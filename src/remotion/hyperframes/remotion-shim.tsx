// The parts of `remotion` that src/remotion uses, driven by HyperFrames'
// `hf-seek` event instead of Remotion's renderer. The HyperFrames render
// (src/shared/render/render-process-hyperframes.ts) bundles the compositions
// with `remotion` aliased to this file, so they render unchanged.
//
// Covered: AbsoluteFill, Sequence (from / durationInFrames / premountFor /
// layout), useCurrentFrame, useVideoConfig, OffthreadVideo (trimBefore /
// playbackRate), Img, delayRender / continueRender. Anything else fails the
// bundle (a missing export), so a new Remotion API can't slip in unnoticed.
import {
  createContext,
  forwardRef,
  useContext,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react"

export type VideoConfig = {
  fps: number
  width: number
  height: number
  durationInFrames: number
  id: string
  defaultProps: Record<string, unknown>
  props: Record<string, unknown>
  defaultCodec: null
}

const ConfigContext = createContext<VideoConfig | null>(null)
/** The root (absolute) frame being shown. */
const FrameContext = createContext(0)
/** Sum of enclosing Sequence `from`s. */
const OffsetContext = createContext(0)
/** Inside a premounted (not yet started) Sequence: time is frozen at its first frame. */
const PremountContext = createContext(false)

export const ShimProviders = ({
  config,
  frame,
  children,
}: {
  config: VideoConfig
  frame: number
  children: ReactNode
}) => (
  <ConfigContext.Provider value={config}>
    <FrameContext.Provider value={frame}>{children}</FrameContext.Provider>
  </ConfigContext.Provider>
)

export function useVideoConfig(): VideoConfig {
  const config = useContext(ConfigContext)
  if (!config)
    throw new Error("useVideoConfig() outside the HyperFrames bridge root")
  return config
}

export function useCurrentFrame(): number {
  const frame = useContext(FrameContext)
  const offset = useContext(OffsetContext)
  const premounted = useContext(PremountContext)
  return premounted ? 0 : frame - offset
}

const fillStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
}

export const AbsoluteFill = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function AbsoluteFill({ style, ...rest }, ref) {
  return <div ref={ref} style={{ ...fillStyle, ...style }} {...rest} />
})

export function Sequence({
  from = 0,
  durationInFrames = Infinity,
  premountFor = 0,
  layout = "absolute-fill",
  style,
  children,
}: {
  from?: number
  durationInFrames?: number
  premountFor?: number
  layout?: "absolute-fill" | "none"
  style?: CSSProperties
  name?: string
  children?: ReactNode
}) {
  const parentOffset = useContext(OffsetContext)
  const parentPremounted = useContext(PremountContext)
  const frame = useContext(FrameContext) - parentOffset
  const active = frame >= from && frame < from + durationInFrames
  const premounting = !active && frame < from && frame >= from - premountFor
  if (!active && !premounting) return null
  const content = (
    <OffsetContext.Provider value={parentOffset + from}>
      <PremountContext.Provider value={parentPremounted || premounting}>
        {children}
      </PremountContext.Provider>
    </OffsetContext.Provider>
  )
  if (layout === "none") {
    return premounting ? (
      <div style={{ display: "contents", visibility: "hidden" }}>{content}</div>
    ) : (
      content
    )
  }
  return (
    <AbsoluteFill
      style={{
        ...style,
        ...(premounting ? { opacity: 0, pointerEvents: "none" } : null),
      }}
    >
      {content}
    </AbsoluteFill>
  )
}

// ---- Async work the next capture must wait for -------------------------------------------

const pending = new Set<Promise<unknown>>()
const track = (p: Promise<unknown>) => {
  pending.add(p)
  p.finally(() => pending.delete(p))
  return p
}
/** Everything still loading or seeking, for the hf-seek handler's waitUntil(). */
export const pendingWork = () => [...pending]

const handles = new Map<number, () => void>()
let nextHandle = 1
export function delayRender(_label?: string): number {
  const id = nextHandle++
  track(new Promise<void>((resolve) => handles.set(id, resolve)))
  return id
}
export function continueRender(id: number) {
  handles.get(id)?.()
  handles.delete(id)
}

// ---- Media --------------------------------------------------------------------------------

/** Source frame rate of ReelPilot footage (processing converts it to 30fps). */
const SOURCE_FPS = 30
const SEEK_TIMEOUT_MS = 10_000

const loaded = (video: HTMLVideoElement) =>
  video.readyState >= 2
    ? Promise.resolve()
    : new Promise<void>((resolve, reject) => {
        video.addEventListener("loadeddata", () => resolve(), { once: true })
        video.addEventListener(
          "error",
          () => reject(new Error(`video failed: ${video.src}`)),
          {
            once: true,
          }
        )
      })

