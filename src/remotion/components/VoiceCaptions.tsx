import { AbsoluteFill, useVideoConfig } from "remotion"

import { lineAt, type Voice } from "@/shared/motion"

import type { StageFonts } from "./TextLayer"

const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

/** The word being spoken: the line's time shared out by word length. */
export function wordIndexAt(words: string[], progress: number) {
  const total = words.reduce((sum, word) => sum + word.length + 1, 0)
  let reached = 0
  for (const [index, word] of words.entries()) {
    reached += word.length + 1
    if (progress < reached / total) return index
  }
  return words.length - 1
}

/**
 * Captions for the voiceover: the line being spoken, with the word being
 * said in the accent colour. Timed by each line's own audio length, so
 * they follow the voice exactly line by line (words are estimated).
 */
export function VoiceCaptions({
  voice,
  adMs,
  fonts,
  accent,
}: {
  voice: Voice
  /** Ad time now. */
  adMs: number
  fonts: StageFonts
  accent: string
}) {
  const { width, height } = useVideoConfig()
  const line = lineAt(voice, adMs)
  if (!line) return null

  const unit = width / 100
  const tall = height > width
  const local = adMs - line.atMs
  const fade = Math.min(
    clamp01(local / 120),
    clamp01((line.durationMs - local) / 120)
  )
  const words = line.text.split(" ")
  const current = wordIndexAt(words, local / line.durationMs)
  const style = voice.captionStyle

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: tall ? height * 0.2 : height * 0.08,
        pointerEvents: "none",
      }}
    >
      <div
        data-testid="voice-caption"
        style={{
          maxWidth: tall ? "88%" : "72%",
          textAlign: "center",
          opacity: fade,
          fontFamily: style === "bold" ? fonts.heading : fonts.body,
          fontWeight: style === "bold" ? fonts.headingWeight : 600,
          fontSize: unit * (style === "minimal" ? 2.6 : tall ? 5.6 : 3.4),
          lineHeight: 1.2,
          color: "#ffffff",
          textTransform: style === "bold" ? "uppercase" : "none",
          ...(style === "bar"
            ? {
                background: "rgba(0, 0, 0, 0.62)",
                padding: `${unit * 0.6}px ${unit * 1.4}px`,
                borderRadius: unit * 0.8,
              }
            : {
                textShadow:
                  style === "bold"
                    ? `0 ${unit * 0.25}px ${unit * 0.8}px rgba(0,0,0,0.85)`
                    : `0 ${unit * 0.1}px ${unit * 0.4}px rgba(0,0,0,0.7)`,
                WebkitTextStroke:
                  style === "bold"
                    ? `${unit * 0.12}px rgba(0,0,0,0.9)`
                    : undefined,
                paintOrder: "stroke fill",
              }),
        }}
      >
        {words.map((word, index) => (
          <span
            key={index}
            style={{
              color:
                style !== "minimal" && index === current ? accent : undefined,
            }}
          >
            {index > 0 ? " " : ""}
            {word}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  )
}
