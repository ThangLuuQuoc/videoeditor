import {
  graphicLimits,
  outputDuration,
  toSource,
  type GraphicItem,
  type KenBurns,
  type Presentation,
  type Shot,
  type Story,
} from "@/shared/motion"

import { newGraphic } from "./graphic-templates"
import { noLens } from "./lens-looks"
import { shareEqually, type Segment } from "./recipe-layout"

/**
 * The timeline template (V3 M12): a story — a title, then dated chapters —
 * over one clip or every clip of a video. The title opens the first clip,
 * each chapter gets a milestone (its date, what happened) as it begins and
 * a chapter bar along the bottom that fills chapter by chapter, and an end
 * card closes the last clip. With one clip per chapter, each chapter is
 * its clip; otherwise the chapters share the time equally (one may run on
 * across a cut). Photos held as still clips get a slow Ken Burns zoom,
 * alternating in and out. Pure, one undo step; what it adds carries the
 * templates' `tpl-` ids, so applying it again replaces it.
 */
export const storyTiming = {
  introMs: 2600,
  endMs: 3000,
  /** The shortest a chapter may be. */
  chapterMinMs: 1500,
  /** How long a chapter's milestone stays up (less on a short chapter). */
  milestoneMs: 3500,
  /** A graphic's shortest and longest length (graphicItemSchema). */
  itemMinMs: 400,
  itemMaxMs: 15_000,
} as const

export type StorySlot = {
  kind: "intro" | "chapter" | "end"
  /** The chapter (0 for the other kinds). */
  index: number
  clip: number
  /** In the clip's ad time. */
  startMs: number
  endMs: number
  /** Chapters: which part of the chapter this piece is (0–1). */
  share: { from: number; to: number }
}

export type StoryLayout =
  | { ok: true; slots: StorySlot[] }
  | { ok: false; reason: "too-short"; needMs: number; haveMs: number }
  | { ok: false; reason: "first-clip-short"; needMs: number; haveMs: number }
  | { ok: false; reason: "last-clip-short"; needMs: number; haveMs: number }

const whole = { from: 0, to: 1 }

/** Lays a story out over clips `lengths` long (each one's edited length). */
export function layoutStory(story: Story, lengths: number[]): StoryLayout {
  const t = storyTiming
  const last = lengths.length - 1
  const chapters = story.chapters.length
  const haveMs = lengths.reduce((sum, length) => sum + length, 0)
  const needMs = t.introMs + chapters * t.chapterMinMs + t.endMs
  if (haveMs < needMs) return { ok: false, reason: "too-short", needMs, haveMs }
  if (last > 0 && lengths[0]! < t.introMs + t.chapterMinMs / 2) {
    return {
      ok: false,
      reason: "first-clip-short",
      needMs: t.introMs + t.chapterMinMs / 2,
      haveMs: lengths[0]!,
    }
  }
  if (last > 0 && lengths[last]! < t.endMs) {
    return {
      ok: false,
      reason: "last-clip-short",
      needMs: t.endMs,
      haveMs: lengths[last]!,
    }
  }
  const room: Segment[] = lengths.map((length, clip) => ({
    clip,
    startMs: clip === 0 ? t.introMs : 0,
    endMs: clip === last ? length - t.endMs : length,
  }))
  const intro: StorySlot = {
    kind: "intro",
    index: 0,
    clip: 0,
    startMs: 0,
    endMs: t.introMs,
    share: whole,
  }
  const end: StorySlot = {
    kind: "end",
    index: 0,
    clip: last,
    startMs: lengths[last]! - t.endMs,
    endMs: lengths[last]!,
    share: whole,
  }

  // One clip per chapter (the usual timeline: a photo a chapter), when
  // every clip has room for its chapter.
  if (
    lengths.length === chapters &&
    room.every((segment) => segment.endMs - segment.startMs >= t.chapterMinMs)
  ) {
    const each = room.map((segment, index): StorySlot => ({
      kind: "chapter",
      index,
      clip: segment.clip,
      startMs: segment.startMs,
      endMs: segment.endMs,
      share: whole,
    }))
    return { ok: true, slots: [intro, ...each, end] }
  }

  const shared = shareEqually(room, chapters)
  if (!shared.slots) return { ok: false, reason: "too-short", needMs, haveMs }
  // Each piece's part of its chapter, for the chapter bar.
  const pieces: StorySlot[] = []
  for (let index = 0; index < chapters; index++) {
    const mine = shared.slots.filter((slot) => slot.index === index)
    const total = mine.reduce((sum, s) => sum + s.endMs - s.startMs, 0)
    let done = 0
    for (const slot of mine) {
      const length = slot.endMs - slot.startMs
      pieces.push({
        kind: "chapter",
        index,
        clip: slot.clip,
        startMs: slot.startMs,
        endMs: slot.endMs,
        share: { from: done / total, to: (done + length) / total },
      })
      done += length
    }
  }
  return { ok: true, slots: [intro, ...pieces, end] }
}

type Motion = { shots: Record<string, Shot | null>; presentation: Presentation }

const prefix = "tpl-"

export type StoryResult =
  | { ok: true; motion: Motion }
  | Exclude<StoryLayout, { ok: true }>
  | { ok: false; reason: "too-many-graphics"; limit: number }

