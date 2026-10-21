import { z } from "zod"

import { versionLanguages } from "@/shared/motion"

/** The shapes an export can take: the stage's (16:9, 9:16, 1:1). */
export const exportShapes = ["16:9", "9:16", "1:1", "4:5"] as const
export type ExportShape = (typeof exportShapes)[number]
export const exportShapeSchema = z.enum(exportShapes)

/** What gets exported or shared: one clip, or one video. */
export const exportTargetSchema = z.object({
  kind: z.enum(["clip", "video"]),
  id: z.string().min(1),
})
export type ExportTarget = z.infer<typeof exportTargetSchema>

/** A language version to export (V3 M13 A); null = the original. */
export const exportLanguageSchema = z.enum(versionLanguages).nullable()

export const startExportSchema = z.object({
  target: exportTargetSchema,
  shape: exportShapeSchema,
  language: exportLanguageSchema.default(null),
})

export const shareLinkSchema = z.object({
  target: exportTargetSchema,
  enabled: z.boolean(),
})
