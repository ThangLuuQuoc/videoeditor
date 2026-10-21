import { beforeAll, describe, expect, it } from "vitest"

import {
  defaultPresentation,
  graphicItemSchema,
  type Presentation,
} from "@/shared/motion"
import { modelReturning } from "@/shared/testing/mock-model"
import { fillPlaceholderEnv } from "@/shared/testing/placeholder-env"

const clip = (words: string[]): Presentation => ({
  ...defaultPresentation,
  graphics: words.map((text, i) =>
    graphicItemSchema.parse({
      id: `g${i}`,
      kind: "lower-third",
      atMs: 0,
      durationMs: 2000,
      text,
    })
  ),
})

describe("posting kit", () => {
  let kit: typeof import("../lib/post-kit")

  beforeAll(async () => {
    fillPlaceholderEnv()
    kit = await import("../lib/post-kit")
  })

  it("reads what the video says, once each, in order", () => {
    expect(
      kit.videoWords([
        clip(["Mì bơ tỏi", "  Luộc   mì "]),
        clip(["Luộc mì", "Phi tỏi"]),
      ])
    ).toEqual(["Mì bơ tỏi", "Luộc mì", "Phi tỏi"])
  })

  it("stands in with the video's own words (AI_TEXT_TEST)", () => {
    const posts = kit.standInPosts({
      name: "Garlic noodles!",
      brand: "Bếp Nhà",
      words: ["Boil", "Toss"],
    })
    expect(posts.map((p) => p.platform)).toEqual(["tiktok", "reels", "shorts"])
    expect(posts[0]).toEqual({
      platform: "tiktok",
      title: "Garlic noodles! (TikTok)",
      description: "Boil · Toss",
      hashtags: ["garlicnoodles", "bepnha", "tiktok"],
    })
  })

  it("asks for every platform in the language, and tidies the answer", async () => {
    const model = modelReturning(
      JSON.stringify({
        posts: [
          {
            platform: "shorts",
            title: "Garlic noodles in 15 minutes",
            description: "Butter, garlic, noodles.",
            hashtags: ["#Garlic Noodles", "recipe"],
          },
          {
            platform: "tiktok",
            title: "Dinner in 15",
            description: "Save it for later",
            hashtags: ["easyrecipe"],
          },
        ],
      })
    )
    const posts = await kit.writePosts(
      {
        name: "Garlic noodles",
        brand: "Acme",
        words: ["Boil the noodles"],
        language: "en",
      },
      { model }
    )
    // In platform order; a platform the model skipped still gets a post.
    expect(posts.map((p) => p.platform)).toEqual(["tiktok", "reels", "shorts"])
    expect(posts[1]).toMatchObject({ title: "Garlic noodles", hashtags: [] })
    expect(posts[2]!.hashtags).toEqual(["garlicnoodles", "recipe"])
    const call = JSON.stringify(model.doGenerateCalls[0]!.prompt)
    expect(call).toContain("in English")
    expect(call).toContain("Boil the noodles")
  })
})
