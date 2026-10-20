import type { Recipe } from "@/shared/motion"

/**
 * Where a recipe's parts go (V3 M12): the title at the start of the first
 * clip, the checklist after it, the steps in order, and the end card on the
 * last clip's last seconds — over one clip, or every clip of a video.
 * Times are in each clip's ad time (after its cuts and speed changes).
 *
 * Without a voiceover the steps share what's left equally, a step running
 * on into the next clip when it must. With one, each step lasts exactly as
 * long as its spoken line (plus a breath before and after), never crosses
 * into another clip (its audio would be cut off there), and spare time
 * becomes even pauses between the steps.
 */
export const recipeTiming = {
  introMs: 2600,
  endMs: 3000,
  /** The checklist: a base plus a little per line, within bounds. */
  listBaseMs: 1600,
  listPerLineMs: 500,
  listMinMs: 2500,
  listMaxMs: 8000,
  stepMinMs: 1500,
  /** A voiced step starts this long before its line, and ends this after. */
  voiceLeadMs: 300,
  voiceTailMs: 500,
  /** A graphic's shortest and longest length (graphicItemSchema). */
  itemMinMs: 400,
  itemMaxMs: 15_000,
} as const

export type RecipeSlot = {
  kind: "intro" | "list" | "step" | "end"
  /** The step's position (0 for the other kinds). */
  index: number
  /** Which clip it's on, and when, in that clip's ad time. */
  clip: number
  startMs: number
  endMs: number
  /** A voiced step: when its line starts, in the clip's ad time. */
  voiceAtMs: number | null
}

export type RecipeLayout =
  | { ok: true; slots: RecipeSlot[] }
  /** The clips together are too short (needs vs has, in ms). */
  | { ok: false; reason: "too-short"; needMs: number; haveMs: number }
  /** The first clip can't hold the title and the checklist. */
  | { ok: false; reason: "first-clip-short"; needMs: number; haveMs: number }
  /** The last clip can't hold the end card. */
  | { ok: false; reason: "last-clip-short"; needMs: number; haveMs: number }
  /** A voiced step is longer than any clip has room for. */
  | { ok: false; reason: "step-too-long"; index: number; needMs: number }
  /** Room enough in total, but voiced steps can't cross clips to use it. */
  | { ok: false; reason: "steps-dont-fit" }

type Segment = { clip: number; startMs: number; endMs: number }

/** The checklist's length for its lines. */
function listWantedMs(lines: number) {
  const t = recipeTiming
  if (lines === 0) return 0
  return Math.max(
    t.listMinMs,
    Math.min(t.listMaxMs, t.listBaseMs + lines * t.listPerLineMs)
  )
}

/**
 * Lays a recipe out over clips `lengths` long (each clip's edited length).
 * `spokenMs`, one per step, times the steps by their voiceover lines.
 */
export function layoutRecipe(
  recipe: Recipe,
  lengths: number[],
  spokenMs?: number[]
): RecipeLayout {
  const t = recipeTiming
  const last = lengths.length - 1
  const steps = recipe.steps.length
  const lines = recipe.ingredients.length
  const need = (index: number) =>
    spokenMs ? spokenMs[index]! + t.voiceLeadMs + t.voiceTailMs : t.stepMinMs
  const stepsNeedMs = recipe.steps.reduce((sum, _, i) => sum + need(i), 0)
  const listMinMs = lines > 0 ? t.listMinMs : 0

  const haveMs = lengths.reduce((sum, length) => sum + length, 0)
  const needMs = t.introMs + listMinMs + stepsNeedMs + t.endMs
  if (haveMs < needMs) return { ok: false, reason: "too-short", needMs, haveMs }
  if (last > 0) {
    if (lengths[0]! < t.introMs + listMinMs) {
      return {
        ok: false,
        reason: "first-clip-short",
        needMs: t.introMs + listMinMs,
        haveMs: lengths[0]!,
      }
    }
    if (lengths[last]! < t.endMs) {
      return {
        ok: false,
        reason: "last-clip-short",
        needMs: t.endMs,
        haveMs: lengths[last]!,
      }
    }
  }

  // Where the checklist and the steps can go: between the title and the
  // end card, clip by clip.
  const room: Segment[] = lengths.map((length, clip) => ({
    clip,
    startMs: clip === 0 ? t.introMs : 0,
    endMs: clip === last ? length - t.endMs : length,
  }))

  const intro: RecipeSlot = {
    kind: "intro",
    index: 0,
    clip: 0,
    startMs: 0,
    endMs: t.introMs,
    voiceAtMs: null,
  }
  const end: RecipeSlot = {
    kind: "end",
    index: 0,
    clip: last,
    startMs: lengths[last]! - t.endMs,
    endMs: lengths[last]!,
    voiceAtMs: null,
  }

  // As long a checklist as its lines want, leaving the steps their room
  // (in one clip they have nowhere else to go); else its shortest.
  const first = room[0]!
  const firstRoom = first.endMs - first.startMs
  const stepsHere = last === 0 ? stepsNeedMs : 0
  const tries = [
    Math.min(listWantedMs(lines), firstRoom - stepsHere),
    listMinMs,
  ]
  for (const listMs of tries) {
    if (listMs < listMinMs) continue
    const afterList = room.map((segment, i) =>
      i === 0 ? { ...segment, startMs: segment.startMs + listMs } : segment
    )
    const placed = spokenMs
      ? packVoiced(afterList, steps, need)
      : shareEqually(afterList, steps)
    if ("tooLong" in placed) {
      return {
        ok: false,
        reason: "step-too-long",
        index: placed.tooLong,
        needMs: need(placed.tooLong),
      }
    }
    if (!placed.slots) continue
    const list: RecipeSlot[] =
      lines > 0
        ? [
            {
              kind: "list",
              index: 0,
              clip: 0,
              startMs: first.startMs,
              endMs: first.startMs + listMs,
              voiceAtMs: null,
            },
          ]
        : []
    return { ok: true, slots: [intro, ...list, ...placed.slots, end] }
  }
  // Room enough in total, but not between the clips' ends.
  return { ok: false, reason: "steps-dont-fit" }
}

