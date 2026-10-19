import { z } from "zod"

/**
 * Voiceover and captions (§7 V3 M9): a script, voiced line by line. Each
 * line is its own audio file, so its captions are timed by the voice itself
 * (no speech recognition). Lines sit on the ad's timeline (after cuts and
 * speed changes), one after another.
 */
export const voiceLanguages = ["vi", "en"] as const
export type VoiceLanguage = (typeof voiceLanguages)[number]
export const voiceLanguageNames: Record<VoiceLanguage, string> = {
  vi: "Tiếng Việt",
  en: "English",
}

export const captionStyles = ["bold", "bar", "minimal"] as const
export type CaptionStyle = (typeof captionStyles)[number]

export const voiceLimits = {
  script: 1200,
  lines: 30,
  lineText: 220,
  /** The narration starts this long into the ad. */
  leadMs: 400,
  /** Silence between lines. */
  gapMs: 250,
} as const

export const voiceLineSchema = z.object({
  id: z.string().min(1).max(40),
  text: z.string().trim().min(1).max(voiceLimits.lineText),
  /** When it starts, in ad time. */
  atMs: z.number().int().min(0),
  durationMs: z.number().int().min(100).max(60_000),
  /** Its audio in storage (a key, signed when played). */
  audioKey: z.string().min(1).max(400),
})
export type VoiceLine = z.output<typeof voiceLineSchema>

export const voiceSchema = z.object({
  script: z.string().max(voiceLimits.script).default(""),
  language: z.enum(voiceLanguages).default("vi"),
  lines: z.array(voiceLineSchema).max(voiceLimits.lines).default([]),
  captions: z.boolean().default(true),
  captionStyle: z.enum(captionStyles).default("bold"),
  /** 0–1. */
  volume: z.number().min(0).max(1).default(1),
})
export type Voice = z.output<typeof voiceSchema>

/**
 * A script → lines to voice: one per sentence, long sentences split at a
 * comma (or by words) so captions stay readable. Blank lines are dropped.
 */
export function splitScript(script: string): string[] {
  const max = 120
  const sentences = script
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?…。])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
  const lines: string[] = []
  for (const sentence of sentences) {
    if (sentence.length <= max) {
      lines.push(sentence)
      continue
    }
    let rest = sentence
    while (rest.length > max) {
      const cut = rest.lastIndexOf(", ", max)
      const space = rest.lastIndexOf(" ", max)
      const at = cut > max / 3 ? cut + 1 : space > 0 ? space : max
      lines.push(rest.slice(0, at).trim())
      rest = rest.slice(at).trim()
    }
    if (rest) lines.push(rest)
  }
  return lines.slice(0, voiceLimits.lines)
}

/** Lines one after another from the lead-in, each `gapMs` after the last. */
export function placeLines(
  lines: { text: string; durationMs: number; audioKey: string; id: string }[]
): VoiceLine[] {
  let atMs = voiceLimits.leadMs
  return lines.map((line) => {
    const placed = { ...line, atMs }
    atMs += line.durationMs + voiceLimits.gapMs
    return placed
  })
}

/** When the narration ends (ad time), or 0 with no lines. */
export const voiceEndMs = (voice: Voice | null) =>
  voice?.lines.reduce(
    (end, line) => Math.max(end, line.atMs + line.durationMs),
    0
  ) ?? 0

/** The line being spoken at `adMs`, if any. */
export const lineAt = (voice: Voice | null, adMs: number) =>
  voice?.lines.find(
    (line) => adMs >= line.atMs && adMs < line.atMs + line.durationMs
  ) ?? null

/** Every stored audio file a voiceover plays (to sign links for). */
export const voiceKeys = (voice: Voice | null) => [
  ...new Set(voice?.lines.map((line) => line.audioKey) ?? []),
]
