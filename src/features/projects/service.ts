import "server-only"

import type { LanguageModel } from "ai"

import { getBrandKit } from "@/features/brand-kits"
import {
  templateById,
  templatedMotion,
  templateTransition,
  type TemplatedClip,
} from "@/features/footage"
import { aiLimits } from "@/shared/config/limits"
import { db, Prisma } from "@/shared/db"
import { AppError } from "@/shared/lib/errors"
import { consumeRateLimit } from "@/shared/rate-limit"
import { workspaceFileKey } from "@/shared/storage"
import {
  defaultClipTransition,
  projectLimits,
  transitionSchema,
  type ProjectClipInput,
  type Transition,
} from "@/shared/motion"

import { parseTemplateUndo, type TemplateUndo } from "./lib/template-undo"

const projectNotFound = () =>
  new AppError("NOT_FOUND", "We couldn’t find that video.")

/** A new, empty project for one of the workspace's brand kits. */
export async function createProject(
  workspaceId: string,
  input: { name: string; kitId: string }
) {
  const kit = await db.brandKit.count({
    where: { id: input.kitId, workspaceId },
  })
  if (!kit) throw new AppError("NOT_FOUND", "We couldn’t find that brand kit.")
  return db.project.create({
    data: { workspaceId, brandKitId: input.kitId, name: input.name },
    select: { id: true },
  })
}

export async function renameProject(
  workspaceId: string,
  projectId: string,
  name: string
) {
  const { count } = await db.project.updateMany({
    where: { id: projectId, workspaceId },
    data: { name },
  })
  if (count === 0) throw projectNotFound()
}

/** Deletes the project; returns its folder (its exports' files live there). */
export async function deleteProject(workspaceId: string, projectId: string) {
  const project = await db.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { brandKitId: true },
  })
  const { count } = await db.project.deleteMany({
    where: { id: projectId, workspaceId },
  })
  if (!project || count === 0) throw projectNotFound()
  return {
    folder: `${workspaceFileKey(workspaceId, "brand-kits", project.brandKitId, "projects", projectId)}/`,
  }
}

/**
 * Replaces the clip list if the project is still at `baseVersion`, and
 * returns the new version. Clips must be footage of the project's own
 * brand kit (still processing is fine: a clip recorded into a video joins
 * it at once and plays once ready). A stale version is a conflict.
 */
export async function saveProjectClips(
  workspaceId: string,
  input: { projectId: string; baseVersion: number; clips: ProjectClipInput[] }
) {
  const project = await db.project.findFirst({
    where: { id: input.projectId, workspaceId },
    select: { brandKitId: true },
  })
  if (!project) throw projectNotFound()

  const ids = [...new Set(input.clips.map((clip) => clip.footageId))]
  const usable = await db.footage.count({
    where: { id: { in: ids }, workspaceId, brandKitId: project.brandKitId },
  })
  if (usable !== ids.length) {
    throw new AppError(
      "VALIDATION",
      "Only this brand kit’s clips can go in the video."
    )
  }

  return db.$transaction(
    async (tx) => {
      const { count } = await tx.project.updateMany({
        where: {
          id: input.projectId,
          workspaceId,
          version: input.baseVersion,
        },
        data: { version: { increment: 1 } },
      })
      if (count === 0) {
        throw new AppError(
          "CONFLICT",
          "This video was changed in another tab or window. Reload to get the latest."
        )
      }
      await tx.projectClip.deleteMany({ where: { projectId: input.projectId } })
      if (input.clips.length > 0) {
        await tx.projectClip.createMany({
          data: input.clips.map((clip, position) => ({
            projectId: input.projectId,
            footageId: clip.footageId,
            position,
            transition: clip.transition as Prisma.InputJsonValue,
          })),
        })
      }
      return input.baseVersion + 1
    },
    // Neon is a network hop away: allow for its latency.
    { timeout: 15_000, maxWait: 10_000 }
  )
}

/**
 * Adds a clip at the end of a project (a clip just recorded or uploaded
 * into it), whatever version it's at, and returns the new version.
 */
