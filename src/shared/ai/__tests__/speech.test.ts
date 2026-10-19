import { MockSpeechModelV4 } from "ai/test"
import { beforeAll, describe, expect, it } from "vitest"

import { fillPlaceholderEnv } from "@/shared/testing/placeholder-env"

describe("speech", () => {
  let speech: typeof import("../speech")

  beforeAll(async () => {
    fillPlaceholderEnv()
    speech = await import("../speech")
  })

  it("asks the configured model for an mp3 of the line", async () => {
    const calls: unknown[] = []
    const model = new MockSpeechModelV4({
      doGenerate: async (options) => {
        calls.push(options)
        return {
          audio: new Uint8Array([1, 2, 3]),
          warnings: [],
          response: { timestamp: new Date(), modelId: "mock", headers: {} },
        }
      },
    })
    const result = await speech.synthesizeSpeech(
      { text: "Xin chào", language: "vi" },
      { model }
    )
    expect([...result.audio]).toEqual([1, 2, 3])
    expect(calls[0]).toMatchObject({
      text: "Xin chào",
      language: "vi",
      outputFormat: "mp3",
    })
  })

  it("turns a provider failure into a user-safe error", async () => {
    const model = new MockSpeechModelV4({
      doGenerate: async () => {
        throw new Error("upstream 500")
      },
    })
    await expect(
      speech.synthesizeSpeech({ text: "x", language: "vi" }, { model })
    ).rejects.toMatchObject({ code: "PROVIDER_FAILED" })
  })

  it("makes a test tone as long as the line takes to say, as a WAV", () => {
    const { audio, mediaType } = speech.testTone("Ra mắt tính năng mới.")
    expect(mediaType).toBe("audio/wav")
    const view = new DataView(audio.buffer)
    expect(String.fromCharCode(...audio.slice(0, 4))).toBe("RIFF")
    const rate = view.getUint32(24, true)
    const seconds = view.getUint32(40, true) / 2 / rate
    expect(seconds).toBeCloseTo(0.3 + 21 * 0.055, 2)
  })
})
