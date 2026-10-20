// The recipe template (V3 M12) on the fixture footage, rendered 9:16 through
// the app's renderVideo(): checks the new `list` and `step` graphics in a
// real HyperFrames export (Vietnamese labels, so the font's glyphs show),
// with pictures (step 1b) on an ingredient and a step: the fixture logo.
// Serve the fixtures with byte ranges first:
//   node docs/hyperframes/spike-phase0/e2e/serve.mjs docs/hyperframes/spike-phase0/reelpilot-bridge/fixtures 8791
// Then, from the repo root:
//   TSX_TSCONFIG_PATH=tsconfig.json node --env-file=docs/hyperframes/spike-phase0/e2e/ci.env \
//     --conditions=react-server --import tsx docs/hyperframes/spike-phase0/e2e/render-recipe.mts recipe.mp4
import {
  applyRecipe,
  setRecipePicture,
} from "@/features/footage/lib/recipe-template"
import type { RenderProps } from "@/remotion/RenderVideo"
import { renderVideo } from "@/shared/render"
import { defaultPresentation, recipeSchema } from "@/shared/motion"

const base = process.env.SAMPLE_MEDIA_BASE ?? "http://127.0.0.1:8791"
const cut = { kind: "cut", durationMs: 0, direction: "left" } as const

const recipe = recipeSchema.parse({
  dish: "Mì bơ tỏi",
  meta: "15 phút · 2 người",
  ingredients: [
    { text: "200 g mì trứng" },
    { text: "3 tép tỏi băm" },
    { text: "2 thìa bơ" },
    { text: "Hành lá, tiêu" },
  ],
  steps: [
    { text: "Luộc mì 4 phút rồi để ráo" },
    { text: "Phi tỏi với bơ đến khi thơm" },
  ],
  language: "vi",
})

const built = applyRecipe(recipe, {
  current: { shots: {}, presentation: defaultPresentation },
  durationMs: 12000,
  brandColors: ["#f97316", "#7c2d12"],
})
if (!built.ok) throw new Error(`recipe not built: ${built.reason}`)
// Picture keys → links, as the export signs them (here: a served fixture).
const picture = "fixtures/logo.png"
let presentation = setRecipePicture(
  built.motion.presentation,
  { kind: "ingredient", index: 1 },
  picture
)
presentation = setRecipePicture(presentation, { kind: "step", index: 0 }, picture)

const props: RenderProps = {
  shape: "9:16",
  fonts: {
    heading: "Montserrat, Inter, sans-serif",
    headingWeight: 800,
    body: "Inter, system-ui, sans-serif",
  },
  accents: ["#f97316", "#facc15"],
  logoUrl: `${base}/logo.png`,
  brandName: "Bếp Nhà",
  siteLabel: "",
  clips: [
    {
      id: "recipe",
      videoUrl: `${base}/footage.mp4`,
      videoWidth: 1920,
      videoHeight: 1080,
      durationMs: 12000,
      transition: cut,
      shots: [],
      presentation,
      pictureUrls: { [picture]: `${base}/logo.png` },
    },
  ],
}

const output = process.argv[2] ?? "recipe.mp4"
const started = Date.now()
const result = await renderVideo({ props, outputPath: output })
console.log(
  JSON.stringify({ output, ...result, renderMs: Date.now() - started })
)
