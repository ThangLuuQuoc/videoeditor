import "server-only"

import { sniffImageType } from "@/shared/lib/image-type"
import { safeFetch, type NetworkPolicy } from "@/shared/net"

/** Logos: raster only. SVG can carry scripts, so it isn't accepted. */
export const logoRules = {
  maxBytes: 2 * 1024 * 1024,
  types: ["image/png", "image/jpeg", "image/webp"],
  extensions: { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" },
} as const

export type LogoType = (typeof logoRules.types)[number]

/** The real image type from the file's first bytes, ignoring what it claims. */
export const sniffLogoType: (bytes: Uint8Array) => LogoType | null =
  sniffImageType

/**
 * Downloads the first candidate that is a real PNG, JPEG or WebP under the
 * size cap. Returns null when none is usable; a kit is fine without a logo.
 */
export async function fetchLogo(
  urls: string[],
  options: { policy?: NetworkPolicy } = {}
) {
  for (const url of urls) {
    try {
      const { body } = await safeFetch(url, {
        accept: logoRules.types,
        maxBytes: logoRules.maxBytes,
        timeoutMs: 5_000,
        policy: options.policy,
      })
      const type = sniffLogoType(body)
      if (type) return { bytes: body, type }
    } catch {
      // Try the next candidate.
    }
  }
  return null
}
