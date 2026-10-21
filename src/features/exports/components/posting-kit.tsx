"use client"

import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  ImageIcon,
  PenLineIcon,
  Share2Icon,
} from "lucide-react"
import { useState, useTransition } from "react"

import type { VersionLanguage } from "@/shared/motion"
import { cn } from "@/shared/lib/utils"
import { Button, buttonVariants } from "@/shared/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import { Spinner } from "@/shared/ui/spinner"
import { Textarea } from "@/shared/ui/textarea"
import { toast } from "@/shared/ui/toast"
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group"

import { saveShareCover, writePosts } from "../actions"
import type { Post, PostPlatform } from "../lib/post-kit"
import type { ExportPanel } from "../queries"
import type { ExportShape, ExportTarget } from "../schema"

const platformNames: Record<PostPlatform, string> = {
  tiktok: "TikTok",
  reels: "Reels",
  shorts: "Shorts",
}

const coverSizes: Record<ExportShape, [number, number]> = {
  "16:9": [1920, 1080],
  "9:16": [1080, 1920],
  "1:1": [1080, 1080],
  "4:5": [1080, 1350],
}

const layouts = [
  { id: "bottom", name: "Title at the bottom" },
  { id: "center", name: "Title in the middle" },
  { id: "band", name: "Title on a band" },
] as const
type Layout = (typeof layouts)[number]["id"]

/** Resolves once `event` fires on `target` (or rejects on an error). */
function once(target: HTMLVideoElement, event: string) {
  return new Promise<void>((resolve, reject) => {
    target.addEventListener(event, () => resolve(), { once: true })
    target.addEventListener("error", () => reject(new Error("video")), {
      once: true,
    })
  })
}

/** Frames at `fractions` of the export (a CORS read of the signed link). */
async function grabFrames(url: string, fractions: number[]) {
  const video = document.createElement("video")
  video.crossOrigin = "anonymous"
  video.muted = true
  video.preload = "auto"
  video.src = url
  await once(video, "loadeddata")
  const frames: HTMLCanvasElement[] = []
  for (const fraction of fractions) {
    video.currentTime = Math.min(
      Math.max(0, video.duration - 0.05),
      fraction * video.duration
    )
    await once(video, "seeked")
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext("2d")!.drawImage(video, 0, 0)
    frames.push(canvas)
  }
  video.removeAttribute("src")
  video.load()
  return frames
}

/** The real family behind a CSS font-family (canvas can't read variables). */
function resolveFamily(css: string) {
  const probe = document.createElement("span")
  probe.style.fontFamily = css
  document.body.appendChild(probe)
  const family = getComputedStyle(probe).fontFamily
  probe.remove()
  return family || "sans-serif"
}

/** Lines of `text` that fit `maxWidth`, at most `max` (the last one cut). */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  max: number
) {
  const lines: string[] = []
  let line = ""
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next
    } else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  if (lines.length > max) {
    lines.length = max
    lines[max - 1] = `${lines[max - 1]}…`
  }
  return lines
}

