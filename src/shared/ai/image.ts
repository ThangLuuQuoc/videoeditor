import "server-only"

import { createHash } from "node:crypto"
import { deflateSync } from "node:zlib"

import { createOpenAI } from "@ai-sdk/openai"
import { generateImage, type ImageModel } from "ai"

import { env } from "@/shared/config/env"
import { AppError } from "@/shared/lib/errors"

/**
 * Pictures (V3 M12 step 1b) behind the same adapter rule as text and voice
 * (§10): feature code asks for a picture, IMAGE_PROVIDER decides who makes
 * it. "test" draws a plain placeholder PNG from the prompt — for
 * development and CI only. The real provider is still open (V3 Q7).
 */
export const imageEnabled = () => Boolean(env.IMAGE_PROVIDER)

/** True when the configured "pictures" are the development placeholder. */
export const imageIsTest = () => env.IMAGE_PROVIDER === "test"

function imageModel(): ImageModel {
  const model = env.IMAGE_MODEL ?? ""
  switch (env.IMAGE_PROVIDER) {
    case "openai":
      return createOpenAI({ apiKey: env.OPENAI_API_KEY }).image(model)
    default:
      throw new AppError(
        "PROVIDER_FAILED",
        "Picture generation isn’t set up on this server."
      )
  }
}

/** One square picture as image bytes (PNG, JPEG or WebP). */
export async function generatePicture(
  input: { prompt: string },
  options: { model?: ImageModel } = {}
): Promise<{ image: Uint8Array; mediaType: string }> {
  if (!options.model && imageIsTest()) return testPicture(input.prompt)
  try {
    const { image } = await generateImage({
      model: options.model ?? imageModel(),
      prompt: input.prompt,
      size: "1024x1024",
      n: 1,
      maxRetries: 2,
    })
    return { image: image.uint8Array, mediaType: image.mediaType }
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError(
      "PROVIDER_FAILED",
      "We couldn’t make the picture. Try again in a moment.",
      { cause: error }
    )
  }
}

// ── The "test" picture ─────────────────────────────────────────────────────

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(new TextEncoder().encode(type), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** HSL (0–360, 0–1, 0–1) → RGB bytes. */
function hsl(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)) as [
    number,
    number,
    number,
  ]
}

/**
 * The "test" picture: a 512×512 PNG — a soft diagonal gradient in a colour
 * taken from the prompt, with a light plate in the middle. The same prompt
 * always gives the same picture.
 */
export function testPicture(prompt: string): {
  image: Uint8Array
  mediaType: string
} {
  const size = 512
  const hue = createHash("sha256").update(prompt).digest()[0]! * (360 / 256)
  const raw = new Uint8Array(size * (size * 3 + 1))
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1)
    raw[row] = 0 // no filter
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2
      const dy = y - size / 2
      const plate = Math.hypot(dx, dy) < size * 0.3
      const [r, g, b] = plate
        ? hsl(hue, 0.25, 0.92)
        : hsl(hue, 0.55, 0.42 + ((x + y) / (2 * size)) * 0.2)
      raw.set([r, g, b], row + 1 + x * 3)
    }
  }
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, size)
  view.setUint32(4, size)
  header.set([8, 2, 0, 0, 0], 8) // 8-bit RGB, no interlace
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array()),
  ]
  const image = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0))
  let offset = 0
  for (const part of parts) {
    image.set(part, offset)
    offset += part.length
  }
  return { image, mediaType: "image/png" }
}