/** One clip's part of a laid-out story, on top of its current edit. */
export function buildStoryClip(
  story: Story,
  input: {
    current: Motion
    durationMs: number
    brandColors: string[]
    /** This clip's slots (layoutStory's, for this clip). */
    slots: StorySlot[]
    /** A photo's slow zoom; videos keep theirs ("off" unless set). */
    kenBurns: KenBurns | null
    scope: "clip" | "video"
  }
): StoryResult {
  const t = storyTiming
  const { durationMs, slots } = input
  const { presentation } = input.current
  const { edit } = presentation
  const chapters = story.chapters.length
  const at = (adMs: number) => Math.round(toSource(edit, durationMs, adMs))
  const length = (ms: number) =>
    Math.max(t.itemMinMs, Math.min(t.itemMaxMs, Math.round(ms)))
  const chapterNames = story.chapters.map((chapter) => chapter.title).join("\n")

  const graphics: GraphicItem[] = presentation.graphics.filter(
    (graphic) => !graphic.id.startsWith(prefix)
  )
  const added: GraphicItem[] = []
  for (const slot of slots) {
    const slotMs = slot.endMs - slot.startMs
    if (slot.kind === "intro") {
      added.push(
        newGraphic("slide", {
          id: `${prefix}intro`,
          atMs: at(slot.startMs),
          durationMs: length(slotMs),
          text: story.title,
          secondary: story.subtitle,
          track: 2,
        })
      )
    } else if (slot.kind === "end") {
      added.push(
        newGraphic("end-card", {
          id: `${prefix}end`,
          atMs: at(slot.startMs),
          durationMs: length(slotMs),
          text: story.title,
          secondary: story.cta || "Thanks for watching",
          track: 2,
        })
      )
    } else {
      const chapter = story.chapters[slot.index]!
      const n = slot.index + 1
      // Its milestone as the chapter begins (not again where it runs on).
      if (slot.share.from === 0) {
        added.push(
          newGraphic("milestone", {
            id: `${prefix}chapter-${n}`,
            atMs: at(slot.startMs),
            durationMs: length(Math.min(t.milestoneMs, slotMs)),
            text: chapter.date,
            secondary: chapter.line
              ? `${chapter.title}\n${chapter.line}`
              : chapter.title,
            track: 1,
          })
        )
      }
      // The chapter bar, in pieces of at most a graphic's longest length.
      const parts = Math.ceil(slotMs / t.itemMaxMs)
      for (let part = 0; part < parts; part++) {
        const from = part / parts
        const to = (part + 1) / parts
        const share = (f: number) =>
          slot.share.from + (slot.share.to - slot.share.from) * f
        added.push(
          newGraphic("progress", {
            id: `${prefix}bar-${n}${parts > 1 ? `-${part + 1}` : ""}`,
            atMs: at(slot.startMs + slotMs * from),
            durationMs: length(slotMs / parts),
            secondary: chapterNames,
            progress: {
              current: slot.index,
              from: (slot.index + share(from)) / chapters,
              to: (slot.index + share(to)) / chapters,
            },
            // Above the milestone, whose dark fade would dim the bar.
            track: 2,
          })
        )
      }
    }
  }
  if (graphics.length + added.length > graphicLimits.items) {
    return {
      ok: false,
      reason: "too-many-graphics",
      limit: graphicLimits.items,
    }
  }

  const [from, to] = input.brandColors
  return {
    ok: true,
    motion: {
      shots: input.current.shots,
      presentation: {
        ...presentation,
        // Photos and footage fill the frame: no screen corners or shadow.
        frame: { ...presentation.frame, radius: 0, shadow: false, padding: 0 },
        lens: noLens,
        textStyle: { animation: "word-rise" },
        kenBurns: input.kenBurns ?? presentation.kenBurns,
        ...(from
          ? {
              background: {
                kind: "gradient" as const,
                from,
                to: to ?? from,
              },
            }
          : {}),
        graphics: [...graphics, ...added],
        template: input.scope === "video" ? "story-video" : "story",
        story,
      },
    },
  }
}

/** The story on one clip (the clip editor's "Build timeline video"). */
export function applyStory(
  story: Story,
  input: {
    current: Motion
    durationMs: number
    brandColors: string[]
    /** The clip is a photo held still: it gets a slow zoom in. */
    isPhoto: boolean
  }
): StoryResult {
  const haveMs = Math.round(
    outputDuration(input.current.presentation.edit, input.durationMs)
  )
  const layout = layoutStory(story, [haveMs])
  if (!layout.ok) return layout
  return buildStoryClip(story, {
    ...input,
    slots: layout.slots,
    kenBurns: input.isPhoto ? "in" : null,
    scope: "clip",
  })
}

/** Why a story couldn't be built, in words, with what to do about it. */
export function storyFailure(
  result: Exclude<StoryResult, { ok: true }>,
  story: Pick<Story, "chapters">,
  across: "clip" | "video"
) {
  const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`
  const chapters = story.chapters.length
  switch (result.reason) {
    case "too-short":
      return `This ${across} runs ${seconds(result.haveMs)}; ${chapters} ${
        chapters === 1 ? "chapter needs" : "chapters need"
      } at least ${seconds(result.needMs)}. Remove a chapter or add ${
        across === "video" ? "clips" : "a longer clip"
      }.`
    case "first-clip-short":
      return `The first clip runs ${seconds(result.haveMs)}; the title needs ${seconds(result.needMs)}. Put a longer clip first.`
    case "last-clip-short":
      return `The last clip runs ${seconds(result.haveMs)}; the end card needs ${seconds(result.needMs)}. Put a longer clip last.`
    case "too-many-graphics":
      return `A clip holds up to ${result.limit} graphics: remove a few first.`
  }
}
