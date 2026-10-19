import { describe, expect, it } from "vitest"

import {
  lineAt,
  placeLines,
  splitScript,
  voiceEndMs,
  voiceKeys,
  voiceLimits,
  type Voice,
} from "../voice"

describe("splitScript", () => {
  it("makes one line per sentence and drops blanks", () => {
    expect(
      splitScript(
        "Ra mắt tính năng mới.  Xuất video chỉ trong vài phút!\n\nDùng thử miễn phí?"
      )
    ).toEqual([
      "Ra mắt tính năng mới.",
      "Xuất video chỉ trong vài phút!",
      "Dùng thử miễn phí?",
    ])
  })

  it("splits a long sentence at a comma, or between words", () => {
    const long = `${"word ".repeat(20).trim()}, ${"more ".repeat(20).trim()}.`
    const lines = splitScript(long)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(120)
    expect(lines.join(" ").replace(/\s+/g, " ")).toBe(long)
  })

  it("keeps at most the line limit", () => {
    expect(splitScript("Hi. ".repeat(50))).toHaveLength(voiceLimits.lines)
  })
})

describe("placing lines", () => {
  const lines = placeLines([
    { id: "a", text: "One.", durationMs: 1000, audioKey: "k/a.wav" },
    { id: "b", text: "Two.", durationMs: 500, audioKey: "k/b.wav" },
  ])
  const voice: Voice = {
    script: "One. Two.",
    language: "vi",
    lines,
    captions: true,
    captionStyle: "bold",
    volume: 1,
  }

  it("starts after the lead-in, one after another with a gap", () => {
    expect(lines.map((line) => line.atMs)).toEqual([
      voiceLimits.leadMs,
      voiceLimits.leadMs + 1000 + voiceLimits.gapMs,
    ])
    expect(voiceEndMs(voice)).toBe(
      voiceLimits.leadMs + 1000 + voiceLimits.gapMs + 500
    )
    expect(voiceEndMs(null)).toBe(0)
  })

  it("knows the line being spoken, and the files to sign", () => {
    expect(lineAt(voice, 0)).toBeNull()
    expect(lineAt(voice, voiceLimits.leadMs + 10)?.id).toBe("a")
    expect(lineAt(voice, voiceLimits.leadMs + 1100)).toBeNull()
    expect(lineAt(voice, voiceLimits.leadMs + 1300)?.id).toBe("b")
    expect(voiceKeys(voice)).toEqual(["k/a.wav", "k/b.wav"])
    expect(voiceKeys(null)).toEqual([])
  })
})
