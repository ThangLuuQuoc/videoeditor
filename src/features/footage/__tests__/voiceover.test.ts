import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

// Real database, storage, test voice and render: runs where a bucket exists.
const hasStorage = Boolean(process.env.NEON_BRANCH || process.env.STORAGE_TESTS)

describe.runIf(hasStorage)("voiceover", () => {
  let db: typeof import("@/shared/db").db
  let storage: typeof import("@/shared/storage")
  let media: typeof import("@/shared/media")
  let voiceover: typeof import("../lib/voiceover")
  let exportsService: typeof import("@/features/exports/service")
  let renderExport: typeof import("@/features/exports/jobs/render-export").renderExport
  let motion: typeof import("@/shared/motion")
  let dir: string
  let workspaceId: string
  let folder: string

  beforeAll(async () => {
    // The development tone: no provider account needed.
    process.env.VOICE_PROVIDER = "test"
    ;({ db } = await import("@/shared/db"))
    storage = await import("@/shared/storage")
    media = await import("@/shared/media")
    motion = await import("@/shared/motion")
    voiceover = await import("../lib/voiceover")
    exportsService = await import("@/features/exports/service")
    ;({ renderExport } = await import("@/features/exports/jobs/render-export"))
    dir = await mkdtemp(join(tmpdir(), "reelpilot-voice-test-"))
    ;({ id: workspaceId } = await db.workspace.create({ data: { name: "V" } }))
  })

  afterAll(async () => {
    if (folder) await storage.deleteFolder(folder)
    await db.workspace.deleteMany({ where: { id: workspaceId } })
    await rm(dir, { recursive: true, force: true })
  })

  it("voices a script line by line, stores it, and the export mixes it in", async () => {
    const kit = await db.brandKit.create({
      data: { workspaceId, name: "Acme", url: "https://acme.app/" },
    })
    const source = join(dir, "video.mp4")
    await media.runFfmpeg(
      [
        "-f",
        "lavfi",
        "-i",
        "testsrc=duration=6:size=1280x720:rate=30",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        source,
      ],
      { timeoutMs: 60_000 }
    )
    const footage = await db.footage.create({
      data: {
        workspaceId,
        brandKitId: kit.id,
        name: "Demo",
        source: "UPLOAD",
        status: "READY",
        originalKey: "k",
        contentType: "video/mp4",
        sizeBytes: 1,
        durationMs: 6000,
        width: 1280,
        height: 720,
      },
    })
    folder = `${storage.workspaceFileKey(workspaceId, "brand-kits", kit.id, "footage", footage.id)}/`
    await storage.uploadFromFile(`${folder}video.mp4`, source, "video/mp4")
    await db.footage.update({
      where: { id: footage.id },
      data: { videoKey: `${folder}video.mp4` },
    })

    const { lines, urls } = await voiceover.voiceLines({
      workspaceId,
      kitId: kit.id,
      footageId: footage.id,
      script: "Ra mắt tính năng mới. Xuất video chỉ trong vài phút.",
      language: "vi",
    })
    expect(lines.map((line) => line.text)).toEqual([
      "Ra mắt tính năng mới.",
      "Xuất video chỉ trong vài phút.",
    ])
    // The test tone lasts 0.3s + 55ms a character.
    expect(lines[0]!.durationMs).toBeGreaterThan(1300)
    expect(lines[0]!.durationMs).toBeLessThan(1500)
    expect(lines[0]!.atMs).toBe(motion.voiceLimits.leadMs)
    for (const line of lines) {
      expect(line.audioKey.startsWith(`${folder}voice/`)).toBe(true)
      expect(urls[line.audioKey]).toMatch(/^https?:\/\//)
      expect(await storage.fileSize(line.audioKey)).toBeGreaterThan(1000)
    }

    await db.footage.update({
      where: { id: footage.id },
      data: {
        presentation: {
          ...motion.defaultPresentation,
          voice: {
            script: "",
            language: "vi",
            lines,
            captions: true,
            captionStyle: "bold",
            volume: 1,
          },
        },
      },
    })
    const { id: exportId } = await exportsService.createExport(
      workspaceId,
      { kind: "clip", id: footage.id },
      "16:9",
      "Demo"
    )
    await renderExport(
      { exportId },
      { signal: new AbortController().signal, isLastAttempt: true }
    )
    const done = await db.export.findUniqueOrThrow({ where: { id: exportId } })
    expect(done.status).toBe("READY")
    const output = join(dir, "export.mp4")
    await storage.downloadToFile(done.fileKey!, output)

    // Silence before the first line, sound during it.
    const volume = async (from: number, to: number) => {
      const { stderr } = await media.runFfmpeg(
        [
          "-ss",
          `${from}`,
          "-to",
          `${to}`,
          "-i",
          output,
          "-vn",
          "-af",
          "volumedetect",
          "-f",
          "null",
          "-",
        ],
        { timeoutMs: 60_000 }
      )
      return Number(/mean_volume: (-?[\d.]+) dB/.exec(stderr)?.[1] ?? -100)
    }
    expect(await volume(0, 0.3)).toBeLessThan(-60)
    expect(await volume(0.6, 1.6)).toBeGreaterThan(-40)
  }, 600_000)
})
