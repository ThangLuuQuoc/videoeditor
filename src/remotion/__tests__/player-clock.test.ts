import { describe, expect, it } from "vitest"

import { fitScale, framesAfter } from "../hyperframes/player-clock"

const clock = { fps: 30, durationInFrames: 300 }

describe("framesAfter", () => {
  it("advances at fps × rate from where playback started", () => {
    expect(
      framesAfter({ ...clock, fromFrame: 10, elapsedMs: 1000, playbackRate: 1 })
    ).toEqual({ frame: 40, ended: false })
    expect(
      framesAfter({ ...clock, fromFrame: 10, elapsedMs: 1000, playbackRate: 2 })
    ).toEqual({ frame: 70, ended: false })
  })

  it("shows the frame playback is in, not the next one", () => {
    expect(
      framesAfter({ ...clock, fromFrame: 0, elapsedMs: 49, playbackRate: 1 })
    ).toEqual({ frame: 1, ended: false })
  })

  it("plays backwards with a negative rate (J)", () => {
    expect(
      framesAfter({
        ...clock,
        fromFrame: 100,
        elapsedMs: 500,
        playbackRate: -2,
      })
    ).toEqual({ frame: 70, ended: false })
  })

  it("stops on the last frame going forwards", () => {
    expect(
      framesAfter({
        ...clock,
        fromFrame: 290,
        elapsedMs: 1000,
        playbackRate: 1,
      })
    ).toEqual({ frame: 299, ended: true })
  })

  it("stops on the first frame going backwards", () => {
    expect(
      framesAfter({ ...clock, fromFrame: 5, elapsedMs: 1000, playbackRate: -1 })
    ).toEqual({ frame: 0, ended: true })
  })
})

describe("fitScale", () => {
  it("fits the composition inside the box", () => {
    expect(
      fitScale({ width: 960, height: 540 }, { width: 1920, height: 1080 })
    ).toBe(0.5)
    expect(
      fitScale({ width: 960, height: 300 }, { width: 1920, height: 1080 })
    ).toBeCloseTo(300 / 1080)
  })

  it("is 0 before the box has a size", () => {
    expect(
      fitScale({ width: 0, height: 0 }, { width: 1920, height: 1080 })
    ).toBe(0)
  })
})
