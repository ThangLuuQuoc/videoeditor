import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

// Replaced: the signed-in user and Next's cache. The rest is real:
// database, storage, the test voice and the export render.
const requireUser = vi.fn()
vi.mock("@/features/auth", () => ({ requireUser }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const hasStorage = Boolean(process.env.NEON_BRANCH || process.env.STORAGE_TESTS)
const cut = { kind: "cut", durationMs: 0, direction: "left" } as const

describe.runIf(hasStorage)("a recipe across a video", () => {
  const userId = `test-${randomUUID()}`
  let db: typeof import("@/shared/db").db
  let storage: typeof import("@/shared/storage")
  let media: typeof import("@/shared/media")
  let motion: typeof import("@/shared/motion")
  let actions: typeof import("../actions")
  let queries: typeof import("../queries")
  let service: typeof import("../service")
  let exportsService: typeof import("@/features/exports/service")
  let renderExport: typeof import("@/features/exports/jobs/render-export").renderExport
  let dir: string
  let workspaceId: string
  let kitId: string
  const folders: string[] = []

  /** A processed clip `seconds` long, its video in storage. */
  async function clip(seconds: number, color: string) {
    const footage = await db.footage.create({
      data: {
        workspaceId,
        brandKitId: kitId,
        name: "Cooking",
        source: "UPLOAD",
        status: "READY",
        originalKey: "k",
        contentType: "video/mp4",
        sizeBytes: 1,
        durationMs: seconds * 1000,
        width: 720,
        height: 1280,
      },
    })
    const folder = `${storage.workspaceFileKey(workspaceId, "brand-kits", kitId, "footage", footage.id)}/`
    folders.push(folder)
    const file = join(dir, `${footage.id}.mp4`)
    await media.runFfmpeg(
      ["-f", "lavfi", "-i", `color=c=${color}:s=720x1280:r=30:d=${seconds}`]
        .concat(["-c:v", "libx264", "-pix_fmt", "yuv420p", file]),
      { timeoutMs: 60_000 }
    )
    await storage.uploadFromFile(`${folder}video.mp4`, file, "video/mp4")
    await db.footage.update({
      where: { id: footage.id },
      data: { videoKey: `${folder}video.mp4` },
    })
    return { id: footage.id, folder }
  }

  beforeAll(async () => {
    // The development tone: no provider account needed.
    process.env.VOICE_PROVIDER = "test"
    ;({ db } = await import("@/shared/db"))
    storage = await import("@/shared/storage")
    media = await import("@/shared/media")
    motion = await import("@/shared/motion")
    actions = await import("../actions")
    queries = await import("../queries")
    service = await import("../service")
    exportsService = await import("@/features/exports/service")
    ;({ renderExport } = await import("@/features/exports/jobs/render-export"))
    dir = await mkdtemp(join(tmpdir(), "reelpilot-recipe-video-"))
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
        name: "Bếp",
        url: "https://bep.example/",
        colors: { primary: "#f97316" },
      },
    }))
  })

  afterAll(async () => {
    for (const folder of folders) await storage.deleteFolder(folder)
    await db.user.deleteMany({ where: { id: userId } })
    await db.workspace.deleteMany({ where: { id: workspaceId } })
    await rm(dir, { recursive: true, force: true })
  })

  it("lays the recipe over the clips, reads each step aloud in its clip, undoes, and exports", async () => {
    const a = await clip(9, "0x303030")
    const b = await clip(10, "0x505050")
    const created = await actions.createProject({ name: "Mì", kitId })
    if (!created.ok) throw new Error(created.error.message)
    const { projectId } = created.data
    const saved = await actions.saveProjectClips({
      projectId,
      baseVersion: 0,
      clips: [a, b].map(({ id }) => ({ footageId: id, transition: cut })),
    })
    if (!saved.ok) throw new Error(saved.error.message)

    const recipe = motion.recipeSchema.parse({
      dish: "Mì bơ tỏi",
      ingredients: [{ text: "200 g mì" }, { text: "3 tép tỏi" }],
      steps: [
        { text: "Luộc mì bốn phút" },
        { text: "Phi tỏi với bơ" },
        { text: "Trộn đều rồi dọn ra đĩa" },
      ],
      language: "vi",
      voiced: true,
    })
    const applied = await actions.applyVideoRecipe({
      projectId,
      baseVersion: saved.data.version,
      recipe,
    })
    if (!applied.ok) throw new Error(applied.error.message)
    expect(applied.data).toMatchObject({ applied: 2, skipped: 0 })

    const video = await queries.getProject(workspaceId, projectId)
    expect(video?.template).toEqual({ templateId: "recipe", withAi: false })
    const [first, second] = video!.clips.map((c) => c.presentation)
    const ids = (p: typeof first) => p!.graphics.map((g) => g.id)
    expect(first!.template).toBe("recipe-video")
    expect(ids(first)).toContain("tpl-intro")
    expect(ids(first)).toContain("tpl-list")
    expect(ids(second)).toContain("tpl-end")
    expect(ids(first)).not.toContain("tpl-end")

    // Every step spoken once, each line stored in the clip it plays in and
    // ending before that clip does.
    const lines = [first!, second!].flatMap((p, index) =>
      (p.voice?.lines ?? []).map((line) => ({ ...line, clip: index }))
    )
    expect(lines.map((line) => line.text).sort()).toEqual(
      recipe.steps.map((step) => step.text).sort()
    )
    const lengths = [9000, 10_000]
    for (const line of lines) {
      const folder = line.clip === 0 ? a.folder : b.folder
      expect(line.audioKey.startsWith(`${folder}voice/`)).toBe(true)
      expect(await storage.fileSize(line.audioKey)).toBeGreaterThan(1000)
      expect(line.atMs + line.durationMs).toBeLessThan(lengths[line.clip]!)
    }
    const secondLine = lines.find((line) => line.clip === 1)
    expect(secondLine).toBeDefined()

    // One step back to where it was.
    const undone = await service.undoVideoTemplate(workspaceId, {
      projectId,
      baseVersion: applied.data.version,
    })
    const restored = await queries.getProject(workspaceId, projectId)
    expect(restored?.template).toBeNull()
    expect(restored!.clips[0]!.presentation.graphics).toEqual([])
    expect(restored!.clips[0]!.presentation.voice).toBeNull()

    // Built again, then exported: the second clip's line is heard there.
    const again = await actions.applyVideoRecipe({
      projectId,
      baseVersion: undone.version,
      recipe,
    })
    if (!again.ok) throw new Error(again.error.message)
    const { id: exportId } = await exportsService.createExport(
      workspaceId,
      { kind: "video", id: projectId },
      "9:16",
      "Mì"
    )
    await renderExport(
      { exportId },
      { signal: new AbortController().signal, isLastAttempt: true }
    )
    const done = await db.export.findUniqueOrThrow({ where: { id: exportId } })
    expect(done.status).toBe("READY")
    const output = join(dir, "export.mp4")
    await storage.downloadToFile(done.fileKey!, output)
    const volume = async (from: number, to: number) => {
      const { stderr } = await media.runFfmpeg(
        ["-ss", `${from}`, "-to", `${to}`, "-i", output, "-vn"]
          .concat(["-af", "volumedetect", "-f", "null", "-"]),
        { timeoutMs: 60_000 }
      )
      return Number(/mean_volume: (-?[\d.]+) dB/.exec(stderr)?.[1] ?? -100)
    }
    // Silent under the title; the tone while the second clip's line plays
    // (the clips are joined by cuts: the second starts at 9s).
    expect(await volume(0, 2)).toBeLessThan(-60)
    const from = 9 + secondLine!.atMs / 1000
    expect(await volume(from + 0.1, from + 0.5)).toBeGreaterThan(-40)
  }, 600_000)
})
