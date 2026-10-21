/**
 * App-wide limits. ReelPilot is free for now (owner, 2026-09-28): no plans,
 * any number of brand kits and clips. What's left are safety caps.
 */

const MB = 1024 * 1024

/** Every clip, uploaded or recorded. */
export const clipLimits = {
  /** Largest file a user may upload or record. */
  maxBytes: 1024 * MB,
  /** Longest clip, checked again on the real file by the worker. */
  maxDurationSeconds: 10 * 60,
} as const

/** Caps on costly AI work, per workspace. */
export const aiLimits = {
  /** "Create from URL" drafts per workspace per day (each is an AI call). */
  brandKitDraftsPerDay: 20,
  /** "Direct with AI" requests for footage motion per workspace per day. */
  motionDirectionsPerDay: 40,
  /** Key moments the AI describes from a frame, per workspace per day. */
  momentDescriptionsPerDay: 300,
  /** "Let AI choose" a graphic for a moment, per workspace per day. */
  graphicSuggestionsPerDay: 100,
  /** Voiceover scripts the AI writes, per workspace per day. */
  voiceScriptsPerDay: 40,
  /** Lines voiced (each a paid text-to-speech call), per workspace per day. */
  voiceLinesPerDay: 300,
  /** Recipe pictures the AI makes (each a paid call), per workspace per day. */
  recipePicturesPerDay: 60,
  /** Clips translated into another language, per workspace per day. */
  translationsPerDay: 60,
  /** Posting kits the AI writes (title, description, hashtags) per day. */
  postKitsPerDay: 60,
} as const
