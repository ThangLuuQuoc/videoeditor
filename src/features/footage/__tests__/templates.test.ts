import { describe, expect, it } from "vitest"

import { defaultPresentation, outputDuration } from "@/shared/motion"

import { newGraphic } from "../lib/graphic-templates"
import {
  applyTemplate,
  templateById,
  templateIds,
  templates,
  templateTransition,
} from "../lib/templates"

const moments = [
  { id: "m1", atMs: 1000 },
  { id: "m2", atMs: 4000 },
  { id: "m3", atMs: 7000 },
]
const base = {
  moments,
  current: { shots: {}, presentation: defaultPresentation },
  durationMs: 10_000,
  idle: [{ startMs: 5000, endMs: 6500 }],
  brandColors: ["#22c55e", "#0f172a"],
  copy: { title: "Acme", cta: "Try it free" },
}
const launch = templateById("launch")!

describe("templates", () => {
  it("has the four templates of the build plan, each complete", () => {
    expect(templates.map((t) => t.id)).toEqual([...templateIds])
    for (const template of templates) {
      expect(template.instruction.length).toBeGreaterThan(20)
    }
    expect(templateById("social-ad")?.shape).toBe("9:16")
  })
})

describe("applyTemplate", () => {
  it("sets the look's shots and intro, the text style, lens and brand background", () => {
    const { shots, presentation } = applyTemplate(launch, base)
    expect(Object.keys(shots).sort()).toEqual(["m1", "m2", "m3"])
    expect(presentation.intro.kind).toBe("rise")
    expect(presentation.textStyle.animation).toBe("word-rise")
    expect(presentation.lens.depthOfField.enabled).toBe(true)
    expect(presentation.background).toEqual({
      kind: "gradient",
      from: "#22c55e",
      to: "#0f172a",
    })
    expect(presentation.template).toBe("launch")
  })

  it("keeps the background when the kit has no colours", () => {
    const { presentation } = applyTemplate(launch, { ...base, brandColors: [] })
    expect(presentation.background).toEqual(defaultPresentation.background)
  })

  it("handles still parts its way and joins every part with its transition", () => {
    const cut = applyTemplate(templateById("feature-demo")!, base).presentation
    expect(cut.edit.parts.some((part) => part.removed)).toBe(true)
    expect(outputDuration(cut.edit, 10_000)).toBeLessThan(10_000)
    for (const part of cut.edit.parts.slice(1)) {
      expect(part.transition).toEqual(
        templateTransition(templateById("feature-demo")!)
      )
    }
    const sped = applyTemplate(launch, base).presentation
    expect(sped.edit.parts.some((part) => part.speed === 4)).toBe(true)
    expect(sped.edit.parts.some((part) => part.removed)).toBe(false)
  })

  it("adds an intro slide and an end card in the last 3 seconds", () => {
    const { presentation } = applyTemplate(launch, base)
    const slide = presentation.graphics.find((g) => g.kind === "slide")
    expect(slide).toMatchObject({ atMs: 0, text: "Acme" })
    const end = presentation.graphics.find((g) => g.kind === "end-card")
    expect(end).toMatchObject({ text: "Acme", secondary: "Try it free" })
    // Footage time of the ad's last 3s: the 1.5s still part is sped up 4×.
    const adEnd = outputDuration(presentation.edit, 10_000)
    expect(adEnd).toBeLessThan(10_000)
    expect(end!.atMs).toBeGreaterThan(5000)
    expect(
      applyTemplate(
        templateById("feature-demo")!,
        base
      ).presentation.graphics.some((g) => g.kind === "slide")
    ).toBe(false)
  })

  it("replaces what an earlier template added and keeps the owner's own graphics", () => {
    const own = newGraphic("stat", { atMs: 2000, text: "3×" })
    const once = applyTemplate(launch, {
      ...base,
      current: {
        shots: {},
        presentation: { ...defaultPresentation, graphics: [own] },
      },
    })
    const twice = applyTemplate(templateById("walkthrough")!, {
      ...base,
      current: once,
    })
    const kinds = twice.presentation.graphics.map((g) => g.kind).sort()
    expect(kinds).toEqual(["end-card", "stat"])
    expect(twice.presentation.graphics).toContainEqual(own)
    expect(twice.presentation.template).toBe("walkthrough")
  })

  it("keeps an end card the clip already has (e.g. from the AI's plan)", () => {
    const card = newGraphic("end-card", { atMs: 8000, text: "Ship faster" })
    const { presentation } = applyTemplate(launch, {
      ...base,
      current: {
        shots: {},
        presentation: { ...defaultPresentation, graphics: [card] },
      },
    })
    const cards = presentation.graphics.filter((g) => g.kind === "end-card")
    expect(cards).toEqual([card])
  })
})
