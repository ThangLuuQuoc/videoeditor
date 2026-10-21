import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

// Replaced: the signed-in user and Next's cache. The rest is real; the
// translation is the stand-in (AI_TEXT_TEST), so no model is called.
const requireUser = vi.fn()
vi.mock("@/features/auth", () => ({ requireUser }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const hasDatabase = Boolean(process.env.DATABASE_URL)
const cut = { kind: "cut", durationMs: 0, direction: "left" } as const

describe.runIf(hasDatabase)("a whole video in another language", () => {
  const userId = `test-${randomUUID()}`
  let db: typeof import("@/shared/db").db
  let motion: typeof import("@/shared/motion")
  let actions: typeof import("../actions")
  let queries: typeof import("../queries")
  let workspaceId: string
  let kitId: string

  async function clipSaying(words: string) {
    const footage = await db.footage.create({
      data: {
        workspaceId,
        brandKitId: kitId,
        name: words,
        source: "UPLOAD",
        status: "READY",
        originalKey: "k",
        contentType: "video/mp4",
        sizeBytes: 1,
        durationMs: 8000,
        width: 1280,
        height: 720,
        presentation: {
          ...motion.defaultPresentation,
          graphics: [
            motion.graphicItemSchema.parse({
              id: "g1",
              kind: "lower-third",
              atMs: 0,
              durationMs: 2000,
              text: words,
            }),
          ],
        },
      },
    })
    return footage.id
  }

  beforeAll(async () => {
    process.env.AI_TEXT_TEST = "on"
    ;({ db } = await import("@/shared/db"))
    motion = await import("@/shared/motion")
    actions = await import("../actions")
    queries = await import("../queries")
    const user = await db.user.create({
      data: { id: userId, name: "Ada", email: `${userId}@example.com` },
    })
    requireUser.mockResolvedValue({ user })
    const { getCurrentWorkspace } = await import("@/features/workspaces")
    ;({
      workspace: { id: workspaceId },
    } = await getCurrentWorkspace())
    ;({ id: kitId } = await db.brandKit.create({
      data: { workspaceId, name: "Acme", url: "https://acme.example/" },
    }))
  })

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: userId } })
    await db.workspace.deleteMany({ where: { id: workspaceId } })
  })

  it("translates every clip as its version, and again replaces it", async () => {
    const a = await clipSaying("Xin chào")
    const b = await clipSaying("Tạm biệt")
    const created = await actions.createProject({ name: "Hai", kitId })
    if (!created.ok) throw new Error(created.error.message)
    const { projectId } = created.data
    const saved = await actions.saveProjectClips({
      projectId,
      baseVersion: 0,
      clips: [a, b].map((footageId) => ({ footageId, transition: cut })),
    })
    if (!saved.ok) throw new Error(saved.error.message)

    const first = await actions.translateVideo({ projectId, language: "en" })
    expect(first).toEqual({ ok: true, data: { translated: 2 } })
    let video = await queries.getProject(workspaceId, projectId)
    const words = video!.clips.map(
      (clip) => clip.presentation.versions[0]!.graphics.g1!.text
    )
    expect(words).toEqual(["[EN] Xin chào", "[EN] Tạm biệt"])
    for (const clip of video!.clips) {
      expect(motion.versionState(clip.presentation, "en")).toBe("current")
      // The original words stay.
      expect(clip.presentation.graphics[0]!.text).not.toMatch(/^\[EN\]/)
    }

    // Translated again: still one English version per clip.
    await actions.translateVideo({ projectId, language: "en" })
    video = await queries.getProject(workspaceId, projectId)
    expect(video!.clips.map((c) => c.presentation.versions.length)).toEqual([
      1, 1,
    ])

    expect(
      await actions.translateVideo({ projectId, language: "fr" })
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } })
  })
})
