import { inflateSync } from "node:zlib"

import { MockImageModelV4 } from "ai/test"
import { beforeAll, describe, expect, it } from "vitest"

import { sniffImageType } from "@/shared/lib/image-type"
import { fillPlaceholderEnv } from "@/shared/testing/placeholder-env"

/** The PNG's chunks by type (no CRC check: the decoder below reads them). */
function chunks(png: Uint8Array) {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  const found: Record<string, Uint8Array> = {}
  for (let at = 8; at < png.length; ) {
    const length = view.getUint32(at)
    const type = new TextDecoder().decode(png.subarray(at + 4, at + 8))
    found[type] = png.subarray(at + 8, at + 8 + length)
    at += 12 + length
  }
  return found
}

describe("image", () => {
  let image: typeof import("../image")

  beforeAll(async () => {
    fillPlaceholderEnv()
    image = await import("../image")
  })

  it("asks the configured model for one square picture", async () => {
    const calls: unknown[] = []
    const model = new MockImageModelV4({
      doGenerate: async (options) => {
        calls.push(options)
        return {
          images: [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
          warnings: [],
          response: { timestamp: new Date(), modelId: "mock", headers: {} },
        }
      },
    })
    const result = await image.generatePicture(
      { prompt: "Garlic on a counter" },
      { model }
    )
    expect(sniffImageType(result.image)).toBe("image/png")
    expect(calls[0]).toMatchObject({
      prompt: "Garlic on a counter",
      n: 1,
      size: "1024x1024",
    })
  })

  it("turns a provider failure into a user-safe error", async () => {
    const model = new MockImageModelV4({
      doGenerate: async () => {
        throw new Error("quota exceeded for key sk-123")
      },
    })
    await expect(
      image.generatePicture({ prompt: "Garlic" }, { model })
    ).rejects.toMatchObject({
      code: "PROVIDER_FAILED",
      message: "We couldn’t make the picture. Try again in a moment.",
    })
  })

  it("draws a real 512×512 PNG for the test provider, the same for the same prompt", () => {
    const first = image.testPicture("Garlic")
    expect(first.mediaType).toBe("image/png")
    expect(sniffImageType(first.image)).toBe("image/png")
    const { IHDR, IDAT, IEND } = chunks(first.image)
    const header = new DataView(IHDR!.buffer, IHDR!.byteOffset, IHDR!.length)
    expect([header.getUint32(0), header.getUint32(4)]).toEqual([512, 512])
    expect(IEND).toHaveLength(0)
    // Rows of RGB with a filter byte each.
    expect(inflateSync(IDAT!)).toHaveLength(512 * (512 * 3 + 1))

    expect(image.testPicture("Garlic").image).toEqual(first.image)
    expect(image.testPicture("Butter").image).not.toEqual(first.image)
  })
})
