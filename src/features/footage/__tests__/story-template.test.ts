import { describe, expect, it } from "vitest"

import {
  defaultPresentation,
  kenBurnsAt,
  presentationSchema,
  storyChapterLines,
  storyChapters,
  storySchema,
  toOutputNearest,
  type Presentation,
  type Story,
} from "@/shared/motion"

import { photoArgs } from "../lib/processing"
import {
  applyStory,
  buildStoryClip,
  layoutStory,
  storyTiming,
} from "../lib/story-template"

const story = (chapters: number): Story =>
  storySchema.parse({
    title: "25 years of Acme",
    subtitle: "From a garage to 40 countries",
    chapters: Array.from({ length: chapters }, (_, i) => ({
      date: `${2000 + i}`,
      title: `Chapter ${i + 1}`,
      line: i === 0 ? "Where it began" : "",
    })),
  })

const clip = (presentation: Presentation = defaultPresentation) => ({
  shots: {},
  presentation,
})

describe("story chapters typed one per line", () => {
  it("reads date | title | line, a dash, or a title alone", () => {
    expect(
      storyChapters(
        "1998 | Founded in a garage | Two friends\n\n2005 — First store\nToday"
      )
    ).toEqual([
      { date: "1998", title: "Founded in a garage", line: "Two friends" },
      { date: "2005", title: "First store", line: "" },
      { date: "", title: "Today", line: "" },
    ])
  })

  it("writes them back the same way", () => {
    const text = "1998 | Founded | Two friends\n2005 | First store\nToday"
    expect(storyChapterLines(storyChapters(text))).toBe(text)
  })
})

describe("layoutStory", () => {
  it("makes each clip a chapter when there's one per chapter", () => {
    const result = layoutStory(story(3), [6000, 6000, 6000])
    if (!result.ok) throw new Error(result.reason)
    expect(
      result.slots.map((s) => [s.kind, s.index, s.clip, s.startMs, s.endMs])
    ).toEqual([
      ["intro", 0, 0, 0, 2600],
      ["chapter", 0, 0, 2600, 6000],
      ["chapter", 1, 1, 0, 6000],
      ["chapter", 2, 2, 0, 3000],
      ["end", 0, 2, 3000, 6000],
    ])
  })

  it("shares one clip's time equally between the chapters", () => {
    const result = layoutStory(story(2), [16_000])
    if (!result.ok) throw new Error(result.reason)
    const chapters = result.slots.filter((s) => s.kind === "chapter")
    expect(chapters.map((s) => [s.startMs, s.endMs])).toEqual([
      [2600, 7800],
      [7800, 13_000],
    ])
  })

  it("says what's too short", () => {
    expect(layoutStory(story(4), [9000])).toEqual({
      ok: false,
      reason: "too-short",
      needMs: 2600 + 4 * 1500 + 3000,
      haveMs: 9000,
    })
    expect(layoutStory(story(2), [2000, 9000])).toMatchObject({
      reason: "first-clip-short",
    })
    expect(layoutStory(story(2), [9000, 2000])).toMatchObject({
      reason: "last-clip-short",
    })
  })
})

describe("buildStoryClip and applyStory", () => {
  it("gives each chapter its milestone and a chapter bar that fills by chapter", () => {
    const layout = layoutStory(story(3), [6000, 6000, 6000])
    if (!layout.ok) throw new Error(layout.reason)
    const second = buildStoryClip(story(3), {
      current: clip(),
      durationMs: 6000,
      brandColors: [],
      slots: layout.slots.filter((s) => s.clip === 1),
      kenBurns: "out",
      scope: "video",
    })
    if (!second.ok) throw new Error(second.reason)
    const { presentation } = second.motion
    const byId = new Map(presentation.graphics.map((g) => [g.id, g]))
    expect(byId.get("tpl-chapter-2")).toMatchObject({
      kind: "milestone",
      text: "2001",
      secondary: "Chapter 2",
      durationMs: storyTiming.milestoneMs,
    })
    // The second of three chapters: the bar goes from 1/3 to 2/3.
    expect(byId.get("tpl-bar-2")).toMatchObject({
      kind: "progress",
      secondary: "Chapter 1\nChapter 2\nChapter 3",
      progress: { current: 1, from: 1 / 3, to: 2 / 3 },
    })
    expect(presentation.kenBurns).toBe("out")
    expect(presentation.template).toBe("story-video")
    expect(presentationSchema.safeParse(presentation).success).toBe(true)
  })

  it("on one clip: a title, every chapter and an end card; a photo zooms in", () => {
    const result = applyStory(story(2), {
      current: clip(),
      durationMs: 16_000,
      brandColors: ["#0ea5e9"],
      isPhoto: true,
    })
    if (!result.ok) throw new Error(result.reason)
    const { presentation } = result.motion
    expect(presentation.graphics.map((g) => g.id)).toEqual([
      "tpl-intro",
      "tpl-chapter-1",
      "tpl-bar-1",
      "tpl-chapter-2",
      "tpl-bar-2",
      "tpl-end",
    ])
    const milestone = presentation.graphics.find(
      (g) => g.id === "tpl-chapter-1"
    )!
    expect(milestone.secondary).toBe("Chapter 1\nWhere it began")
    expect(toOutputNearest(presentation.edit, 16_000, milestone.atMs)).toBe(
      2600
    )
    expect(presentation.graphics.at(-1)!.secondary).toBe("Thanks for watching")
    expect(presentation.kenBurns).toBe("in")
    expect(presentation.frame).toMatchObject({ radius: 0, padding: 0 })
    expect(presentation.story!.title).toBe("25 years of Acme")
    expect(presentationSchema.safeParse(presentation).success).toBe(true)
  })

  it("keeps a video's own zoom setting, and splits a long chapter's bar", () => {
    const result = applyStory(story(1), {
      current: clip(),
      durationMs: 40_000,
      brandColors: [],
      isPhoto: false,
    })
    if (!result.ok) throw new Error(result.reason)
    const { presentation } = result.motion
    expect(presentation.kenBurns).toBe("off")
    // 34.4s of chapter: three bars of at most 15s, one after another.
    const bars = presentation.graphics.filter((g) => g.kind === "progress")
    expect(bars).toHaveLength(3)
    expect(bars.map((bar) => bar.progress)).toEqual([
      { current: 0, from: 0, to: 1 / 3 },
      { current: 0, from: 1 / 3, to: 2 / 3 },
      { current: 0, from: 2 / 3, to: 1 },
    ])
  })
})

describe("photos", () => {
  it("zoom slowly in or out across the clip", () => {
    expect(kenBurnsAt("off", 0.5)).toBeNull()
    expect(kenBurnsAt("in", 0)).toEqual({ scale: 1, x: -0, y: -0 })
    expect(kenBurnsAt("in", 1)).toEqual({ scale: 1.12, x: -2, y: -1.2 })
    expect(kenBurnsAt("out", 1)).toEqual({ scale: 1, x: -0, y: -0 })
  })

  it("are held for 6 seconds as a silent H.264 clip", () => {
    const args = photoArgs("in.jpg", "out.mp4")
    expect(args.slice(0, 6)).toEqual([
      "-loop",
      "1",
      "-framerate",
      "30",
      "-t",
      "6.000",
    ])
    expect(args).toContain("libx264")
    expect(args.join(" ")).toContain("force_divisible_by=2")
  })
})
