// Ground truth from ReelPilot's own code: which footage frame each output frame must show
// (same arithmetic FootageStage uses for its <Sequence>/<OffthreadVideo> per part).
// Single-clip fixtures with cut transitions only (no overlapping parts).
import { outputLayout } from "@/shared/motion"
import { framesFor, stageFps } from "@/remotion/compositions/FootageStage"
import { projectDurationMs } from "@/remotion/compositions/ProjectStage"
import type { RenderProps } from "@/remotion/Root"

export function expectedFrames(props: RenderProps) {
  const { shape: _shape, ...stage } = props
  const durationMs = projectDurationMs(stage)
  const clip = stage.clips[0]!
  const layout = outputLayout(clip.presentation.edit, clip.durationMs)
  const total = framesFor(durationMs)
  const frames: (number | null)[] = []
  for (let f = 0; f < total; f++) {
    const part = layout.find((p) => {
      const from = Math.round((p.outStartMs / 1000) * stageFps)
      const to = Math.round((p.outEndMs / 1000) * stageFps)
      return f >= from && f < Math.max(from + 1, to)
    })
    if (!part) {
      frames.push(null)
      continue
    }
    const from = Math.round((part.outStartMs / 1000) * stageFps)
    const trimBefore = Math.round((part.startMs / 1000) * stageFps)
    frames.push(Math.floor(trimBefore + (f - from) * part.speed + 1e-6))
  }
  return { durationMs, frames, layout }
}
