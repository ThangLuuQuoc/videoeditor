import { describe, expect, it } from "vitest"

import {
  allVoiceKeys,
  defaultPresentation,
  graphicItemSchema,
  presentationSchema,
  textItemSchema,
  versionState,
  withLanguageVersion,
  withVersion,
  wordsHash,
  type LanguageVersion,
  type Presentation,
} from "@/shared/motion"

const step = graphicItemSchema.parse({
  id: "tpl-step-1",
  kind: "step",
  atMs: 3000,
  durationMs: 2000,
  text: "Luộc mì",
  secondary: "Bước 1/2",
})
const title = textItemSchema.parse({
  id: "t1",
  atMs: 0,
  durationMs: 2000,
  text: "Mì bơ tỏi ngon",
  emphasis: "ngon",
  role: "headline",
  x: 0.5,
  y: 0.5,
  align: "center",
})
const voice = {
  script: "Luộc mì",
  language: "vi" as const,
  lines: [
    {
      id: "l1",
      text: "Luộc mì",
      atMs: 3300,
      durationMs: 900,
      audioKey: "vi.wav",
    },
  ],
  captions: false,
  captionStyle: "bold" as const,
  volume: 1,
}
const clip: Presentation = {
  ...defaultPresentation,
  graphics: [step],
  texts: [title],
  voice,
}
const english = (source = wordsHash(clip)): LanguageVersion => ({
  language: "en",
  graphics: {
    "tpl-step-1": { text: "Boil the noodles", secondary: "Step 1/2" },
  },
  texts: { t1: { text: "Tasty garlic noodles", emphasis: "Tasty" } },
  voice: {
    ...voice,
    language: "en",
    script: "Boil the noodles",
    lines: [
      { ...voice.lines[0]!, text: "Boil the noodles", audioKey: "en.wav" },
    ],
  },
  source,
})

describe("language versions", () => {
  it("fingerprint the words, not where things are", () => {
    const moved = { ...clip, graphics: [{ ...step, atMs: 5000, track: 3 }] }
    expect(wordsHash(moved)).toBe(wordsHash(clip))
    const reworded = {
      ...clip,
      graphics: [{ ...step, text: "Luộc mì 4 phút" }],
    }
    expect(wordsHash(reworded)).not.toBe(wordsHash(clip))
  })

  it("know when they're missing, current or out of date", () => {
    expect(versionState(clip, "en")).toBe("missing")
    const translated = { ...clip, versions: [english()] }
    expect(versionState(translated, "en")).toBe("current")
    const reworded = {
      ...translated,
      texts: [{ ...title, text: "Mì bơ tỏi" }],
    }
    expect(versionState(reworded, "en")).toBe("stale")
  })

  it("play the clip with the version's words and voice, keeping its layout", () => {
    const moved = {
      ...clip,
      graphics: [{ ...step, atMs: 5000 }],
      versions: [english()],
    }
    const played = withVersion(moved, "en")
    expect(played.graphics[0]).toMatchObject({
      atMs: 5000,
      text: "Boil the noodles",
      secondary: "Step 1/2",
    })
    expect(played.texts[0]).toMatchObject({
      text: "Tasty garlic noodles",
      emphasis: "Tasty",
    })
    expect(played.voice!.lines[0]!.audioKey).toBe("en.wav")
    // The original and an unknown language play as they are.
    expect(withVersion(moved, null)).toBe(moved)
    expect(withVersion(moved, "vi")).toBe(moved)
  })

  it("keep their own words on things added since", () => {
    const added = graphicItemSchema.parse({
      id: "g-new",
      kind: "callout",
      atMs: 0,
      durationMs: 1000,
      text: "Nóng!",
    })
    const played = withVersion(
      { ...clip, graphics: [step, added], versions: [english()] },
      "en"
    )
    expect(played.graphics[1]!.text).toBe("Nóng!")
  })

  it("sign every language's voice, and replace a language's version", () => {
    const translated = { ...clip, versions: [english()] }
    expect(allVoiceKeys(translated).sort()).toEqual(["en.wav", "vi.wav"])
    const again = withLanguageVersion(translated.versions, english("other"))
    expect(again).toHaveLength(1)
    expect(again[0]!.source).toBe("other")
    expect(presentationSchema.safeParse(translated).success).toBe(true)
  })
})
