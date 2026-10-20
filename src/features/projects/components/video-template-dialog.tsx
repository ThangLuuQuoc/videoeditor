"use client"

import { LayoutTemplateIcon, SparklesIcon } from "lucide-react"
import { useState } from "react"

import {
  RecipeForm,
  StoryForm,
  templates,
  type TemplateId,
} from "@/features/footage/client"
import type { Recipe, Story } from "@/shared/motion"
import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/shared/ui/field"
import { Spinner } from "@/shared/ui/spinner"
import { Switch } from "@/shared/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group"

/**
 * A template for every clip of the video at once (§7.16), optionally with
 * the AI writing each clip's text — or a recipe across the clips (V3 M12):
 * one change, undone with "Undo template".
 */
export function VideoTemplateDialog({
  current,
  busy,
  recipe,
  story,
  voiceSetUp,
  voiceIsTest,
  onApply,
  onBuildRecipe,
  onBuildStory,
  onUndo,
}: {
  /** The video's last template, while it can be undone. */
  current: { templateId: string; withAi: boolean } | null
  busy: boolean
  /** The recipe the video was last built from, to start the form with. */
  recipe: Recipe | null
  /** The story the video was last built from. */
  story: Story | null
  /** The server has a voice (the recipe's steps can be read aloud). */
  voiceSetUp: boolean
  voiceIsTest: boolean
  /** Resolves true when applied (the dialog closes). */
  onApply: (templateId: TemplateId, withAi: boolean) => Promise<boolean>
  /** Resolves with a problem to show, or null when built (it closes). */
  onBuildRecipe: (recipe: Recipe) => Promise<string | null>
  onBuildStory: (story: Story) => Promise<string | null>
  onUndo: () => void
}) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<"style" | "recipe" | "story">(
    current?.templateId === "recipe"
      ? "recipe"
      : current?.templateId === "story"
        ? "story"
        : "style"
  )
  const [picked, setPicked] = useState<TemplateId>("launch")
  const [withAi, setWithAi] = useState(false)
  const currentTitle =
    current?.templateId === "recipe"
      ? "Recipe"
      : current?.templateId === "story"
        ? "Timeline"
        : templates.find((t) => t.id === current?.templateId)?.title

  return (
    <>
      {current && currentTitle && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={onUndo}
          title={`Put every clip back as it was before ${currentTitle}`}
        >
          Undo template
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        {busy ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <LayoutTemplateIcon data-icon="inline-start" />
        )}
        <span className="hidden sm:inline">{currentTitle ?? "Template"}</span>
        <span className="sr-only sm:hidden">Template</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Template for every clip</DialogTitle>
            <DialogDescription>
              {kind === "style"
                ? "Sets the camera, cuts, text style, lens, end card and the transitions between clips. Clips without key moments stay as they are."
                : kind === "recipe"
                  ? "Your recipe across the clips, in order: the title and ingredients on the first, the steps through the rest, the end card on the last."
                  : "Your story across the clips, a chapter per clip when they match: dates and titles as each begins, a chapter bar along the bottom, photos zooming slowly."}
            </DialogDescription>
          </DialogHeader>
          <ToggleGroup
            aria-label="Kind of template"
            variant="outline"
            className="grid grid-cols-3 gap-1"
            value={[kind]}
            onValueChange={(values) => {
              const next = values[0] as "style" | "recipe" | "story" | undefined
              if (next) setKind(next)
            }}
          >
            <ToggleGroupItem value="style" className="w-full">
              Style
            </ToggleGroupItem>
            <ToggleGroupItem value="recipe" className="w-full">
              Recipe
            </ToggleGroupItem>
            <ToggleGroupItem value="story" className="w-full">
              Timeline
            </ToggleGroupItem>
          </ToggleGroup>
          {kind === "story" ? (
            <StoryForm
              story={story}
              active={current?.templateId === "story"}
              disabled={busy}
              across="video"
              onBuild={async (next) => {
                const problem = await onBuildStory(next)
                if (!problem) setOpen(false)
                return problem
              }}
            />
          ) : kind === "recipe" ? (
            <RecipeForm
              recipe={recipe}
              active={current?.templateId === "recipe"}
              disabled={busy}
              voiceSetUp={voiceSetUp}
              voiceIsTest={voiceIsTest}
              across="video"
              onBuild={async (next) => {
                const problem = await onBuildRecipe(next)
                if (!problem) setOpen(false)
                return problem
              }}
            />
          ) : (
            <>
              <div
                role="radiogroup"
                aria-label="Template"
                className="grid gap-2 sm:grid-cols-2"
              >
                {templates.map((template) => {
                  const checked = picked === template.id
                  return (
                    <button
                      key={template.id}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      onClick={() => setPicked(template.id)}
                      className={cn(
                        "flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        checked
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted"
                      )}
                    >
                      <span className="flex items-center justify-between gap-2 text-sm font-medium">
                        {template.title}
                        <span className="font-mono text-xs text-muted-foreground">
                          {template.shape}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {template.hint}
                      </span>
                    </button>
                  )
                })}
              </div>
              <Field orientation="horizontal">
                <Switch
                  id="template-with-ai"
                  aria-describedby="template-with-ai-hint"
                  checked={withAi}
                  onCheckedChange={setWithAi}
                />
                <FieldContent>
                  <FieldLabel htmlFor="template-with-ai">
                    Write the text with AI
                  </FieldLabel>
                  <FieldDescription id="template-with-ai-hint">
                    Headlines, labels and graphics for each clip’s key moments,
                    in this style. Uses one AI direction per clip.
                  </FieldDescription>
                </FieldContent>
              </Field>
            </>
          )}
          {kind === "style" && (
            <DialogFooter>
              <Button
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (await onApply(picked, withAi)) setOpen(false)
                }}
              >
                {busy ? (
                  <Spinner data-icon="inline-start" />
                ) : withAi ? (
                  <SparklesIcon data-icon="inline-start" />
                ) : (
                  <LayoutTemplateIcon data-icon="inline-start" />
                )}
                {busy
                  ? "Applying…"
                  : withAi
                    ? "AI first cut"
                    : "Apply to every clip"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
