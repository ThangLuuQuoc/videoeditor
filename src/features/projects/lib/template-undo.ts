import { z } from "zod"

import {
  presentationSchema,
  shotSchema,
  transitionSchema,
} from "@/shared/motion"

/**
 * What a video's template replaced (projects.templateUndo), so "Undo
 * template" restores every clip in one change. It only undoes while nothing
 * changed since: the video at `appliedVersion`, each clip at its
 * `versionAfter`.
 */
export const templateUndoSchema = z.object({
  templateId: z.string(),
  withAi: z.boolean(),
  appliedVersion: z.number().int(),
  clips: z.array(
    z.object({
      footageId: z.string(),
      versionAfter: z.number().int(),
      presentation: presentationSchema,
      shots: z.record(z.string(), shotSchema.nullable()),
    })
  ),
  /** Each project clip's transition before, by its row id. */
  transitions: z.array(
    z.object({ clipId: z.string(), transition: transitionSchema })
  ),
})
export type TemplateUndo = z.output<typeof templateUndoSchema>

/** The stored snapshot, or null when there's none (or it's unreadable). */
export function parseTemplateUndo(value: unknown): TemplateUndo | null {
  if (value === null || value === undefined) return null
  const parsed = templateUndoSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
