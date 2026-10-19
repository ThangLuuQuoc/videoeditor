"use client"

// The editor's preview player, in place of @remotion/player. It plays the
// compositions in src/remotion through the same Remotion shim the HyperFrames
// export uses (next.config.ts aliases `remotion` to ./remotion-shim), so the
// preview runs the code the export renders, with no Remotion runtime.
//
// It keeps only what the editor used of Remotion's PlayerRef: play, pause,
// seekTo, isPlaying, getCurrentFrame, and the frameupdate / seeked / play /
// pause / ended events.
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
} from "react"

import { fitScale, framesAfter } from "./player-clock"
import { ShimProviders, type VideoConfig } from "./remotion-shim"

type FrameDetail = { frame: number }
export type StagePlayerEvents = {
  frameupdate: FrameDetail
  seeked: FrameDetail
  play: undefined
  pause: undefined
  ended: undefined
}
type Listener<E extends keyof StagePlayerEvents> = (event: {
  detail: StagePlayerEvents[E]
}) => void

export type StagePlayerRef = {
  play: () => void
  pause: () => void
  seekTo: (frame: number) => void
  isPlaying: () => boolean
  getCurrentFrame: () => number
  addEventListener: <E extends keyof StagePlayerEvents>(
    name: E,
    listener: Listener<E>
  ) => void
  removeEventListener: <E extends keyof StagePlayerEvents>(
    name: E,
    listener: Listener<E>
  ) => void
}

type StagePlayerProps<P extends object> = {
  component: ComponentType<P>
  inputProps: P
  durationInFrames: number
  compositionWidth: number
  compositionHeight: number
  fps: number
  initialFrame?: number
  /** −10…10, never 0; negative plays backwards. */
  playbackRate?: number
  style?: CSSProperties
}

function StagePlayerInner<P extends object>(
  {
    component: Component,
    inputProps,
    durationInFrames,
    compositionWidth,
    compositionHeight,
    fps,
    initialFrame = 0,
    playbackRate = 1,
    style,
  }: StagePlayerProps<P>,
  ref: React.ForwardedRef<StagePlayerRef>
) {
  const last = Math.max(0, durationInFrames - 1)
  const [frame, setFrame] = useState(() =>
    Math.min(last, Math.max(0, Math.round(initialFrame)))
  )
  const frameRef = useRef(frame)
  const playingRef = useRef(false)
  const rateRef = useRef(playbackRate)
  const lastRef = useRef(last)
  // Where the clock last (re)started: playback time is measured from here.
  const anchor = useRef({ frame, at: 0 })
  const rafRef = useRef(0)
  const listeners = useRef(new Map<string, Set<(event: object) => void>>())

  const emit = useCallback(
    <E extends keyof StagePlayerEvents>(
      name: E,
      detail: StagePlayerEvents[E]
    ) => {
      for (const listener of listeners.current.get(name) ?? [])
        listener({ detail })
    },
    []
  )

  const show = useCallback(
    (next: number) => {
      if (next === frameRef.current) return
      frameRef.current = next
      setFrame(next)
      emit("frameupdate", { frame: next })
    },
    [emit]
  )

  const stopClock = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
  }, [])

  // The playback loop, kept in a ref so each frame schedules the latest one.
  const tickRef = useRef<FrameRequestCallback>(() => undefined)
  useEffect(() => {
    tickRef.current = (now) => {
      if (!playingRef.current) return
      const { frame: next, ended } = framesAfter({
        fromFrame: anchor.current.frame,
        elapsedMs: now - anchor.current.at,
        fps,
        playbackRate: rateRef.current,
        durationInFrames: lastRef.current + 1,
      })
      show(next)
      if (ended) {
        playingRef.current = false
        stopClock()
        // Forward stops on the last frame ("ended"), as the Player did with
        // moveToBeginningWhenEnded off; backwards stops on the first.
        if (rateRef.current > 0) emit("ended", undefined)
        else emit("pause", undefined)
        return
      }
      rafRef.current = requestAnimationFrame((time) => tickRef.current(time))
    }
  }, [emit, fps, show, stopClock])

  const restartClock = useCallback(() => {
    anchor.current = { frame: frameRef.current, at: performance.now() }
  }, [])

  // A new playback rate takes over from where playback is now.
  useEffect(() => {
    rateRef.current = playbackRate
    if (playingRef.current) restartClock()
  }, [playbackRate, restartClock])

  // A shorter edit can leave the playhead past the end.
  useEffect(() => {
    lastRef.current = last
    if (frameRef.current > last) show(last)
  }, [last, show])

  useEffect(() => stopClock, [stopClock])

  useImperativeHandle(
    ref,
    (): StagePlayerRef => ({
      play: () => {
        if (playingRef.current) return
        playingRef.current = true
        restartClock()
        emit("play", undefined)
        rafRef.current = requestAnimationFrame((time) => tickRef.current(time))
      },
      pause: () => {
        if (!playingRef.current) return
        playingRef.current = false
        stopClock()
        emit("pause", undefined)
      },
      seekTo: (target: number) => {
        const next = Math.min(lastRef.current, Math.max(0, Math.round(target)))
        show(next)
        if (playingRef.current) restartClock()
        emit("seeked", { frame: next })
      },
      isPlaying: () => playingRef.current,
      getCurrentFrame: () => frameRef.current,
      addEventListener: (name, listener) => {
        const set = listeners.current.get(name) ?? new Set()
        set.add(listener as (event: object) => void)
        listeners.current.set(name, set)
      },
      removeEventListener: (name, listener) => {
        listeners.current.get(name)?.delete(listener as (event: object) => void)
      },
    }),
    [emit, restartClock, show, stopClock]
  )

  // Fit the composition into the box, centred (the editor sizes the box to
  // the stage's shape, so this is normally an exact fit).
  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const element = boxRef.current
    if (!element) return
    const measure = () =>
      setBox({ width: element.clientWidth, height: element.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const scale = fitScale(box, {
    width: compositionWidth,
    height: compositionHeight,
  })

  const config: VideoConfig = useMemo(
    () => ({
      fps,
      width: compositionWidth,
      height: compositionHeight,
      durationInFrames: Math.max(1, durationInFrames),
      id: "preview",
      defaultProps: {},
      props: inputProps as Record<string, unknown>,
      defaultCodec: null,
    }),
    [compositionHeight, compositionWidth, durationInFrames, fps, inputProps]
  )

  return (
    <div
      ref={boxRef}
      style={{ position: "relative", overflow: "hidden", ...style }}
    >
      {scale > 0 && (
        <div
          style={{
            position: "absolute",
            left: (box.width - compositionWidth * scale) / 2,
            top: (box.height - compositionHeight * scale) / 2,
            width: compositionWidth,
            height: compositionHeight,
            transform: `scale(${scale})`,
            transformOrigin: "0 0",
            overflow: "hidden",
          }}
        >
          <ShimProviders config={config} frame={frame}>
            <Component {...inputProps} />
          </ShimProviders>
        </div>
      )}
    </div>
  )
}

/** Plays a src/remotion composition in the editor (see the file comment). */
export const StagePlayer = forwardRef(StagePlayerInner) as <P extends object>(
  props: StagePlayerProps<P> & { ref?: React.Ref<StagePlayerRef> }
) => React.ReactElement
