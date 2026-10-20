import type { Recipe } from "@/shared/motion"

import type { RecipeResult } from "./recipe-template"

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`

/** Why a recipe couldn't be built, in words, with what to do about it. */
export function recipeFailure(
  result: Exclude<RecipeResult, { ok: true }>,
  recipe: Pick<Recipe, "steps" | "voiced">,
  across: "clip" | "video"
) {
  const steps = recipe.steps.length
  switch (result.reason) {
    case "too-short":
      return `This ${across} runs ${seconds(result.haveMs)}; ${steps} ${
        steps === 1 ? "step needs" : "steps need"
      } at least ${seconds(result.needMs)}${
        recipe.voiced ? ", read aloud" : ""
      }. Remove a step or use ${across === "video" ? "longer clips" : "a longer clip"}.`
    case "first-clip-short":
      return `The first clip runs ${seconds(result.haveMs)}; the title and ingredients need ${seconds(result.needMs)}. Put a longer clip first.`
    case "last-clip-short":
      return `The last clip runs ${seconds(result.haveMs)}; the end card needs ${seconds(result.needMs)}. Put a longer clip last.`
    case "step-too-long":
      return `Step ${result.index + 1} takes ${seconds(result.needMs)} to say, longer than any clip. Shorten it or split it in two.`
    case "steps-dont-fit":
      return "The steps read aloud don’t fit between the clips’ ends (a line never runs into the next clip). Use fewer steps or longer clips."
    case "too-many-graphics":
      return `A clip holds up to ${result.limit} graphics: remove a few first.`
  }
}
