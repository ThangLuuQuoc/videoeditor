import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

// Real database, storage, test pictures and render: runs where a bucket exists.
const hasStorage = Boolean(process.env.NEON_BRANCH || process.env.STORAGE_TESTS)

describe.runIf(hasStorage)("recipe pictures", () => {
  let db: typeof import("@/shared/db").db
  let storage: typeof import("@/shared/storage")
  let media: typeof import("@/shared/media")
  let motion: typeof import("@/shared/motion")
  let pictures: typeof import("../lib/recipe-pictures")
  let template: typeof import("../lib/recipe-template")
  let exportsService: typeof import("@/features/exports/service")
  let renderExport: typeof import("@/features/exports/jobs/render-export").renderExport
  let dir: string
  let workspaceId: string
  let folder: string

  beforeAll(async () => {
    // The development placeholder: no provider account needed.
    process.env.IMAGE_PROVIDER = "test"
    ;({ db } = await import("@/shared/db"))
    storage = await import("@/shared/storage")
    media = await import("@/shared/media")
    motion = await import("@/shared/motion")
    pictures = await import("../lib/recipe-pictures")
    template = await import("../lib/recipe-template")
    exportsService = await import("@/features/exports/service")
    ;({ renderExport } = await import("@/features/exports/jobs/render-export"))
    dir = await mkdtemp(join(tmpdir(), "reelpilot-pictures-test-"))
    ;({ id: workspaceId } = await db.workspace.create({ data: { name: "P" } }))
  })

  afterAll(async () => {
    if (folder) await storage.deleteFolder(folder)
    await db.workspace.deleteMany({ where: { id: workspaceId } })
    await rm(dir, { recursive: true, force: true })
  })

  /** A solid-colour PNG, as a cook's upload would be. */
  async function solidPng(name: string, color: string) {
    const file = join(dir, name)
    await media.runFfmpeg(
      ["-f", "lavfi", "-i", `color=c=${color}:s=256x256`, "-frames:v", "1", file],
      { timeoutMs: 30_000 }
    )
    return new Uint8Array(await readFile(file))
  }

  /** Share of a frame's pixels close to an RGB colour. */
  async function shareOf(video: string, atSeconds: number, rgb: number[]) {
    const raw = join(dir, `frame-${atSeconds}.rgb`)
    await media.runFfmpeg(
      ["-v", "error", "-y", "-ss", `${atSeconds}`, "-i", video, "-frames:v", "1"]
        .concat(["-vf", "scale=270:480", "-f", "rawvideo", "-pix_fmt", "rgb24", raw]),
      { timeoutMs: 60_000 }
    )
    const pixels = await readFile(raw)
    let near = 0
    for (let i = 0; i < pixels.length; i += 3) {
      if (rgb.every((value, c) => Math.abs(pixels[i + c]! - value) < 40)) near++
    }
    return near / (pixels.length / 3)
  }

  it("stores made and uploaded pictures, and the export shows them", async () => {
    const kit = await db.brandKit.create({
      data: { workspaceId, name: "Bếp", url: "https://bep.example/" },
    })
    const source = join(dir, "video.mp4")
    await media.runFfmpeg(
      ["-f", "lavfi", "-i", "color=c=0x404040:s=720x1280:r=30:d=16"]
        .concat(["-c:v", "libx264", "-pix_fmt", "yuv420p", source]),
      { timeoutMs: 60_000 }
    )
    const footage = await db.footage.create({
      data: {
        workspaceId,
        brandKitId: kit.id,
        name: "Cooking",
        source: "UPLOAD",
        status: "READY",
        originalKey: "k",
        contentType: "video/mp4",
        sizeBytes: 1,
        durationMs: 16_000,
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

    // Made by the (test) image provider: a real PNG in the clip's folder.
    const made = await pictures.makeRecipePicture({
      ...where,
      dish: "Mì bơ tỏi",
      kind: "ingredient",
      text: "3 tép tỏi",
    })
    expect(made.key.startsWith(`${folder}pictures/ai-`)).toBe(true)
    expect(made.key.endsWith(".png")).toBe(true)
    expect(made.url).toMatch(/^https?:\/\//)
    const fetched = new Uint8Array(await (await fetch(made.url)).arrayBuffer())
    expect(fetched.length).toBeGreaterThan(1000)

    // Uploaded: cyan for the first ingredient, magenta for the first step.
    const cyan = await pictures.storeRecipePicture({
      ...where,
      bytes: await solidPng("cyan.png", "0x00ffff"),
      type: "image/png",
      source: "upload",
    })
    const magenta = await pictures.storeRecipePicture({
      ...where,
      bytes: await solidPng("magenta.png", "0xff00ff"),
      type: "image/png",
      source: "upload",
    })
    expect(cyan.key.startsWith(`${folder}pictures/upload-`)).toBe(true)

    const recipe = motion.recipeSchema.parse({
      dish: "Mì bơ tỏi",
      ingredients: [{ text: "200 g mì" }, { text: "3 tép tỏi" }],
      steps: [{ text: "Luộc mì" }, { text: "Phi tỏi với bơ" }],
      language: "vi",
    })
    const built = template.applyRecipe(recipe, {
      current: { shots: {}, presentation: motion.defaultPresentation },
      durationMs: 16_000,
      brandColors: [],
    })
    if (!built.ok) throw new Error(built.reason)
    let presentation = built.motion.presentation
    presentation = template.setRecipePicture(
      presentation,
      { kind: "ingredient", index: 0 },
      cyan.key
    )
    presentation = template.setRecipePicture(
      presentation,
      { kind: "ingredient", index: 1 },
      made.key
    )
    presentation = template.setRecipePicture(
      presentation,
      { kind: "step", index: 0 },
      magenta.key
    )
    await db.footage.update({
      where: { id: footage.id },
      data: { presentation },
    })

    const { id: exportId } = await exportsService.createExport(
      workspaceId,
      { kind: "clip", id: footage.id },
      "9:16",
      "Cooking"
    )
    await renderExport(
      { exportId },
      { signal: new AbortController().signal, isLastAttempt: true }
    )
    const done = await db.export.findUniqueOrThrow({ where: { id: exportId } })
    expect(done.status).toBe("READY")
    const output = join(dir, "export.mp4")
    await storage.downloadToFile(done.fileKey!, output)

    // 16s: title 0–2.6s, checklist 2.6–5.2s, step 1 5.2–9.1s, step 2, end card.
    const cyanOnList = await shareOf(output, 4.6, [0, 255, 255])
    const magentaOnStep = await shareOf(output, 7.5, [255, 0, 255])
    // A thumbnail: about 17×17 of 270×480 pixels.
    expect(cyanOnList).toBeGreaterThan(0.001)
    expect(magentaOnStep).toBeGreaterThan(0.05)
    // Each only while its graphic shows.
    expect(await shareOf(output, 7.5, [0, 255, 255])).toBe(0)
    expect(await shareOf(output, 4.6, [255, 0, 255])).toBe(0)
  }, 600_000)
})
