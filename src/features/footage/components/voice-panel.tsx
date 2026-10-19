"use client"

import { MicIcon, SparklesIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"

import {
  captionStyles,
  voiceEndMs,
  voiceLanguageNames,
  voiceLanguages,
  voiceLimits,
  type CaptionStyle,
  type Voice,
  type VoiceLanguage,
} from "@/shared/motion"
import { Button } from "@/shared/ui/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/shared/ui/field"
import { Spinner } from "@/shared/ui/spinner"
import { Switch } from "@/shared/ui/switch"
import { Textarea } from "@/shared/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group"

import { formatTimecode } from "../lib/format"
import { PanelHeading, SliderField } from "./editor-panels"

const captionStyleNames: Record<CaptionStyle, string> = {
  bold: "Bold",
  bar: "Bar",
  minimal: "Minimal",
}

/**
 * Voiceover and captions (V3 M9): a script, voiced line by line by the
 * server's voice provider, with captions timed by each line's audio.
 */
export function VoicePanel({
  voice,
  adMs,
  setUp,
  isTest,
  isWriting,
  isVoicing,
  onWrite,
  onVoice,
  onChange,
  onRemove,
}: {
  voice: Voice | null
  /** The ad's length (after cuts and speed changes). */
  adMs: number
  /** Whether this server has a voice provider. */
  setUp: boolean
  /** The development tone stands in for a voice. */
  isTest: boolean
  isWriting: boolean
  isVoicing: boolean
  /** Resolves to the AI's script, or null if it failed (it says why). */
  onWrite: (language: VoiceLanguage) => Promise<string | null>
  onVoice: (script: string, language: VoiceLanguage) => void
  onChange: (voice: Voice, control: string) => void
  onRemove: () => void
}) {
  const [script, setScript] = useState(voice?.script ?? "")
  const [language, setLanguage] = useState<VoiceLanguage>(
    voice?.language ?? "vi"
  )
  const endMs = voiceEndMs(voice)
  const busy = isWriting || isVoicing

  if (!setUp) {
    return (
      <div className="flex flex-col gap-6">
        <PanelHeading
          title="Voiceover"
          description="Voiceover isn’t set up on this server. Add a voice provider (VOICE_PROVIDER) to turn it on."
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PanelHeading
        title="Voiceover"
        description="Write what the narrator says. Each sentence is voiced and captioned on its own, one after another."
      />
      <Field>
        <span className="text-sm font-medium" id="voice-language-label">
          Language
        </span>
        <ToggleGroup
          aria-labelledby="voice-language-label"
          variant="outline"
          className="flex flex-wrap gap-1"
          value={[language]}
          onValueChange={(values) => {
            const next = values[0] as VoiceLanguage | undefined
            if (next) setLanguage(next)
          }}
        >
          {voiceLanguages.map((code) => (
            <ToggleGroupItem key={code} value={code} className="text-xs">
              {voiceLanguageNames[code]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      <Field>
        <FieldLabel htmlFor="voice-script">Script</FieldLabel>
        <Textarea
          id="voice-script"
          className="min-h-36"
          maxLength={voiceLimits.script}
          placeholder="Ra mắt tính năng mới. Xuất video chỉ trong vài phút. Dùng thử miễn phí hôm nay."
          value={script}
          disabled={busy}
          onChange={(event) => setScript(event.target.value)}
        />
        <FieldDescription>
          {script.length}/{voiceLimits.script} characters
          {isTest ? ". Test voice: a tone stands in for speech." : ""}
        </FieldDescription>
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={async () => {
            const written = await onWrite(language)
            if (written) setScript(written)
          }}
        >
          {isWriting ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <SparklesIcon data-icon="inline-start" />
          )}
          Write with AI
        </Button>
        <Button
          type="button"
          disabled={busy || !script.trim()}
          onClick={() => onVoice(script, language)}
        >
          {isVoicing ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <MicIcon data-icon="inline-start" />
          )}
          {isVoicing ? "Voicing…" : voice ? "Voice again" : "Make voiceover"}
        </Button>
      </div>

      {voice && voice.lines.length > 0 && (
        <>
          <section
            className="flex flex-col gap-2"
            aria-labelledby="voice-lines"
          >
            <h3 id="voice-lines" className="text-sm font-medium">
              Lines
            </h3>
            {endMs > adMs && (
              <p className="text-sm text-destructive" role="status">
                The voiceover runs past the end of the ad (
                {formatTimecode(endMs)} of {formatTimecode(adMs)}). Shorten the
                script or keep more of the clip.
              </p>
            )}
            <ol className="flex flex-col gap-1" aria-label="Voiceover lines">
              {voice.lines.map((line) => (
                <li key={line.id} className="flex gap-2 text-sm">
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {formatTimecode(line.atMs)}
                  </span>
                  <span>{line.text}</span>
                </li>
              ))}
            </ol>
          </section>
          <Field orientation="horizontal">
            <Switch
              id="voice-captions"
              checked={voice.captions}
              onCheckedChange={(captions) =>
                onChange({ ...voice, captions }, "captions")
              }
            />
            <FieldContent>
              <FieldLabel htmlFor="voice-captions">Captions</FieldLabel>
              <FieldDescription>
                The line being spoken, on the video.
              </FieldDescription>
            </FieldContent>
          </Field>
          {voice.captions && (
            <Field>
              <span className="text-sm font-medium" id="caption-style-label">
                Caption style
              </span>
              <ToggleGroup
                aria-labelledby="caption-style-label"
                variant="outline"
                className="flex flex-wrap gap-1"
                value={[voice.captionStyle]}
                onValueChange={(values) => {
                  const next = values[0] as CaptionStyle | undefined
                  if (next)
                    onChange({ ...voice, captionStyle: next }, "caption-style")
                }}
              >
                {captionStyles.map((style) => (
                  <ToggleGroupItem
                    key={style}
                    value={style}
                    className="text-xs"
                  >
                    {captionStyleNames[style]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
          )}
          <SliderField
            label="Voice volume"
            value={voice.volume}
            min={0}
            max={1}
            step={0.05}
            format={(value) => `${Math.round(value * 100)}%`}
            onChange={(volume) => onChange({ ...voice, volume }, "volume")}
          />
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onRemove}
          >
            <Trash2Icon data-icon="inline-start" />
            Remove voiceover
          </Button>
        </>
      )}
    </div>
  )
}
