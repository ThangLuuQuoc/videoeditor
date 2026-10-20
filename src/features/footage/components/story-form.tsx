"use client"

import { CheckIcon, HistoryIcon } from "lucide-react"
import { useId, useState, useTransition } from "react"

import {
  storyChapterLines,
  storyChapters,
  storyLimits,
  type Story,
} from "@/shared/motion"
import { Button } from "@/shared/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import { Spinner } from "@/shared/ui/spinner"
import { Textarea } from "@/shared/ui/textarea"

/** What's wrong with the story as typed, in words; null = fine. */
export function storyProblem(input: {
  title: string
  chapters: ReturnType<typeof storyChapters>
}) {
  const l = storyLimits
  if (!input.title.trim()) return "Give the story a title."
  if (input.title.trim().length > l.title)
    return `Keep the title under ${l.title} characters.`
  if (input.chapters.length === 0) return "Add at least one chapter."
  if (input.chapters.length > l.chapters) return `Up to ${l.chapters} chapters.`
  for (const [index, chapter] of input.chapters.entries()) {
    const n = index + 1
    if (!chapter.title) return `Chapter ${n} needs a title after its date.`
    if (chapter.date.length > l.date)
      return `Keep chapter ${n}'s date under ${l.date} characters.`
    if (chapter.title.length > l.chapterTitle)
      return `Keep chapter ${n}'s title under ${l.chapterTitle} characters.`
    if (chapter.line.length > l.line)
      return `Keep chapter ${n}'s line under ${l.line} characters.`
  }
  return null
}

/**
 * The timeline template's form (V3 M12): a title, then chapters one per
 * line — "1998 | Founded in a garage | Two friends and a soldering iron".
 * Building replaces what the template made before. Used for one clip and
 * for a whole video (best with a clip, often a photo, per chapter).
 */
export function StoryForm({
  story,
  active,
  disabled,
  across = "clip",
  onBuild,
}: {
  story: Story | null
  active: boolean
  disabled: boolean
  /** What it builds on: this clip, or every clip of a video. */
  across?: "clip" | "video"
  /** Returns a problem to show (e.g. too short), or null. */
  onBuild: (story: Story) => Promise<string | null>
}) {
  const id = useId()
  const [title, setTitle] = useState(story?.title ?? "")
  const [subtitle, setSubtitle] = useState(story?.subtitle ?? "")
  const [chapters, setChapters] = useState(
    story ? storyChapterLines(story.chapters) : ""
  )
  const [cta, setCta] = useState(story?.cta ?? "")
  const [problem, setProblem] = useState<string | null>(null)
  const [isBuilding, startBuild] = useTransition()

  function build(event: React.FormEvent) {
    event.preventDefault()
    const parsed = storyChapters(chapters)
    const typed = storyProblem({ title, chapters: parsed })
    if (typed) {
      setProblem(typed)
      return
    }
    setProblem(null)
    startBuild(async () => {
      setProblem(
        await onBuild({
          title: title.trim(),
          subtitle: subtitle.trim(),
          chapters: parsed,
          cta: cta.trim(),
        })
      )
    })
  }

  return (
    <form
      className="flex flex-col gap-4 rounded-lg border bg-card p-3"
      aria-labelledby={`${id}-title`}
      onSubmit={build}
    >
      <div className="flex flex-col gap-1">
        <h3 id={`${id}-title`} className="text-sm font-medium">
          Timeline
        </h3>
        <p className="text-xs text-muted-foreground">
          A story told chapter by chapter: each gets its date and title as it
          begins, and a bar along the bottom shows how far along it is.
          {across === "video"
            ? " With a clip per chapter, each chapter is its clip; photos zoom slowly."
            : " Photos zoom slowly."}
        </p>
      </div>

      <Field>
        <FieldLabel htmlFor={`${id}-name`}>Title</FieldLabel>
        <Input
          id={`${id}-name`}
          value={title}
          maxLength={storyLimits.title}
          placeholder="25 years of Acme"
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-subtitle`}>Line under the title</FieldLabel>
        <Input
          id={`${id}-subtitle`}
          value={subtitle}
          maxLength={storyLimits.subtitle}
          placeholder="From a garage to 40 countries"
          onChange={(event) => setSubtitle(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-chapters`}>Chapters</FieldLabel>
        <Textarea
          id={`${id}-chapters`}
          value={chapters}
          rows={5}
          placeholder={
            "1998 | Founded in a garage | Two friends and a soldering iron\n2005 | First store\n2024 | 40 countries"
          }
          onChange={(event) => setChapters(event.target.value)}
        />
        <FieldDescription>
          One per line, in order, up to {storyLimits.chapters}: date | title | a
          line about it (the date and the line are optional).
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-cta`}>End card line</FieldLabel>
        <Input
          id={`${id}-cta`}
          value={cta}
          maxLength={storyLimits.cta}
          placeholder="Here's to the next 25"
          onChange={(event) => setCta(event.target.value)}
        />
      </Field>

      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      <Button
        type="submit"
        size="sm"
        variant={active ? "secondary" : "default"}
        disabled={disabled || isBuilding}
      >
        {isBuilding ? (
          <Spinner data-icon="inline-start" />
        ) : active ? (
          <CheckIcon data-icon="inline-start" />
        ) : (
          <HistoryIcon data-icon="inline-start" />
        )}
        {active ? "Rebuild timeline video" : "Build timeline video"}
      </Button>
    </form>
  )
}
