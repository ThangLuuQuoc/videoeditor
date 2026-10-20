// The browser-safe part of the footage slice's public API, for other
// slices' client components (index.ts also exports server-only queries,
// which must never reach a browser bundle).
export { FullscreenControls } from "./components/fullscreen-controls"
export { stageAspects, type StageAspect } from "./components/motion-stage"
export { formatDuration, formatTimecode } from "./lib/format"
export { stageFontsFor } from "./lib/stage-fonts"
export { FootageUploader } from "./components/footage-uploader"
export { ScreenRecorder } from "./components/screen-recorder"
export { RecipeForm } from "./components/recipe-form"
export { StoryForm } from "./components/story-form"
export {
  templateById,
  templateIds,
  templates,
  type Template,
  type TemplateId,
} from "./lib/templates"