/** One cover: the frame filling the shape, and the title in a layout. */
function drawCover(
  frame: HTMLCanvasElement,
  layout: Layout,
  title: string,
  family: string,
  [width, height]: [number, number]
) {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")!
  // Cover-fit (the export already has this shape; this guards rounding).
  const scale = Math.max(width / frame.width, height / frame.height)
  const w = frame.width * scale
  const h = frame.height * scale
  ctx.drawImage(frame, (width - w) / 2, (height - h) / 2, w, h)

  const short = Math.min(width, height)
  const size = Math.round(short * (layout === "center" ? 0.11 : 0.085))
  ctx.font = `800 ${size}px ${family}`
  ctx.textBaseline = "alphabetic"
  const lines = wrap(ctx, title, width * 0.84, 3)
  const lineHeight = size * 1.12

  if (layout === "bottom") {
    const fade = ctx.createLinearGradient(0, height * 0.45, 0, height)
    fade.addColorStop(0, "rgba(0,0,0,0)")
    fade.addColorStop(1, "rgba(0,0,0,0.78)")
    ctx.fillStyle = fade
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = "#ffffff"
    ctx.textAlign = "left"
    const bottom = height - short * 0.08
    lines.forEach((line, i) =>
      ctx.fillText(
        line,
        width * 0.08,
        bottom - (lines.length - 1 - i) * lineHeight
      )
    )
  } else if (layout === "center") {
    ctx.fillStyle = "rgba(0,0,0,0.42)"
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = "#ffffff"
    ctx.textAlign = "center"
    ctx.shadowColor = "rgba(0,0,0,0.45)"
    ctx.shadowBlur = size * 0.3
    const top = height / 2 - ((lines.length - 1) * lineHeight) / 2 + size * 0.35
    lines.forEach((line, i) =>
      ctx.fillText(line, width / 2, top + i * lineHeight)
    )
  } else {
    const band = lines.length * lineHeight + short * 0.08
    ctx.fillStyle = "rgba(255,255,255,0.94)"
    ctx.fillRect(0, short * 0.06, width, band)
    ctx.fillStyle = "#15171c"
    ctx.textAlign = "center"
    lines.forEach((line, i) =>
      ctx.fillText(
        line,
        width / 2,
        short * 0.06 + short * 0.04 + size * 0.95 + i * lineHeight
      )
    )
  }
  return canvas
}

const toBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("blob"))),
      "image/png"
    )
  )

type Cover = { layout: Layout; url: string; blob: Blob }

/**
 * The posting kit (V3 M13 B), under a finished export: a cover (three
 * layouts from the video's own frames, with its title in the brand's
 * font) to download or put on the share link, and a title, description
 * and hashtags for each platform, in the export's language. Keyed by the
 * export's link, so another shape or language starts afresh.
 */
