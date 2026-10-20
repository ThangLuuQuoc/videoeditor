import { describe, expect, it } from "vitest"

import {
  defaultPresentation,
  pictureKeys,
  presentationSchema,
  recipeLines,
  recipeSchema,
  toOutputNearest,
  type Presentation,
  type Recipe,
} from "@/shared/motion"

import { recipeProblem } from "../components/recipe-form"
import { newGraphic } from "../lib/graphic-templates"
import {
  applyRecipe,
  recipeNeedsMs,
  recipeTiming,
  setRecipePicture,
} from "../lib/recipe-template"

const recipe: Recipe = recipeSchema.parse({
  dish: "Garlic butter noodles",
  meta: "15 min · serves 2",
  ingredients: [
    { text: "200 g noodles" },
    { text: "3 cloves garlic" },
    { text: "2 tbsp butter" },
  ],
  steps: [
    { text: "Boil the noodles" },
    { text: "Melt the butter with the garlic" },
    { text: "Toss and serve" },
  ],
  language: "vi",
})

const clip = (presentation: Presentation = defaultPresentation) => ({
  current: { shots: {}, presentation },
  durationMs: 30_000,
  brandColors: ["#f97316", "#7c2d12"],
})

function built(input = clip(), each: Recipe = recipe) {
  const result = applyRecipe(each, input)
  if (!result.ok) throw new Error(`not built: ${result.reason}`)
  return result.motion.presentation
}

/** Each graphic's [start, end] in ad time. */
function adTimes(presentation: Presentation, durationMs = 30_000) {
  return presentation.graphics.map((graphic) => {
    const start = toOutputNearest(presentation.edit, durationMs, graphic.atMs)
    return { id: graphic.id, start, end: start + graphic.durationMs }
  })
}

describe("recipeLines", () => {
  it("takes one item per line, without list marks or blank lines", () => {
    expect(
      recipeLines("- 2 eggs\n\n• 200 g flour\r\n1. Whisk\n2) Bake  \n   ")
    ).toEqual(["2 eggs", "200 g flour", "Whisk", "Bake"])
  })

  it("keeps numbers that are part of the words", () => {
    expect(recipeLines("200 g flour\n3 cloves garlic")).toEqual([
      "200 g flour",
      "3 cloves garlic",
    ])
  })
})

describe("recipeProblem", () => {
  it("asks for a dish and at least one step", () => {
    expect(recipeProblem({ dish: " ", ingredients: [], steps: ["a"] })).toBe(
      "Name the dish."
    )
    expect(recipeProblem({ dish: "Soup", ingredients: [], steps: [] })).toBe(
      "Add at least one step."
    )
    expect(
      recipeProblem({ dish: "Soup", ingredients: [], steps: ["Heat"] })
    ).toBeNull()
  })

  it("names the limit that was passed", () => {
    const many = Array.from({ length: 11 }, (_, i) => `Step ${i}`)
    expect(recipeProblem({ dish: "Soup", ingredients: [], steps: many })).toBe(
      "Up to 10 steps."
    )
  })
})

