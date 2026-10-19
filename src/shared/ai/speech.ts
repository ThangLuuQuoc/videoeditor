import "server-only"

import { createElevenLabs } from "@ai-sdk/elevenlabs"
import { createOpenAI } from "@ai-sdk/openai"
import { generateSpeech, type SpeechModel } from "ai"

import { env } from "@/shared/config/env"
import { AppError } from "@/shared/lib/errors"

/**
 * Voiceover (V3 M9) behind the same adapter rule as text (§10): feature
 * code asks for speech, VOICE_PROVIDER decides who makes it. "test" makes a
 * quiet tone as long as the line would take to say — for development and
 * CI only, never a real voice.
 */
export const voiceEnabled = () => Boolean(env.VOICE_PROVIDER)

/** True when the configured "voice" is the development tone. */
export const voiceIsTest = () => env.VOICE_PROVIDER === "test"

function speechModel(): SpeechModel {
  const model = env.VOICE_MODEL ?? ""
  switch (env.VOICE_PROVIDER) {
    case "openai":
      return createOpenAI({ apiKey: env.OPENAI_API_KEY }).speech(model)
    case "elevenlabs":
      return createElevenLabs({ apiKey: env.ELEVENLABS_API_KEY }).speech(model)
    default:
      throw new AppError(
        "PROVIDER_FAILED",
        "Voiceover isn’t set up on this server."
      )
  }
}

/** One spoken line as audio bytes. */
export async function synthesizeSpeech(
  input: { text: string; language: string },
  options: { model?: SpeechModel } = {}
): Promise<{ audio: Uint8Array; mediaType: string }> {
  if (!options.model && voiceIsTest()) return testTone(input.text)
  try {
    const { audio } = await generateSpeech({
      model: options.model ?? speechModel(),
      text: input.text,
      voice: env.VOICE_ID,
      language: input.language,
      outputFormat: "mp3",
      maxRetries: 2,
    })
    return { audio: audio.uint8Array, mediaType: audio.mediaType }
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError(
      "PROVIDER_FAILED",
      "We couldn’t make the voiceover. Try again in a moment.",
      { cause: error }
    )
  }
}

/**
 * The "test" voice: a soft 330 Hz tone, about as long as reading the line
 * aloud (55 ms a character, 0.6–12 s), as a 16-bit mono WAV.
 */
export function testTone(text: string): {
  audio: Uint8Array
  mediaType: string
} {
  const rate = 24_000
  const seconds = Math.min(12, Math.max(0.6, 0.3 + text.length * 0.055))
  const samples = Math.round(rate * seconds)
  const bytes = new Uint8Array(44 + samples * 2)
  const view = new DataView(bytes.buffer)
  const ascii = (offset: number, value: string) =>
    [...value].forEach((char, i) =>
      view.setUint8(offset + i, char.charCodeAt(0))
    )
  ascii(0, "RIFF")
  view.setUint32(4, 36 + samples * 2, true)
  ascii(8, "WAVE")
  ascii(12, "fmt ")
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, "data")
  view.setUint32(40, samples * 2, true)
  for (let i = 0; i < samples; i++) {
    // Short fades in and out, so lines don't click.
    const edge = Math.min(1, i / 480, (samples - i) / 480)
    const value = Math.sin((2 * Math.PI * 330 * i) / rate) * 0.18 * edge
    view.setInt16(44 + i * 2, Math.round(value * 32767), true)
  }
  return { audio: bytes, mediaType: "audio/wav" }
}
