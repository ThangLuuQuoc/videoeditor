// Renders a 2-clip ReelPilot project through the app's own renderVideo()
// (src/shared/render), with whichever RENDER_ENGINE is set.
// Serve the footage first (needs footage.mp4 next to the server):
//   (cd docs/hyperframes/spike-phase0/reelpilot-bridge/fixtures && python -m http.server 8790 --bind 127.0.0.1)
// Then, from the repo root:
//   RENDER_ENGINE=hyperframes TSX_TSCONFIG_PATH=tsconfig.json node --env-file=docs/hyperframes/spike-phase0/e2e/ci.env //     --conditions=react-server --import tsx docs/hyperframes/spike-phase0/e2e/render-sample.mts out.mp4
import { writeFileSync } from "node:fs"

import { renderVideo } from "@/shared/render"
import type { RenderProps } from "@/remotion/RenderVideo"
import { defaultPresentation } from "@/shared/motion"

// SAMPLE_MEDIA_URL: 8790 = python http.server (no byte ranges), 8791 = serve.mjs (ranges, like S3)
const media = process.env.SAMPLE_MEDIA_URL ?? "http://127.0.0.1:8790/footage.mp4"
const cut = { kind: "cut", durationMs: 0, direction: "left" } as const

const props: RenderProps = {
  shape: (process.env.SAMPLE_SHAPE ?? "16:9") as RenderProps["shape"],
  fonts: {
    heading: "Bebas Neue, Inter, sans-serif",
    headingWeight: 400,
    body: "Inter, system-ui, sans-serif",
  },
  accents: ["#22c55e", "#facc15"],
  brandName: "ReelPilot",
  siteLabel: "reelpilot.app",
  clips: [
    {
      id: "clip-seek",
      videoUrl: media,
      videoWidth: 1920,
      videoHeight: 1080,
      durationMs: 12000,
      shots: [],
      transition: cut,
      presentation: {
        ...defaultPresentation,
        edit: {
          parts: [
            { startMs: 0, removed: false, speed: 1, transition: cut },
            { startMs: 3000, removed: true, speed: 1, transition: cut },
            { startMs: 5000, removed: false, speed: 2, transition: cut },
          ],
        },
      },
    },
    {
      id: "clip-motion",
      videoUrl: media,
      videoWidth: 1920,
      videoHeight: 1080,
      durationMs: 12000,
      transition: { kind: "push", durationMs: 500, direction: "left" },
      shots: [
        {
          atMs: 1500,
          shot: {
            camera: { tilt: 10, turn: -12, roll: 3, zoom: 1.6, focusX: 0.3, focusY: 0.5 },
            transitionMs: 900,
            easing: "smooth",
            drift: 0.3,
          },
        },
      ],
      presentation: {
        ...defaultPresentation,
        background: { kind: "gradient", from: "#0f172a", to: "#22c55e" },
        intro: { kind: "rise", durationMs: 1200 },
        edit: {
          parts: [
            { startMs: 0, removed: false, speed: 1, transition: cut },
            { startMs: 4000, removed: false, speed: 1.5, transition: { kind: "push", durationMs: 500, direction: "left" } },
          ],
        },
        texts: [
          {
            id: "t1",
            atMs: 600,
            durationMs: 2600,
            text: "Ra mắt tính năng mới",
            role: "headline",
            animation: null,
            x: 0.5,
            y: 0.12,
            align: "center",
            emphasis: "tính năng mới",
            track: 1,
            size: 1,
            color: null,
            highlightColor: null,
            background: null,
          },
        ],
      },
    },
  ],
}

const output = process.argv[2] ?? "sample.mp4"
writeFileSync(`${output}.props.json`, JSON.stringify(props, null, 1))
const started = Date.now()
let last = -1
const result = await renderVideo({
  props,
  outputPath: output,
  onProgress: (p) => {
    const step = Math.floor(p * 10)
    if (step !== last) {
      last = step
      process.stdout.write(`${Math.round(p * 100)}% `)
    }
  },
})
console.log(`\n${process.env.RENDER_ENGINE ?? "default"}: ${JSON.stringify(result)} in ${((Date.now() - started) / 1000).toFixed(1)}s -> ${output}`)
