import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

// Real database, storage, test voice, stand-in translation and render.
const hasStorage = Boolean(process.env.NEON_BRANCH || process.env.STORAGE_TESTS)

describe.runIf(hasStorage)("a clip's English version, exported", () => {
  let db: typeof import("@/shared/db").db
  let storage: typeof import("@/shared/storage")
  let media: typeof import("@/shared/media")
  let motion: typeof import("@/shared/motion")
  let voiceover: typeof import("../lib/voiceover")
  let recipes: typeof import("../lib/recipe-template")
  let translate: typeof import("../lib/translate")
  let exportsService: typeof import("@/features/exports/service")
  let exportsQueries: typeof import("@/features/exports/queries")
  let renderInput: typeof import("@/features/exports/lib/render-input")
  let renderExport: typeof import("@/features/exports/jobs/render-export").renderExport
  let dir: string
  let workspaceId: string
  let folder: string

  beforeAll(async () => {
    // The test voice and the stand-in translation: no accounts needed.
    process.env.VOICE_PROVIDER = "test"
    process.env.AI_TEXT_TEST = "on"
    ;({ db } = await import("@/shared/db"))
    storage = await import("@/shared/storage")
    media = await import("@/shared/media")
    motion = await import("@/shared/motion")
    voiceover = await import("../lib/voiceover")
    recipes = await import("../lib/recipe-template")
    translate = await import("../lib/translate")
    exportsService = await import("@/features/exports/service")
    exportsQueries = await import("@/features/exports/queries")
    renderInput = await import("@/features/exports/lib/render-input")
    ;({ renderExport } = await import("@/features/exports/jobs/render-export"))
    dir = await mkdtemp(join(tmpdir(), "reelpilot-translate-test-"))
    ;({ id: workspaceId } = await db.workspace.create({ data: { name: "T" } }))
  })

  afterAll(async () => {
    if (folder) await storage.deleteFolder(folder)
    await db.workspace.deleteMany({ where: { id: workspaceId } })
    await rm(dir, { recursive: true, force: true })
  })

  it("translates the words, voices them again, and keeps both exports", async () => {
    const kit = await db.brandKit.create({
      data: { workspaceId, name: "Bếp", url: "https://bep.example/" },
    })
    const source = join(dir, "video.mp4")
    await media.runFfmpeg(
      ["-f", "lavfi", "-i", "color=c=0x404040:s=720x1280:r=30:d=14"].concat([
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        source,
      ]),
      { timeoutMs: 60_000 }
    )
    const footage = await db.footage.create({
      data: {
        workspaceId,
        brandKitId: kit.id,
        name: "Mì bơ tỏi",
        source: "UPLOAD",
        status: "READY",
        originalKey: "k",
        contentType: "video/mp4",
        sizeBytes: 1,
        durationMs: 14_000,
        width: 720,
        height: 1280,
      },
    })
    folder = `${storage.workspaceFileKey(workspaceId, "brand-kits", kit.id, "footage", footage.id)}/`
    await storage.uploadFromFile(`${folder}video.mp4`, source, "video/mp4")
    await db.footage.update({
      where: { id: footage.id },
      data: { videoKey: `${folder}video.mp4` },
    })
    const where = { workspaceId, kitId: kit.id, footageId: footage.id }

    // A Vietnamese recipe, read aloud.
    const recipe = motion.recipeSchema.parse({
      dish: "Mì bơ tỏi",
      steps: [{ text: "Luộc mì bốn phút" }, { text: "Phi tỏi với bơ" }],
      language: "vi",
      voiced: true,
    })
    const { steps } = await voiceover.voiceSteps({
      ...where,
      steps: recipe.steps.map((s) => s.text),
      language: "vi",
    })
    const built = recipes.applyRecipe(recipe, {
      current: { shots: {}, presentation: motion.defaultPresentation },
      durationMs: 14_000,
      brandColors: [],
      voiced: steps,
    })
    if (!built.ok) throw new Error(built.reason)
    const original = built.motion.presentation

    const { version } = await translate.translateClip({
      ...where,
      presentation: original,
      language: "en",
    })
    expect(version.graphics["tpl-step-1"]).toEqual({
      text: "[EN] Luộc mì bốn phút",
      secondary: "[EN] Bước 1/2",
    })
    // Read again in English, each line where the Vietnamese one starts.
    expect(version.voice!.language).toBe("en")
    version.voice!.lines.forEach((line, index) => {
      expect(line.atMs).toBe(original.voice!.lines[index]!.atMs)
      expect(line.audioKey).not.toBe(original.voice!.lines[index]!.audioKey)
      expect(line.audioKey.startsWith(`${folder}voice/`)).toBe(true)
    })
    await db.footage.update({
      where: { id: footage.id },
      data: { presentation: { ...original, versions: [version] } },
    })

    // The English render input: English words, English voice, linked.
    const english = await renderInput.loadRenderInput(
      workspaceId,
      { kind: "clip", id: footage.id },
      { linkSeconds: 600, language: "en" }
    )
    expect(english!.languages).toEqual([{ language: "en", current: true }])
    const stage = english!.stage.clips[0]!
    expect(
      stage.presentation.graphics.find((g) => g.id === "tpl-step-2")!.text
    ).toBe("[EN] Phi tỏi với bơ")
    for (const line of stage.presentation.voice!.lines) {
      expect(stage.voiceUrls![line.audioKey]).toMatch(/^https?:\/\//)
    }

    // Both exports, original and English, are kept side by side.
    const target = { kind: "clip" as const, id: footage.id }
    for (const language of [null, "en" as const]) {
      const { id } = await exportsService.createExport(
        workspaceId,
        target,
        "9:16",
        "Mì bơ tỏi",
        language
      )
      await renderExport(
        { exportId: id },
        { signal: new AbortController().signal, isLastAttempt: true }
      )
    }
    const done = await db.export.findMany({
      where: { footageId: footage.id, status: "READY" },
      orderBy: { createdAt: "asc" },
    })
    expect(done.map((row) => row.language)).toEqual([null, "en"])
    const panel = await exportsQueries.getExportPanel(workspaceId, target)
    expect(panel!.exports["9:16"]!.file!.current).toBe(true)
    expect(panel!.versions[0]!.exports["9:16"]!.file!.current).toBe(true)
    const file = await exportsQueries.getExportFile(workspaceId, done[1]!.id)
    expect(file!.fileName).toBe("Mi bo toi (English) 9x16.mp4")

    // The English line is heard where the Vietnamese one was.
    const output = join(dir, "english.mp4")
    await storage.downloadToFile(done[1]!.fileKey!, output)
    const { stderr } = await media.runFfmpeg(
      [
        "-ss",
        `${version.voice!.lines[0]!.atMs / 1000 + 0.1}`,
        "-t",
        "0.4",
      ].concat(["-i", output, "-vn", "-af", "volumedetect", "-f", "null", "-"]),
      { timeoutMs: 60_000 }
    )
    const mean = Number(/mean_volume: (-?[\d.]+) dB/.exec(stderr)?.[1] ?? -100)
    expect(mean).toBeGreaterThan(-40)
  }, 600_000)
})
