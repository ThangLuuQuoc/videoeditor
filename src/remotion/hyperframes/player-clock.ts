/**
 * The preview player's clock, pure: where playback is `elapsedMs` after it
 * (re)started at `fromFrame`, and whether it ran off an end. Kept apart from
 * the component so it can be tested without a browser.
 */
export function framesAfter(input: {
  fromFrame: number
  elapsedMs: number
  fps: number
  /** Negative plays backwards (J). Never 0 while playing. */
  playbackRate: number
  durationInFrames: number
}): { frame: number; ended: boolean } {
  const last = Math.max(0, input.durationInFrames - 1)
  const exact =
    input.fromFrame + (input.elapsedMs / 1000) * input.fps * input.playbackRate
  if (input.playbackRate > 0 && exact >= last)
    return { frame: last, ended: true }
  if (input.playbackRate < 0 && exact <= 0) return { frame: 0, ended: true }
  return { frame: Math.min(last, Math.max(0, Math.floor(exact))), ended: false }
}

/** The scale that fits a composition inside a box, as the Player did. */
export function fitScale(
  box: { width: number; height: number },
  composition: { width: number; height: number }
) {
  if (box.width <= 0 || box.height <= 0) return 0
  return Math.min(
    box.width / composition.width,
    box.height / composition.height
  )
}
