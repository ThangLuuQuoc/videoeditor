import { describe, expect, it } from "vitest"

import {
  defaultPresentation,
  placeLines,
  type Presentation,
  type Transition,
} from "@/shared/motion"

import { wordIndexAt } from "../components/VoiceCaptions"
import type { ProjectStageClip } from "../compositions/ProjectStage"
import { voiceTracks } from "../voice-tracks"

const cut: Transition = { kind: "cut", durationMs: 0, direction: "left" }

function clip(
  id: string,
  durationMs: number,
  lines: { text: string; durationMs: number }[],
  urls = true
): ProjectStageClip {
  const placed = placeLines(
    lines.map((line, i) => ({
      ...line,
      id: `${id}${i}`,
      audioKey: `${id}/${i}.wav`,
    }))
  )
  const presentation: Presentation = {
    ...defaultPresentation,
    voice: lines.length
      ? {
          script: "",
          language: "vi",
          lines: placed,
          captions: true,
          captionStyle: "bold",
          volume: 0.8,
        }
      : null,
  }
  return {
    id,
    videoUrl: "",
    videoWidth: 1920,
    videoHeight: 1080,
    presentation,
    shots: [],
    durationMs,
    transition: cut,
    voiceUrls: urls
      ? Object.fromEntries(
          placed.map((line) => [line.audioKey, `https://x/${line.audioKey}`])
        )
      : {},
  }
}

describe("voiceTracks", () => {
  it("puts each clip's lines where the clip plays, at its volume", () => {
    const tracks = voiceTracks([
      clip("a", 3000, [{ text: "One.", durationMs: 1000 }]),
      clip("b", 4000, [{ text: "Two.", durationMs: 800 }]),
    ])
    expect(tracks).toEqual([
      expect.objectContaining({
        src: "https://x/a/0.wav",
        startMs: 400,
        durationMs: 1000,
        volume: 0.8,
      }),
      expect.objectContaining({
        src: "https://x/b/0.wav",
        startMs: 3400,
        durationMs: 800,
      }),
    ])
  })

  it("cuts a line at its clip's end and drops lines that start after it", () => {
    const tracks = voiceTracks([
      clip("a", 2000, [
        { text: "Long.", durationMs: 3000 },
        { text: "Too late.", durationMs: 500 },
      ]),
    ])
    expect(tracks).toHaveLength(1)
    expect(tracks[0]).toMatchObject({ startMs: 400, durationMs: 1600 })
  })

  it("skips lines without a signed link, and clips without a voiceover", () => {
    expect(
      voiceTracks([clip("a", 3000, [{ text: "x", durationMs: 500 }], false)])
    ).toEqual([])
    expect(voiceTracks([clip("a", 3000, [])])).toEqual([])
  })
})

describe("caption words", () => {
  it("moves through the words by their length", () => {
    const words = ["Ra", "mắt", "tính", "năng"]
    expect(wordIndexAt(words, 0)).toBe(0)
    expect(wordIndexAt(words, 0.5)).toBe(2)
    expect(wordIndexAt(words, 0.999)).toBe(3)
  })
})
