"use server"

import { unstable_rethrow } from "next/navigation"

import { randomUUID } from "node:crypto"

import { requireWorkspaceAccess } from "@/features/workspaces"
import { aiLimits } from "@/shared/config/limits"
import { enqueue } from "@/shared/jobs"
import { AppError } from "@/shared/lib/errors"
import { imageExtensions, sniffImageType } from "@/shared/lib/image-type"
import { err, ok, toResultError, type Result } from "@/shared/lib/result"
import { consumeRateLimit } from "@/shared/rate-limit"
import { deleteFile, putFile } from "@/shared/storage"

import { renderExportJob } from "./jobs/definitions"
import { exportCoverKey } from "./lib/keys"
import { videoWords, writePosts as write, type Post } from "./lib/post-kit"
import { loadRenderInput } from "./lib/render-input"
import { getExportPanel, type ExportPanel } from "./queries"
import {
  exportTargetSchema,
  shareLinkSchema,
  writePostsSchema,
  startExportSchema,
} from "./schema"
import * as service from "./service"

// Same pattern as the other slices: validate → authorize → service,
// returning a Result. The dialog reads state back with exportPanel.

const invalid = () => new AppError("VALIDATION", "Check the export.")

/** Renders a day, per workspace: each one keeps the worker busy for minutes. */
const dailyExports = 50

/**
 * Queues an MP4 export of a clip or video in one shape, or returns the
 * one already running. Returns the dialog's new state.
 */
export async function startExport(
  input: unknown
): Promise<Result<ExportPanel>> {
  try {
    const parsed = startExportSchema.safeParse(input)
    if (!parsed.success) throw invalid()
    const { target, shape, language } = parsed.data
    const { workspace } = await requireWorkspaceAccess("content:edit")
    const render = await loadRenderInput(workspace.id, target, {
      linkSeconds: 60,
      language,
    })
    if (!render) {
      await service.assertTarget(workspace.id, target)
      throw invalid()
    }
    if (render.notReady) throw new AppError("VALIDATION", render.notReady)

    // A second click while one runs doesn't render twice.
    if (language && !render.languages.some((v) => v.language === language)) {
      throw new AppError(
        "VALIDATION",
        "Make that language version first, then export it."
      )
    }
    if (
      !(await service.findRunningExport(workspace.id, target, shape, language))
    ) {
      await consumeRateLimit({
        key: `exports:${workspace.id}`,
        limit: dailyExports,
        windowSeconds: 24 * 60 * 60,
        message: `You’ve made ${dailyExports} exports today. Try again tomorrow.`,
      })
      const { id } = await service.createExport(
        workspace.id,
        target,
        shape,
        render.name,
        language
      )
      await enqueue(renderExportJob, { exportId: id }).catch(
        async (error: unknown) => {
          await service.discardExport(id)
          throw error
        }
      )
    }
    return ok((await getExportPanel(workspace.id, target))!)
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}

/** The dialog's state: exports by shape, the share link, readiness. */
export async function exportPanel(
  input: unknown
): Promise<Result<ExportPanel>> {
  try {
    const parsed = exportTargetSchema.safeParse(input)
    if (!parsed.success) throw invalid()
    const { workspace } = await requireWorkspaceAccess("workspace:view")
    const panel = await getExportPanel(workspace.id, parsed.data)
    if (!panel) {
      await service.assertTarget(workspace.id, parsed.data)
      throw invalid()
    }
    return ok(panel)
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}

/** Turns the public link on (creating it the first time) or off. */
export async function setShareLink(
  input: unknown
): Promise<Result<ExportPanel>> {
  try {
    const parsed = shareLinkSchema.safeParse(input)
    if (!parsed.success) throw invalid()
    const { target, enabled } = parsed.data
    const { workspace } = await requireWorkspaceAccess("content:edit")
    await service.assertTarget(workspace.id, target)
    await service.setShareLink(workspace.id, target, enabled)
    return ok((await getExportPanel(workspace.id, target))!)
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}

/**
 * A posting kit's words (V3 M13 B): a title, a description and hashtags
 * for each platform, from what the video says, in the export's language.
 */
export async function writePosts(input: unknown): Promise<Result<Post[]>> {
  try {
    const parsed = writePostsSchema.safeParse(input)
    if (!parsed.success) throw invalid()
    const { target, language } = parsed.data
    const { workspace } = await requireWorkspaceAccess("content:edit")
    const render = await loadRenderInput(workspace.id, target, {
      linkSeconds: 60,
      language,
    })
    if (!render) {
      await service.assertTarget(workspace.id, target)
      throw invalid()
    }
    await consumeRateLimit({
      key: `post-kits:${workspace.id}`,
      limit: aiLimits.postKitsPerDay,
      windowSeconds: 24 * 60 * 60,
      message: `You’ve written ${aiLimits.postKitsPerDay} posts today. Try again tomorrow.`,
    })
    return ok(
      await write({
        name: render.name,
        brand: render.stage.brandName ?? "",
        words: videoWords(render.stage.clips.map((clip) => clip.presentation)),
        language: language ?? "en",
      })
    )
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}

const coverRules = { maxBytes: 2 * 1024 * 1024 }

/**
 * Stores a cover (PNG or JPEG, made in the export dialog) as the share
 * link's: shown before the video plays and in link previews.
 */
export async function saveShareCover(
  formData: FormData
): Promise<Result<ExportPanel>> {
  try {
    const target = exportTargetSchema.safeParse({
      kind: formData.get("kind"),
      id: formData.get("id"),
    })
    const file = formData.get("cover")
    if (!target.success || !(file instanceof File) || file.size === 0) {
      throw new AppError("VALIDATION", "Make a cover first.")
    }
    if (file.size > coverRules.maxBytes) {
      throw new AppError("VALIDATION", "That cover is larger than 2 MB.")
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const type = sniffImageType(bytes)
    if (!type) throw new AppError("VALIDATION", "A cover is a PNG or JPEG.")

    const { workspace } = await requireWorkspaceAccess("content:edit")
    const render = await loadRenderInput(workspace.id, target.data, {
      linkSeconds: 60,
    })
    if (!render) {
      await service.assertTarget(workspace.id, target.data)
      throw invalid()
    }
    const key = exportCoverKey(
      workspace.id,
      render.kitId,
      target.data,
      `cover-${randomUUID()}.${imageExtensions[type]}`
    )
    await putFile(key, bytes, type)
    const { previousCoverKey } = await service.setShareCover(
      workspace.id,
      target.data,
      key
    )
    if (previousCoverKey) {
      await deleteFile(previousCoverKey).catch((error: unknown) =>
        console.warn("Couldn't delete a replaced cover", error)
      )
    }
    return ok((await getExportPanel(workspace.id, target.data))!)
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}
