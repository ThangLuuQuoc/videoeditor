/**
 * Ken Burns (V3 M12 timeline): a slow push in (or pull out) with a slight
 * drift across a clip, for photos held as still clips. Applied to what's
 * inside the frame, so the frame itself stays put.
 */
export const kenBurnsModes = ["off", "in", "out"] as const
export type KenBurns = (typeof kenBurnsModes)[number]

export const kenBurnsLimits = {
  /** How far it zooms over the clip (1.12 = 12%). */
  zoom: 0.12,
  /** How far it drifts, in % of the frame (left and up). */
  driftX: 2,
  driftY: 1.2,
} as const

/** The pose `progress` (0–1) through the clip; null when off. */
export function kenBurnsAt(mode: KenBurns, progress: number) {
  if (mode === "off") return null
  const t = Math.min(1, Math.max(0, progress))
  const k = mode === "in" ? t : 1 - t
  return {
    scale: 1 + kenBurnsLimits.zoom * k,
    x: -kenBurnsLimits.driftX * k,
    y: -kenBurnsLimits.driftY * k,
  }
}
