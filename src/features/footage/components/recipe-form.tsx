"use client"

import { CheckIcon, ChefHatIcon } from "lucide-react"
import { useId, useState } from "react"

import {
  recipeLimits,
  recipeLines,
  voiceLanguageNames,
  voiceLanguages,
  type Recipe,
  type VoiceLanguage,
} from "@/shared/motion"
import { Button } from "@/shared/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
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
 * steps, one per line. Building replaces what the template made before.
 */
export function RecipeForm({
  recipe,
  active,
  disabled,
  onBuild,
}: {
  recipe: Recipe | null
  active: boolean
  disabled: boolean
  /** Returns a problem to show (e.g. the clip is too short), or null. */
  onBuild: (recipe: Recipe) => string | null
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
  const [problem, setProblem] = useState<string | null>(null)

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
    setProblem(
      onBuild({
        dish: dish.trim(),
        meta: meta.trim(),
        ingredients: withImages(ingredientLines, recipe?.ingredients ?? []),
        steps: withImages(stepLines, recipe?.steps ?? []),
        language,
      })
    )
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
          One per line, in order, up to {recipeLimits.steps}. They share the
          clip&apos;s time equally.
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

      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      <Button
        type="submit"
        size="sm"
        variant={active ? "secondary" : "default"}
        disabled={disabled}
      >
        {active ? (
          <CheckIcon data-icon="inline-start" />
        ) : (
          <ChefHatIcon data-icon="inline-start" />
        )}
        {active ? "Rebuild recipe video" : "Build recipe video"}
      </Button>
    </form>
  )
}
