import { execFile } from "node:child_process"
import { promisify } from "node:util"

import ffprobe from "@ffprobe-installer/ffprobe"

import { expect, hasDatabase, test } from "./fixtures"
import { expectNoViolations } from "./helpers/axe"
import { createKitByHand } from "./helpers/brand-kits"
import { makeTestVideo } from "./helpers/video"

test.skip(
  !hasDatabase,
  "Signed-in tests need a database (DATABASE_URL_UNPOOLED)"
)

// Uploads go to a real bucket; the voice is the development tone.
const hasStorage = Boolean(process.env.NEON_BRANCH || process.env.STORAGE_TESTS)
const hasVoice = process.env.VOICE_PROVIDER === "test"

test("a voiceover with captions, kept after a reload and heard in the export", async ({
  page,
  signedInUser: _user,
  consoleProblems,
}) => {
  test.skip(!hasStorage, "Needs a bucket (NEON_BRANCH or STORAGE_TESTS)")
  test.skip(!hasVoice, "Needs VOICE_PROVIDER=test")
  test.setTimeout(300_000)
  const video = await makeTestVideo()
  await createKitByHand(page)
  await page.getByRole("tab", { name: "Footage" }).click()
  await page.getByTestId("footage-file").setInputFiles(video)
  const card = page.getByRole("listitem").filter({ hasText: "Product demo" })
  await expect(card.getByText("Ready")).toBeVisible({ timeout: 90_000 })
  await card.getByRole("link", { name: "Product demo" }).click()

  const tools = page.getByRole("tablist", { name: "Editor tools" })
  await tools.getByRole("tab", { name: "Voice" }).click()
  await page
    .getByRole("textbox", { name: "Script" })
    .fill("Ra mắt tính năng mới. Dùng thử miễn phí.")
  await page.getByRole("button", { name: "Make voiceover" }).click()
  await expect(page.getByText("Voiceover ready")).toBeVisible({
    timeout: 30_000,
  })
  const lines = page.getByRole("list", { name: "Voiceover lines" })
  await expect(lines.getByRole("listitem")).toHaveCount(2)
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()
  await expectNoViolations(page)

  // The caption shows the line being spoken.
  await page.getByRole("button", { name: "Play", exact: true }).click()
  await expect(page.getByTestId("voice-caption")).toContainText(
    /tính năng mới/i,
    { timeout: 5000 }
  )
  await page.getByRole("button", { name: "Pause", exact: true }).click()

  await page.reload()
  await page
    .getByRole("tablist", { name: "Editor tools" })
    .getByRole("tab", { name: "Voice" })
    .click()
  await expect(lines.getByRole("listitem")).toHaveCount(2)

  // The exported MP4 has the voiceover as its sound.
  await page.getByRole("button", { name: "Export" }).click()
  const dialog = page.getByRole("dialog", { name: "Export and share" })
  await dialog.getByRole("button", { name: "Export MP4" }).click()
  const download = dialog.getByRole("link", { name: /Download MP4/ })
  await expect(download).toBeVisible({ timeout: 180_000 })
  const file = page.waitForEvent("download")
  await download.click()
  const path = await (await file).path()
  const { stdout } = await promisify(execFile)(ffprobe.path, [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_type",
    "-of",
    "csv=p=0",
    path,
  ])
  expect(stdout.split(/\s+/).filter(Boolean).sort()).toEqual(["audio", "video"])
  expect(consoleProblems).toEqual([])
})
