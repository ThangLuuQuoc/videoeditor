"use client"

import { ImageIcon, SparklesIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { useId } from "react"

import type { Recipe, RecipeTarget } from "@/shared/motion"
import { Button } from "@/shared/ui/button"
import { Spinner } from "@/shared/ui/spinner"

/** A stable name for one ingredient's or step's picture ("step-0"). */
export const pictureTargetId = (target: RecipeTarget) =>
  `${target.kind}-${target.index}`

/** Pictures the image provider made carry "ai-" in their file name. */
const madeByAi = (key: string) => /\/pictures\/ai-[^/]+$/.test(key)

/**
 * A picture for each ingredient and step of the built recipe (V3 M12 step
 * 1b): upload one, have the image provider make one, or remove it. The
 * checklist shows ingredients' pictures; a step's shows under its words.
 */
export function RecipePictures({
  recipe,
  pictureUrls,
  canMake,
  makesPlaceholders,
  busy,
  onUpload,
  onMake,
  onRemove,
}: {
  recipe: Recipe
  pictureUrls: Record<string, string>
  /** The server has an image provider (IMAGE_PROVIDER). */
  canMake: boolean
  /** That provider is the development placeholder. */
  makesPlaceholders: boolean
  /** The picture being made or uploaded ("all" while making the missing). */
  busy: string | null
  onUpload: (target: RecipeTarget, file: File) => void
  onMake: (targets: RecipeTarget[]) => void
  onRemove: (target: RecipeTarget) => void
}) {
  const id = useId()
  const rows = [
    ...recipe.ingredients.map((item, index) => ({
      item,
      target: { kind: "ingredient", index } as RecipeTarget,
    })),
    ...recipe.steps.map((item, index) => ({
      item,
      target: { kind: "step", index } as RecipeTarget,
    })),
  ]
  const missing = rows
    .filter(({ item }) => !item.imageKey)
    .map(({ target }) => target)

  const list = (kind: RecipeTarget["kind"], title: string) => {
    const shown = rows.filter(({ target }) => target.kind === kind)
    if (shown.length === 0) return null
    return (
      <div className="flex flex-col gap-2">
        <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>
        <ul className="flex flex-col gap-2" aria-label={`${title} pictures`}>
          {shown.map(({ item, target }) => {
            const name = pictureTargetId(target)
            const url = item.imageKey ? pictureUrls[item.imageKey] : undefined
            const working = busy === name || busy === "all"
            return (
              <li key={name} className="flex items-center gap-2">
                <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                  {url ? (
                    // A short-lived signed URL from private storage: next/image
                    // would cache it past its expiry.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt={`Picture of ${item.text}`}
                      className="size-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="size-4 text-muted-foreground" />
                  )}
                  {item.imageKey && madeByAi(item.imageKey) && (
                    <span className="absolute right-0 bottom-0 rounded-tl bg-background/90 px-0.5 font-mono text-[9px] leading-tight">
                      AI
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {item.text}
                </span>
                {working ? (
                  <Spinner aria-label={`Working on ${item.text}`} />
                ) : (
                  <span className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Upload a picture for ${item.text}`}
                      disabled={busy !== null}
                      onClick={() =>
                        document.getElementById(`${id}-${name}`)?.click()
                      }
                    >
                      <UploadIcon />
                    </Button>
                    <input
                      id={`${id}-${name}`}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      tabIndex={-1}
                      aria-hidden
                      data-testid={`picture-file-${name}`}
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        event.target.value = ""
                        if (file) onUpload(target, file)
                      }}
                    />
                    {canMake && (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Make a picture of ${item.text} with AI`}
                        disabled={busy !== null}
                        onClick={() => onMake([target])}
                      >
                        <SparklesIcon />
                      </Button>
                    )}
                    {item.imageKey && (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Remove the picture of ${item.text}`}
                        disabled={busy !== null}
                        onClick={() => onRemove(target)}
                      >
                        <Trash2Icon />
                      </Button>
                    )}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-lg border bg-card p-3"
      aria-labelledby={`${id}-heading`}
    >
      <div className="flex flex-col gap-1">
        <h3 id={`${id}-heading`} className="text-sm font-medium">
          Pictures
        </h3>
        <p className="text-xs text-muted-foreground">
          Ingredients show theirs on the checklist; a step shows its picture
          under the words. PNG, JPEG or WebP up to 2 MB.
          {makesPlaceholders &&
            " AI pictures here are plain placeholders (test mode)."}
        </p>
      </div>
      {canMake && missing.length > 0 && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={() => onMake(missing)}
        >
          {busy === "all" ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <SparklesIcon data-icon="inline-start" />
          )}
          Make {missing.length} missing{" "}
          {missing.length === 1 ? "picture" : "pictures"} with AI
        </Button>
      )}
      {list("ingredient", "Ingredients")}
      {list("step", "Steps")}
    </section>
  )
}
