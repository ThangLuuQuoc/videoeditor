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

const extensions: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
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
  const dir = await mkdtemp(join(tmpdir(), "reelpilot-voice-"))
  try {
    const voiced = []
    for (const text of texts) {
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
      const file = join(dir, `${hash}.${extension}`)
      await writeFile(file, audio)
      const durationMs = await probeAudioMs(file)
      if (!durationMs) {
        throw new AppError(
          "PROVIDER_FAILED",
          "The voiceover came back unreadable. Try again in a moment."
        )
      }
      const audioKey = footageVoiceKey(
        input.workspaceId,
        input.kitId,
        input.footageId,
        `${hash}.${extension}`
      )
      await putFile(audioKey, audio, mediaType)
      voiced.push({ id: hash.slice(0, 12), text, durationMs, audioKey })
    }
    const lines = placeLines(voiced)
    const urls = Object.fromEntries(
      await Promise.all(
        lines.map(
          async (line) =>
            [line.audioKey, await signedFileUrl(line.audioKey, 3600)] as const
        )
      )
    )
    return { lines, urls }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
