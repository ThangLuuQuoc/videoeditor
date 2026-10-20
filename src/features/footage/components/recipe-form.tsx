"use client"

import { CheckIcon, ChefHatIcon } from "lucide-react"
import { useId, useState, useTransition } from "react"

import {
  recipeLimits,
  recipeLines,
  voiceLanguageNames,
  voiceLanguages,
  type Recipe,
  type VoiceLanguage,
} from "@/shared/motion"
import { Button } from "@/shared/ui/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import { Spinner } from "@/shared/ui/spinner"
import { Switch } from "@/shared/ui/switch"
import { Textarea } from "@/shared/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group"

/** Keeps each line's picture when its words didn't change. */
function withImages(lines: string[], before: Recipe["steps"]) {
  return lines.map((text) => ({
    text,
    imageKey: before.find((item) => item.text === text)?.imageKey ?? null,
  }))
}

/** What's wrong with the recipe as typed, in words; null = fine. */
export function recipeProblem(input: {
  dish: string
  ingredients: string[]
  steps: string[]
}) {
  const l = recipeLimits
  if (!input.dish.trim()) return "Name the dish."
  if (input.dish.trim().length > l.dish)
    return `Keep the dish's name under ${l.dish} characters.`
  if (input.steps.length === 0) return "Add at least one step."
  if (input.steps.length > l.steps) return `Up to ${l.steps} steps.`
  if (input.ingredients.length > l.ingredients)
    return `Up to ${l.ingredients} ingredients.`
  if (input.ingredients.some((line) => line.length > l.ingredient))
    return `Keep each ingredient under ${l.ingredient} characters.`
  if (input.steps.some((line) => line.length > l.step))
    return `Keep each step under ${l.step} characters.`
  return null
}

/**
 * The recipe template's form (V3 M12): the dish, its ingredients and its
 * steps, one per line, and whether the steps are read aloud. Building
 * replaces what the template made before. Used for one clip and for a
 * whole video.
 */
export function RecipeForm({
  recipe,
  active,
  disabled,
  voiceSetUp,
  voiceIsTest = false,
  across = "clip",
  onBuild,
}: {
  recipe: Recipe | null
  active: boolean
  disabled: boolean
  /** The server has a voice (VOICE_PROVIDER): offer reading the steps. */
  voiceSetUp: boolean
  /** That voice is the development tone. */
  voiceIsTest?: boolean
  /** What it builds on: this clip, or every clip of a video. */
  across?: "clip" | "video"
  /** Returns a problem to show (e.g. the clip is too short), or null. */
  onBuild: (recipe: Recipe) => Promise<string | null>
}) {
  const id = useId()
  const [dish, setDish] = useState(recipe?.dish ?? "")
  const [meta, setMeta] = useState(recipe?.meta ?? "")
  const [ingredients, setIngredients] = useState(
    recipe?.ingredients.map((item) => item.text).join("\n") ?? ""
  )
  const [steps, setSteps] = useState(
    recipe?.steps.map((item) => item.text).join("\n") ?? ""
  )
  const [language, setLanguage] = useState<VoiceLanguage>(
    recipe?.language ?? "en"
  )
  const [voiced, setVoiced] = useState(voiceSetUp && (recipe?.voiced ?? false))
  const [problem, setProblem] = useState<string | null>(null)
  const [isBuilding, startBuild] = useTransition()

  function build(event: React.FormEvent) {
    event.preventDefault()
    const ingredientLines = recipeLines(ingredients)
    const stepLines = recipeLines(steps)
    const typed = recipeProblem({
      dish,
      ingredients: ingredientLines,
      steps: stepLines,
    })
    if (typed) {
      setProblem(typed)
      return
    }
    setProblem(null)
    startBuild(async () => {
      setProblem(
        await onBuild({
          dish: dish.trim(),
          meta: meta.trim(),
          ingredients: withImages(ingredientLines, recipe?.ingredients ?? []),
          steps: withImages(stepLines, recipe?.steps ?? []),
          language,
          voiced,
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
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h3 id={`${id}-title`} className="text-sm font-medium">
            Recipe
          </h3>
          <p className="text-xs text-muted-foreground">
            Your dish, its ingredients and steps become a title, a checklist,
            numbered steps and an end card. Footage fills the frame.
          </p>
        </div>
        <span className="shrink-0 rounded border px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
          9:16
        </span>
      </div>

      <Field>
        <FieldLabel htmlFor={`${id}-dish`}>Dish</FieldLabel>
        <Input
          id={`${id}-dish`}
          value={dish}
          maxLength={recipeLimits.dish}
          placeholder="Garlic butter noodles"
          onChange={(event) => setDish(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-meta`}>Line under the name</FieldLabel>
        <Input
          id={`${id}-meta`}
          value={meta}
          maxLength={recipeLimits.meta}
          placeholder="15 min · serves 2"
          onChange={(event) => setMeta(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-ingredients`}>Ingredients</FieldLabel>
        <Textarea
          id={`${id}-ingredients`}
          value={ingredients}
          rows={4}
          placeholder={"200 g noodles\n3 cloves garlic\n2 tbsp butter"}
          onChange={(event) => setIngredients(event.target.value)}
        />
        <FieldDescription>
          One per line, up to {recipeLimits.ingredients}. Optional.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-steps`}>Steps</FieldLabel>
        <Textarea
          id={`${id}-steps`}
          value={steps}
          rows={4}
          placeholder={
            "Boil the noodles for 4 minutes\nMelt the butter with the garlic\nToss and serve"
          }
          onChange={(event) => setSteps(event.target.value)}
        />
        <FieldDescription>
          One per line, in order, up to {recipeLimits.steps}.{" "}
          {voiced
            ? "Each lasts as long as it takes to say."
            : across === "video"
              ? "They share the video's time equally."
              : "They share the clip's time equally."}
        </FieldDescription>
      </Field>
      <Field>
        <span className="text-sm font-medium" id={`${id}-language`}>
          Words it adds
        </span>
        <ToggleGroup
          aria-labelledby={`${id}-language`}
          variant="outline"
          className="grid grid-cols-2 gap-1"
          value={[language]}
          onValueChange={(values) => {
            const next = values[0] as VoiceLanguage | undefined
            if (next) setLanguage(next)
          }}
        >
          {voiceLanguages.map((each) => (
            <ToggleGroupItem
              key={each}
              value={each}
              className="w-full px-0 text-xs"
            >
              {voiceLanguageNames[each]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>

      {voiceSetUp && (
        <Field orientation="horizontal">
          <Switch
            id={`${id}-voiced`}
            checked={voiced}
            onCheckedChange={setVoiced}
          />
          <FieldContent>
            <FieldLabel htmlFor={`${id}-voiced`}>
              Read the steps aloud
            </FieldLabel>
            <FieldDescription>
              A voiceover line per step, in the language above.
              {voiceIsTest && " Test mode: a tone stands in for the voice."}
            </FieldDescription>
          </FieldContent>
        </Field>
      )}

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
          <ChefHatIcon data-icon="inline-start" />
        )}
        {active ? "Rebuild recipe video" : "Build recipe video"}
      </Button>
    </form>
  )
}
