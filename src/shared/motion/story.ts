import { z } from "zod"

/**
 * A story for the timeline template (V3 M12): a title, then chapters in
 * order — a date, what happened, and a line about it — kept on the
 * presentation so the form opens with it again. Each chapter usually gets
 * a clip (a photo held still, or a video).
 */
export const storyLimits = {
  title: 60,
  subtitle: 80,
  cta: 40,
  chapters: 12,
  date: 24,
  chapterTitle: 60,
  line: 120,
} as const

export const storyChapterSchema = z.object({
  /** "1998", "Spring 2020", "Day 1"; may be empty. */
  date: z.string().trim().max(storyLimits.date).default(""),
  title: z.string().trim().min(1).max(storyLimits.chapterTitle),
  line: z.string().trim().max(storyLimits.line).default(""),
})
export type StoryChapter = z.output<typeof storyChapterSchema>

export const storySchema = z.object({
  title: z.string().trim().min(1).max(storyLimits.title),
  subtitle: z.string().trim().max(storyLimits.subtitle).default(""),
  chapters: z.array(storyChapterSchema).min(1).max(storyLimits.chapters),
  /** The end card's line; empty says "Thanks for watching". */
  cta: z.string().trim().max(storyLimits.cta).default(""),
})
export type Story = z.output<typeof storySchema>
export type StoryInput = z.input<typeof storySchema>

/**
 * Chapters typed one per line: "1998 | Founded in a garage | Two friends
 * and a soldering iron". The date and the line are optional; "1998 — Title"
 * works too. Blank lines are dropped.
 */
export function storyChapters(text: string): StoryChapter[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|").map((part) => part.trim())
      if (parts.length >= 2) {
        const [date = "", title = "", ...rest] = parts
        return { date, title, line: rest.join(" ").trim() }
      }
      const dashed = /^(\S+(?:\s\S+)?)\s+[—–-]\s+(.+)$/u.exec(line)
      if (dashed) return { date: dashed[1]!, title: dashed[2]!, line: "" }
      return { date: "", title: line, line: "" }
    })
}

/** The chapters back as lines, for the form. */
export const storyChapterLines = (chapters: StoryChapter[]) =>
  chapters
    .map((chapter) =>
      chapter.line
        ? `${chapter.date} | ${chapter.title} | ${chapter.line}`
        : chapter.date
          ? `${chapter.date} | ${chapter.title}`
          : chapter.title
    )
    .join("\n")
