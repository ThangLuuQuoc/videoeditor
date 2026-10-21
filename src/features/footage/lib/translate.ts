import "server-only"

import { z } from "zod"

import {
  generateStructured,
  type LanguageModel,
  type SpeechModel,
} from "@/shared/ai"
import { env } from "@/shared/config/env"
import { AppError } from "@/shared/lib/errors"
import {
  versionLanguageNames,
  wordsHash,
  type LanguageVersion,
  type Presentation,
  type VersionLanguage,
} from "@/shared/motion"

import { speakLines, storeVoicedLine, voiceLinks } from "./voiceover"

/**
 * Translates a clip into another language (V3 M13 A): every graphic's and
 * text item's words, and — when the clip has a voiceover — its lines,
 * voiced again in that language and placed where the originals start.
 * Recipes and timelines translate well this way: their words are already
 * on the clip as text, so nothing has to be heard first. Nothing is saved
 * here: the caller puts the version on the clip.
 */

/** "[EN] Boil the noodles": AI_TEXT_TEST's stand-in for a translation. */
export function standInTranslation(text: string, language: VersionLanguage) {
  const tag = `[${language.toUpperCase()}]`
  return text
    .split("\n")
    .map((line) => (line.trim() ? `${tag} ${line}` : line))
    .join("\n")
}

/** Translates each string in order (an empty string stays empty). */
export async function translateWords(
  texts: string[],
  language: VersionLanguage,
  options: { model?: LanguageModel } = {}
): Promise<string[]> {
  const todo = [...new Set(texts.filter((text) => text.trim()))]
  if (todo.length === 0) return texts
  let done: string[]
  if (!options.model && env.AI_TEXT_TEST === "on") {
    done = todo.map((text) => standInTranslation(text, language))
  } else {
    const name = versionLanguageNames[language]
    const { translations } = await generateStructured({
      schema: z.object({ translations: z.array(z.string()) }),
      system:
        `You translate the words of a short video into ${name}: titles, on-screen captions, ` +
        "checklist lines, step instructions and voiceover lines. Keep each one about as " +
        "short as the original (it sits on screen or is read aloud in the same time), keep " +
        "numbers, units, brand names, emoji and line breaks, and match the tone. A string " +
        `already in ${name} comes back unchanged. Return exactly one translation per input, ` +
        "in the same order.",
      prompt: JSON.stringify(todo),
      model: options.model,
    })
    if (translations.length !== todo.length) {
      throw new AppError(
        "PROVIDER_FAILED",
        "The translation came back incomplete. Try again in a moment."
      )
    }
    done = translations
  }
  const byText = new Map(todo.map((text, i) => [text, done[i]!]))
  return texts.map((text) => byText.get(text) ?? text)
}

export async function translateClip(input: {
  workspaceId: string
  kitId: string
  footageId: string
  presentation: Presentation
  language: VersionLanguage
  model?: LanguageModel
  speech?: SpeechModel
}): Promise<{ version: LanguageVersion; urls: Record<string, string> }> {
  const { presentation, language } = input
  const graphics = presentation.graphics.filter(
    (graphic) => graphic.text || graphic.secondary
  )
  const lines = presentation.voice?.lines ?? []
  const source = [
    ...graphics.flatMap((graphic) => [graphic.text, graphic.secondary]),
    ...presentation.texts.flatMap((item) => [item.text, item.emphasis]),
    ...lines.map((line) => line.text),
  ]
  const translated = await translateWords(source, language, {
    model: input.model,
  })
  let at = 0
  const next = () => translated[at++] ?? ""

  const version: LanguageVersion = {
    language,
    graphics: {},
    texts: {},
    voice: null,
    source: wordsHash(presentation),
  }
  for (const graphic of graphics) {
    version.graphics[graphic.id] = { text: next(), secondary: next() }
  }
  for (const item of presentation.texts) {
    const text = next()
    const emphasis = next()
    // The highlighted words must still be in the line; else none.
    version.texts[item.id] = {
      text,
      emphasis:
        emphasis && text.toLowerCase().includes(emphasis.toLowerCase())
          ? emphasis
          : "",
    }
  }

  let urls: Record<string, string> = {}
  if (presentation.voice && lines.length > 0) {
    const texts = lines.map(() => next())
    const spoken = await speakLines({ texts, language, model: input.speech })
    const voiced = []
    for (const [index, line] of spoken.entries()) {
      voiced.push({
        id: line.id,
        text: line.text,
        // Where the original line starts: the cards it belongs to stay put.
        atMs: lines[index]!.atMs,
        durationMs: line.durationMs,
        audioKey: await storeVoicedLine(line, input),
      })
    }
    version.voice = {
      ...presentation.voice,
      language,
      script: texts.join("\n"),
      lines: voiced,
    }
    urls = await voiceLinks(voiced.map((line) => line.audioKey))
  }
  return { version, urls }
}
