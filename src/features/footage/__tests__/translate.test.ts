import { beforeAll, describe, expect, it } from "vitest"

import {
  defaultPresentation,
  graphicItemSchema,
  textItemSchema,
  wordsHash,
  type Presentation,
} from "@/shared/motion"
import { failingModel, modelReturning } from "@/shared/testing/mock-model"
import { fillPlaceholderEnv } from "@/shared/testing/placeholder-env"

const clip: Presentation = {
  ...defaultPresentation,
  graphics: [
    graphicItemSchema.parse({
      id: "tpl-list",
      kind: "list",
      atMs: 0,
      durationMs: 3000,
      text: "Nguyên liệu",
      secondary: "200 g mì\n3 tép tỏi",
    }),
    // No words: nothing to translate.
    graphicItemSchema.parse({
      id: "g-ripple",
      kind: "ripple",
      atMs: 0,
      durationMs: 900,
    }),
  ],
  texts: [
    textItemSchema.parse({
      id: "t1",
      atMs: 0,
      durationMs: 2000,
      text: "Nguyên liệu",
      emphasis: "ngon",
      role: "headline",
      x: 0.5,
      y: 0.5,
      align: "center",
    }),
  ],
}

describe("translate", () => {
  let translate: typeof import("../lib/translate")

  beforeAll(async () => {
    fillPlaceholderEnv()
    translate = await import("../lib/translate")
  })

  it("asks once per distinct string and puts the answers back in order", async () => {
    const model = modelReturning(
      JSON.stringify({
        translations: [
          "Ingredients",
          "200 g noodles\n3 garlic cloves",
          "tasty",
        ],
      })
    )
    const out = await translate.translateWords(
      ["Nguyên liệu", "200 g mì\n3 tép tỏi", "", "Nguyên liệu", "ngon"],
      "en",
      { model }
    )
    expect(out).toEqual([
      "Ingredients",
      "200 g noodles\n3 garlic cloves",
      "",
      "Ingredients",
      "tasty",
    ])
    const prompt = JSON.stringify(model.doGenerateCalls[0]!.prompt)
    expect(prompt).toContain("English")
  })

  it("refuses an answer with the wrong number of translations", async () => {
    await expect(
      translate.translateWords(["Một", "Hai"], "en", {
        model: modelReturning(JSON.stringify({ translations: ["One"] })),
      })
    ).rejects.toMatchObject({ code: "PROVIDER_FAILED" })
    await expect(
      translate.translateWords(["Một"], "en", { model: failingModel() })
    ).rejects.toMatchObject({ code: "PROVIDER_FAILED" })
  })

  it("marks each line of a stand-in translation (AI_TEXT_TEST)", () => {
    expect(translate.standInTranslation("Luộc mì\n\nPhi tỏi", "en")).toBe(
      "[EN] Luộc mì\n\n[EN] Phi tỏi"
    )
  })

  it("makes a version keyed by each graphic and text item, with no voice", async () => {
    const model = modelReturning(
      JSON.stringify({
        translations: [
          "Ingredients",
          "200 g noodles\n3 garlic cloves",
          "tasty",
        ],
      })
    )
    const { version, urls } = await translate.translateClip({
      workspaceId: "w",
      kitId: "k",
      footageId: "f",
      presentation: clip,
      language: "en",
      model,
    })
    expect(version.graphics).toEqual({
      "tpl-list": {
        text: "Ingredients",
        secondary: "200 g noodles\n3 garlic cloves",
      },
    })
    // "tasty" isn't in "Ingredients": the emphasis is dropped.
    expect(version.texts).toEqual({ t1: { text: "Ingredients", emphasis: "" } })
    expect(version.voice).toBeNull()
    expect(version.source).toBe(wordsHash(clip))
    expect(urls).toEqual({})
  })
})
