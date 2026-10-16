import "@fontsource-variable/inter/wght.css"
import "@fontsource-variable/montserrat/wght.css"
import "@fontsource/poppins/400.css"
import "@fontsource/poppins/700.css"
import "@fontsource-variable/roboto/wght.css"
import "@fontsource-variable/open-sans/wght.css"
import "@fontsource/lato/400.css"
import "@fontsource/lato/700.css"
import "@fontsource-variable/dm-sans/wght.css"
import "@fontsource-variable/nunito/wght.css"
import "@fontsource-variable/raleway/wght.css"
import "@fontsource-variable/rubik/wght.css"
import "@fontsource-variable/oswald/wght.css"
import "@fontsource/bebas-neue/400.css"
import "@fontsource/anton/400.css"
import "@fontsource/archivo-black/400.css"
import "@fontsource-variable/playfair-display/wght.css"

import { useState } from "react"
import { continueRender, delayRender } from "remotion"

import type { stageSizes } from "./compositions/FootageStage"
import {
  ProjectStage,
  type ProjectStageProps,
} from "./compositions/ProjectStage"

/** What the export worker renders: a video (a clip is a one-clip video). */
export type RenderProps = Omit<
  ProjectStageProps,
  "preview" | "playing" | "onVideoError"
> & { shape: keyof typeof stageSizes }

/** The first family in a CSS font-family list, unquoted. */
const firstFamily = (list: string) =>
  list
    .split(",")[0]!
    .trim()
    .replace(/^['"]|['"]$/g, "")

/**
 * The stage, once the kit's fonts have loaded: a font that arrives after
 * the first frames would change the text mid-video. Shared by both render
 * engines (Remotion's Root and the HyperFrames page, src/remotion/hyperframes).
 */
export function RenderVideo(props: RenderProps) {
  const [handle] = useState(() => {
    const id = delayRender("Loading the brand kit's fonts")
    const fonts = props.fonts
    const loads = fonts
      ? [
          `${fonts.headingWeight} 64px "${firstFamily(fonts.heading)}"`,
          `400 64px "${firstFamily(fonts.body)}"`,
          `700 64px "${firstFamily(fonts.body)}"`,
        ]
      : []
    Promise.all(loads.map((font) => document.fonts.load(font)))
      .catch(() => undefined)
      .finally(() => continueRender(id))
    return id
  })
  void handle
  const { shape: _shape, ...stage } = props
  return <ProjectStage {...stage} />
}
