import "server-only"

import { createHash } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { synthesizeSpeech, type SpeechModel } from "@/shared/ai"
import { env } from "@/shared/config/env"
import { AppError } from "@/shared/lib/errors"
import { probeAudioMs } from "@/shared/media"
import {
  placeLines,
  splitScript,
  type VoiceLanguage,
  type VoiceLine,
} from "@/shared/motion"
import { putFile, signedFileUrl } from "@/shared/storage"

import { footageVoiceKey } from "./keys"
import type { VoicedStep } from "./recipe-template"

const extensions: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
}

/** One line voiced, measured, not stored yet (see `storeVoicedLine`). */
export type SpokenLine = {
  id: string
  text: string
  durationMs: number
  audio: Uint8Array
  mediaType: string
  /** Its file name: what was said, how and by whom (paid for once). */
  file: string
}

/** Voices each text in turn and measures it. Stores nothing. */
export async function speakLines(input: {
  texts: string[]
  language: VoiceLanguage
  model?: SpeechModel
}): Promise<SpokenLine[]> {
  const dir = await mkdtemp(join(tmpdir(), "reelpilot-voice-"))
  try {
    const spoken: SpokenLine[] = []
    for (const text of input.texts) {
      const { audio, mediaType } = await synthesizeSpeech(
        { text, language: input.language },
        { model: input.model }
      )
      const extension = extensions[mediaType.split(";")[0] ?? ""] ?? "mp3"
      const hash = createHash("sha256")
        .update(
          [
            env.VOICE_PROVIDER,
            env.VOICE_MODEL,
            env.VOICE_ID,
            input.language,
            text,
          ].join("\n")
        )
        .digest("hex")
        .slice(0, 24)
      const file = `${hash}.${extension}`
      await writeFile(join(dir, file), audio)
      const durationMs = await probeAudioMs(join(dir, file))
      if (!durationMs) {
        throw new AppError(
          "PROVIDER_FAILED",
          "The voiceover came back unreadable. Try again in a moment."
        )
      }
      spoken.push({
        id: hash.slice(0, 12),
        text,
        durationMs,
        audio,
        mediaType,
        file,
      })
    }
    return spoken
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** Stores a voiced line in a clip's voice folder; returns its key. */
export async function storeVoicedLine(
  line: SpokenLine,
  where: { workspaceId: string; kitId: string; footageId: string }
) {
  const audioKey = footageVoiceKey(
    where.workspaceId,
    where.kitId,
    where.footageId,
    line.file
  )
  await putFile(audioKey, line.audio, line.mediaType)
  return audioKey
}

/** Signed links to play stored lines, by key. */
export async function voiceLinks(keys: string[]) {
  return Object.fromEntries(
    await Promise.all(
      keys.map(async (key) => [key, await signedFileUrl(key, 3600)] as const)
    )
  )
}

/**
 * Voices a script line by line: each sentence becomes its own audio file in
 * the clip's folder (named by what was said, how and by whom, so a line
 * that didn't change isn't paid for twice), measured, and placed on the ad's
 * timeline one after another. Returns the lines and signed links to play
 * them. Nothing is saved to the clip: the editor saves the voice it shows.
 */
export async function voiceLines(input: {
  workspaceId: string
  kitId: string
  footageId: string
  script: string
  language: VoiceLanguage
  model?: SpeechModel
}): Promise<{ lines: VoiceLine[]; urls: Record<string, string> }> {
  const texts = splitScript(input.script)
  if (texts.length === 0) {
    throw new AppError("VALIDATION", "Write the script first.")
  }
  const spoken = await speakLines({ ...input, texts })
  const voiced = []
  for (const line of spoken) {
    const audioKey = await storeVoicedLine(line, input)
    voiced.push({
      id: line.id,
      text: line.text,
      durationMs: line.durationMs,
      audioKey,
    })
  }
  const lines = placeLines(voiced)
  return { lines, urls: await voiceLinks(lines.map((line) => line.audioKey)) }
}

/**
 * A recipe's steps read aloud for one clip (V3 M12): one line per step,
 * stored in the clip's folder, not placed — the recipe template times each
 * step by its line.
 */
export async function voiceSteps(input: {
  workspaceId: string
  kitId: string
  footageId: string
  steps: string[]
  language: VoiceLanguage
  model?: SpeechModel
}): Promise<{ steps: VoicedStep[]; urls: Record<string, string> }> {
  const spoken = await speakLines({ ...input, texts: input.steps })
  const steps: VoicedStep[] = []
  for (const line of spoken) {
    steps.push({
      id: line.id,
      text: line.text,
      durationMs: line.durationMs,
      audioKey: await storeVoicedLine(line, input),
    })
  }
  return { steps, urls: await voiceLinks(steps.map((step) => step.audioKey)) }
}
