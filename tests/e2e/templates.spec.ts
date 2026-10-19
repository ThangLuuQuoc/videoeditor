import { expect, hasDatabase, test } from "./fixtures"
import { expectNoViolations } from "./helpers/axe"
import { createKitByHand } from "./helpers/brand-kits"
import { makeTestVideo } from "./helpers/video"

test.skip(
  !hasDatabase,
  "Signed-in tests need a database (DATABASE_URL_UNPOOLED)"
)

// Uploads go to a real bucket: Neon locally, the S3 server in CI.
const hasStorage = Boolean(process.env.NEON_BRANCH || process.env.STORAGE_TESTS)
const kitName = "acme-e2e.invalid"

test("a template styles the whole clip in one step, and undo takes it back", async ({
  page,
  signedInUser: _user,
  consoleProblems,
}) => {
  test.skip(!hasStorage, "Needs a bucket (NEON_BRANCH or STORAGE_TESTS)")
  test.setTimeout(150_000)
  const video = await makeTestVideo()
  await createKitByHand(page)
  await page.getByRole("tab", { name: "Footage" }).click()
  await page.getByTestId("footage-file").setInputFiles(video)
  const card = page.getByRole("listitem").filter({ hasText: "Product demo" })
  await expect(card.getByText("Ready")).toBeVisible({ timeout: 90_000 })
  await card.getByRole("link", { name: "Product demo" }).click()
  const tools = page.getByRole("tablist", { name: "Editor tools" })
  const graphicsList = page.getByRole("list", { name: "Graphics on the ad" })

  await tools.getByRole("tab", { name: "Templates" }).click()
  const templates = page.getByRole("list", { name: "Templates" })
  await expect(templates.getByRole("listitem")).toHaveCount(4)
  await expectNoViolations(page)

  await page.getByRole("button", { name: "Apply Launch video" }).click()
  await expect(page.getByText("Template applied")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Apply Launch video" })
  ).toHaveText(/Applied/)
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()

  // Its intro slide and end card carry the brand's name.
  await tools.getByRole("tab", { name: "Graphics" }).click()
  await expect(graphicsList.getByRole("listitem")).toHaveCount(2)
  await expect(graphicsList.getByText(new RegExp(kitName))).toHaveCount(2)

  // One undo step takes the whole template back.
  await page.getByRole("button", { name: /^Undo \(/ }).click()
  await expect(graphicsList.getByRole("listitem")).toHaveCount(0)
  await page.getByRole("button", { name: /^Redo \(/ }).click()
  await expect(graphicsList.getByRole("listitem")).toHaveCount(2)
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()

  // Kept after a reload.
  await page.reload()
  await page
    .getByRole("tablist", { name: "Editor tools" })
    .getByRole("tab", { name: "Templates" })
    .click()
  await expect(
    page.getByRole("button", { name: "Apply Launch video" })
  ).toHaveText(/Applied/)
  expect(consoleProblems).toEqual([])
})

test("a template on every clip of a video, undone in one step", async ({
  page,
  signedInUser: _user,
  consoleProblems,
}) => {
  test.skip(!hasStorage, "Needs a bucket (NEON_BRANCH or STORAGE_TESTS)")
  test.setTimeout(180_000)
  const video = await makeTestVideo()
  await createKitByHand(page)
  await page.goto("/dashboard")
  await page.getByRole("button", { name: "New video" }).click()
  await page.getByRole("textbox", { name: "Name" }).fill("Launch")
  await page.getByRole("button", { name: "Create video" }).click()
  await expect(page).toHaveURL(/\/videos\/[^/?]+$/, { timeout: 20_000 })
  await page.getByTestId("footage-file").setInputFiles(video)
  // One clip opens in the clip editor; the video's own page has the list.
  await expect(page).toHaveURL(/\/footage\/[^/?]+\?video=/, {
    timeout: 90_000,
  })
  await page.goto(
    page.url().replace(/\/brand-kits\/.*\?video=/, "/videos/") + "?clips=1"
  )

  await page.getByRole("button", { name: "Template" }).click()
  const dialog = page.getByRole("dialog", { name: "Template for every clip" })
  await expect(dialog.getByRole("radio")).toHaveCount(4)
  await expectNoViolations(page)
  await dialog.getByRole("radio", { name: /Feature demo/ }).click()
  await expect(
    dialog.getByRole("radio", { name: /Feature demo/ })
  ).toHaveAttribute("aria-checked", "true")
  await dialog.getByRole("button", { name: "Apply to every clip" }).click()
  await expect(page.getByText("Feature demo on 1 clip")).toBeVisible({
    timeout: 30_000,
  })
  await expect(dialog).toBeHidden()
  await expect(page.getByRole("button", { name: /Feature demo/ })).toBeVisible()

  await page.getByRole("button", { name: "Undo template" }).click()
  await expect(page.getByText("Template undone")).toBeVisible()
  await expect(page.getByRole("button", { name: "Undo template" })).toHaveCount(
    0
  )
  await expect(page.getByRole("button", { name: "Template" })).toBeVisible()
  expect(consoleProblems).toEqual([])
})
