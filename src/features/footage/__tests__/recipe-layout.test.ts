import { describe, expect, it } from "vitest"

import { recipeSchema, type Recipe } from "@/shared/motion"

import {
  layoutRecipe,
  recipeTiming,
  type RecipeSlot,
} from "../lib/recipe-layout"

const t = recipeTiming

const recipe = (steps: number, ingredients = 2): Recipe =>
  recipeSchema.parse({
    dish: "Soup",
    ingredients: Array.from({ length: ingredients }, (_, i) => ({
      text: `Ingredient ${i + 1}`,
    })),
    steps: Array.from({ length: steps }, (_, i) => ({ text: `Step ${i + 1}` })),
  })

function slotsOf(result: ReturnType<typeof layoutRecipe>) {
  if (!result.ok) throw new Error(`not laid out: ${result.reason}`)
  return result.slots
}

const steps = (slots: RecipeSlot[]) => slots.filter((s) => s.kind === "step")

describe("layoutRecipe on one clip", () => {
  it("puts the title, checklist, equal steps and end card back to back", () => {
    const slots = slotsOf(layoutRecipe(recipe(3), [20_000]))
    expect(slots.map((s) => [s.kind, s.index, s.startMs, s.endMs])).toEqual([
      ["intro", 0, 0, 2600],
      // 1.6s + 0.5s a line (2.6s for two).
      ["list", 0, 2600, 5200],
      ["step", 0, 5200, 9133],
      ["step", 1, 9133, 13067],
      ["step", 2, 13067, 17000],
      ["end", 0, 17_000, 20_000],
    ])
  })

  it("times voiced steps by their lines, with equal pauses between", () => {
    const spoken = [1200, 2000, 800]
    const slots = slotsOf(layoutRecipe(recipe(3), [20_000], spoken))
    const voiced = steps(slots)
    voiced.forEach((slot, i) => {
      // A breath before and after each line, never more.
      expect(slot.endMs - slot.startMs).toBe(
        spoken[i]! + t.voiceLeadMs + t.voiceTailMs
      )
      expect(slot.voiceAtMs).toBe(slot.startMs + t.voiceLeadMs)
    })
    const list = slots.find((s) => s.kind === "list")!
    const pauses = [
      voiced[0]!.startMs - list.endMs,
      voiced[1]!.startMs - voiced[0]!.endMs,
      voiced[2]!.startMs - voiced[1]!.endMs,
      17_000 - voiced[2]!.endMs,
    ]
    for (const pause of pauses) {
      expect(Math.abs(pause - pauses[0]!)).toBeLessThanOrEqual(1)
    }
  })

  it("shortens the checklist to make room for the steps", () => {
    // 12s: 2.6 title + 3 end card leaves 6.4s; two steps need 3s.
    const slots = slotsOf(layoutRecipe(recipe(2, 4), [12_000]))
    const list = slots.find((s) => s.kind === "list")!
    expect(list.endMs - list.startMs).toBe(3400)
  })

  it("says how long the clip must be", () => {
    expect(layoutRecipe(recipe(3), [8000])).toEqual({
      ok: false,
      reason: "too-short",
      needMs: 2600 + 2500 + 3 * 1500 + 3000,
      haveMs: 8000,
    })
  })
})

describe("layoutRecipe across clips", () => {
  it("runs the steps through the clips, continuing one across a cut", () => {
    const slots = slotsOf(layoutRecipe(recipe(3), [8000, 6000, 7000]))
    expect(slots[0]).toMatchObject({ kind: "intro", clip: 0 })
    expect(slots.at(-1)).toMatchObject({
      kind: "end",
      clip: 2,
      startMs: 4000,
      endMs: 7000,
    })
    // 2.8s after the checklist, 6s, 4s: 12.8s shared by three steps
    // (4.27s each). A piece shorter than a graphic can be (0.27s) is left
    // out: the step shows on the next clip.
    const parts = steps(slots).map((s) => [s.index, s.clip, s.startMs, s.endMs])
    expect(parts).toEqual([
      [0, 0, 5200, 8000],
      [0, 1, 0, 1467],
      [1, 1, 1467, 5733],
      [2, 2, 0, 4000],
    ])
  })

  it("keeps each voiced step inside one clip, its line never cut off", () => {
    const spoken = [2500, 2500, 2500]
    const slots = slotsOf(layoutRecipe(recipe(3), [9000, 5000, 7000], spoken))
    const voiced = steps(slots)
    // Each 3.3s: one fits after the checklist, one in the middle clip, one
    // before the end card.
    expect(voiced.map((s) => s.clip)).toEqual([0, 1, 2])
    for (const slot of voiced) {
      expect(slot.endMs - slot.startMs).toBe(3300)
    }
    // The middle clip's spare 1.7s is split before and after its step.
    expect(voiced[1]).toMatchObject({ startMs: 850, endMs: 4150 })
  })

  it("names the clip that's too short, or the step too long to say", () => {
    expect(layoutRecipe(recipe(1), [3000, 20_000])).toEqual({
      ok: false,
      reason: "first-clip-short",
      needMs: 5100,
      haveMs: 3000,
    })
    expect(layoutRecipe(recipe(1), [20_000, 2000])).toEqual({
      ok: false,
      reason: "last-clip-short",
      needMs: 3000,
      haveMs: 2000,
    })
    expect(layoutRecipe(recipe(2), [9000, 6000, 6000], [2000, 9000])).toEqual(
      { ok: false, reason: "step-too-long", index: 1, needMs: 9800 }
    )
  })

  it("refuses voiced steps that only fit by crossing a cut", () => {
    // 9.9s of steps in 11.4s of room (3.4 + 5 + 3), but the last clip
    // has 3s before its end card and a step needs 3.3s.
    expect(
      layoutRecipe(recipe(3, 0), [6000, 5000, 6000], [2500, 2500, 2500])
    ).toEqual({ ok: false, reason: "steps-dont-fit" })
  })
})
