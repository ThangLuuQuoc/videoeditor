// Decodes the 9-bit barcode burned into the test footage from every output frame and
// compares it with expected.json (ReelPilot's own edit math).
// Usage: node verify.mjs <rendered.mp4> <expected.json> [ffmpeg]
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"

const [video, expectedPath, ffmpeg = "ffmpeg"] = process.argv.slice(2)
const expected = JSON.parse(readFileSync(expectedPath, "utf8")).frames
const W = 480
const H = 270
const raw = spawnSync(ffmpeg, ["-v", "error", "-i", video, "-vf", `scale=${W}:${H}:flags=area`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], {
  maxBuffer: 1 << 30,
}).stdout
const frameBytes = W * H * 3
const count = raw.length / frameBytes

// Footage background is #1e293b; the barcode band sits at 40–60% of the footage height.
const isFootageBg = (r, g, b) => Math.abs(r - 0x1e) < 14 && Math.abs(g - 0x29) < 14 && Math.abs(b - 0x3b) < 14
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b

function decode(f) {
  const base = f * frameBytes
  const px = (x, y) => {
    const i = base + (y * W + x) * 3
    return [raw[i], raw[i + 1], raw[i + 2]]
  }
  // Footage bounds from a row above the band (title row area is mostly background).
  const probeY = Math.round(H * 0.33)
  let left = -1
  let right = -1
  for (let x = 0; x < W; x++) if (isFootageBg(...px(x, probeY))) { if (left < 0) left = x; right = x }
  if (left < 0) return { value: null }
  const y = Math.round(H / 2)
  let value = 0
  for (let k = 0; k < 9; k++) {
    const x = Math.round(left + ((k + 0.5) / 9) * (right - left))
    value = value * 2 + (lum(...px(x, y)) > 150 ? 1 : 0)
  }
  return { value, left, right }
}

let ok = 0
const misses = []
for (let f = 0; f < count; f++) {
  const { value } = decode(f)
  const want = expected[f]
  if (value === want) ok++
  else misses.push({ f, got: value, want, off: value === null || want === null ? null : value - want })
}
console.log(`frames: ${count} rendered, ${expected.length} expected`)
console.log(`exact: ${ok}/${count} (${((ok / count) * 100).toFixed(1)}%)`)
if (misses.length) {
  const byOff = {}
  for (const m of misses) byOff[m.off] = (byOff[m.off] ?? 0) + 1
  console.log("misses by offset (got - want):", JSON.stringify(byOff))
  console.log("first misses:", JSON.stringify(misses.slice(0, 15)))
}