export async function appendClip(
  workspaceId: string,
  projectId: string,
  footageId: string
) {
  const project = await db.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { brandKitId: true },
  })
  if (!project) throw projectNotFound()
  const footage = await db.footage.count({
    where: { id: footageId, workspaceId, brandKitId: project.brandKitId },
  })
  if (!footage) {
    throw new AppError("NOT_FOUND", "We couldn’t find that clip.")
  }
  return db.$transaction(
    async (tx) => {
      const { version } = await tx.project.update({
        where: { id: projectId },
        data: { version: { increment: 1 } },
        select: { version: true },
      })
      const position = await tx.projectClip.count({ where: { projectId } })
      if (position >= projectLimits.clips) {
        throw new AppError(
          "PLAN_LIMIT",
          `A video holds up to ${projectLimits.clips} clips.`
        )
      }
      await tx.projectClip.create({
        data: {
          projectId,
          footageId,
          position,
          transition: defaultClipTransition as Prisma.InputJsonValue,
        },
      })
      return version
    },
    { timeout: 15_000, maxWait: 10_000 }
  )
}

/** Each clip's processing status, in order. */
export async function clipStatuses(workspaceId: string, projectId: string) {
  const clips = await db.projectClip.findMany({
    where: { projectId, project: { workspaceId } },
    orderBy: { position: "asc" },
    select: { footage: { select: { status: true } } },
  })
  return clips.map((clip) => clip.footage.status as string)
}

const storedTransition = (value: unknown): Transition =>
  transitionSchema.safeParse(value).data ?? defaultClipTransition

const videoChanged = () =>
  new AppError(
    "CONFLICT",
    "This video was changed in another tab or window. Reload to get the latest."
  )

/**
 * Applies a template to every clip of a video as one change (§7.16): each
 * clip gets the template's look, cuts, text style, lens and end card (and,
 * with `withAi`, the AI director's words and graphics), and every join
 * between clips its transition. What it replaced is kept on the project so
 * it can be undone in one step. Clips that aren't ready or have no key
 * moments are left as they are. A stale video or clip is a conflict.
 */
export async function applyTemplateToVideo(
  workspaceId: string,
  input: {
    projectId: string
    baseVersion: number
    templateId: string
    withAi: boolean
  },
  options: { model?: LanguageModel } = {}
) {
  const template = templateById(input.templateId)
  if (!template) {
    throw new AppError("NOT_FOUND", "We couldn’t find that template.")
  }
  const project = await db.project.findFirst({
    where: { id: input.projectId, workspaceId },
    select: {
      version: true,
      brandKitId: true,
      clips: {
        orderBy: { position: "asc" },
        select: { id: true, footageId: true, transition: true },
      },
    },
  })
  if (!project) throw projectNotFound()
  if (project.version !== input.baseVersion) throw videoChanged()
  const kit = await getBrandKit(workspaceId, project.brandKitId)
  if (!kit) throw projectNotFound()

  // The same footage may appear twice: it gets the template once.
  const footageIds = [...new Set(project.clips.map((clip) => clip.footageId))]
  const results: TemplatedClip[] = []
  for (const footageId of footageIds) {
    if (input.withAi) {
      await consumeRateLimit({
        key: `motion-direction:${workspaceId}`,
        limit: aiLimits.motionDirectionsPerDay,
        windowSeconds: 24 * 60 * 60,
        message: `You’ve used AI direction ${aiLimits.motionDirectionsPerDay} times today. Apply the template without AI, or try again tomorrow.`,
      })
    }
    const result = await templatedMotion({
      workspaceId,
      footageId,
      template,
      withAi: input.withAi,
      model: options.model,
      brand: {
        name: kit.name,
        description: kit.description ?? "",
        audience: kit.audience ?? "",
        tone: kit.tone ?? null,
        bannedWords: kit.bannedWords ?? [],
        colors: kit.colors,
      },
    })
    if (result) results.push(result)
  }
  if (results.length === 0) {
    throw new AppError(
      "VALIDATION",
      "Add key moments to a clip first: templates move the camera between them."
    )
  }

  const transition = templateTransition(template)
  const undo: TemplateUndo = {
    templateId: template.id,
    withAi: input.withAi,
    appliedVersion: input.baseVersion + 1,
    clips: results.map((result) => ({
      footageId: result.footageId,
      versionAfter: result.baseVersion + 1,
      presentation: result.before.presentation,
      shots: result.before.shots,
    })),
    transitions: project.clips.map((clip) => ({
      clipId: clip.id,
      transition: storedTransition(clip.transition),
    })),
  }

  return db.$transaction(
    async (tx) => {
      const { count } = await tx.project.updateMany({
        where: { id: input.projectId, workspaceId, version: input.baseVersion },
        data: {
          version: { increment: 1 },
          templateUndo: undo as Prisma.InputJsonValue,
        },
      })
      if (count === 0) throw videoChanged()
      for (const result of results) {
        const saved = await tx.footage.updateMany({
          where: {
            id: result.footageId,
            workspaceId,
            presentationVersion: result.baseVersion,
          },
          data: {
            presentation: result.after.presentation as Prisma.InputJsonValue,
            presentationVersion: { increment: 1 },
          },
        })
        if (saved.count === 0) throw videoChanged()
        for (const [markerId, shot] of Object.entries(result.after.shots)) {
          await tx.footageMarker.updateMany({
            where: { id: markerId, footageId: result.footageId },
            data: { shot: shot ?? Prisma.DbNull },
          })
        }
      }
      const transitions = project.clips.map((clip, position) =>
        position === 0 ? storedTransition(clip.transition) : transition
      )
      for (const [position, clip] of project.clips.entries()) {
        if (position === 0) continue
        await tx.projectClip.update({
          where: { id: clip.id },
          data: { transition: transition as Prisma.InputJsonValue },
        })
      }
      return {
        version: input.baseVersion + 1,
        transitions,
        applied: results.length,
        skipped: footageIds.length - results.length,
      }
    },
    // Neon is a network hop away; a video can have many clips.
    { timeout: 30_000, maxWait: 10_000 }
  )
}

