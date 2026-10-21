import { z } from "zod"

import {
  presentationSchema,
  recipeLimits,
  versionLanguages,
  shotSchema,
  voiceLanguages,
  voiceLimits,
} from "@/shared/motion"

import { recordingSchema } from "./lib/recording"

/** Accepted video types → file extension for the stored original. */
export const footageTypes = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  // Photos (V3 M12 timeline): the worker turns each into a short still clip.
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const
export type FootageType = keyof typeof footageTypes

/** A photo, not a video: it becomes a still clip. */
export const isPhotoType = (type: string) => type.startsWith("image/")

export const footageLimits = {
  name: 80,
  label: 120,
  recordedMarks: 100,
} as const

const idSchema = z.string().min(1).max(64)

/** "video/webm;codecs=vp9" (MediaRecorder) → "video/webm". */
const contentTypeSchema = z
  .string()
  .transform((value) => value.split(";")[0]?.trim().toLowerCase() ?? "")
  .pipe(
    z.enum(Object.keys(footageTypes) as [FootageType, ...FootageType[]], {
      message: "Upload a video (MP4, MOV, WebM) or a photo (JPEG, PNG, WebP).",
    })
  )

/** "Demo take 2.MOV" → "Demo take 2"; empty names get a default. */
const footageNameSchema = z
  .string()
  .trim()
  .transform((value) =>
    value.replace(/\.(mp4|mov|webm|m4v|jpe?g|png|webp)$/i, "").trim()
  )
  .transform((value) => value.slice(0, footageLimits.name) || "Untitled clip")

export const requestUploadSchema = z.object({
  kitId: idSchema,
  name: footageNameSchema,
  sizeBytes: z.number().int().positive("That file is empty."),
  contentType: contentTypeSchema,
  source: z.enum(["UPLOAD", "RECORDING"]),
})
export type RequestUploadInput = z.infer<typeof requestUploadSchema>

export const completeUploadSchema = z.object({
  footageId: idSchema,
  /** Moments marked with "Mark moment" while recording, from the start. */
  recordedMarksMs: z
    .array(z.number().int().min(0))
    .max(footageLimits.recordedMarks)
    .default([]),
  /** Surface and cursor track from the in-app recorder. */
  recording: recordingSchema.optional(),
})

const labelSchema = z
  .string()
  .trim()
  .max(
    footageLimits.label,
    `Keep labels under ${footageLimits.label} characters.`
  )
  .transform((value) => value || null)

export const addMarkerSchema = z.object({
  footageId: idSchema,
  atMs: z.number().int().min(0),
  label: labelSchema.nullish().transform((value) => value ?? null),
})

export const updateMarkerSchema = z.object({
  markerId: idSchema,
  label: labelSchema,
})

export const footageIdSchema = idSchema

export const updateShotSchema = z.object({
  markerId: idSchema,
  shot: shotSchema.nullable(),
})

export const updatePresentationSchema = z.object({
  footageId: idSchema,
  presentation: presentationSchema,
  /** The version this edit started from (a stale one is refused). */
  baseVersion: z.number().int().min(0),
})

export const directEditSchema = z.object({
  footageId: idSchema,
  instruction: z
    .string()
    .trim()
    .min(1, "Describe the ad you want.")
    .max(500, "Keep the instruction under 500 characters."),
  /** What the AI may change. */
  scope: z
    .object({
      camera: z.boolean(),
      cuts: z.boolean(),
      text: z.boolean(),
      graphics: z.boolean(),
      lens: z.boolean(),
    })
    .refine(
      (scope) => Object.values(scope).some(Boolean),
      "Let the AI change at least one thing."
    ),
})

export const moveMarkerSchema = z.object({
  markerId: idSchema,
  atMs: z.number().int().min(0),
})

export const suggestGraphicSchema = z.object({
  footageId: idSchema,
  markerId: idSchema,
})

/** The AI writes a voiceover script for a clip, in a language. */
export const writeVoiceScriptSchema = z.object({
  footageId: idSchema,
  language: z.enum(voiceLanguages),
  note: z.string().trim().max(300, "Keep the note under 300 characters."),
})

/** Voice a script for a clip, line by line. */
export const makeVoiceoverSchema = z.object({
  footageId: idSchema,
  language: z.enum(voiceLanguages),
  script: z
    .string()
    .trim()
    .min(1, "Write the script first.")
    .max(
      voiceLimits.script,
      `Keep the script under ${voiceLimits.script} characters.`
    ),
})

/** "Make it with AI": one recipe picture (V3 M12 step 1b). */
export const makeRecipePictureSchema = z.object({
  footageId: idSchema,
  dish: z.string().trim().min(1, "Name the dish first.").max(recipeLimits.dish),
  kind: z.enum(["ingredient", "step"]),
  text: z.string().trim().min(1).max(recipeLimits.step),
})

/** A recipe's steps read aloud for one clip (V3 M12). */
export const voiceRecipeStepsSchema = z.object({
  footageId: idSchema,
  language: z.enum(voiceLanguages),
  steps: z
    .array(z.string().trim().min(1).max(recipeLimits.step))
    .min(1, "Add at least one step.")
    .max(recipeLimits.steps),
})

/** A clip translated into another language (V3 M13 A). */
export const translateClipSchema = z.object({
  footageId: idSchema,
  language: z.enum(versionLanguages),
  /** The clip as the editor shows it now (saves may still be on the way). */
  presentation: presentationSchema,
})
