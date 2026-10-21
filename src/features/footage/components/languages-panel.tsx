"use client"

import { EyeIcon, LanguagesIcon, RefreshCwIcon, Trash2Icon } from "lucide-react"

import {
  versionLanguageNames,
  versionLanguages,
  versionState,
  type Presentation,
  type VersionLanguage,
} from "@/shared/motion"
import { Button } from "@/shared/ui/button"
import { Spinner } from "@/shared/ui/spinner"

import { PanelHeading } from "./editor-panels"

const stateNote = {
  missing: "Not made yet",
  current: "Up to date",
  stale: "Out of date: the words changed since",
} as const

/**
 * Languages (V3 M13 A): this clip in other languages. A version is its
 * words translated and its voiceover voiced again; everything else is the
 * clip's own, so it stays right as you move things. Preview plays it here;
 * Export picks it.
 */
export function LanguagesPanel({
  presentation,
  preview,
  busy,
  readOnly,
  onTranslate,
  onRemove,
  onPreview,
}: {
  presentation: Presentation
  /** The language the stage shows now; null = the original. */
  preview: VersionLanguage | null
  /** The language being made. */
  busy: VersionLanguage | null
  readOnly: boolean
  onTranslate: (language: VersionLanguage) => void
  onRemove: (language: VersionLanguage) => void
  onPreview: (language: VersionLanguage | null) => void
}) {
  const voiced = (presentation.voice?.lines.length ?? 0) > 0
  return (
    <div className="flex flex-col gap-6">
      <PanelHeading
        title="Languages"
        description={`The same clip in another language: every title, card and caption translated${
          voiced ? ", and the voiceover read again" : ""
        }. Your edits stay; export picks the language.`}
      />
      {preview && (
        <p
          role="status"
          className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground"
        >
          Previewing {versionLanguageNames[preview]}. Edits still change the
          original; translate again to bring them over.
        </p>
      )}
      <ul className="flex flex-col gap-3" aria-label="Languages">
        {versionLanguages.map((language) => {
          const state = versionState(presentation, language)
          const name = versionLanguageNames[language]
          const working = busy === language
          return (
            <li
              key={language}
              className="flex flex-col gap-3 rounded-lg border bg-card p-3"
              aria-label={name}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <LanguagesIcon className="size-4 text-muted-foreground" />
                  {name}
                </span>
                <span
                  className={
                    state === "stale"
                      ? "text-xs text-destructive"
                      : "text-xs text-muted-foreground"
                  }
                >
                  {stateNote[state]}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {!readOnly && (
                  <Button
                    type="button"
                    size="sm"
                    variant={state === "current" ? "outline" : "default"}
                    disabled={busy !== null}
                    onClick={() => onTranslate(language)}
                  >
                    {working ? (
                      <Spinner data-icon="inline-start" />
                    ) : state === "missing" ? (
                      <LanguagesIcon data-icon="inline-start" />
                    ) : (
                      <RefreshCwIcon data-icon="inline-start" />
                    )}
                    {working
                      ? "Translating…"
                      : state === "missing"
                        ? `Make ${name} version`
                        : "Translate again"}
                  </Button>
                )}
                {state !== "missing" && (
                  <Button
                    type="button"
                    size="sm"
                    variant={preview === language ? "secondary" : "outline"}
                    aria-pressed={preview === language}
                    onClick={() =>
                      onPreview(preview === language ? null : language)
                    }
                  >
                    <EyeIcon data-icon="inline-start" />
                    {preview === language ? "Previewing" : "Preview"}
                  </Button>
                )}
                {state !== "missing" && !readOnly && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove the ${name} version`}
                    disabled={busy !== null}
                    onClick={() => onRemove(language)}
                  >
                    <Trash2Icon />
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
