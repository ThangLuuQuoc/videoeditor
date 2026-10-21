import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

// Replaced: the signed-in user and Next's cache. The rest is real:
// database, storage, and the posting kit's stand-in words.
const requireUser = vi.fn()
vi.mock("@/features/auth", () => ({ requireUser }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const hasStorage = Boolean(process.env.NEON_BRANCH || process.env.STORAGE_TESTS)

describe.runIf(hasStorage)("a share link's cover and posts", () => {
  const userId = `test-${randomUUID()}`
  let db: typeof import("@/shared/db").db
  let storage: typeof import("@/shared/storage")
  let media: typeof import("@/shared/media")
  let actions: typeof import("../actions")
  let queries: typeof import("../queries")
  let dir: string
  let workspaceId: string
  let footageId: string
  let folder: string

  /** A small PNG of one colour, as the dialog makes. */
  async function png(color: string) {
    const file = join(dir, `${color}.png`)
    await media.runFfmpeg(
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        `color=c=${color}:s=320x180`,
        "-frames:v",
        "1",
        file,
      ],
      { timeoutMs: 30_000 }
    )
    return new File([await readFile(file)], "cover.png", { type: "image/png" })
  }

  const form = (cover: File | Blob) => {
    const data = new FormData()
    data.set("kind", "clip")
    data.set("id", footageId)
    data.set("cover", cover)
    return data
  }

  beforeAll(async () => {
    process.env.AI_TEXT_TEST = "on"
    ;({ db } = await import("@/shared/db"))
    storage = await import("@/shared/storage")
    media = await import("@/shared/media")
    actions = await import("../actions")
    queries = await import("../queries")
    dir = await mkdtemp(join(tmpdir(), "reelpilot-cover-test-"))
    const user = await db.user.create({
      data: { id: userId, name: "Ada", email: `${userId}@example.com` },
    })
    requireUser.mockResolvedValue({ user })
    const { getCurrentWorkspace } = await import("@/features/workspaces")
    ;({
      workspace: { id: workspaceId },
    } = await getCurrentWorkspace())
    const kit = await db.brandKit.create({
      data: { workspaceId, name: "Acme", url: "https://acme.example/" },
    })
    const footage = await db.footage.create({
      data: {
        workspaceId,
        brandKitId: kit.id,
        name: "Garlic noodles",
        source: "UPLOAD",
        status: "READY",
        originalKey: "k",
        contentType: "video/mp4",
        sizeBytes: 1,
        durationMs: 5000,
        width: 1280,
        height: 720,
        videoKey: "unused/video.mp4",
      },
    })
    footageId = footage.id
    folder = `${storage.workspaceFileKey(workspaceId, "brand-kits", kit.id, "footage", footageId)}/`
  })

  afterAll(async () => {
    if (folder) await storage.deleteFolder(folder)
    await db.user.deleteMany({ where: { id: userId } })
    await db.workspace.deleteMany({ where: { id: workspaceId } })
    await rm(dir, { recursive: true, force: true })
  })

  it("stores a cover on the share link, shows it there, and replaces it", async () => {
    const first = await actions.saveShareCover(form(await png("red")))
    if (!first.ok) throw new Error(first.error.message)
    expect(first.data.coverUrl).toMatch(/^https?:\/\//)
    const link = await db.shareLink.findFirstOrThrow({ where: { footageId } })
    // A cover alone doesn't publish the link.
    expect(link.enabled).toBe(false)
    expect(link.coverKey!.startsWith(`${folder}exports/cover-`)).toBe(true)

    await actions.setShareLink({
      target: { kind: "clip", id: footageId },
      enabled: true,
    })
    const shared = await queries.getSharedVideo(link.token)
    expect(shared!.coverUrl).toMatch(/^https?:\/\//)
    // Link previews show the cover, not the clip's poster.
    expect(shared!.posterUrl).toBe(shared!.coverUrl)

    // A new cover replaces the old one's file.
    const second = await actions.saveShareCover(form(await png("blue")))
    expect(second.ok).toBe(true)
    expect(await storage.fileSize(link.coverKey!)).toBeNull()
  })

  it("refuses what isn't a picture", async () => {
    const result = await actions.saveShareCover(
      form(new File(["<svg/>"], "cover.svg", { type: "image/svg+xml" }))
    )
    expect(result).toMatchObject({
      ok: false,
      error: { message: "A cover is a PNG or JPEG." },
    })
  })

  it("writes a post for each platform from what the video says", async () => {
    const result = await actions.writePosts({
      target: { kind: "clip", id: footageId },
    })
    if (!result.ok) throw new Error(result.error.message)
    expect(result.data.map((post) => post.platform)).toEqual([
      "tiktok",
      "reels",
      "shorts",
    ])
    expect(result.data[0]!.title).toBe("Garlic noodles (TikTok)")
  })
})
