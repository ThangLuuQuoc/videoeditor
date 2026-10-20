import "server-only"

import { randomUUID } from "node:crypto"

import { generatePicture, type ImageModel } from "@/shared/ai"
import { AppError } from "@/shared/lib/errors"
import {
  imageExtensions,
  sniffImageType,
  type ImageType,
} from "@/shared/lib/image-type"
import { putFile, signedFileUrl } from "@/shared/storage"

import { footagePictureKey } from "./keys"

/**
 * Pictures for a clip's recipe (V3 M12 step 1b): uploaded by the cook or
 * made by the image provider, stored in the clip's folder (deleted with it).
 * Nothing is saved to the clip here: the editor puts the key on the recipe
 * and its graphic, and saves that like any edit.
 */
export const pictureRules = {
  /** The server action body limit (next.config.ts) allows a little more. */
  maxBytes: 2 * 1024 * 1024,
} as const

export type StoredPicture = { key: string; url: string }

/** What to ask the image provider for: a photo, never words in it. */
export function recipePicturePrompt(input: {
  dish: string
  kind: "ingredient" | "step"
  text: string
}) {
  return input.kind === "ingredient"
    ? `An appetising food photo of ${input.text}, an ingredient for ${input.dish}. Seen from above on a plain kitchen counter, soft natural light, realistic. No text, no labels, no people.`
    : `A realistic food photo of this cooking step while making ${input.dish}: ${input.text}. Close up, soft natural light. No text, no labels.`
}

export async function storeRecipePicture(input: {
  workspaceId: string
  kitId: string
  footageId: string
  bytes: Uint8Array
  type: ImageType
  /** Uploaded or made by AI: shown in its name, for whoever looks later. */
  source: "upload" | "ai"
}): Promise<StoredPicture> {
  const key = footagePictureKey(
    input.workspaceId,
    input.kitId,
    input.footageId,
    `${input.source}-${randomUUID()}.${imageExtensions[input.type]}`
  )
  await putFile(key, input.bytes, input.type)
  return { key, url: await signedFileUrl(key, 3600) }
}

/** Asks the image provider for a picture and stores it. */
export async function makeRecipePicture(input: {
  workspaceId: string
  kitId: string
  footageId: string
  dish: string
  kind: "ingredient" | "step"
  text: string
  model?: ImageModel
}): Promise<StoredPicture> {
  const { image } = await generatePicture(
    { prompt: recipePicturePrompt(input) },
    { model: input.model }
  )
  // Trust the bytes, not the provider's label.
  const type = sniffImageType(image)
  if (!type) {
    throw new AppError(
      "PROVIDER_FAILED",
      "The picture came back unreadable. Try again in a moment."
    )
  }
  return storeRecipePicture({ ...input, bytes: image, type, source: "ai" })
}
