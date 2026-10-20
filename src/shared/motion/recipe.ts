import { z } from "zod"

import { voiceLanguages, type VoiceLanguage } from "./voice"

/**
 * A recipe for the recipe template (V3 M12): what the cook fills in once —
 * the dish, its ingredients and its steps — kept on the presentation so the
 * form opens with it again. Each ingredient and step may carry a picture
 * (an object key in the bucket), uploaded or generated (M12 step 1b).
 */
export const recipeLimits = {
  dish: 60,
  meta: 60,
  ingredient: 60,
  ingredients: 12,
  step: 140,
  steps: 10,
} as const

const recipeItem = (max: number) =>
  z.object({
    text: z.string().trim().min(1).max(max),
    /** A picture for it, in the bucket; null = none yet. */
    imageKey: z.string().max(300).nullable().default(null),
  })

export const recipeSchema = z.object({
  dish: z.string().trim().min(1).max(recipeLimits.dish),
  /** One line under the dish's name: "25 min · serves 2". */
  meta: z.string().trim().max(recipeLimits.meta).default(""),
  ingredients: z
    .array(recipeItem(recipeLimits.ingredient))
    .max(recipeLimits.ingredients)
    .default([]),
  steps: z.array(recipeItem(recipeLimits.step)).min(1).max(recipeLimits.steps),
  /** The language of the words the template adds ("Ingredients", "Step 2/5"). */
  language: z.enum(voiceLanguages).default("en"),
  /** Its steps are read aloud (the voiceover), each as long as its line. */
  voiced: z.boolean().default(false),
})
export type Recipe = z.output<typeof recipeSchema>
export type RecipeInput = z.input<typeof recipeSchema>

export const recipeLabels: Record<
  VoiceLanguage,
  { ingredients: string; step: (n: number, of: number) => string; cta: string }
> = {
  en: {
    ingredients: "Ingredients",
    step: (n, of) => `Step ${n}/${of}`,
    cta: "Save this recipe",
  },
  vi: {
    ingredients: "Nguyên liệu",
    step: (n, of) => `Bước ${n}/${of}`,
    cta: "Lưu công thức",
  },
}

/** Which picture of a recipe: an ingredient's or a step's, by position. */
export type RecipeTarget = { kind: "ingredient" | "step"; index: number }

/**
 * Every picture a clip shows or offers, as bucket keys: its graphics' and
 * its recipe's (the form shows those). Signed for the stage and editor.
 */
export function pictureKeys(presentation: {
  graphics: { images: (string | null)[] }[]
  recipe: Recipe | null
}) {
  const keys = new Set<string>()
  for (const graphic of presentation.graphics) {
    for (const key of graphic.images) if (key) keys.add(key)
  }
  const recipe = presentation.recipe
  for (const item of [...(recipe?.ingredients ?? []), ...(recipe?.steps ?? [])]) {
    if (item.imageKey) keys.add(item.imageKey)
  }
  return [...keys]
}

/**
 * Lines typed or pasted into a box, one item each: blank lines dropped,
 * list marks ("-", "•", "1.", "2)") removed.
 */
export function recipeLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(/^(?:[-*•–]|\d{1,2}[.)])\s*/u, "")
        .trim()
    )
    .filter(Boolean)
}
