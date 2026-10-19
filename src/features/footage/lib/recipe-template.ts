import {
  graphicLimits,
  outputDuration,
  recipeLabels,
  toSource,
  type GraphicItem,
  type Presentation,
  type Recipe,
  type Shot,
} from "@/shared/motion"

import { newGraphic } from "./graphic-templates"
import { noLens } from "./lens-looks"

/**
 * The recipe template (V3 M12, step 1): a cooking clip and a recipe become
 * a 9:16 video — the dish's title, the ingredients ticking in, each step
 * with its number, and an end card. Unlike the style templates
 * (./templates.ts) it keeps the cook's own camera: footage fills the frame
 * instead of sitting in a screen. Pure, one undo step; what it adds carries
 * the templates' `tpl-` ids, so applying it again replaces it.
 */
export const recipeTiming = {
  introMs: 2600,
  endMs: 3000,
  /** The ingredients card: a base plus a little per line, within bounds. */
  listBaseMs: 1600,
  listPerLineMs: 500,
  listMinMs: 2500,
  listMaxMs: 8000,
  stepMinMs: 1500,
  /** A graphic's longest length (graphicItemSchema). */
  itemMaxMs: 15_000,
} as const

type Motion = { shots: Record<string, Shot | null>; presentation: Presentation }

const prefix = "tpl-"

/** The shortest edited clip that fits this recipe. */
export function recipeNeedsMs(recipe: Recipe) {
  const t = recipeTiming
  return (
    t.introMs +
    (recipe.ingredients.length > 0 ? t.listMinMs : 0) +
    recipe.steps.length * t.stepMinMs +
    t.endMs
  )
}

export type RecipeResult =
  | { ok: true; motion: Motion }
  | { ok: false; reason: "too-short"; needMs: number; haveMs: number }
  | { ok: false; reason: "too-many-graphics"; limit: number }

export function applyRecipe(
  recipe: Recipe,
  input: {
    current: Motion
    durationMs: number
    /** The kit's colours, best first; none keeps the clip's background. */
    brandColors: string[]
  }
): RecipeResult {
  const t = recipeTiming
  const { durationMs } = input
  const { edit } = input.current.presentation
  const haveMs = outputDuration(edit, durationMs)
  const needMs = recipeNeedsMs(recipe)
  if (haveMs < needMs) return { ok: false, reason: "too-short", needMs, haveMs }

  const kept = input.current.presentation.graphics.filter(
    (graphic) => !graphic.id.startsWith(prefix)
  )
  const count = 2 + (recipe.ingredients.length > 0 ? 1 : 0) + recipe.steps.length
  if (kept.length + count > graphicLimits.items) {
    return { ok: false, reason: "too-many-graphics", limit: graphicLimits.items }
  }

  const labels = recipeLabels[recipe.language]
  // Ad time → footage time, as every graphic starts in footage time.
  const at = (adMs: number) => Math.round(toSource(edit, durationMs, adMs))
  const graphics: GraphicItem[] = [...kept]

  graphics.push(
    newGraphic("slide", {
      id: `${prefix}intro`,
      atMs: 0,
      durationMs: t.introMs,
      text: recipe.dish,
      secondary: recipe.meta,
      track: 2,
    })
  )

  const endStart = haveMs - t.endMs
  let cursor = t.introMs
  if (recipe.ingredients.length > 0) {
    // As long as its lines need, leaving every step its minimum.
    const room = endStart - cursor - recipe.steps.length * t.stepMinMs
    const listMs = Math.min(
      room,
      Math.max(
        t.listMinMs,
        Math.min(
          t.listMaxMs,
          t.listBaseMs + recipe.ingredients.length * t.listPerLineMs
        )
      )
    )
    graphics.push(
      newGraphic("list", {
        id: `${prefix}list`,
        atMs: at(cursor),
        durationMs: listMs,
        text: labels.ingredients,
        secondary: recipe.ingredients.map((item) => item.text).join("\n"),
        track: 1,
      })
    )
    cursor += listMs
  }

  // The steps share what's left equally.
  const stepMs = (endStart - cursor) / recipe.steps.length
  recipe.steps.forEach((step, index) => {
    const startMs = cursor + index * stepMs
    graphics.push(
      newGraphic("step", {
        id: `${prefix}step-${index + 1}`,
        atMs: at(startMs),
        durationMs: Math.min(t.itemMaxMs, Math.round(stepMs)),
        text: step.text,
        secondary: labels.step(index + 1, recipe.steps.length),
        track: 1,
      })
    )
  })

  graphics.push(
    newGraphic("end-card", {
      id: `${prefix}end`,
      atMs: at(endStart),
      durationMs: t.endMs,
      text: recipe.dish,
      secondary: labels.cta,
      track: 2,
    })
  )

  const { presentation } = input.current
  const [from, to] = input.brandColors
  return {
    ok: true,
    motion: {
      shots: input.current.shots,
      presentation: {
        ...presentation,
        // The cook's footage fills the frame: no screen corners or shadow.
        frame: { ...presentation.frame, radius: 0, shadow: false, padding: 0 },
        lens: noLens,
        textStyle: { animation: "word-rise" },
        ...(from
          ? {
              background: {
                kind: "gradient" as const,
                from,
                to: to ?? from,
              },
            }
          : {}),
        graphics,
        template: "recipe",
        recipe,
      },
    },
  }
}
