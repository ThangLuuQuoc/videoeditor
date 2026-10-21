import "server-only"

import { z } from "zod"

import { generateStructured, type LanguageModel } from "@/shared/ai"
import { env } from "@/shared/config/env"
import {
  versionLanguageNames,
  type Presentation,
  type VersionLanguage,
} from "@/shared/motion"

/**
 * The words of a posting kit (V3 M13 B): a title, a description and
 * hashtags for each platform the video goes to, from what the video says
 * (its titles, cards, captions and voiceover), in its language.
 */
export const postPlatforms = ["tiktok", "reels", "shorts"] as const
export type PostPlatform = (typeof postPlatforms)[number]

export const postPlatformNames: Record<PostPlatform, string> = {
  tiktok: "TikTok",
  reels: "Instagram Reels",
  shorts: "YouTube Shorts",
}

/** Each platform's limits, so a post fits where it goes. */
const platformRules: Record<PostPlatform, string> = {
  tiktok:
    "TikTok: a hook-like title under 60 characters, a caption under 150 characters, 3–5 hashtags.",
  reels:
    "Instagram Reels: a title under 60 characters, a caption of 1–3 short sentences with a call to action, 5–8 hashtags.",
  shorts:
    "YouTube Shorts: a searchable title under 70 characters, a description of 1–2 sentences, 3 hashtags.",
}

export const postSchema = z.object({
  platform: z.enum(postPlatforms),
  title: z.string().max(120),
  description: z.string().max(600),
  /** Without the "#", one word each. */
  hashtags: z.array(z.string().max(40)).max(10),
})
export type Post = z.output<typeof postSchema>

/** Everything the video says, once each, in order. */
export function videoWords(presentations: Presentation[]) {
  const words: string[] = []
  const add = (text: string | undefined) => {
    const clean = text?.replace(/\s+/g, " ").trim()
    if (clean && !words.includes(clean)) words.push(clean)
  }
  for (const presentation of presentations) {
    for (const graphic of presentation.graphics) {
      add(graphic.text)
      add(graphic.secondary)
    }
    for (const item of presentation.texts) add(item.text)
    for (const line of presentation.voice?.lines ?? []) add(line.text)
  }
  return words
}

/** "Garlic noodles!" → "garlicnoodles": a hashtag word. */
const tag = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLowerCase()
    .slice(0, 30)

/** AI_TEXT_TEST's stand-in: the video's own words, shaped per platform. */
export function standInPosts(input: {
  name: string
  brand: string
  words: string[]
}): Post[] {
  const about = input.words.slice(0, 3).join(" · ")
  return postPlatforms.map((platform) => ({
    platform,
    title: `${input.name} (${postPlatformNames[platform]})`,
    description: about || input.name,
    hashtags: [tag(input.name), tag(input.brand), platform].filter(Boolean),
  }))
}

export async function writePosts(
  input: {
    name: string
    brand: string
    /** What the video says (`videoWords`). */
    words: string[]
    language: VersionLanguage
  },
  options: { model?: LanguageModel } = {}
): Promise<Post[]> {
  if (!options.model && env.AI_TEXT_TEST === "on") return standInPosts(input)
  const language = versionLanguageNames[input.language]
  const { posts } = await generateStructured({
    schema: z.object({ posts: z.array(postSchema) }),
    system:
      `You write social posts for a short video, in ${language}. Base them only on what ` +
      "the video says; never invent prices, dates or claims. Use the brand's name once at " +
      "most. Hashtags are single words without the #, relevant to the content.\n" +
      postPlatforms.map((platform) => platformRules[platform]).join("\n"),
    prompt: JSON.stringify({
      video: input.name,
      brand: input.brand,
      saysOnScreen: input.words.slice(0, 40),
      platforms: postPlatforms,
    }),
    model: options.model,
  })
  // One post per platform, in order, hashtags without "#" or spaces.
  return postPlatforms.map((platform) => {
    const post = posts.find((each) => each.platform === platform) ?? {
      platform,
      title: input.name,
      description: "",
      hashtags: [],
    }
    return {
      ...post,
      hashtags: post.hashtags.map((each) => tag(each)).filter(Boolean),
    }
  })
}
