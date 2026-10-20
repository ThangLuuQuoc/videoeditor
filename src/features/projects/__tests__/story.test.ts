import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

// Replaced: the signed-in user, Next's cache and the queue (processing
// queues the analysis job). The rest is real: database, storage, ffmpeg
// and the export render.
const requireUser = vi.fn()
vi.mock("@/features/auth", () => ({ requireUser }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
const enqueue = vi.hoisted(() => vi.fn().mockResolvedValue("job-1"))
vi.mock("@/shared/jobs", async (original) => ({
  ...(await original<typeof import("@/shared/jobs")>()),
  enqueue,
}))

const hasStorage = Boolean(process.env.NEON_BRANCH || process.env.STORAGE_TESTS)
const cut = { kind: "cut", durationMs: 0, direction: "left" } as const

describe.runIf(hasStorage)("a timeline across a video of photos", () => {
  const userId = `test-${randomUUID()}`
  let db: typeof import("@/shared/db").db
  let storage: typeof import("@/shared/storage")
  let media: typeof import("@/shared/media")
  let footage: typeof import("@/features/footage/service")
  let processFootage: typeof import("@/features/footage/jobs/process-footage").processFootage
  let actions: typeof import("../actions")
  let queries: typeof import("../queries")
  let exportsService: typeof import("@/features/exports/service")
  let renderExport: typeof import("@/features/exports/jobs/render-export").renderExport
  let dir: string
  let workspaceId: string
  let kitId: string
  const folders: string[] = []

  /** A photo uploaded and processed into a still clip, as the app does. */
  async function photo(name: string, picture: string) {
    const file = join(dir, `${name}.png`)
    await media.runFfmpeg(
      ["-f", "lavfi", "-i", picture, "-frames:v", "1", file],
      { timeoutMs: 30_000 }
    )
    const { footageId, originalKey } = await footage.createFootageUpload(
      workspaceId,
      {
        kitId,
        name,
        sizeBytes: 1,
        contentType: "image/png",
        source: "UPLOAD",
      }
    )
    folders.push(originalKey.slice(0, originalKey.lastIndexOf("/") + 1))
    await storage.uploadFromFile(originalKey, file, "image/png")
    await footage.startProcessing(workspaceId, footageId, [])
    await processFootage(
      { footageId },
      { signal: new AbortController().signal, isLastAttempt: true }
    )
    return footageId
  }

  /** One frame of the export, `width`×`width * 9/16` RGB. */
  async function frameAt(video: string, seconds: number, width = 640) {
    const raw = join(dir, `frame-${seconds}-${width}.rgb`)
    const scale = `scale=${width}:${(width * 9) / 16}`
    await media.runFfmpeg(
      [
        "-v",
        "error",
        "-y",
        "-ss",
        `${seconds}`,
        "-i",
        video,
        "-frames:v",
        "1",
      ].concat(["-vf", scale, "-f", "rawvideo", "-pix_fmt", "rgb24", raw]),
      { timeoutMs: 60_000 }
    )
    return readFile(raw)
  }

  beforeAll(async () => {
    ;({ db } = await import("@/shared/db"))
    storage = await import("@/shared/storage")
    media = await import("@/shared/media")
    footage = await import("@/features/footage/service")
    ;({ processFootage } =
      await import("@/features/footage/jobs/process-footage"))
    actions = await import("../actions")
    queries = await import("../queries")
    exportsService = await import("@/features/exports/service")
    ;({ renderExport } = await import("@/features/exports/jobs/render-export"))
    dir = await mkdtemp(join(tmpdir(), "reelpilot-story-video-"))
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
        url: "https://acme.example/",
        // A dark brand colour and a magenta accent: the chapter bar fills
        // in magenta, which nothing else on screen is.
        colors: { primary: "#0f172a", accent: "#ff00ff" },
      },
    }))
  })

  afterAll(async () => {
    for (const folder of folders) await storage.deleteFolder(folder)
    await db.user.deleteMany({ where: { id: userId } })
    await db.workspace.deleteMany({ where: { id: workspaceId } })
    await rm(dir, { recursive: true, force: true })
  })

  it("makes each photo a chapter that zooms, with the chapter bar, and exports", async () => {
    const first = await photo("Garage", "testsrc=size=1280x720")
    const second = await photo("Store", "color=c=0x808080:size=1280x720")
    const clips = await db.footage.findMany({
      where: { id: { in: [first, second] } },
    })
    for (const clip of clips) {
      expect(clip.status).toBe("READY")
      expect(clip.durationMs).toBeGreaterThan(5900)
    }

    const created = await actions.createProject({ name: "Acme", kitId })
    if (!created.ok) throw new Error(created.error.message)
    const { projectId } = created.data
    const saved = await actions.saveProjectClips({
      projectId,
      baseVersion: 0,
      clips: [first, second].map((footageId) => ({
        footageId,
        transition: cut,
      })),
    })
    if (!saved.ok) throw new Error(saved.error.message)

    const applied = await actions.applyVideoStory({
      projectId,
      baseVersion: saved.data.version,
      story: {
        title: "25 years of Acme",
        chapters: [
          { date: "1998", title: "Founded in a garage" },
          { date: "2005", title: "First store" },
        ],
      },
    })
    if (!applied.ok) throw new Error(applied.error.message)
    const video = await queries.getProject(workspaceId, projectId)
    expect(video?.template).toEqual({ templateId: "story", withAi: false })
    const [a, b] = video!.clips.map((clip) => clip.presentation)
    // Photos zoom in, then out.
    expect([a!.kenBurns, b!.kenBurns]).toEqual(["in", "out"])
    expect(a!.graphics.map((g) => g.id)).toEqual([
      "tpl-intro",
      "tpl-chapter-1",
      "tpl-bar-1",
    ])
    expect(b!.graphics.map((g) => g.id)).toEqual([
      "tpl-chapter-2",
      "tpl-bar-2",
      "tpl-end",
    ])

    const { id: exportId } = await exportsService.createExport(
      workspaceId,
      { kind: "video", id: projectId },
      "16:9",
      "Acme"
    )
    await renderExport(
      { exportId },
      { signal: new AbortController().signal, isLastAttempt: true }
    )
    const done = await db.export.findUniqueOrThrow({ where: { id: exportId } })
    expect(done.status).toBe("READY")
    const output = join(dir, "export.mp4")
    await storage.downloadToFile(done.fileKey!, output)

    // The still photo moves: two moments of the same chapter differ.
    const early = await frameAt(output, 2.8)
    const late = await frameAt(output, 5.8)
    let changed = 0
    for (let i = 0; i < early.length; i++) {
      changed += Math.abs(early[i]! - late[i]!)
    }
    expect(changed / early.length).toBeGreaterThan(4)

    // The second chapter's bar, nearly full, in the accent along the
    // bottom (below the milestone's words), over the plain grey photo. At
    // full size: the bar is 7.5px tall.
    const chapter2 = await frameAt(output, 8.5, 1920)
    let magenta = 0
    const bottom = chapter2.subarray(1920 * 3 * 960)
    for (let i = 0; i < bottom.length; i += 3) {
      const [r, g, b] = [bottom[i]!, bottom[i + 1]!, bottom[i + 2]!]
      if (r > 150 && b > 150 && g < 100) magenta++
    }
    expect(magenta).toBeGreaterThan(3000)
  }, 600_000)
})