describe("applyRecipe", () => {
  it("lays out the intro, ingredients, every step and the end card in order", () => {
    const presentation = built()
    expect(presentation.graphics.map((g) => [g.id, g.kind])).toEqual([
      ["tpl-intro", "slide"],
      ["tpl-list", "list"],
      ["tpl-step-1", "step"],
      ["tpl-step-2", "step"],
      ["tpl-step-3", "step"],
      ["tpl-end", "end-card"],
    ])
    const times = adTimes(presentation)
    expect(times[0]).toMatchObject({ start: 0, end: recipeTiming.introMs })
    // Back to back, ending with the end card on the clip's last 3 seconds.
    for (let i = 1; i < times.length; i++) {
      expect(Math.abs(times[i]!.start - times[i - 1]!.end)).toBeLessThanOrEqual(1)
    }
    expect(times.at(-1)).toMatchObject({ start: 27_000, end: 30_000 })
  })

  it("writes the recipe into the graphics, with labels in its language", () => {
    const byId = new Map(built().graphics.map((g) => [g.id, g]))
    expect(byId.get("tpl-intro")).toMatchObject({
      text: "Garlic butter noodles",
      secondary: "15 min · serves 2",
    })
    expect(byId.get("tpl-list")).toMatchObject({
      text: "Nguyên liệu",
      secondary: "200 g noodles\n3 cloves garlic\n2 tbsp butter",
    })
    expect(byId.get("tpl-step-2")).toMatchObject({
      text: "Melt the butter with the garlic",
      secondary: "Bước 2/3",
    })
    expect(byId.get("tpl-end")).toMatchObject({ secondary: "Lưu công thức" })
  })

  it("fills the frame with the footage and keeps the recipe for the form", () => {
    const presentation = built()
    expect(presentation.frame).toMatchObject({
      radius: 0,
      shadow: false,
      padding: 0,
    })
    expect(presentation.lens.depthOfField.enabled).toBe(false)
    expect(presentation.background).toMatchObject({ from: "#f97316" })
    expect(presentation.template).toBe("recipe")
    expect(presentation.recipe).toEqual(recipe)
    // What it builds is a valid presentation (saved as is).
    expect(presentationSchema.safeParse(presentation).success).toBe(true)
  })

  it("replaces what it made before and keeps the cook's own graphics", () => {
    const own = newGraphic("callout", { id: "g-own", atMs: 5000, text: "Hot!" })
    const once = built(clip({ ...defaultPresentation, graphics: [own] }))
    const twice = built(clip(once), { ...recipe, steps: recipe.steps.slice(0, 1) })
    expect(twice.graphics.map((g) => g.id)).toEqual([
      "g-own",
      "tpl-intro",
      "tpl-list",
      "tpl-step-1",
      "tpl-end",
    ])
  })

  it("skips the checklist when there are no ingredients", () => {
    const ids = built(clip(), { ...recipe, ingredients: [] }).graphics.map(
      (g) => g.id
    )
    expect(ids).toEqual([
      "tpl-intro",
      "tpl-step-1",
      "tpl-step-2",
      "tpl-step-3",
      "tpl-end",
    ])
  })

  it("places graphics in footage time when the clip has cuts", () => {
    // 0–10s kept, 10–20s removed, 20–30s kept: a 20s ad.
    const cut = {
      kind: "cut",
      durationMs: 0,
      direction: "left",
    } as const
    const edit = {
      parts: [
        { startMs: 0, removed: false, speed: 1, transition: cut },
        { startMs: 10_000, removed: true, speed: 1, transition: cut },
        { startMs: 20_000, removed: false, speed: 1, transition: cut },
      ],
    }
    const presentation = built(clip({ ...defaultPresentation, edit }))
    const end = presentation.graphics.find((g) => g.id === "tpl-end")!
    // The ad's last 3s (17–20s) are footage 27–30s.
    expect(end.atMs).toBe(27_000)
  })

  it("refuses a clip too short for its steps, saying how long it needs", () => {
    const result = applyRecipe(recipe, { ...clip(), durationMs: 8000 })
    expect(result).toEqual({
      ok: false,
      reason: "too-short",
      needMs: recipeNeedsMs(recipe),
      haveMs: 8000,
    })
    expect(recipeNeedsMs(recipe)).toBe(2600 + 2500 + 3 * 1500 + 3000)
  })

  it("refuses when the clip would hold more graphics than allowed", () => {
    const graphics = Array.from({ length: 27 }, (_, i) =>
      newGraphic("callout", { id: `g${i}`, atMs: i * 100 })
    )
    const result = applyRecipe(
      recipe,
      clip({ ...defaultPresentation, graphics })
    )
    expect(result).toEqual({ ok: false, reason: "too-many-graphics", limit: 30 })
  })

  it("caps a long step at a graphic's longest length", () => {
    const presentation = built(
      { ...clip(), durationMs: 120_000 },
      { ...recipe, steps: recipe.steps.slice(0, 1) }
    )
    const step = presentation.graphics.find((g) => g.id === "tpl-step-1")!
    expect(step.durationMs).toBe(recipeTiming.itemMaxMs)
  })
})

