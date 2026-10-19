import { workspaceFileKey } from "@/shared/storage/keys"

import { footageTypes, type FootageType } from "../schema"

/** Every file of one clip lives under this folder. */
export function footageFolder(
  workspaceId: string,
  kitId: string,
  footageId: string
) {
  return `${workspaceFileKey(workspaceId, "brand-kits", kitId, "footage", footageId)}/`
}

export function footageFileKey(
  workspaceId: string,
  kitId: string,
  footageId: string,
  file: "video.mp4" | "poster.jpg" | "thumbnails.jpg" | `original.${string}`
) {
  return workspaceFileKey(
    workspaceId,
    "brand-kits",
    kitId,
    "footage",
    footageId,
    file
  )
}

/** A voiced line of a clip's voiceover (its own folder in the clip's). */
export function footageVoiceKey(
  workspaceId: string,
  kitId: string,
  footageId: string,
  file: string
) {
  return workspaceFileKey(
    workspaceId,
    "brand-kits",
    kitId,
    "footage",
    footageId,
    "voice",
    file
  )
}

export function originalFileName(type: FootageType) {
  return `original.${footageTypes[type]}` as const
}
