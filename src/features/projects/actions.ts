"use server"

import { revalidatePath } from "next/cache"
import { unstable_rethrow } from "next/navigation"
import type { z } from "zod"

import { requireWorkspaceAccess } from "@/features/workspaces"
import { AppError } from "@/shared/lib/errors"
import { err, ok, toResultError, type Result } from "@/shared/lib/result"
import type { Transition } from "@/shared/motion"
import { deleteFolder } from "@/shared/storage"

import {
  appendClipSchema,
  applyVideoTemplateSchema,
  createProjectSchema,
  projectIdSchema,
  renameProjectSchema,
  saveProjectClipsSchema,
  undoVideoTemplateSchema,
} from "./schema"
import * as service from "./service"

// Same pattern as the other slices: validate → authorize → service →
// revalidate, returning a Result.

function invalid(error: z.ZodError, message: string) {
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "form"
    ;(fieldErrors[key] ??= []).push(issue.message)
  }
  return new AppError("VALIDATION", message, { fieldErrors })
}

function refreshProjects() {
  revalidatePath("/videos")
  revalidatePath("/dashboard")
}

export async function createProject(
  input: unknown
): Promise<Result<{ projectId: string }>> {
  try {
    const parsed = createProjectSchema.safeParse(input)
    if (!parsed.success) throw invalid(parsed.error, "Check the video.")
    const { workspace } = await requireWorkspaceAccess("content:create")
    const { id } = await service.createProject(workspace.id, parsed.data)
    refreshProjects()
    return ok({ projectId: id })
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}

export async function renameProject(input: unknown): Promise<Result<null>> {
  try {
    const parsed = renameProjectSchema.safeParse(input)
    if (!parsed.success) throw invalid(parsed.error, "Check the name.")
    const { workspace } = await requireWorkspaceAccess("content:edit")
    await service.renameProject(
      workspace.id,
      parsed.data.projectId,
      parsed.data.name
    )
    refreshProjects()
    return ok(null)
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}

export async function deleteProject(input: unknown): Promise<Result<null>> {
  try {
    const parsed = projectIdSchema.safeParse(input)
    if (!parsed.success) throw invalid(parsed.error, "Check the video.")
    const { workspace } = await requireWorkspaceAccess("content:edit")
    const { folder } = await service.deleteProject(
      workspace.id,
      parsed.data.projectId
    )
    // Its exports' MP4s. The rows went with the project.
    await deleteFolder(folder).catch((error: unknown) =>
      console.error("[projects] couldn't delete a video's files", error)
    )
    refreshProjects()
    return ok(null)
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}

/**
 * Saves the clip list (order, transitions) from the version it was edited
 * from. Returns the new version; a stale one gets a CONFLICT.
 */
export async function saveProjectClips(
  input: unknown
): Promise<Result<{ version: number }>> {
  try {
    const parsed = saveProjectClipsSchema.safeParse(input)
    if (!parsed.success) throw invalid(parsed.error, "Check the clips.")
    const { workspace } = await requireWorkspaceAccess("content:edit")
    const version = await service.saveProjectClips(workspace.id, parsed.data)
    // The list and dashboard show clip counts and length; the project page
    // already shows this.
    refreshProjects()
    return ok({ version })
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}

/**
 * Adds a clip just recorded or uploaded into a video at its end. Returns
 * the new version (the page that added it carries on from there).
 */
export async function appendProjectClip(
  input: unknown
): Promise<Result<{ version: number }>> {
  try {
    const parsed = appendClipSchema.safeParse(input)
    if (!parsed.success) throw invalid(parsed.error, "Check the clip.")
    const { workspace } = await requireWorkspaceAccess("content:edit")
    const version = await service.appendClip(
      workspace.id,
      parsed.data.projectId,
      parsed.data.footageId
    )
    refreshProjects()
    return ok({ version })
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}

/**
 * Where each of a video's clips is in processing (cheap: read by the page
 * every few seconds while any clip is still working).
 */
export async function projectClipStatuses(
  input: unknown
): Promise<Result<{ statuses: string[] }>> {
  try {
    const parsed = projectIdSchema.safeParse(input)
    if (!parsed.success) throw invalid(parsed.error, "Check the video.")
    const { workspace } = await requireWorkspaceAccess("workspace:view")
    const statuses = await service.clipStatuses(
      workspace.id,
      parsed.data.projectId
    )
    return ok({ statuses })
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}

/**
 * Applies a template to every clip of a video (and, with AI, writes its
 * text and picks its graphics) as one change that can be undone. Returns
 * the new version and the joins' transitions, in clip order.
 */
export async function applyVideoTemplate(input: unknown): Promise<
  Result<{
    version: number
    transitions: Transition[]
    applied: number
    skipped: number
  }>
> {
  try {
    const parsed = applyVideoTemplateSchema.safeParse(input)
    if (!parsed.success) throw invalid(parsed.error, "Pick a template.")
    const { workspace } = await requireWorkspaceAccess("content:edit")
    const result = await service.applyTemplateToVideo(workspace.id, parsed.data)
    revalidatePath(`/videos/${parsed.data.projectId}`)
    refreshProjects()
    return ok(result)
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}

/** Puts the video back as it was before its last template. */
export async function undoVideoTemplate(
  input: unknown
): Promise<Result<{ version: number; transitions: Transition[] }>> {
  try {
    const parsed = undoVideoTemplateSchema.safeParse(input)
    if (!parsed.success) throw invalid(parsed.error, "Check the video.")
    const { workspace } = await requireWorkspaceAccess("content:edit")
    const result = await service.undoVideoTemplate(workspace.id, parsed.data)
    revalidatePath(`/videos/${parsed.data.projectId}`)
    refreshProjects()
    return ok(result)
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}
