import "server-only"

import type { LanguageModel } from "ai"

import {
  parseStoredShot,
  presentationFor,
  type Presentation,
  type Shot,
} from "@/shared/motion"

import { getFootage } from "../queries"
import { aimAt } from "./aim"
import { parseStoredAnalysis } from "./analysis"
import { applyPlan } from "./apply-plan"
import { directEdit } from "./direct-edit"
import { parseStoredInsight } from "./insight"
import { parseStoredRecording } from "./recording"
import { applyTemplate, type Template } from "./templates"

type Motion = { shots: Record<string, Shot | null>; presentation: Presentation }

export type TemplatedClip = {
  footageId: string
  /** The clip's presentation version the result was computed from. */
  baseVersion: number
  before: Motion
  after: Motion
}

/** What a template's AI first cut knows about the brand. */
export type TemplateBrand = {
  name: string
  description: string
  audience: string
  tone: string | null
  bannedWords: string[]
  colors: { primary?: string; secondary?: string; accent?: string }
}

/**
 * One clip of a video with a template applied (and, with `withAi`, the AI
 * director's words and graphics under it), from what's saved now. Returns
 * null for a clip that can't take one (not ready, or no key moments).
 * Nothing is saved here: the caller saves every clip in one transaction.
 */
export async function templatedMotion(input: {
  workspaceId: string
  footageId: string
  template: Template
  brand: TemplateBrand
  withAi: boolean
  /** Tests pass a mock model. */
  model?: LanguageModel
}): Promise<TemplatedClip | null> {
  const clip = await getFootage(input.workspaceId, input.footageId)
  if (!clip || clip.status !== "READY" || !clip.durationMs) return null
  if (clip.markers.length === 0) return null

  const durationMs = clip.durationMs
  const analysis = parseStoredAnalysis(clip.analysis)
  const recording = parseStoredRecording(clip.recording)
  const before: Motion = {
    presentation: presentationFor(clip.presentation, input.brand.colors),
    shots: Object.fromEntries(
      clip.markers.map((marker) => [marker.id, parseStoredShot(marker.shot)])
    ),
  }
  const moments = clip.markers.map((marker) => {
    const insight = parseStoredInsight(marker.insight)
    return {
      id: marker.id,
      atMs: marker.atMs,
      label: marker.label,
      insight,
      aim: aimAt({ analysis, recording, insight, atMs: marker.atMs }),
    }
  })
  const idle = analysis?.idle ?? []

  let current = before
  let aiEndCard = false
  if (input.withAi) {
    const plan = await directEdit({
      instruction: input.template.instruction,
      durationMs,
      moments: moments.map((moment) => ({
        id: moment.id,
        atMs: moment.atMs,
        label: moment.label,
        insight: moment.insight,
        aimZoom: moment.aim?.zoom ?? null,
      })),
      stillMs: idle.reduce((sum, r) => sum + r.endMs - r.startMs, 0),
      brand: {
        name: input.brand.name,
        description: input.brand.description,
        audience: input.brand.audience,
        tone: input.brand.tone,
        bannedWords: input.brand.bannedWords,
      },
      model: input.model,
    })
    aiEndCard = plan.endCard !== null
    current = applyPlan(plan, {
      moments,
      current,
      durationMs,
      idle,
      scope: {
        camera: true,
        cuts: true,
        text: true,
        graphics: true,
        lens: true,
      },
    })
  }

  const after = applyTemplate(input.template, {
    moments,
    current,
    durationMs,
    idle,
    brandColors: [
      input.brand.colors.primary,
      input.brand.colors.secondary,
      input.brand.colors.accent,
    ].filter((color): color is string => Boolean(color)),
    copy: { title: input.brand.name, cta: "Try it free" },
    endCard: !aiEndCard,
  })
  return {
    footageId: clip.id,
    baseVersion: clip.presentationVersion,
    before,
    after,
  }
}
