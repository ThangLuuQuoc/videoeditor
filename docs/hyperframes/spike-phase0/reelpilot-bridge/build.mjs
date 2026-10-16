// Bundles ReelPilot's src/remotion compositions for HyperFrames, unchanged,
// by aliasing `remotion` to ./src/remotion-shim.tsx.
// Usage: node build.mjs <fixture.json> <out-project-dir>
import { build } from "esbuild"
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
// In the repo this spike lives in docs/hyperframes/spike-phase0/reelpilot-bridge.
const reelpilotSrc = process.env.REELPILOT_SRC ?? resolve(here, "../../../../src")
const [fixturePath, outDir] = process.argv.slice(2)
if (!fixturePath || !outDir) throw new Error("usage: node build.mjs <fixture.json> <out-project-dir>")

const fixture = JSON.parse(readFileSync(fixturePath, "utf8"))
const shared = {
  bundle: true,
  jsx: "automatic",
  alias: { remotion: join(here, "src/remotion-shim.tsx"), "@": reelpilotSrc },
  nodePaths: [join(here, "node_modules")],
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
}

// Ground truth (duration + footage frame per output frame) from ReelPilot's own edit math.
mkdirSync(join(here, ".cache"), { recursive: true })
const expectedJs = join(here, ".cache/expected.mjs")
await build({ ...shared, entryPoints: [join(here, "src/expected.ts")], platform: "node", format: "esm", outfile: expectedJs })
const { expectedFrames } = await import(pathToFileURL(expectedJs).href + `?t=${Date.now()}`)
const expected = expectedFrames(fixture.props)
const durationMs = expected.durationMs
const framesFor = (ms) => Math.max(1, Math.round((ms / 1000) * 30))
const sizes = { "16:9": [1920, 1080], "9:16": [1080, 1920], "1:1": [1080, 1080] }
const [width, height] = sizes[fixture.props.shape]

mkdirSync(join(outDir, "assets"), { recursive: true })
await build({
  ...shared,
  entryPoints: [join(here, "src/entry.tsx")],
  format: "iife",
  target: "chrome120",
  outfile: join(outDir, "assets/stage.js"),
})
writeFileSync(join(outDir, "expected.json"), JSON.stringify(expected, null, 1))
for (const asset of fixture.assets ?? []) cpSync(resolve(dirname(fixturePath), asset), join(outDir, "assets", asset.split("/").pop()))

const seconds = (durationMs / 1000).toFixed(3)
writeFileSync(
  join(outDir, "index.html"),
  `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; background: #000; }
      #root { position: relative; width: ${width}px; height: ${height}px; font-family: Inter, system-ui, sans-serif; }
      #rp-stage { position: absolute; inset: 0; overflow: hidden; }
    </style>
  </head>
  <body>
    <!-- ReelPilot ProjectStage, rendered by React and seeked through hf-seek (no GSAP timeline). -->
    <div id="root" data-composition-id="main" data-start="0" data-duration="${seconds}"
         data-width="${width}" data-height="${height}" data-fps="30" data-no-timeline>
      <div id="rp-stage" class="clip" data-start="0" data-duration="${seconds}" data-track-index="0"
           data-layout-allow-overflow></div>
    </div>
    <script id="rp-props" type="application/json">${JSON.stringify(fixture.props)}</script>
    <script src="assets/stage.js"></script>
  </body>
</html>
`,
)
console.log(`built ${outDir}: ${width}x${height}, ${seconds}s (${framesFor(durationMs)} frames)`)
