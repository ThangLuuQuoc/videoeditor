import { Composition } from "remotion"

import { defaultClipTransition, defaultPresentation } from "@/shared/motion"

import { framesFor, stageFps, stageSizes } from "./compositions/FootageStage"
import { projectDurationMs } from "./compositions/ProjectStage"
import { RenderVideo, type RenderProps } from "./RenderVideo"

export type { RenderProps } from "./RenderVideo"

const placeholder: RenderProps = {
  shape: "16:9",
  clips: [
    {
      id: "placeholder",
      videoUrl: "",
      videoWidth: 1920,
      videoHeight: 1080,
      presentation: defaultPresentation,
      shots: [],
      durationMs: 1000,
      transition: defaultClipTransition,
    },
  ],
}

export function RemotionRoot() {
  return (
    <Composition
      id="Video"
      component={RenderVideo}
      defaultProps={placeholder}
      fps={stageFps}
      width={1920}
      height={1080}
      durationInFrames={1}
      calculateMetadata={({ props }) => ({
        ...stageSizes[props.shape],
        durationInFrames: framesFor(projectDurationMs(props)),
      })}
    />
  )
}
