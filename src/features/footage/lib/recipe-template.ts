import {
  graphicLimits,
  outputDuration,
  recipeLabels,
  toSource,
  type GraphicItem,
  type Presentation,
  type Recipe,
  type RecipeTarget,
  type Shot,
  type Voice,
} from "@/shared/motion"

import { newGraphic } from "./graphic-templates"
import { noLens } from "./lens-looks"
import {
  layoutRecipe,
  recipeTiming,
  type RecipeLayout,
  type RecipeSlot,
} from "./recipe-layout"

export { layoutRecipe, recipeTiming, type RecipeSlot } from "./recipe-layout"

/**
 * The recipe template (V3 M12): a recipe becomes a 9:16 video — the dish's
 * title, the ingredients ticking in, each step with its number, and an end
 * card — on one clip or across every clip of a video (./recipe-layout.ts
 * places them). Unlike the style templates (./templates.ts) it keeps the
 * cook's own camera: footage fills the frame instead of sitting in a
 * screen. With a voiceover, each step is read aloud and lasts as long as
 * its line. Pure, one undo step; what it adds carries the templates'
 * `tpl-` ids, so applying it again replaces it.
 */

type Motion = { shots: Record<string, Shot | null>; presentation: Presentation }

/** One step read aloud: its audio (in the clip's folder) and length. */
export type VoicedStep = {
  id: string
  text: string
  durationMs: number
  audioKey: string
}

const prefix = "tpl-"

/** The shortest edited clip that fits this recipe (no voiceover). */
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
  | Exclude<RecipeLayout, { ok: true }>
  | { ok: false; reason: "too-many-graphics"; limit: number }

/** One clip's part of a laid-out recipe, on top of its current edit. */
export function buildRecipeClip(
  recipe: Recipe,
  input: {
    current: Motion
    durationMs: number
    /** The kit's colours, best first; none keeps the clip's background. */
    brandColors: string[]
    /** This clip's slots (layoutRecipe's, for this clip). */
    slots: RecipeSlot[]
    /** Every step read aloud, in order (audio for this clip's steps). */
    voiced?: VoicedStep[]
    /** One clip, or one of a video's clips. */
    scope: "clip" | "video"
  }
): RecipeResult {
  const t = recipeTiming
  const { durationMs, slots, voiced } = input
  const { presentation } = input.current
  const { edit } = presentation
  const labels = recipeLabels[recipe.language]
  // Ad time → footage time, as every graphic starts in footage time.
  const at = (adMs: number) => Math.round(toSource(edit, durationMs, adMs))
  const length = (slot: RecipeSlot) =>
    Math.max(t.itemMinMs, Math.min(t.itemMaxMs, slot.endMs - slot.startMs))

  const graphics: GraphicItem[] = presentation.graphics.filter(
    (graphic) => !graphic.id.startsWith(prefix)
  )
  if (graphics.length + slots.length > graphicLimits.items) {
    return {
      ok: false,
      reason: "too-many-graphics",
      limit: graphicLimits.items,
    }
  }
  for (const slot of slots) {
    const base = { atMs: at(slot.startMs), durationMs: length(slot) }
    switch (slot.kind) {
      case "intro":
        graphics.push(
          newGraphic("slide", {
            ...base,
            id: `${prefix}intro`,
            text: recipe.dish,
            secondary: recipe.meta,
            track: 2,
          })
        )
        break
      case "list":
        graphics.push(
          newGraphic("list", {
            ...base,
            id: `${prefix}list`,
            text: labels.ingredients,
            secondary: recipe.ingredients.map((item) => item.text).join("\n"),
            images: recipe.ingredients.map((item) => item.imageKey),
            track: 1,
          })
        )
        break
      case "step": {
        const step = recipe.steps[slot.index]!
        graphics.push(
          newGraphic("step", {
            ...base,
            id: `${prefix}step-${slot.index + 1}`,
            text: step.text,
            secondary: labels.step(slot.index + 1, recipe.steps.length),
            images: step.imageKey ? [step.imageKey] : [],
            track: 1,
          })
        )
        break
      }
      case "end":
        graphics.push(
          newGraphic("end-card", {
            ...base,
            id: `${prefix}end`,
            text: recipe.dish,
            secondary: labels.cta,
            track: 2,
          })
        )
        break
    }
  }

  // The steps read aloud on this clip; a recipe voiced before and now
  // without a voice loses that old (no longer timed) narration.
  let voice: Voice | null = presentation.voice
  if (voiced) {
    const lines = slots.flatMap((slot) => {
      const line = voiced[slot.index]
      if (slot.kind !== "step" || slot.voiceAtMs === null || !line) return []
      return [{ ...line, atMs: slot.voiceAtMs }]
    })
    voice =
      lines.length > 0
        ? {
            script: recipe.steps.map((step) => step.text).join("\n"),
            language: recipe.language,
            lines,
            // The step card already shows the words.
            captions: false,
            captionStyle: presentation.voice?.captionStyle ?? "bold",
            volume: presentation.voice?.volume ?? 1,
          }
        : null
  } else if (presentation.recipe?.voiced) {
    voice = null
  }

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
        voice,
        template: input.scope === "video" ? "recipe-video" : "recipe",
        recipe: { ...recipe, voiced: Boolean(voiced) },
      },
    },
  }
}

/** The recipe on one clip (the clip editor's "Build recipe video"). */
export function applyRecipe(
  recipe: Recipe,
  input: {
    current: Motion
    durationMs: number
    brandColors: string[]
    /** Every step read aloud, in order: steps take their lines' length. */
    voiced?: VoicedStep[]
  }
): RecipeResult {
  const { edit } = input.current.presentation
  const haveMs = Math.round(outputDuration(edit, input.durationMs))
  const layout = layoutRecipe(
    recipe,
    [haveMs],
    input.voiced?.map((line) => line.durationMs)
  )
  if (!layout.ok) return layout
  return buildRecipeClip(recipe, {
    ...input,
    slots: layout.slots,
    scope: "clip",
  })
}

/**
 * Gives one ingredient or step a picture (a bucket key; null removes it):
 * on the recipe, and on the graphic the template made for it, so the video
 * shows it without building again (the cook's edits to it stay).
 */
export function setRecipePicture(
  presentation: Presentation,
  target: RecipeTarget,
  key: string | null
): Presentation {
  const recipe = presentation.recipe
  const items =
    target.kind === "ingredient" ? recipe?.ingredients : recipe?.steps
  if (!recipe || !items?.[target.index]) return presentation
  const changed = items.map((item, index) =>
    index === target.index ? { ...item, imageKey: key } : item
  )
  const next: Recipe =
    target.kind === "ingredient"
      ? { ...recipe, ingredients: changed }
      : { ...recipe, steps: changed }
  const graphics = presentation.graphics.map((graphic) => {
    if (target.kind === "ingredient" && graphic.id === `${prefix}list`) {
      return {
        ...graphic,
        images: next.ingredients.map((item) => item.imageKey),
      }
    }
    if (
      target.kind === "step" &&
      graphic.id === `${prefix}step-${target.index + 1}`
    ) {
      return { ...graphic, images: key ? [key] : [] }
    }
    return graphic
  })
  return { ...presentation, recipe: next, graphics }
}
