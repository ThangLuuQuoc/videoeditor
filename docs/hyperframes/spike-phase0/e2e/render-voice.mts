// A clip with a 2-line voiceover and captions, rendered through renderVideo()
// (checks that HyperFrames mixes the <audio> clips into the MP4).
// Serve the fixtures with byte ranges first (serve.mjs on 8791), then from the repo root:
//   TSX_TSCONFIG_PATH=tsconfig.json node --env-file=docs/hyperframes/spike-phase0/e2e/ci.env \
//     --conditions=react-server --import tsx docs/hyperframes/spike-phase0/e2e/render-voice.mts out.mp4
import { renderVideo } from "@/shared/render"
import type { RenderProps } from "@/remotion/RenderVideo"
import { defaultPresentation, placeLines } from "@/shared/motion"

const base = process.env.SAMPLE_MEDIA_BASE ?? "http://127.0.0.1:8791"
const cut = { kind: "cut", durationMs: 0, direction: "left" } as const
const lines = placeLines([
  { id: "l1", text: "Ra mắt tính năng mới cho đội của bạn.", durationMs: 2000, audioKey: "voice/l1.wav" },
  { id: "l2", text: "Xuất video chỉ trong vài phút.", durationMs: 1500, audioKey: "voice/l2.wav" },
])

const props: RenderProps = {
  shape: "9:16",
  accents: ["#facc15"],
  clips: [
    {
      id: "clip-voice",
      videoUrl: `${base}/footage.mp4`,
      videoWidth: 1920,
      videoHeight: 1080,
      durationMs: 6000,
      shots: [],
      transition: cut,
      voiceUrls: { "voice/l1.wav": `${base}/voice-1.wav`, "voice/l2.wav": `${base}/voice-2.wav` },
      presentation: {
        ...defaultPresentation,
        voice: { script: "", language: "vi", lines, captions: true, captionStyle: "bold", volume: 1 },
      },
    },
  ],
}

const output = process.argv[2] ?? "voice.mp4"
const started = Date.now()
const result = await renderVideo({ props, outputPath: output })
console.log(`voice: ${JSON.stringify(result)} in ${((Date.now() - started) / 1000).toFixed(1)}s -> ${output}`)