export function PostingKit({
  target,
  shape,
  language,
  videoUrl,
  name,
  coverTitle,
  coverFont,
  coverUrl,
  canEdit,
  onPanel,
}: {
  target: ExportTarget
  shape: ExportShape
  language: VersionLanguage | null
  /** The finished export, played to read its frames. */
  videoUrl: string
  /** The clip's or video's name (the cover's file name). */
  name: string
  /** What the cover says to start with. */
  coverTitle: string
  /** The brand's heading font (a CSS font-family). */
  coverFont: string
  /** The share link's cover now, if any. */
  coverUrl: string | null
  canEdit: boolean
  onPanel: (panel: ExportPanel) => void
}) {
  const [title, setTitle] = useState(coverTitle)
  const [covers, setCovers] = useState<Cover[]>([])
  const [picked, setPicked] = useState<Layout>("bottom")
  const [isMaking, setMaking] = useState(false)
  const [isSaving, startSave] = useTransition()
  const [isWriting, startWrite] = useTransition()
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [platform, setPlatform] = useState<PostPlatform>("tiktok")
  const [copied, setCopied] = useState(false)

  async function makeCovers() {
    setMaking(true)
    try {
      const family = resolveFamily(coverFont)
      await document.fonts.load(`800 64px ${family}`).catch(() => undefined)
      const [frame] = await grabFrames(videoUrl, [0.35])
      const size = coverSizes[shape]
      const made = await Promise.all(
        layouts.map(async ({ id }) => {
          const canvas = drawCover(
            frame!,
            id,
            title.trim() || name,
            family,
            size
          )
          const blob = await toBlob(canvas)
          return { layout: id, url: URL.createObjectURL(blob), blob }
        })
      )
      for (const cover of covers) URL.revokeObjectURL(cover.url)
      setCovers(made)
    } catch {
      toast.add({
        type: "error",
        title: "Couldn’t read the video’s frames. Try again in a moment.",
      })
    } finally {
      setMaking(false)
    }
  }

  const chosen = covers.find((cover) => cover.layout === picked)

  function useOnShareLink() {
    if (!chosen) return
    startSave(async () => {
      const form = new FormData()
      form.set("kind", target.kind)
      form.set("id", target.id)
      form.set("cover", chosen.blob, "cover.png")
      const result = await saveShareCover(form)
      if (!result.ok) {
        toast.add({ type: "error", title: result.error.message })
        return
      }
      onPanel(result.data)
      toast.add({
        type: "success",
        title: "Cover saved",
        description: "The share link shows it before the video plays.",
      })
    })
  }

  function write() {
    startWrite(async () => {
      const result = await writePosts({ target, language })
      if (result.ok) setPosts(result.data)
      else toast.add({ type: "error", title: result.error.message })
    })
  }

  const post = posts?.find((each) => each.platform === platform)
  const hashtags = post?.hashtags.map((tag) => `#${tag}`).join(" ") ?? ""

  async function copyPost() {
    if (!post) return
    const text = [post.title, post.description, hashtags]
      .filter(Boolean)
      .join("\n\n")
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.add({
        type: "error",
        title: "Couldn’t copy. Select the text and copy it.",
      })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3" aria-labelledby="cover-heading">
        <h4 id="cover-heading" className="text-sm font-medium">
          Cover
        </h4>
        <div className="flex gap-2">
          <Input
            aria-label="Cover title"
            value={title}
            maxLength={80}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            disabled={isMaking}
            onClick={() => void makeCovers()}
          >
            {isMaking ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <ImageIcon data-icon="inline-start" />
            )}
            {covers.length ? "Make again" : "Make covers"}
          </Button>
        </div>
        {covers.length > 0 && (
          <>
            <div
              role="radiogroup"
              aria-label="Covers"
              className="grid grid-cols-3 gap-2"
            >
              {covers.map((cover) => {
                const layout = layouts.find((l) => l.id === cover.layout)!
                const checked = cover.layout === picked
                return (
                  <button
                    key={cover.layout}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    aria-label={layout.name}
                    onClick={() => setPicked(cover.layout)}
                    className={cn(
                      "overflow-hidden rounded-md border-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      checked ? "border-primary" : "border-transparent"
                    )}
                  >
                    {/* A blob URL made here: next/image can't optimise it. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cover.url} alt="" className="block w-full" />
                  </button>
                )
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              {chosen && (
                <a
                  href={chosen.url}
                  download={`${name} cover.png`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <DownloadIcon data-icon="inline-start" />
                  Download cover
                </a>
              )}
              {canEdit && (
                <Button
                  type="button"
                  size="sm"
                  disabled={isSaving || !chosen}
                  onClick={useOnShareLink}
                >
                  {isSaving ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Share2Icon data-icon="inline-start" />
                  )}
                  Use on the share link
                </Button>
              )}
            </div>
          </>
        )}
        {coverUrl && covers.length === 0 && (
          <FieldDescription>
            The share link has a cover. Make new ones to change it.
          </FieldDescription>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="post-heading">
        <div className="flex items-center justify-between gap-2">
          <h4 id="post-heading" className="text-sm font-medium">
            Post
          </h4>
          {canEdit && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isWriting}
              onClick={write}
            >
              {isWriting ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <PenLineIcon data-icon="inline-start" />
              )}
              {posts ? "Write again" : "Write posts"}
            </Button>
          )}
        </div>
        {posts && post && (
          <>
            <ToggleGroup
              aria-label="Platform"
              variant="outline"
              className="grid grid-cols-3 gap-1"
              value={[platform]}
              onValueChange={(values) => {
                const next = values[0] as PostPlatform | undefined
                if (next) setPlatform(next)
              }}
            >
              {posts.map((each) => (
                <ToggleGroupItem
                  key={each.platform}
                  value={each.platform}
                  className="w-full"
                >
                  {platformNames[each.platform]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Field>
              <FieldLabel htmlFor="post-title">Title</FieldLabel>
              <Input id="post-title" readOnly value={post.title} />
            </Field>
            <Field>
              <FieldLabel htmlFor="post-description">Description</FieldLabel>
              <Textarea
                id="post-description"
                readOnly
                rows={3}
                value={post.description}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="post-hashtags">Hashtags</FieldLabel>
              <Input id="post-hashtags" readOnly value={hashtags} />
            </Field>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => void copyPost()}
            >
              {copied ? (
                <CheckIcon data-icon="inline-start" />
              ) : (
                <CopyIcon data-icon="inline-start" />
              )}
              {copied ? "Copied" : "Copy post"}
            </Button>
          </>
        )}
      </section>
    </div>
  )
}
