import {
  projectSlots,
  type ProjectStageClip,
} from "./compositions/ProjectStage"

/** One sound on the video's timeline (a voiced line). */
export type AudioTrack = {
  id: string
  src: string
  /** When it starts and how long it plays, in the video's time (ms). */
  startMs: number
  durationMs: number
  /** 0–1. */
  volume: number
}

/**
 * Every voiced line of a video on its timeline: each clip's lines moved to
 * where the clip plays (its slot), cut at the clip's end. The editor's
 * StagePlayer plays these and the HyperFrames render mixes them, from the
 * same list, so they match. Lines without a signed link are skipped.
 */
export function voiceTracks(clips: ProjectStageClip[]): AudioTrack[] {
  const { slots } = projectSlots(clips)
  return clips.flatMap((clip, index) => {
    const voice = clip.presentation.voice
    const slot = slots[index]
    if (!voice || !slot) return []
    return voice.lines.flatMap((line) => {
      const src = clip.voiceUrls?.[line.audioKey]
      const startMs = slot.startMs + line.atMs
      if (!src || startMs >= slot.endMs) return []
      return [
        {
          id: `${clip.id}-${index}-${line.id}`,
          src,
          startMs,
          durationMs: Math.min(line.durationMs, slot.endMs - startMs),
          volume: voice.volume,
        },
      ]
    })
  })
}
