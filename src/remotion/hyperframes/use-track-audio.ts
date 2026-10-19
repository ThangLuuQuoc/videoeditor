"use client"

import { useCallback, useEffect, useRef } from "react"

import type { AudioTrack } from "../voice-tracks"

/** How far an element may drift from the clock before it's re-seeked (s). */
const maxDrift = 0.25

/**
 * The preview's sound: one <audio> per track (a voiced line), started,
 * stopped and re-seeked from the player's clock. Sound plays only forward
 * at 1× (shuttling and frame steps are silent, as in editors). Returns the
 * function the player calls on every frame and on play/pause/seek.
 */
export function useTrackAudio(tracks: AudioTrack[] | undefined) {
  const elements = useRef(new Map<string, HTMLAudioElement>())
  const current = useRef<AudioTrack[]>([])

  useEffect(() => {
    const list = tracks ?? []
    current.current = list
    const map = elements.current
    const wanted = new Map(list.map((track) => [track.id, track]))
    for (const [id, element] of map) {
      const track = wanted.get(id)
      if (!track || element.dataset.src !== track.src) {
        element.pause()
        element.removeAttribute("src")
        map.delete(id)
      }
    }
    for (const track of list) {
      let element = map.get(track.id)
      if (!element) {
        element = new Audio()
        element.preload = "auto"
        element.src = track.src
        element.dataset.src = track.src
        map.set(track.id, element)
      }
      element.volume = track.volume
    }
  }, [tracks])

  useEffect(() => {
    const map = elements.current
    return () => {
      for (const element of map.values()) element.pause()
    }
  }, [])

  return useCallback((timeMs: number, audible: boolean) => {
    for (const track of current.current) {
      const element = elements.current.get(track.id)
      if (!element) continue
      const into = (timeMs - track.startMs) / 1000
      const inside = into >= 0 && into < track.durationMs / 1000
      if (!audible || !inside) {
        if (!element.paused) element.pause()
        continue
      }
      if (element.paused) {
        element.currentTime = into
        void element.play().catch(() => {
          // Autoplay rules or a quick pause: the next frame tries again.
        })
      } else if (Math.abs(element.currentTime - into) > maxDrift) {
        element.currentTime = into
      }
    }
  }, [])
}
