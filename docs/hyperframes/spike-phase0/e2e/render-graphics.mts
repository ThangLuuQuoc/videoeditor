// A 2-clip project heavy on motion graphics (magnifier = a second
// OffthreadVideo, logo/end card = <Img>, callout, lower third, split layout),
// rendered through the app's renderVideo() with whichever RENDER_ENGINE is set.
// Serve the fixtures with byte ranges first:
//   node docs/hyperframes/spike-phase0/e2e/serve.mjs docs/hyperframes/spike-phase0/reelpilot-bridge/fixtures 8791
// Then, from the repo root:
//   RENDER_ENGINE=hyperframes TSX_TSCONFIG_PATH=tsconfig.json node --env-file=docs/hyperframes/spike-phase0/e2e/ci.env \
//     --conditions=react-server --import tsx docs/hyperframes/spike-phase0/e2e/render-graphics.mts out.mp4
import { renderVideo } from "@/shared/render"
import type { RenderProps } from "@/remotion/RenderVideo"
import { defaultPresentation, graphicItemSchema } from "@/shared/motion"

const base = process.env.SAMPLE_MEDIA_BASE ?? "http://127.0.0.1:8791"
const media = `${base}/footage.mp4`
const cut = { kind: "cut", durationMs: 0, direction: "left" } as const
const graphic = (item: Record<string, unknown>) => graphicItemSchema.parse(item)

const props: RenderProps = {
  shape: "16:9",
  fonts: { heading: "Montserrat, Inter, sans-serif", headingWeight: 800, body: "Inter, system-ui, sans-serif" },
  accents: ["#22c55e", "#facc15"],
  logoUrl: `${base}/logo.png`,
  brandName: "ReelPilot",
  siteLabel: "reelpilot.app",
  clips: [
    {
      id: "clip-graphics",
      videoUrl: media,
      videoWidth: 1920,
      videoHeight: 1080,
      durationMs: 12000,
      transition: cut,
      shots: [],
      presentation: {
        ...defaultPresentation,
        edit: {
          parts: [
            { startMs: 0, removed: false, speed: 1, transition: cut },
            { startMs: 6000, removed: false, speed: 2, transition: cut },
          ],
        },
        graphics: [
          // Over the barcode band: the magnified copy must show the same frame.
          graphic({ id: "g-mag", kind: "magnifier", atMs: 1000, durationMs: 3000, box: { x: 0.05, y: 0.4, w: 0.35, h: 0.2 } }),
          graphic({ id: "g-callout", kind: "callout", atMs: 2500, durationMs: 2500, text: "Tính năng mới", box: { x: 0.55, y: 0.4, w: 0.3, h: 0.2 } }),
          graphic({ id: "g-lower", kind: "lower-third", atMs: 4500, durationMs: 3000, text: "Thắng Lưu", secondary: "Product lead", track: 1 }),
          graphic({ id: "g-logo", kind: "logo", atMs: 7000, durationMs: 2500, track: 2 }),
        ],
      },
    },
    {
      id: "clip-split",
      videoUrl: media,
      videoWidth: 1920,
      videoHeight: 1080,
      durationMs: 12000,
      transition: { kind: "zoom", durationMs: 450, direction: "left" },
      shots: [],
      presentation: {
        ...defaultPresentation,
        background: { kind: "gradient", from: "#0f172a", to: "#1d4ed8" },
        edit: {
          parts: [
            { startMs: 0, removed: false, speed: 1, transition: cut },
            { startMs: 5000, removed: true, speed: 1, transition: cut },
          ],
        },
        graphics: [
          graphic({ id: "g-split", kind: "split", atMs: 0, durationMs: 3000, text: "Xuất video", secondary: "mọi khung hình" }),
          graphic({ id: "g-stat", kind: "stat", atMs: 3000, durationMs: 1800, text: "3×", secondary: "nhanh hơn", track: 1 }),
          graphic({ id: "g-end", kind: "end-card", atMs: 3600, durationMs: 1400, text: "Dùng thử miễn phí", track: 2 }),
        ],
      },
    },
  ],
}

const output = process.argv[2] ?? "graphics.mp4"
const started = Date.now()
const result = await renderVideo({ props, outputPath: output })
console.log(`${process.env.RENDER_ENGINE ?? "default"}: ${JSON.stringify(result)} in ${((Date.now() - started) / 1000).toFixed(1)}s -> ${output}`)
