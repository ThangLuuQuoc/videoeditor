// The page HyperFrames renders: RenderVideo (the export's composition) with
// its props from <script id="render-props">, seeked frame by frame through
// HyperFrames' `hf-seek` event. Bundled by render-process-hyperframes.ts with
// `remotion` aliased to ./remotion-shim.
import { useEffect, useState } from "react"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"

import { framesFor, stageFps, stageSizes } from "../compositions/FootageStage"
import { projectDurationMs } from "../compositions/ProjectStage"
import { RenderVideo, type RenderProps } from "../RenderVideo"

import {
  pendingWork,
  reassertVideos,
  seekFailures,
  ShimProviders,
  videosSettled,
  type VideoConfig,
} from "./remotion-shim"

declare global {
  interface Window {
    /** Seeks that never settled, for the render process to report. */
    __renderSeekFailures?: typeof seekFailures
  }
}

type SeekDetail = { time: number; waitUntil: (work: Promise<unknown>) => void }

const propsTag = document.getElementById("render-props")
const mount = document.getElementById("render-stage")
if (!propsTag?.textContent || !mount) {
  throw new Error("The render page is missing its props or stage element.")
}
const props = JSON.parse(propsTag.textContent) as RenderProps
const size = stageSizes[props.shape]
const durationInFrames = framesFor(projectDurationMs(props))
const config: VideoConfig = {
  fps: stageFps,
  ...size,
  durationInFrames,
  id: "Video",
  defaultProps: {},
  props,
  defaultCodec: null,
}

let showFrame: (frame: number) => void = () => undefined

function RenderRoot() {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    showFrame = setFrame
  }, [])
  return (
    <ShimProviders config={config} frame={frame}>
      <RenderVideo {...props} />
    </ShimProviders>
  )
}

mount.style.width = `${size.width}px`
mount.style.height = `${size.height}px`
const root = createRoot(mount)
flushSync(() => root.render(<RenderRoot />))
window.__renderSeekFailures = seekFailures

// `time` is the composition time in seconds. Render that frame now, then hold
// the capture until every video shows its exact frame (checked again after
// the first wave settles, in case the runtime moved a video meanwhile).
window.addEventListener("hf-seek", (event) => {
  const { time, waitUntil } = (event as CustomEvent<SeekDetail>).detail
  const frame = Math.min(
    durationInFrames - 1,
    Math.max(0, Math.round(time * stageFps))
  )
  flushSync(() => showFrame(frame))
  reassertVideos()
  waitUntil(
    (async () => {
      for (let pass = 0; pass < 3; pass++) {
        await Promise.all(pendingWork())
        if (videosSettled()) return
        reassertVideos()
      }
    })()
  )
})