/**
 * Steps of equal length one after another through the segments; a step
 * that runs past a clip's end goes on at the next clip's start.
 */
function shareEqually(
  segments: Segment[],
  steps: number
): { slots: RecipeSlot[] | null } {
  const t = recipeTiming
  const usable = segments.filter((s) => s.endMs > s.startMs)
  const total = usable.reduce((sum, s) => sum + s.endMs - s.startMs, 0)
  if (total < steps * t.stepMinMs) return { slots: null }
  const each = total / steps
  const slots: RecipeSlot[] = []
  for (let index = 0; index < steps; index++) {
    // The step's stretch of the joined segments, cut at clip ends.
    let from = index * each
    const to = (index + 1) * each
    let offset = 0
    for (const segment of usable) {
      const length = segment.endMs - segment.startMs
      const start = Math.max(from, offset)
      const stop = Math.min(to, offset + length)
      if (stop - start >= t.itemMinMs) {
        slots.push({
          kind: "step",
          index,
          clip: segment.clip,
          startMs: Math.round(segment.startMs + start - offset),
          endMs: Math.round(segment.startMs + stop - offset),
          voiceAtMs: null,
        })
      }
      if (stop >= to) break
      offset += length
      from = Math.max(from, offset)
    }
  }
  return { slots }
}

/**
 * Voiced steps, each `need(i)` long, in order: a step that doesn't fit in
 * what's left of a clip moves to the next clip. Each clip's spare time is
 * shared as equal pauses before, between and after its steps.
 */
function packVoiced(
  segments: Segment[],
  steps: number,
  need: (index: number) => number
): { slots: RecipeSlot[] | null } | { tooLong: number } {
  const t = recipeTiming
  const bySegment: number[][] = segments.map(() => [])
  let at = 0
  let used = 0
  for (let index = 0; index < steps; index++) {
    const length = need(index)
    while (
      at < segments.length &&
      segments[at]!.endMs - segments[at]!.startMs - used < length
    ) {
      at++
      used = 0
    }
    if (at >= segments.length) {
      const fits = segments.some((s) => s.endMs - s.startMs >= length)
      return fits ? { slots: null } : { tooLong: index }
    }
    bySegment[at]!.push(index)
    used += length
  }
  const slots: RecipeSlot[] = []
  segments.forEach((segment, i) => {
    const mine = bySegment[i]!
    if (mine.length === 0) return
    const busy = mine.reduce((sum, index) => sum + need(index), 0)
    const pause = (segment.endMs - segment.startMs - busy) / (mine.length + 1)
    let cursor = segment.startMs + pause
    for (const index of mine) {
      const startMs = Math.round(cursor)
      const endMs = Math.round(cursor + need(index))
      slots.push({
        kind: "step",
        index,
        clip: segment.clip,
        startMs,
        endMs,
        voiceAtMs: startMs + t.voiceLeadMs,
      })
      cursor += need(index) + pause
    }
  })
  return { slots }
}
