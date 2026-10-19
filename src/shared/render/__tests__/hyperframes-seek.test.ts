import { createReadStream, statSync } from "node:fs"
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import type { RenderProps } from "@/remotion/RenderVideo"
import { fillPlaceholderEnv } from "@/shared/testing/placeholder-env"

// A real HyperFrames render (headless Chrome + ffmpeg), so it runs where the
// export render test runs (CI's STORAGE_TESTS) or on request (RENDER_TESTS=1).
const runs = Boolean(
  process.env.NEON_BRANCH ||
  process.env.STORAGE_TESTS ||
  process.env.RENDER_TESTS
)

const fps = 30
const bits = 9
// Decoded at a small size: one barcode bit is ~25px wide there.
const W = 240
const H = 135

/**
 * 12s of 1920×1080 footage whose frames each show their own number as a
 * 9-bit barcode (white boxes across the middle), with a keyframe only every
 * 2s, like a screen recording. drawbox only, so no font is needed.
 */
function barcodeFilter() {
  const boxes = Array.from({ length: bits }, (_, k) => {
    const value = 1 << (bits - 1 - k)
    const x = Math.round((k * 1920) / bits)
    return `drawbox=x=${x}:y=432:w=213:h=216:color=white:t=fill:enable='eq(mod(floor(n/${value})\\,2)\\,1)'`
  })
  return boxes.join(",")
}

/** Serves `file` with byte ranges, as S3 does (browsers seek through them). */
function serve(file: string) {
  const size = statSync(file).size
  const server = createServer((req, res) => {
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "")
    const headers = { "Accept-Ranges": "bytes", "Content-Type": "video/mp4" }
    if (!range) {
      res.writeHead(200, { ...headers, "Content-Length": size })
      createReadStream(file).pipe(res)
      return
    }
    const start = range[1] ? Number(range[1]) : size - Number(range[2])
    const end =
      range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
    res.writeHead(206, {
      ...headers,
      "Content-Length": end - start + 1,
      "Content-Range": `bytes ${start}-${end}/${size}`,
    })
    createReadStream(file, { start, end }).pipe(res)
  })
  return new Promise<Server>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(server))
  )
}

describe.runIf(runs)("HyperFrames render: footage seeks", () => {
  let dir: string
  let server: Server
  let media: typeof import("@/shared/media")

  beforeAll(async () => {
    fillPlaceholderEnv()
    process.env.RENDER_ENGINE = "hyperframes"
    media = await import("@/shared/media")
    dir = await mkdtemp(join(tmpdir(), "reelpilot-seek-test-"))
    const footage = join(dir, "footage.mp4")
    await media.runFfmpeg(
      [
        "-hide_banner",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=0x1e293b:s=1920x1080:r=30:d=12",
        "-vf",
        barcodeFilter(),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-g",
        "60",
        "-keyint_min",
        "60",
        "-sc_threshold",
        "0",
        "-an",
        footage,
      ],
      { timeoutMs: 120_000 }
    )
    server = await serve(footage)
  }, 180_000)

  afterAll(async () => {
    server?.close()
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it("shows the exact footage frame across a cut and a 2× part", async () => {
    const { renderVideo } = await import("@/shared/render")
    const { outputLayout } = await import("@/shared/motion")
    const { defaultPresentation } = await import("@/shared/motion")
    const { framesFor } = await import("@/remotion/compositions/FootageStage")

    const { port } = server.address() as AddressInfo
    const cut = { kind: "cut", durationMs: 0, direction: "left" } as const
    const edit = {
      parts: [
        { startMs: 0, removed: false, speed: 1, transition: cut },
        { startMs: 3000, removed: true, speed: 1, transition: cut },
        { startMs: 5000, removed: false, speed: 2, transition: cut },
      ],
    }
    const props: RenderProps = {
      shape: "16:9",
      clips: [
        {
          id: "seek",
          videoUrl: `http://127.0.0.1:${port}/footage.mp4`,
          videoWidth: 1920,
          videoHeight: 1080,
          durationMs: 12000,
          shots: [],
          transition: cut,
          presentation: { ...defaultPresentation, edit },
        },
      ],
    }
    const output = join(dir, "render.mp4")
    const { durationMs } = await renderVideo({ props, outputPath: output })
    expect(durationMs).toBe(6500)

    // What each output frame must show: the same arithmetic FootageStage
    // uses for its Sequence + OffthreadVideo per part.
    const expected: number[] = []
    for (const part of outputLayout(edit, 12000)) {
      const from = Math.round((part.outStartMs / 1000) * fps)
      const to = Math.round((part.outEndMs / 1000) * fps)
      const trimBefore = Math.round((part.startMs / 1000) * fps)
      for (let f = from; f < to; f++) {
        expected[f] = Math.floor(trimBefore + (f - from) * part.speed + 1e-6)
      }
    }
    expect(expected).toHaveLength(framesFor(6500))

    const raw = join(dir, "frames.rgb")
    await media.runFfmpeg(
      [
        "-v",
        "error",
        "-y",
        "-i",
        output,
        "-vf",
        `scale=${W}:${H}:flags=area`,
      ].concat(["-f", "rawvideo", "-pix_fmt", "rgb24", raw]),
      { timeoutMs: 120_000 }
    )
    const pixels = await readFile(raw)
    const frameBytes = W * H * 3
    const decoded: (number | null)[] = []
    for (let f = 0; f < pixels.length / frameBytes; f++) {
      decoded.push(decodeBarcode(pixels, f * frameBytes))
    }
    const wrong = decoded.flatMap((got, frame) =>
      got === expected[frame] ? [] : [{ frame, got, want: expected[frame] }]
    )
    if (wrong.length > 0) {
      // Keep the render for a look (CI: upload it as an artifact).
      const kept = join(tmpdir(), `reelpilot-seek-failure-${Date.now()}.mp4`)
      await copyFile(output, kept)
      console.error(`Wrong frames kept in ${kept}:`, JSON.stringify(wrong))
    }
    expect(wrong).toEqual([])
  }, 600_000)
})

/** The footage's background, #1e293b. */
const isFootage = (r: number, g: number, b: number) =>
  Math.abs(r - 0x1e) < 14 && Math.abs(g - 0x29) < 14 && Math.abs(b - 0x3b) < 14

/** Reads the barcode from one rendered frame (null if the footage isn't found). */
function decodeBarcode(pixels: Buffer, base: number) {
  const at = (x: number, y: number) => {
    const i = base + (y * W + x) * 3
    return [pixels[i] ?? 0, pixels[i + 1] ?? 0, pixels[i + 2] ?? 0] as const
  }
  // The footage's left and right edges, on a row above the barcode.
  const probe = Math.round(H * 0.33)
  let left = -1
  let right = -1
  for (let x = 0; x < W; x++) {
    if (isFootage(...at(x, probe))) {
      if (left < 0) left = x
      right = x
    }
  }
  if (left < 0) return null
  let value = 0
  for (let k = 0; k < bits; k++) {
    const x = Math.round(left + ((k + 0.5) / bits) * (right - left))
    const [r, g, b] = at(x, Math.round(H / 2))
    value = value * 2 + (0.2126 * r + 0.7152 * g + 0.0722 * b > 150 ? 1 : 0)
  }
  return value
}
