"use server"

import { revalidatePath } from "next/cache"
import { unstable_rethrow } from "next/navigation"
import { z } from "zod"

import { getBrandKit } from "@/features/brand-kits"
import { requireWorkspaceAccess } from "@/features/workspaces"
import { imageEnabled, voiceEnabled } from "@/shared/ai"
import { aiLimits } from "@/shared/config/limits"
import {
  outputDuration,
  presentationFor,
  splitScript,
  type VoiceLine,
} from "@/shared/motion"
import { enqueue } from "@/shared/jobs"
import { AppError } from "@/shared/lib/errors"
import { sniffImageType } from "@/shared/lib/image-type"
import { err, ok, toResultError, type Result } from "@/shared/lib/result"
import { consumeRateLimit } from "@/shared/rate-limit"
import { deleteFolder, fileSize, signedFileUpload } from "@/shared/storage"

import { analyzeFootageJob, processFootageJob } from "./jobs/definitions"
import { aimAt } from "./lib/aim"
import { parseStoredAnalysis } from "./lib/analysis"
import { directEdit, type EditPlan } from "./lib/direct-edit"
import { parseStoredRecording } from "./lib/recording"
import { parseStoredInsight } from "./lib/insight"
import {
  makeRecipePicture as makePicture,
  pictureRules,
  storeRecipePicture,
  type StoredPicture,
} from "./lib/recipe-pictures"
import { suggestGraphic, type GraphicSuggestion } from "./lib/suggest-graphic"
import { writeVoiceScript as writeScript } from "./lib/voice-script"
import type { VoicedStep } from "./lib/recipe-template"
import { voiceLines, voiceSteps } from "./lib/voiceover"
import { clipMediaUrls, getFootage } from "./queries"
import {
  addMarkerSchema,
  completeUploadSchema,
  directEditSchema,
  footageIdSchema,
  makeRecipePictureSchema,
  makeVoiceoverSchema,
  voiceRecipeStepsSchema,
  moveMarkerSchema,
  requestUploadSchema,
  suggestGraphicSchema,
  updateMarkerSchema,
  updatePresentationSchema,
  updateShotSchema,
  writeVoiceScriptSchema,
} from "./schema"
import * as service from "./service"

// Same pattern as brand-kits/actions.ts: validate → authorize → service →
// revalidate, returning a Result; only Next's redirects are rethrown.

function invalid(error: z.ZodError, message: string) {
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "form"
    ;(fieldErrors[key] ??= []).push(issue.message)
  }
  // Show the specific reason (e.g. the wrong file type) when there's one.
  return new AppError("VALIDATION", error.issues[0]?.message ?? message, {
    fieldErrors,
  })
}

function refreshFootage(kitId?: string) {
  revalidatePath(
    kitId ? `/brand-kits/${kitId}/footage` : "/brand-kits",
    "layout"
  )
}

export type FootageUpload = {
  footageId: string
  /** Signed form POST to storage: send `fields` then the file as "file". */
  upload: { url: string; fields: Record<string, string> }
}

/**
 * Step 1 of an upload: checks the plan's limits, creates the clip and signs
 * a browser upload straight to storage, capped at the declared size.
 */