describe("recipe pictures", () => {
  const withPictures: Recipe = {
    ...recipe,
    ingredients: recipe.ingredients.map((item, index) => ({
      ...item,
      imageKey: index === 1 ? "pictures/garlic.png" : null,
    })),
    steps: recipe.steps.map((item, index) => ({
      ...item,
      imageKey: index === 0 ? "pictures/boil.png" : null,
    })),
  }

  it("puts the recipe's pictures on the checklist's lines and the steps", () => {
    const byId = new Map(
      built(clip(), withPictures).graphics.map((g) => [g.id, g])
    )
    expect(byId.get("tpl-list")!.images).toEqual([
      null,
      "pictures/garlic.png",
      null,
    ])
    expect(byId.get("tpl-step-1")!.images).toEqual(["pictures/boil.png"])
    expect(byId.get("tpl-step-2")!.images).toEqual([])
  })

  it("sets one picture on the recipe and its graphic, keeping the cook's edits", () => {
    const presentation = built()
    const edited = {
      ...presentation,
      graphics: presentation.graphics.map((g) =>
        g.id === "tpl-step-2" ? { ...g, backgroundColor: "#000000" } : g
      ),
    }
    const step = setRecipePicture(
      edited,
      { kind: "step", index: 1 },
      "pictures/melt.png"
    )
    expect(step.recipe!.steps[1]!.imageKey).toBe("pictures/melt.png")
    const graphic = step.graphics.find((g) => g.id === "tpl-step-2")!
    expect(graphic.images).toEqual(["pictures/melt.png"])
    expect(graphic.backgroundColor).toBe("#000000")

    const ingredient = setRecipePicture(
      step,
      { kind: "ingredient", index: 2 },
      "pictures/butter.png"
    )
    expect(
      ingredient.graphics.find((g) => g.id === "tpl-list")!.images
    ).toEqual([null, null, "pictures/butter.png"])
    expect(pictureKeys(ingredient).sort()).toEqual([
      "pictures/butter.png",
      "pictures/melt.png",
    ])

    // Removing it clears both; a target that isn't there changes nothing.
    const removed = setRecipePicture(
      ingredient,
      { kind: "step", index: 1 },
      null
    )
    expect(removed.graphics.find((g) => g.id === "tpl-step-2")!.images).toEqual(
      []
    )
    expect(pictureKeys(removed)).toEqual(["pictures/butter.png"])
    expect(
      setRecipePicture(removed, { kind: "step", index: 9 }, "x.png")
    ).toBe(removed)
    expect(presentationSchema.safeParse(removed).success).toBe(true)
  })
})

describe("recipe read aloud", () => {
  const voiced = recipe.steps.map((step, index) => ({
    id: `line-${index}`,
    text: step.text,
    durationMs: 1500 + index * 500,
    audioKey: `voice/${index}.wav`,
  }))

  it("voices each step on its card, which lasts as long as the line", () => {
    const result = applyRecipe(
      { ...recipe, voiced: true },
      { ...clip(), voiced }
    )
    if (!result.ok) throw new Error(result.reason)
    const { presentation } = result.motion
    const lines = presentation.voice!.lines
    expect(lines.map((line) => line.audioKey)).toEqual([
      "voice/0.wav",
      "voice/1.wav",
      "voice/2.wav",
    ])
    const times = adTimes(presentation)
    lines.forEach((line, index) => {
      const card = times.find((g) => g.id === `tpl-step-${index + 1}`)!
      expect(line.atMs).toBe(card.start + recipeTiming.voiceLeadMs)
      expect(card.end - card.start).toBe(
        line.durationMs + recipeTiming.voiceLeadMs + recipeTiming.voiceTailMs
      )
    })
    // The card shows the words, so no captions; the recipe remembers.
    expect(presentation.voice!.captions).toBe(false)
    expect(presentation.recipe!.voiced).toBe(true)
    expect(presentationSchema.safeParse(presentation).success).toBe(true)
  })

  it("drops its own old narration when built again without a voice", () => {
    const once = applyRecipe({ ...recipe, voiced: true }, { ...clip(), voiced })
    if (!once.ok) throw new Error(once.reason)
    const again = built(clip(once.motion.presentation))
    expect(again.voice).toBeNull()
    expect(again.recipe!.voiced).toBe(false)
  })

  it("keeps a voiceover the cook made themselves", () => {
    const own = {
      script: "Hello",
      language: "en" as const,
      lines: [
        { id: "l", text: "Hello", atMs: 400, durationMs: 900, audioKey: "k" },
      ],
      captions: true,
      captionStyle: "bold" as const,
      volume: 1,
    }
    expect(built(clip({ ...defaultPresentation, voice: own })).voice).toEqual(
      own
    )
  })
})
