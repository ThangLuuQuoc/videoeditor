// HyperFrames entry for ReelPilot's ProjectStage (the composition the export worker renders).
// Props come from <script id="rp-props" type="application/json"> in the page.
import { useEffect, useState } from "react"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"

import { framesFor, stageFps, stageSizes } from "@/remotion/compositions/FootageStage"
import { projectDurationMs, ProjectStage } from "@/remotion/compositions/ProjectStage"
import type { RenderProps } from "@/remotion/Root"

import { pendingWork, reassertVideos, seekFailures, ShimProviders, videosSettled, type VideoConfig } from "./remotion-shim"

declare global {
  interface Window {
    __rpBridge?: { durationInFrames: number; fps: number; frame: number }
  }
}

type SeekDetail = { time: number; waitUntil: (p: Promise<unknown>) => void }

const props = JSON.parse(document.getElementById("rp-props")!.textContent!) as RenderProps
const { shape, ...stage } = props
const size = stageSizes[shape]
const durationInFrames = framesFor(projectDurationMs(stage))
const config: VideoConfig = {
  fps: stageFps,
  ...size,
  durationInFrames,
  id: "Video",
  defaultProps: {},
  props: stage,
  defaultCodec: null,
}

let setFrameExternal: (frame: number) => void = () => undefined

function BridgeRoot() {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    setFrameExternal = setFrame
  }, [])
  window.__rpBridge = { durationInFrames, fps: stageFps, frame }
  return (
    <ShimProviders config={config} frame={frame}>
      <ProjectStage {...stage} />
    </ShimProviders>
  )
}

const mount = document.getElementById("rp-stage")!
mount.style.width = `${size.width}px`
mount.style.height = `${size.height}px`
const root = createRoot(mount)
flushSync(() => root.render(<BridgeRoot />))

// HyperFrames seeks by dispatching `hf-seek` with the composition time in seconds.
// Render that frame synchronously, then hold the capture until every video has seeked.
window.addEventListener("hf-seek", (event) => {
  const { time, waitUntil } = (event as CustomEvent<SeekDetail>).detail
  const frame = Math.min(durationInFrames - 1, Math.max(0, Math.round(time * stageFps)))
  flushSync(() => setFrameExternal(frame))
  reassertVideos()
  // Hold the capture until every video shows its frame; re-check once more after the first
  // wave settles, in case something moved a video while we waited.
  waitUntil(
    (async () => {
      for (let pass = 0; pass < 3; pass++) {
        await Promise.all(pendingWork())
        if (videosSettled()) return
        reassertVideos()
      }
    })(),
  )
})

declare global {
  interface Window {
    __rpSeekFailures?: typeof seekFailures
  }
}
window.__rpSeekFailures = seekFailures
