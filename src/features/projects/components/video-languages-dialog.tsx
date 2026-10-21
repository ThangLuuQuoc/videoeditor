"use client"

import { LanguagesIcon, RefreshCwIcon } from "lucide-react"
import { useState } from "react"

import {
  versionLanguageNames,
  versionLanguages,
  versionState,
  type Presentation,
  type VersionLanguage,
} from "@/shared/motion"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Spinner } from "@/shared/ui/spinner"

/** A language's state over every clip: missing anywhere, stale, or current. */
function videoState(clips: Presentation[], language: VersionLanguage) {
  const states = clips.map((clip) => versionState(clip, language))
  if (states.length === 0 || states.includes("missing")) return "missing"
  return states.includes("stale") ? "stale" : "current"
}

const stateNote = {
  missing: "Not made yet",
  current: "Up to date",
  stale: "Out of date: words changed since",
} as const

/**
 * Languages for a whole video (V3 M13 A): every clip translated (and its
 * voiceover voiced again) in one go. Export picks the language.
 */
export function VideoLanguagesDialog({
  clips,
  busy,
  onTranslate,
}: {
  /** Each clip's presentation, in order. */
  clips: Presentation[]
  /** The language being made. */
  busy: VersionLanguage | null
  /** Resolves true when done (the dialog closes). */
  onTranslate: (language: VersionLanguage) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={clips.length === 0}
        onClick={() => setOpen(true)}
      >
        {busy ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <LanguagesIcon data-icon="inline-start" />
        )}
        <span className="hidden sm:inline">Languages</span>
        <span className="sr-only sm:hidden">Languages</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Languages</DialogTitle>
            <DialogDescription>
              The whole video in another language: every clip&apos;s titles,
              cards and captions translated, and its voiceover read again. The
              original stays; Export picks the language.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-3" aria-label="Video languages">
            {versionLanguages.map((language) => {
              const state = videoState(clips, language)
              const name = versionLanguageNames[language]
              return (
                <li
                  key={language}
                  aria-label={name}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{name}</span>
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
                  <Button
                    type="button"
                    size="sm"
                    variant={state === "current" ? "outline" : "default"}
                    disabled={busy !== null}
                    onClick={async () => {
                      if (await onTranslate(language)) setOpen(false)
                    }}
                  >
                    {busy === language ? (
                      <Spinner data-icon="inline-start" />
                    ) : state === "missing" ? (
                      <LanguagesIcon data-icon="inline-start" />
                    ) : (
                      <RefreshCwIcon data-icon="inline-start" />
                    )}
                    {busy === language
                      ? "Translating…"
                      : state === "missing"
                        ? `Make ${name} version`
                        : "Translate again"}
                  </Button>
                </li>
              )
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