/** The template a video's clips last got, while it can be undone. */
export async function videoTemplate(workspaceId: string, projectId: string) {
  const project = await db.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { templateUndo: true },
  })
  const undo = parseTemplateUndo(project?.templateUndo)
  return undo ? { templateId: undo.templateId, withAi: undo.withAi } : null
}

/**
 * Puts every clip (and every join) back as it was before the video's last
 * template, in one change. Refused once anything changed since: undoing
 * then would throw away that later work.
 */
export async function undoVideoTemplate(
  workspaceId: string,
  input: { projectId: string; baseVersion: number }
) {
  const project = await db.project.findFirst({
    where: { id: input.projectId, workspaceId },
    select: { version: true, templateUndo: true },
  })
  if (!project) throw projectNotFound()
  const undo = parseTemplateUndo(project.templateUndo)
  if (!undo) throw new AppError("NOT_FOUND", "There’s no template to undo.")
  const changedSince = () =>
    new AppError(
      "CONFLICT",
      "The video changed after the template, so it can’t be undone in one step. Change the clips by hand."
    )
  if (
    project.version !== input.baseVersion ||
    project.version !== undo.appliedVersion
  ) {
    throw changedSince()
  }

  return db.$transaction(
    async (tx) => {
      const { count } = await tx.project.updateMany({
        where: { id: input.projectId, workspaceId, version: input.baseVersion },
        data: { version: { increment: 1 }, templateUndo: Prisma.DbNull },
      })
      if (count === 0) throw changedSince()
      for (const clip of undo.clips) {
        const restored = await tx.footage.updateMany({
          where: {
            id: clip.footageId,
            workspaceId,
            presentationVersion: clip.versionAfter,
          },
          data: {
            presentation: clip.presentation as Prisma.InputJsonValue,
            presentationVersion: { increment: 1 },
          },
        })
        if (restored.count === 0) throw changedSince()
        for (const [markerId, shot] of Object.entries(clip.shots)) {
          await tx.footageMarker.updateMany({
            where: { id: markerId, footageId: clip.footageId },
            data: { shot: shot ?? Prisma.DbNull },
          })
        }
      }
      for (const entry of undo.transitions) {
        await tx.projectClip.updateMany({
          where: { id: entry.clipId, projectId: input.projectId },
          data: { transition: entry.transition as Prisma.InputJsonValue },
        })
      }
      const clips = await tx.projectClip.findMany({
        where: { projectId: input.projectId },
        orderBy: { position: "asc" },
        select: { transition: true },
      })
      return {
        version: input.baseVersion + 1,
        transitions: clips.map((clip) => storedTransition(clip.transition)),
      }
    },
    { timeout: 30_000, maxWait: 10_000 }
  )
}