export async function requestFootageUpload(
  input: unknown
): Promise<Result<FootageUpload>> {
  try {
    const parsed = requestUploadSchema.safeParse(input)
    if (!parsed.success) throw invalid(parsed.error, "Check the file.")

    const { workspace } = await requireWorkspaceAccess("content:create")
    const { footageId, originalKey } = await service.createFootageUpload(
      workspace.id,
      parsed.data
    )
    const upload = await signedFileUpload(originalKey, {
      maxBytes: parsed.data.sizeBytes,
      contentType: parsed.data.contentType,
      expiresInSeconds: 60 * 60,
    })

    refreshFootage(parsed.data.kitId)
    return ok({ footageId, upload })
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}

/**
 * Step 2: the browser says the upload finished. Checks the file really
 * arrived at the declared size, then queues processing.
 */
export async function completeFootageUpload(
  input: unknown
): Promise<Result<null>> {
  try {
    const parsed = completeUploadSchema.safeParse(input)
    if (!parsed.success) throw invalid(parsed.error, "Check the upload.")
    const { footageId, recordedMarksMs, recording } = parsed.data

    const { workspace } = await requireWorkspaceAccess("content:create")
    const clip = await service.getUploadingFootage(workspace.id, footageId)
    if (clip) {
      const size = await fileSize(clip.originalKey)
      if (size === null || size === 0 || size > clip.sizeBytes) {
        const message = "The upload didn’t finish. Upload the clip again."
        await service.failFootage(footageId, message)
        throw new AppError("VALIDATION", message)
      }
    }
    // A repeated call (clip already processing) is fine: nothing to do.
    const started = await service.startProcessing(
      workspace.id,
      footageId,
      recordedMarksMs,
      recording
    )
    if (started) {
      await enqueue(
        processFootageJob,
        { footageId },
        { singletonKey: footageId }
      )
    }

    refreshFootage()
    return ok(null)
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}

export async function deleteFootage(footageId: unknown): Promise<Result<null>> {
  try {
    const parsed = footageIdSchema.safeParse(footageId)
    if (!parsed.success) throw new AppError("NOT_FOUND", "Clip not found.")

    const { workspace } = await requireWorkspaceAccess("content:edit")
    const { folder } = await service.deleteFootage(workspace.id, parsed.data)
    // The clip is gone either way; leftover files are only wasted space.
    await deleteFolder(folder).catch((error: unknown) =>
      console.warn("Couldn't delete footage files", folder, error)
    )

    refreshFootage()
    return ok(null)
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}

export async function addFootageMarker(
  input: unknown
): Promise<Result<{ markerId: string }>> {
  try {
    const parsed = addMarkerSchema.safeParse(input)
    if (!parsed.success) throw invalid(parsed.error, "Check the marker.")

    const { workspace } = await requireWorkspaceAccess("content:edit")
    const { id } = await service.addMarker(workspace.id, parsed.data)
    await queueAnalysis(workspace.id, parsed.data.footageId)

    refreshFootage()
    return ok({ markerId: id })
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}

export async function updateFootageMarker(
  input: unknown
): Promise<Result<null>> {
  try {
    const parsed = updateMarkerSchema.safeParse(input)
    if (!parsed.success) throw invalid(parsed.error, "Check the label.")

    const { workspace } = await requireWorkspaceAccess("content:edit")
    await service.updateMarkerLabel(
      workspace.id,
      parsed.data.markerId,
      parsed.data.label
    )

    refreshFootage()
    return ok(null)
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}

export async function deleteFootageMarker(
  markerId: unknown
): Promise<Result<null>> {
  try {
    const parsed = footageIdSchema.safeParse(markerId)
    if (!parsed.success) throw new AppError("NOT_FOUND", "That marker is gone.")

    const { workspace } = await requireWorkspaceAccess("content:edit")
    await service.deleteMarker(workspace.id, parsed.data)

    refreshFootage()
    return ok(null)
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}

export async function updateMarkerShot(input: unknown): Promise<Result<null>> {
  try {
    const parsed = updateShotSchema.safeParse(input)
    if (!parsed.success)
      throw invalid(parsed.error, "Check the camera settings.")

    const { workspace } = await requireWorkspaceAccess("content:edit")
    await service.setMarkerShot(
      workspace.id,
      parsed.data.markerId,
      parsed.data.shot
    )

    // No page refresh: the editor already shows this, and nothing else
    // renders shots or style (refreshing mid-playback was wasted work).
    return ok(null)
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}

export async function updateFootagePresentation(
  input: unknown
): Promise<Result<{ version: number }>> {
  try {
    const parsed = updatePresentationSchema.safeParse(input)
    if (!parsed.success) throw invalid(parsed.error, "Check the clip’s style.")

    const { workspace } = await requireWorkspaceAccess("content:edit")
    const version = await service.setFootagePresentation(
      workspace.id,
      parsed.data.footageId,
      parsed.data.presentation,
      parsed.data.baseVersion
    )

    // No page refresh: the editor already shows this, and nothing else
    // renders shots or style (refreshing mid-playback was wasted work).
    return ok({ version })
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}

/**
 * "Direct with AI" (v2): plans the whole edit (camera look, cuts, text,
 * graphics, end card, lens) from the analysis, the brand kit and the
 * owner's words. Returns the plan; the editor applies it with the
 * deterministic engines as one undoable change, and saves as usual.
 */
export async function directFootageEdit(
  input: unknown
): Promise<Result<EditPlan>> {
  try {
    const parsed = directEditSchema.safeParse(input)
    if (!parsed.success)
      throw invalid(parsed.error, "Describe the ad you want.")

    const { workspace } = await requireWorkspaceAccess("content:edit")
    const clip = await getFootage(workspace.id, parsed.data.footageId)
    if (!clip || clip.status !== "READY" || !clip.durationMs) {
      throw new AppError("NOT_FOUND", "That clip isn’t ready yet.")
    }
    if (clip.markers.length === 0) {
      throw new AppError(
        "VALIDATION",
        "Add a key moment first: the AI builds the edit around them."
      )
    }
    await consumeRateLimit({
      key: `motion-direction:${workspace.id}`,
      limit: aiLimits.motionDirectionsPerDay,
      windowSeconds: 24 * 60 * 60,
      message: `You’ve used AI direction ${aiLimits.motionDirectionsPerDay} times today. Adjust the edit by hand, or try again tomorrow.`,
    })

    const kit = await getBrandKit(workspace.id, clip.brandKitId)
    const analysis = parseStoredAnalysis(clip.analysis)
    const recording = parseStoredRecording(clip.recording)
    const plan = await directEdit({
      instruction: parsed.data.instruction,
      durationMs: clip.durationMs,
      moments: clip.markers.map((marker) => {
        const insight = parseStoredInsight(marker.insight)
        const aim = aimAt({ analysis, recording, insight, atMs: marker.atMs })
        return {
          id: marker.id,
          atMs: marker.atMs,
          label: marker.label,
          insight,
          aimZoom: aim?.zoom ?? null,
        }
      }),
      stillMs: (analysis?.idle ?? []).reduce(
        (sum, r) => sum + r.endMs - r.startMs,
        0
      ),
      brand: {
        name: kit?.name ?? "the product",
        description: kit?.description ?? "",
        audience: kit?.audience ?? "",
        tone: kit?.tone ?? null,
        bannedWords: kit?.bannedWords ?? [],
      },
    })
    return ok(plan)
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}

export async function moveFootageMarker(input: unknown): Promise<Result<null>> {
  try {
    const parsed = moveMarkerSchema.safeParse(input)
    if (!parsed.success) throw invalid(parsed.error, "Check the new time.")

    const { workspace } = await requireWorkspaceAccess("content:edit")
    const moved = await service.moveMarker(
      workspace.id,
      parsed.data.markerId,
      parsed.data.atMs
    )
    if (moved.needsInsight) await queueAnalysis(workspace.id, moved.footageId)

    refreshFootage()
    return ok(null)
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}

/**
 * Queues the smart analysis (§7.4b), which also describes moments that
 * have no description yet. A failed enqueue is logged, not shown: the
 * stuck-analysis sweep queues it again.
 */
async function queueAnalysis(
  workspaceId: string,
  footageId: string,
  options = { redescribe: false }
) {
  if (!(await service.requestAnalysis(workspaceId, footageId, options))) {
    return false
  }
  await enqueue(
    analyzeFootageJob,
    { footageId },
    { singletonKey: footageId }
  ).catch((error: unknown) =>
    console.warn(`[footage] couldn't queue analysis for ${footageId}`, error)
  )
  return true
}

/** "Analyse again": fresh activity map, colours and moment descriptions. */
export async function analyzeFootageAgain(
  footageId: unknown
): Promise<Result<null>> {
  try {
    const parsed = footageIdSchema.safeParse(footageId)
    if (!parsed.success) throw new AppError("NOT_FOUND", "That clip is gone.")

    const { workspace } = await requireWorkspaceAccess("content:edit")
    const queued = await queueAnalysis(workspace.id, parsed.data, {
      redescribe: true,
    })
    if (!queued) throw new AppError("NOT_FOUND", "That clip isn’t ready yet.")

    refreshFootage()
    return ok(null)
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}

/** "Let AI choose": the graphic that suits a moment, and its label. */
export async function suggestMomentGraphic(
  input: unknown
): Promise<Result<GraphicSuggestion>> {
  try {
    const parsed = suggestGraphicSchema.safeParse(input)
    if (!parsed.success) throw new AppError("NOT_FOUND", "That moment is gone.")

    const { workspace } = await requireWorkspaceAccess("content:edit")
    const clip = await getFootage(workspace.id, parsed.data.footageId)
    const marker = clip?.markers.find((m) => m.id === parsed.data.markerId)
    if (!clip || !marker)
      throw new AppError("NOT_FOUND", "That moment is gone.")
    await consumeRateLimit({
      key: `graphic-suggestion:${workspace.id}`,
      limit: aiLimits.graphicSuggestionsPerDay,
      windowSeconds: 24 * 60 * 60,
      message: `You’ve asked the AI for ${aiLimits.graphicSuggestionsPerDay} graphics today. Pick one of the suggestions, or try again tomorrow.`,
    })
    const kit = await getBrandKit(workspace.id, clip.brandKitId)
    return ok(
      await suggestGraphic({
        insight: parseStoredInsight(marker.insight),
        label: marker.label,
        brandName: kit?.name ?? "the product",
      })
    )
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}

/**
 * Fresh signed links for a clip's video, poster and thumbnails (they're
 * signed for an hour). The editor asks before they expire, and when a
 * video fails to load, so long sessions never stall on a dead link.
 */
export async function freshFootageLinks(footageId: unknown): Promise<
  Result<{
    videoUrl: string | null
    posterUrl: string | null
    thumbnailsUrl: string | null
  }>
> {
  try {
    const parsed = footageIdSchema.safeParse(footageId)
    if (!parsed.success) throw new AppError("NOT_FOUND", "That clip is gone.")
    const { workspace } = await requireWorkspaceAccess("workspace:view")
    const clip = await getFootage(workspace.id, parsed.data)
    if (!clip) throw new AppError("NOT_FOUND", "That clip is gone.")
    return ok(await clipMediaUrls(clip))
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}

const voiceOff = () =>
  new AppError("PROVIDER_FAILED", "Voiceover isn’t set up on this server.")

/**
 * The AI writes a voiceover script for the clip from what's on screen at its
 * key moments, sized to the ad's length. Returns the script; nothing saved.
 */
export async function writeVoiceScript(
  input: unknown
): Promise<Result<{ script: string }>> {
  try {
    const parsed = writeVoiceScriptSchema.safeParse(input)
    if (!parsed.success) throw invalid(parsed.error, "Check the request.")
    if (!voiceEnabled()) throw voiceOff()
    const { workspace } = await requireWorkspaceAccess("content:edit")
    const clip = await getFootage(workspace.id, parsed.data.footageId)
    if (!clip || clip.status !== "READY" || !clip.durationMs) {
      throw new AppError("NOT_FOUND", "That clip isn’t ready yet.")
    }
    await consumeRateLimit({
      key: `voice-script:${workspace.id}`,
      limit: aiLimits.voiceScriptsPerDay,
      windowSeconds: 24 * 60 * 60,
      message: `You’ve had ${aiLimits.voiceScriptsPerDay} scripts written today. Write this one yourself, or try again tomorrow.`,
    })
    const kit = await getBrandKit(workspace.id, clip.brandKitId)
    const presentation = presentationFor(clip.presentation, kit?.colors ?? {})
    const script = await writeScript({
      language: parsed.data.language,
      adMs: outputDuration(presentation.edit, clip.durationMs),
      moments: clip.markers.map((marker) => ({
        atMs: marker.atMs,
        insight: parseStoredInsight(marker.insight),
      })),
      brand: {
        name: kit?.name ?? "the product",
        description: kit?.description ?? "",
        audience: kit?.audience ?? "",
        tone: kit?.tone ?? null,
        bannedWords: kit?.bannedWords ?? [],
      },
      note: parsed.data.note,
    })
    return ok({ script })
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}

/**
 * Voices the script line by line (each line a stored audio file) and
 * returns the lines placed on the ad's timeline with links to play them.
 * The editor puts them in the clip's voice and saves it like any edit.
 */
export async function makeVoiceover(
  input: unknown
): Promise<Result<{ lines: VoiceLine[]; urls: Record<string, string> }>> {
  try {
    const parsed = makeVoiceoverSchema.safeParse(input)
    if (!parsed.success) throw invalid(parsed.error, "Check the script.")
    if (!voiceEnabled()) throw voiceOff()
    const { workspace } = await requireWorkspaceAccess("content:edit")
    const clip = await getFootage(workspace.id, parsed.data.footageId)
    if (!clip || clip.status !== "READY") {
      throw new AppError("NOT_FOUND", "That clip isn’t ready yet.")
    }
    // Each line is a paid text-to-speech call.
    for (const _line of splitScript(parsed.data.script)) {
      await consumeRateLimit({
        key: `voice-lines:${workspace.id}`,
        limit: aiLimits.voiceLinesPerDay,
        windowSeconds: 24 * 60 * 60,
        message: `You’ve voiced ${aiLimits.voiceLinesPerDay} lines today. Try again tomorrow.`,
      })
    }
    const voiced = await voiceLines({
      workspaceId: workspace.id,
      kitId: clip.brandKitId,
      footageId: clip.id,
      script: parsed.data.script,
      language: parsed.data.language,
    })
    return ok(voiced)
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}

// ── Recipe pictures (V3 M12 step 1b) ─────────────────────────────────────

const pictureTooBig = `That picture is larger than ${pictureRules.maxBytes / 1024 / 1024} MB. Use a smaller PNG, JPEG or WebP.`
const pictureWrongType =
  "That file isn’t a PNG, JPEG or WebP image. Choose a photo in one of those formats."

/** The clip a picture is for, in this workspace. */
async function clipForPicture(workspaceId: string, footageId: unknown) {
  const id = z.string().min(1).max(64).safeParse(footageId)
  const clip = id.success ? await getFootage(workspaceId, id.data) : null
  if (!clip) throw new AppError("NOT_FOUND", "That clip doesn’t exist.")
  return clip
}

/**
 * Stores an uploaded picture for a recipe's ingredient or step (PNG, JPEG
 * or WebP, max 2 MB). Returns its key and a signed link; the editor puts
 * it on the recipe and saves.
 */
export async function uploadRecipePicture(
  formData: FormData
): Promise<Result<StoredPicture>> {
  try {
    const file = formData.get("picture")
    if (!(file instanceof File) || file.size === 0) {
      throw new AppError("VALIDATION", "Choose a picture to upload.")
    }
    if (file.size > pictureRules.maxBytes) {
      throw new AppError("VALIDATION", pictureTooBig)
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    // Trust the file's bytes, not its name or declared type.
    const type = sniffImageType(bytes)
    if (!type) throw new AppError("VALIDATION", pictureWrongType)

    const { workspace } = await requireWorkspaceAccess("content:edit")
    const clip = await clipForPicture(workspace.id, formData.get("footageId"))
    return ok(
      await storeRecipePicture({
        workspaceId: workspace.id,
        kitId: clip.brandKitId,
        footageId: clip.id,
        bytes,
        type,
        source: "upload",
      })
    )
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}

/** The image provider makes a picture for one ingredient or step. */
export async function makeRecipePicture(
  input: unknown
): Promise<Result<StoredPicture>> {
  try {
    const parsed = makeRecipePictureSchema.safeParse(input)
    if (!parsed.success) throw invalid(parsed.error, "Check the recipe.")
    if (!imageEnabled()) {
      throw new AppError(
        "PROVIDER_FAILED",
        "Picture generation isn’t set up on this server."
      )
    }
    const { workspace } = await requireWorkspaceAccess("content:edit")
    const clip = await clipForPicture(workspace.id, parsed.data.footageId)
    // Each picture is a paid call.
    await consumeRateLimit({
      key: `recipe-pictures:${workspace.id}`,
      limit: aiLimits.recipePicturesPerDay,
      windowSeconds: 24 * 60 * 60,
      message: `You’ve made ${aiLimits.recipePicturesPerDay} pictures today. Try again tomorrow, or upload your own.`,
    })
    return ok(
      await makePicture({
        workspaceId: workspace.id,
        kitId: clip.brandKitId,
        footageId: clip.id,
        dish: parsed.data.dish,
        kind: parsed.data.kind,
        text: parsed.data.text,
      })
    )
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}

/**
 * A recipe's steps read aloud (V3 M12): one line per step, stored in the
 * clip's folder. The editor's recipe template times each step by its line.
 */
export async function voiceRecipeSteps(
  input: unknown
): Promise<Result<{ steps: VoicedStep[]; urls: Record<string, string> }>> {
  try {
    const parsed = voiceRecipeStepsSchema.safeParse(input)
    if (!parsed.success) throw invalid(parsed.error, "Check the steps.")
    if (!voiceEnabled()) throw voiceOff()
    const { workspace } = await requireWorkspaceAccess("content:edit")
    const clip = await getFootage(workspace.id, parsed.data.footageId)
    if (!clip || clip.status !== "READY") {
      throw new AppError("NOT_FOUND", "That clip isn’t ready yet.")
    }
    // Each step is a paid text-to-speech call.
    for (const _step of parsed.data.steps) {
      await consumeRateLimit({
        key: `voice-lines:${workspace.id}`,
        limit: aiLimits.voiceLinesPerDay,
        windowSeconds: 24 * 60 * 60,
        message: `You’ve voiced ${aiLimits.voiceLinesPerDay} lines today. Try again tomorrow.`,
      })
    }
    return ok(
      await voiceSteps({
        workspaceId: workspace.id,
        kitId: clip.brandKitId,
        footageId: clip.id,
        steps: parsed.data.steps,
        language: parsed.data.language,
      })
    )
  } catch (error) {
    unstable_rethrow(error)
    return err(toResultError(error))
  }
}
