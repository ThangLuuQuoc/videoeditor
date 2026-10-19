import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { modelReturning } from "@/shared/testing/mock-model"

// Replaced: the signed-in user and Next's cache. The rest is real.
const requireUser = vi.fn()
vi.mock("@/features/auth", () => ({ requireUser }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const hasDatabase = Boolean(process.env.DATABASE_URL)

const cut = { kind: "cut", durationMs: 0, direction: "left" } as const
const zoom = { kind: "zoom", durationMs: 450, direction: "left" } as const

describe.runIf(hasDatabase)("video templates", () => {
  const userId = `test-${randomUUID()}`
  let db: typeof import("@/shared/db").db
  let actions: typeof import("../actions")
  let queries: typeof import("../queries")
  let service: typeof import("../service")
  let workspaceId: string
  let kitId: string

  /** A ready clip with key moments at `moments` (ms). */
  async function clipWith(moments: number[]) {
    const footage = await db.footage.create({
      data: {
        workspaceId,
        brandKitId: kitId,
        name: "Clip",
        source: "UPLOAD",
        status: "READY",
        originalKey: "k",
        contentType: "video/mp4",
        sizeBytes: 1,
        durationMs: 8000,
        width: 1280,
        height: 720,
      },
    })
    const markers = await Promise.all(
      moments.map((atMs) =>
        db.footageMarker.create({
          data: { footageId: footage.id, atMs, source: "MANUAL" },
        })
      )
    )
    return { id: footage.id, markerIds: markers.map((m) => m.id) }
  }

  async function newVideo(footageIds: string[]) {
    const created = await actions.createProject({ name: "Launch", kitId })
    if (!created.ok) throw new Error(created.error.message)
    const { projectId } = created.data
    const saved = await actions.saveProjectClips({
      projectId,
      baseVersion: 0,
      clips: footageIds.map((footageId) => ({ footageId, transition: cut })),
    })
    if (!saved.ok) throw new Error(saved.error.message)
    return { projectId, version: saved.data.version }
  }

  beforeAll(async () => {
    ;({ db } = await import("@/shared/db"))
    actions = await import("../actions")
    queries = await import("../queries")
    service = await import("../service")
    const user = await db.user.create({
      data: { id: userId, name: "Ada", email: `${userId}@example.com` },
    })
    requireUser.mockResolvedValue({ user })
    const { getCurrentWorkspace } = await import("@/features/workspaces")
    ;({
      workspace: { id: workspaceId },
    } = await getCurrentWorkspace())
    ;({ id: kitId } = await db.brandKit.create({
      data: {
        workspaceId,
        name: "Acme",
        url: "https://acme.app/",
        colors: { primary: "#22c55e", secondary: "#0f172a" },
      },
    }))
  })

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: userId } })
    await db.workspace.deleteMany({ where: { id: workspaceId } })
  })

  it("applies a template to every clip and every join, then undoes it in one step", async () => {
    const a = await clipWith([1000, 4000])
    const b = await clipWith([2000])
    const bare = await clipWith([])
    const { projectId, version } = await newVideo([a.id, b.id, bare.id])

    const applied = await actions.applyVideoTemplate({
      projectId,
      baseVersion: version,
      templateId: "launch",
      withAi: false,
    })
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    expect(applied.data).toMatchObject({
      version: version + 1,
      applied: 2,
      skipped: 1,
    })
    expect(applied.data.transitions).toEqual([cut, zoom, zoom])

    const video = await queries.getProject(workspaceId, projectId)
    expect(video?.template).toEqual({ templateId: "launch", withAi: false })
    const [first, second, third] = video!.clips
    expect(first!.presentation.template).toBe("launch")
    expect(first!.presentation.background).toEqual({
      kind: "gradient",
      from: "#22c55e",
      to: "#0f172a",
    })
    expect(first!.presentation.graphics.map((g) => g.kind).sort()).toEqual([
      "end-card",
      "slide",
    ])
    expect(first!.shots).toHaveLength(2)
    expect(second!.presentation.template).toBe("launch")
    // No key moments: left as it was.
    expect(third!.presentation.template).toBeNull()

    const undone = await actions.undoVideoTemplate({
      projectId,
      baseVersion: version + 1,
    })
    expect(undone.ok && undone.data).toEqual({
      version: version + 2,
      transitions: [cut, cut, cut],
    })
    const after = await queries.getProject(workspaceId, projectId)
    expect(after?.template).toBeNull()
    expect(after!.clips[0]!.presentation.template).toBeNull()
    expect(after!.clips[0]!.presentation.graphics).toEqual([])
    expect(after!.clips[0]!.shots).toEqual([])
  })

  it("won't undo once the video changed since", async () => {
    const a = await clipWith([1000])
    const { projectId, version } = await newVideo([a.id])
    const applied = await actions.applyVideoTemplate({
      projectId,
      baseVersion: version,
      templateId: "feature-demo",
      withAi: false,
    })
    if (!applied.ok) throw new Error(applied.error.message)
    // A later edit to the clip.
    await db.footage.update({
      where: { id: a.id },
      data: { presentationVersion: { increment: 1 } },
    })
    const undone = await actions.undoVideoTemplate({
      projectId,
      baseVersion: applied.data.version,
    })
    expect(!undone.ok && undone.error.code).toBe("CONFLICT")
  })

  it("refuses a stale version and a video with no key moments", async () => {
    const a = await clipWith([1000])
    const { projectId, version } = await newVideo([a.id])
    const stale = await actions.applyVideoTemplate({
      projectId,
      baseVersion: version - 1,
      templateId: "launch",
      withAi: false,
    })
    expect(!stale.ok && stale.error.code).toBe("CONFLICT")

    const bare = await clipWith([])
    const empty = await newVideo([bare.id])
    const none = await actions.applyVideoTemplate({
      projectId: empty.projectId,
      baseVersion: empty.version,
      templateId: "launch",
      withAi: false,
    })
    expect(!none.ok && none.error.code).toBe("VALIDATION")
  })

  it("with AI: the director's words and end card, in the template's style", async () => {
    const a = await clipWith([1000, 5000])
    const { projectId, version } = await newVideo([a.id])
    const plan = {
      look: "tour",
      take: 0,
      stillParts: "keep",
      textStyle: "typewriter",
      texts: [
        {
          markerId: a.markerIds[0],
          role: "headline",
          text: "Close the books in a day",
          emphasis: "a day",
        },
      ],
      graphics: [],
      endCard: { headline: "Try Acme", cta: "Start free" },
      lens: "sharp",
      reasoning: "A launch.",
    }
    const result = await service.applyTemplateToVideo(
      workspaceId,
      {
        projectId,
        baseVersion: version,
        templateId: "social-ad",
        withAi: true,
      },
      { model: modelReturning(JSON.stringify(plan)) }
    )
    expect(result.applied).toBe(1)
    const video = await queries.getProject(workspaceId, projectId)
    const presentation = video!.clips[0]!.presentation
    // The template wins on style; the AI's words and end card stay.
    expect(presentation.template).toBe("social-ad")
    expect(presentation.textStyle.animation).toBe("keyword-swap")
    expect(presentation.texts.map((t) => t.text)).toEqual([
      "Close the books in a day",
    ])
    const cards = presentation.graphics.filter((g) => g.kind === "end-card")
    expect(cards.map((g) => g.text)).toEqual(["Try Acme"])
  })
})
