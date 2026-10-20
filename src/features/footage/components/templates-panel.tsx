"use client"

import { CheckIcon, SparklesIcon } from "lucide-react"

import type { Recipe, RecipeTarget } from "@/shared/motion"
import { Button } from "@/shared/ui/button"
import { Spinner } from "@/shared/ui/spinner"

import { templates, type TemplateId } from "../lib/templates"
import { PanelHeading } from "./editor-panels"
import { RecipeForm } from "./recipe-form"
import { RecipePictures } from "./recipe-pictures"

/**
 * Templates (§7.16): a finished style in one click, or an "AI first cut"
 * that writes text and picks graphics in that style. Both are one undo step.
 * Below them, templates by genre (M12) build a video from what you type.
 */
export function TemplatesPanel({
  activeTemplate,
  hasMoments,
  isDirecting,
  recipe,
  voiceSetUp,
  voiceIsTest,
  pictures,
  onApply,
  onFirstCut,
  onBuildRecipe,
}: {
  activeTemplate: string | null
  hasMoments: boolean
  isDirecting: boolean
  recipe: Recipe | null
  /** The server has a voice (the recipe's steps can be read aloud). */
  voiceSetUp: boolean
  voiceIsTest: boolean
  onApply: (id: TemplateId) => void
  onFirstCut: (id: TemplateId) => void
  onBuildRecipe: (recipe: Recipe) => Promise<string | null>
  /** Pictures for the built recipe's ingredients and steps. */
  pictures: {
    urls: Record<string, string>
    canMake: boolean
    makesPlaceholders: boolean
    busy: string | null
    onUpload: (target: RecipeTarget, file: File) => void
    onMake: (targets: RecipeTarget[]) => void
    onRemove: (target: RecipeTarget) => void
  }
}) {
  return (
    <div className="flex flex-col gap-6">
      <PanelHeading
        title="Templates"
        description={
          hasMoments
            ? "Pick a style for the whole clip: camera, cuts, text, lens and an end card. Everything stays editable."
            : "Add a key moment first: templates move the camera between them."
        }
      />
      <ul className="flex flex-col gap-3" aria-label="Templates">
        {templates.map((template) => {
          const active = activeTemplate === template.id
          const headingId = `template-${template.id}`
          return (
            <li
              key={template.id}
              aria-labelledby={headingId}
              className="flex flex-col gap-3 rounded-lg border bg-card p-3"
              data-active={active || undefined}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <h3 id={headingId} className="text-sm font-medium">
                    {template.title}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {template.hint}
                  </p>
                </div>
                <span className="shrink-0 rounded border px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                  {template.shape}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={active ? "secondary" : "outline"}
                  disabled={!hasMoments || isDirecting}
                  aria-label={`Apply ${template.title}`}
                  onClick={() => onApply(template.id)}
                >
                  {active && <CheckIcon data-icon="inline-start" />}
                  {active ? "Applied" : "Apply"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!hasMoments || isDirecting}
                  aria-label={`AI first cut: ${template.title}`}
                  onClick={() => onFirstCut(template.id)}
                >
                  {isDirecting ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <SparklesIcon data-icon="inline-start" />
                  )}
                  AI first cut
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
      <section className="flex flex-col gap-3" aria-labelledby="genre-heading">
        <div className="flex flex-col gap-1">
          <h3 id="genre-heading" className="text-sm font-medium">
            By genre
          </h3>
          <p className="text-xs text-muted-foreground">
            Fill in what the video is about; the template lays it out. No key
            moments needed.
          </p>
        </div>
        {activeTemplate === "recipe-video" && (
          <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            This clip is part of a recipe across a whole video. Change the
            recipe from the video&apos;s Template button, so the steps stay in
            order across its clips. Pictures can be changed here.
          </p>
        )}
        <RecipeForm
          recipe={recipe}
          active={activeTemplate === "recipe"}
          disabled={isDirecting || activeTemplate === "recipe-video"}
          voiceSetUp={voiceSetUp}
          voiceIsTest={voiceIsTest}
          onBuild={onBuildRecipe}
        />
        {recipe &&
          (activeTemplate === "recipe" ||
            activeTemplate === "recipe-video") && (
            <RecipePictures
              recipe={recipe}
              pictureUrls={pictures.urls}
              canMake={pictures.canMake}
              makesPlaceholders={pictures.makesPlaceholders}
              busy={pictures.busy}
              onUpload={pictures.onUpload}
              onMake={pictures.onMake}
              onRemove={pictures.onRemove}
            />
          )}
      </section>
    </div>
  )
}
