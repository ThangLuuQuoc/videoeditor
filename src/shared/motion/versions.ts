import { z } from "zod"

import {
  voiceLanguages,
  voiceSchema,
  type Voice,
  type VoiceLanguage,
} from "./voice"

/**
 * Language versions (V3 M13 A): the same clip in another language. A
 * version holds only the words — each graphic's and text item's, by id —
 * and a voiceover voiced in that language; positions, timing and colours
 * always come from the clip itself, so moving things after translating
 * keeps the version right. When the clip's words change, the version is
 * out of date (its `source` no longer matches) until translated again.
 */
export const versionLanguages = voiceLanguages
export type VersionLanguage = VoiceLanguage

export const versionLanguageNames: Record<VersionLanguage, string> = {
  vi: "Vietnamese",
  en: "English",
}

const words = z.object({
  text: z.string().max(400),
  secondary: z.string().max(400),
})

export const languageVersionSchema = z.object({
  language: z.enum(versionLanguages),
  /** Each graphic's translated words, by its id. */
  graphics: z.record(z.string(), words).default({}),
  /** Each text item's translated words and emphasis, by its id. */
  texts: z
    .record(
      z.string(),
      z.object({ text: z.string().max(400), emphasis: z.string().max(400) })
    )
    .default({}),
  /** The voiceover voiced in this language; null = none. */
  voice: voiceSchema.nullable().default(null),
  /** What it was translated from (`wordsHash`): another = out of date. */
  source: z.string().max(64),
})
export type LanguageVersion = z.output<typeof languageVersionSchema>

type Wordy = {
  graphics: { id: string; text: string; secondary: string }[]
  texts: { id: string; text: string; emphasis: string }[]
  voice: Voice | null
}

/**
 * A short fingerprint of a clip's words (graphics, text items, voiceover
 * lines), in the browser and on the server alike (FNV-1a, 2 × 32 bits).
 */
export function wordsHash(presentation: Wordy) {
  const all = JSON.stringify([
    presentation.graphics.map((g) => [g.id, g.text, g.secondary]),
    presentation.texts.map((t) => [t.id, t.text, t.emphasis]),
    presentation.voice?.lines.map((line) => line.text) ?? [],
  ])
  let a = 0x811c9dc5
  let b = 0x01000193
  for (let i = 0; i < all.length; i++) {
    const code = all.charCodeAt(i)
    a = Math.imul(a ^ code, 0x01000193) >>> 0
    b = Math.imul(b ^ code, 0x811c9dc5 | 1) >>> 0
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0")
}

/** "missing", "current" or "stale" (the clip's words changed since). */
export function versionState(
  presentation: Wordy & { versions: LanguageVersion[] },
  language: VersionLanguage
) {
  const version = presentation.versions.find((v) => v.language === language)
  if (!version) return "missing" as const
  return version.source === wordsHash(presentation)
    ? ("current" as const)
    : ("stale" as const)
}

/**
 * The clip as it plays in `language`: its own graphics and text items with
 * the version's words (anything added since keeps its own), and the
 * version's voiceover. Null language, or none saved, = the clip as is.
 */
export function withVersion<
  P extends {
    graphics: { id: string; text: string; secondary: string }[]
    texts: { id: string; text: string; emphasis: string }[]
    voice: Voice | null
    versions: LanguageVersion[]
  },
>(presentation: P, language: VersionLanguage | null): P {
  const version = language
    ? presentation.versions.find((v) => v.language === language)
    : undefined
  if (!version) return presentation
  return {
    ...presentation,
    graphics: presentation.graphics.map((graphic) => {
      const words = version.graphics[graphic.id]
      return words ? { ...graphic, ...words } : graphic
    }),
    texts: presentation.texts.map((item) => {
      const words = version.texts[item.id]
      return words ? { ...item, ...words } : item
    }),
    voice: presentation.voice ? version.voice : null,
  }
}

/** Every voiceover file a clip plays in any language (to sign links for). */
export function allVoiceKeys(presentation: {
  voice: Voice | null
  versions: LanguageVersion[]
}) {
  const keys = new Set<string>()
  for (const voice of [
    presentation.voice,
    ...presentation.versions.map((v) => v.voice),
  ]) {
    for (const line of voice?.lines ?? []) keys.add(line.audioKey)
  }
  return [...keys]
}

/** The clip's versions with `version` in place of any in its language. */
export const withLanguageVersion = (
  versions: LanguageVersion[],
  version: LanguageVersion
) => [...versions.filter((v) => v.language !== version.language), version]