const targetTime = (video: HTMLVideoElement, sourceFrame: number) => {
  // duration is NaN/Infinity until known (or when the server can't serve
  // byte ranges): don't clamp to the end then.
  const last = Number.isFinite(video.duration)
    ? Math.max(0, Math.floor(video.duration * SOURCE_FPS) - 1)
    : Number.POSITIVE_INFINITY
  const frame = Math.min(Math.max(0, sourceFrame), last)
  // Middle of the frame: a seek to the exact boundary can land on the previous frame.
  return (frame + 0.5) / SOURCE_FPS
}
const isAt = (video: HTMLVideoElement, target: number) =>
  !video.seeking &&
  video.readyState >= 2 &&
  Math.abs(video.currentTime - target) < 0.25 / SOURCE_FPS

/**
 * Seek so the element shows exactly `sourceFrame`, resolving once that frame is decoded.
 * Verifies after `seeked` and retries: another seek (ours or the runtime's) can land in between.
 */
async function seekToFrame(video: HTMLVideoElement, sourceFrame: number) {
  await loaded(video)
  const target = targetTime(video, sourceFrame)
  for (let attempt = 0; attempt < 4 && !isAt(video, target); attempt++) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, SEEK_TIMEOUT_MS)
      video.addEventListener(
        "seeked",
        () => {
          clearTimeout(timer)
          resolve()
        },
        { once: true }
      )
      video.currentTime = target
    })
  }
  if (!isAt(video, target))
    seekFailures.push({
      src: video.currentSrc,
      sourceFrame,
      at: video.currentTime,
    })
}

/** Mounted videos and the source frame each must show now. */
const mountedVideos = new Map<HTMLVideoElement, number>()

/** Seeks that never settled on their frame (inspected by the verify step). */
export const seekFailures: { src: string; sourceFrame: number; at: number }[] =
  []

/** True when every mounted video already shows its frame. */
export const videosSettled = () =>
  [...mountedVideos].every(([video, frame]) =>
    isAt(video, targetTime(video, frame))
  )

type VideoProps = Omit<React.VideoHTMLAttributes<HTMLVideoElement>, "src"> & {
  src: string
  /** Source frames skipped at the start (Remotion 4.0.3xx+ name). */
  trimBefore?: number
  playbackRate?: number
}

/**
 * Re-checks every mounted video on each hf-seek. HyperFrames' runtime also watches
 * <video> elements and may move their currentTime (e.g. a premounted part's video while
 * it waits), so "seek only when the target changes" is not enough: the target can be
 * unchanged while the element drifted. Call after the frame's React render.
 */
export function reassertVideos() {
  for (const [video, frame] of mountedVideos) track(seekToFrame(video, frame))
}

/** Frame-exact video: every seek waits until the element shows the right source frame. */
export function OffthreadVideo({
  src,
  trimBefore = 0,
  playbackRate = 1,
  muted,
  style,
  ...rest
}: VideoProps) {
  const ref = useRef<HTMLVideoElement>(null)
  const frame = useCurrentFrame()
  const sourceFrame = Math.floor(trimBefore + frame * playbackRate + 1e-6)
  useLayoutEffect(() => {
    const video = ref.current
    if (!video) return
    mountedVideos.set(video, sourceFrame)
    return () => {
      mountedVideos.delete(video)
    }
  }, [sourceFrame])
  return (
    <video
      ref={ref}
      src={src}
      muted={muted ?? true}
      playsInline
      preload="auto"
      data-source-frame={sourceFrame}
      style={style}
      {...rest}
    />
  )
}

export const Img = forwardRef<
  HTMLImageElement,
  React.ImgHTMLAttributes<HTMLImageElement>
>(function Img(props, ref) {
  const local = useRef<HTMLImageElement | null>(null)
  useLayoutEffect(() => {
    const img = local.current
    if (img && !img.complete) {
      track(
        new Promise<void>((resolve) => {
          img.addEventListener("load", () => resolve(), { once: true })
          img.addEventListener("error", () => resolve(), { once: true })
        })
      )
    }
  })
  return (
    // Remotion's <Img> is a plain <img> (next/image has no place in a render
    // page); callers pass alt through props.
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img
      ref={(el) => {
        local.current = el
        if (typeof ref === "function") ref(el)
        else if (ref) ref.current = el
      }}
      {...props}
    />
  )
})

// Not used by the compositions, but imported by Root.tsx (which the bridge does not bundle).
export const Composition = () => null
export const registerRoot = () => undefined
