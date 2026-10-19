import {
  outputDuration,
  toSource,
  transitionDefaults,
  type GraphicItem,
  type Presentation,
  type Shot,
  type TextAnimation,
  type Transition,
} from "@/shared/motion"

import { applyStillParts } from "./apply-plan"
import { newGraphic } from "./graphic-templates"
import { lensLooks } from "./lens-looks"
import { applyLook, type LookMoment } from "./looks"
import { motionPrompts } from "./motion-prompts"

/**
 * Templates (build plan §7.16): a finished style in one click — a camera
 * look, text animation, lens, transitions, what happens to still parts, an
 * intro slide and an end card — built only from the presets the editor
 * already has. "AI first cut" runs the AI director with the template's
 * instruction first, then applies the template on top.
 */
export const templateIds = [
  "launch",
  "feature-demo",
  "social-ad",
  "walkthrough",
] as const
export type TemplateId = (typeof templateIds)[number]

export type Template = {
  id: TemplateId
  title: string
  hint: string
  /** The stage shape it's designed for (the preview switches to it). */
  shape: "16:9" | "9:16"
  look: string
  textAnimation: TextAnimation
  lens: string
  /** Between the clip's parts, and between a video's clips. */
  transition: Transition["kind"]
  stillParts: "keep" | "speed" | "cut"
  introSlide: boolean
  /** The AI director's instruction for "AI first cut". */
  instruction: string
}

const prompt = (title: (typeof motionPrompts)[number]["title"]) =>
  motionPrompts.find((each) => each.title === title)?.text ?? ""

export const templates: Template[] = [
  {
    id: "launch",
    title: "Launch video",
    hint: "Rise in, glide between moments, cinematic lens, a title slide.",
    shape: "16:9",
    look: "launch",
    textAnimation: "word-rise",
    lens: "cinematic",
    transition: "zoom",
    stillParts: "speed",
    introSlide: true,
    instruction: prompt("Product launch"),
  },
  {
    id: "feature-demo",
    title: "Feature demo",
    hint: "Calm zooms that keep the interface readable; slow parts cut.",
    shape: "16:9",
    look: "tour",
    textAnimation: "mask-reveal",
    lens: "sharp",
    transition: "push",
    stillParts: "cut",
    introSlide: false,
    instruction: prompt("Feature tour"),
  },
  {
    id: "social-ad",
    title: "Social ad",
    hint: "Portrait 9:16, punchy moves, whip pans, keywords that swap in.",
    shape: "9:16",
    look: "hype",
    textAnimation: "keyword-swap",
    lens: "shallow",
    transition: "whip",
    stillParts: "cut",
    introSlide: false,
    instruction: prompt("High energy"),
  },
  {
    id: "walkthrough",
    title: "Walkthrough",
    hint: "Slow dolly moves, sharp lens, blur dissolves; nothing cut.",
    shape: "16:9",
    look: "dolly",
    textAnimation: "blur-resolve",
    lens: "sharp",
    transition: "blur",
    stillParts: "speed",
    introSlide: false,
    instruction: prompt("Minimal & clean"),
  },
]

export const templateById = (id: string) =>
  templates.find((template) => template.id === id)

/** The template's transition with its kind's default length. */
export function templateTransition(template: Template): Transition {
  return {
    kind: template.transition,
    durationMs: transitionDefaults[template.transition].durationMs,
    direction: "left",
  }
}

/** Graphics a template adds carry this id prefix, so re-applying replaces them. */
const templatePrefix = "tpl-"

type Motion = { shots: Record<string, Shot | null>; presentation: Presentation }

/**
 * Applies a template to one clip, deterministically (no AI). Keeps the
 * clip's own text and graphics, replacing only what an earlier template
 * added. Pure: runs in the editor and on the server (a video's clips).
 */
export function applyTemplate(
  template: Template,
  input: {
    moments: LookMoment[]
    current: Motion
    durationMs: number
    idle: { startMs: number; endMs: number }[]
    /** The kit's colours, best first; none keeps the clip's background. */
    brandColors: string[]
    /** Words for the intro slide and end card. */
    copy: { title: string; cta: string }
    /** Skip the end card (the AI's plan made one). */
    endCard?: boolean
  }
): Motion {
  const { durationMs } = input
  const looked = applyLook(template.look, input.moments, input.current, {
    take: 0,
  })
  const { shots } = looked
  let { presentation } = looked

  let edit = applyStillParts(
    presentation.edit,
    durationMs,
    input.idle,
    template.stillParts
  )
  // Every join (between kept or sped-up parts) uses the template's move.
  const transition = templateTransition(template)
  edit = {
    parts: edit.parts.map((part, index) =>
      index === 0 ? part : { ...part, transition }
    ),
  }

  const lens = lensLooks.find((look) => look.id === template.lens)
  const [from, to] = input.brandColors
  presentation = {
    ...presentation,
    edit,
    textStyle: { animation: template.textAnimation },
    ...(lens ? { lens: lens.lens } : {}),
    ...(from
      ? {
          background: {
            kind: "gradient" as const,
            from,
            to: to ?? from,
          },
        }
      : {}),
  }

  const graphics: GraphicItem[] = presentation.graphics.filter(
    (graphic) => !graphic.id.startsWith(templatePrefix)
  )
  if (template.introSlide) {
    graphics.push(
      newGraphic("slide", {
        id: `${templatePrefix}intro`,
        atMs: 0,
        text: input.copy.title,
        secondary: "",
        track: 2,
      })
    )
  }
  const hasEndCard = graphics.some((graphic) => graphic.kind === "end-card")
  if ((input.endCard ?? true) && !hasEndCard) {
    // The last 3 seconds of the ad, placed in footage time.
    const adEnd = outputDuration(presentation.edit, durationMs)
    graphics.push(
      newGraphic("end-card", {
        id: `${templatePrefix}end`,
        atMs: Math.round(
          toSource(presentation.edit, durationMs, Math.max(0, adEnd - 3000))
        ),
        durationMs: 3000,
        text: input.copy.title,
        secondary: input.copy.cta,
        track: 2,
      })
    )
  }

  return {
    shots,
    presentation: { ...presentation, graphics, template: template.id },
  }
}
