import { expect, hasDatabase, test } from "./fixtures"
import { expectNoViolations } from "./helpers/axe"
import { createKitByHand } from "./helpers/brand-kits"
import { makeTestPicture, makeTestVideo } from "./helpers/video"

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

test("a recipe becomes a titled, step-by-step video in one undo step", async ({
  page,
  signedInUser: _user,
  consoleProblems,
}) => {
  test.skip(!hasStorage, "Needs a bucket (NEON_BRANCH or STORAGE_TESTS)")
  test.setTimeout(150_000)
  // 16s: room for the intro, the ingredients and two steps, not six.
  const video = await makeTestVideo(16)
  await createKitByHand(page)
  await page.getByRole("tab", { name: "Footage" }).click()
  await page.getByTestId("footage-file").setInputFiles(video)
  const card = page.getByRole("listitem").filter({ hasText: "Product demo" })
  await expect(card.getByText("Ready")).toBeVisible({ timeout: 90_000 })
  await card.getByRole("link", { name: "Product demo" }).click()
  const tools = page.getByRole("tablist", { name: "Editor tools" })
  const graphicsList = page.getByRole("list", { name: "Graphics on the ad" })

  await tools.getByRole("tab", { name: "Templates" }).click()
  const form = page.getByRole("form", { name: "Recipe" })
  await form.getByRole("textbox", { name: "Dish" }).fill("Garlic noodles")
  await form
    .getByRole("textbox", { name: "Line under the name" })
    .fill("15 min · serves 2")
  await form
    .getByRole("textbox", { name: "Ingredients" })
    .fill("- 200 g noodles\n- 3 cloves garlic")
  const steps = form.getByRole("textbox", { name: "Steps" })
  await steps.fill("Boil\nDrain\nMelt butter\nAdd garlic\nToss\nServe")
  await form.getByRole("button", { name: "Tiếng Việt" }).click()
  await expect(
    form.getByRole("button", { name: "Tiếng Việt" })
  ).toHaveAttribute("aria-pressed", "true")
  await expectNoViolations(page)

  // Six steps don't fit in 16 seconds: it says so and changes nothing.
  await form.getByRole("button", { name: "Build recipe video" }).click()
  await expect(form.getByRole("alert")).toContainText("6 steps need")

  await steps.fill("1. Boil the noodles\n2. Toss with garlic butter")
  await form.getByRole("button", { name: "Build recipe video" }).click()
  await expect(page.getByText("Recipe video built")).toBeVisible()
  await expect(form.getByRole("alert")).toHaveCount(0)
  await expect(
    form.getByRole("button", { name: "Rebuild recipe video" })
  ).toBeVisible()
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()

  // Title, checklist, two numbered steps and the end card.
  await tools.getByRole("tab", { name: "Graphics" }).click()
  await expect(graphicsList.getByRole("listitem")).toHaveCount(5)
  await expect(graphicsList.getByText(/Nguyên liệu/)).toBeVisible()
  await expect(graphicsList.getByText(/Toss with garlic butter/)).toBeVisible()

  // One undo step takes it all back; redo brings it again.
  await page.getByRole("button", { name: /^Undo \(/ }).click()
  await expect(graphicsList.getByRole("listitem")).toHaveCount(0)
  await page.getByRole("button", { name: /^Redo \(/ }).click()
  await expect(graphicsList.getByRole("listitem")).toHaveCount(5)
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()

  // The form opens with the recipe again after a reload.
  await page.reload()
  await page
    .getByRole("tablist", { name: "Editor tools" })
    .getByRole("tab", { name: "Templates" })
    .click()
  const again = page.getByRole("form", { name: "Recipe" })
  await expect(again.getByRole("textbox", { name: "Dish" })).toHaveValue(
    "Garlic noodles"
  )
  await expect(again.getByRole("textbox", { name: "Steps" })).toHaveValue(
    "Boil the noodles\nToss with garlic butter"
  )

  // Pictures: upload one, make one with AI (the test provider's
  // placeholder), then the rest in one go; each shows as a thumbnail.
  const pictures = page.getByRole("region", { name: "Pictures" })
  await page
    .getByTestId("picture-file-ingredient-0")
    .setInputFiles(await makeTestPicture())
  await expect(
    pictures.getByRole("img", { name: "Picture of 200 g noodles" })
  ).toBeVisible()
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()
  await pictures
    .getByRole("button", { name: "Make a picture of Boil the noodles with AI" })
    .click()
  await expect(page.getByText("Picture made")).toBeVisible()
  await expect(
    pictures.getByRole("img", { name: "Picture of Boil the noodles" })
  ).toBeVisible()
  await expectNoViolations(page)
  await pictures
    .getByRole("button", { name: "Make 2 missing pictures with AI" })
    .click()
  await expect(page.getByText("2 pictures made")).toBeVisible()
  await expect(pictures.getByRole("img")).toHaveCount(4)
  await expect(
    pictures.getByRole("button", { name: /missing pictures? with AI/ })
  ).toHaveCount(0)

  // Removing one is one undo step too.
  await pictures
    .getByRole("button", { name: "Remove the picture of 3 cloves garlic" })
    .click()
  await expect(pictures.getByRole("img")).toHaveCount(3)
  await page.getByRole("button", { name: /^Undo \(/ }).click()
  await expect(pictures.getByRole("img")).toHaveCount(4)
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()

  // Kept, and signed again, after a reload.
  await page.reload()
  await page
    .getByRole("tablist", { name: "Editor tools" })
    .getByRole("tab", { name: "Templates" })
    .click()
  await expect(
    page.getByRole("region", { name: "Pictures" }).getByRole("img")
  ).toHaveCount(4)
  expect(consoleProblems).toEqual([])
})

test("a recipe read aloud: a voiceover line for each step", async ({
  page,
  signedInUser: _user,
  consoleProblems,
}) => {
  test.skip(!hasStorage, "Needs a bucket (NEON_BRANCH or STORAGE_TESTS)")
  test.setTimeout(150_000)
  const video = await makeTestVideo(16)
  await createKitByHand(page)
  await page.getByRole("tab", { name: "Footage" }).click()
  await page.getByTestId("footage-file").setInputFiles(video)
  const card = page.getByRole("listitem").filter({ hasText: "Product demo" })
  await expect(card.getByText("Ready")).toBeVisible({ timeout: 90_000 })
  await card.getByRole("link", { name: "Product demo" }).click()
  const tools = page.getByRole("tablist", { name: "Editor tools" })

  await tools.getByRole("tab", { name: "Templates" }).click()
  const form = page.getByRole("form", { name: "Recipe" })
  await form.getByRole("textbox", { name: "Dish" }).fill("Garlic noodles")
  await form
    .getByRole("textbox", { name: "Steps" })
    .fill("Boil the noodles\nToss with garlic butter")
  await form.getByRole("switch", { name: "Read the steps aloud" }).click()
  await expect(
    form.getByText("Each lasts as long as it takes to say.")
  ).toBeVisible()
  await form.getByRole("button", { name: "Build recipe video" }).click()
  await expect(page.getByText("Recipe video built")).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByText(/Garlic noodles, read aloud/)).toBeVisible()
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()

  // One line per step, in the Voice tool.
  await tools.getByRole("tab", { name: "Voice" }).click()
  const lines = page.getByRole("list", { name: "Voiceover lines" })
  await expect(lines.getByRole("listitem")).toHaveCount(2)
  await expect(lines).toContainText("Toss with garlic butter")
  expect(consoleProblems).toEqual([])
})

test("a recipe across a video's clips, read aloud, undone in one step", async ({
  page,
  signedInUser: _user,
  consoleProblems,
}) => {
  test.skip(!hasStorage, "Needs a bucket (NEON_BRANCH or STORAGE_TESTS)")
  test.setTimeout(240_000)
  const first = await makeTestVideo(10, "Prep")
  const second = await makeTestVideo(10, "Cooking")
  await createKitByHand(page)
  await page.getByRole("tab", { name: "Footage" }).click()
  for (const file of [first, second]) {
    await page.getByTestId("footage-file").setInputFiles(file)
    await expect(page.getByText("Clip uploaded")).toBeVisible({
      timeout: 30_000,
    })
  }
  for (const name of ["Prep", "Cooking"]) {
    await expect(
      page.getByRole("listitem").filter({ hasText: name }).getByText("Ready")
    ).toBeVisible({ timeout: 90_000 })
  }
  await page.goto("/videos")
  await page.getByRole("button", { name: "New video" }).click()
  await page.getByRole("textbox", { name: "Name" }).fill("Noodles")
  await page.getByRole("button", { name: "Create video" }).click()
  await expect(page).toHaveURL(/\/videos\/[^/]+$/, { timeout: 20_000 })
  await page.getByRole("button", { name: "Choose from footage" }).click()
  const picker = page.getByRole("list", { name: "Footage to add" })
  await picker.getByRole("button", { name: /Prep/ }).click()
  await picker.getByRole("button", { name: /Cooking/ }).click()
  await page.getByRole("button", { name: "Add 2 clips" }).click()
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Template" }).click()
  const dialog = page.getByRole("dialog", { name: "Template for every clip" })
  await dialog.getByRole("button", { name: "Recipe" }).click()
  const form = dialog.getByRole("form", { name: "Recipe" })
  await form.getByRole("textbox", { name: "Dish" }).fill("Garlic noodles")
  await form.getByRole("textbox", { name: "Ingredients" }).fill("200 g noodles")
  await form
    .getByRole("textbox", { name: "Steps" })
    .fill("Boil the noodles\nMelt the butter\nToss and serve")
  await form.getByRole("switch", { name: "Read the steps aloud" }).click()
  await expectNoViolations(page)
  await form.getByRole("button", { name: "Build recipe video" }).click()
  await expect(page.getByText("Recipe on 2 clips")).toBeVisible({
    timeout: 60_000,
  })
  await expect(dialog).toBeHidden()

  // Undone in one step, like any template.
  await page.getByRole("button", { name: "Undo template" }).click()
  await expect(page.getByText("Template undone")).toBeVisible()
  await expect(page.getByRole("button", { name: "Undo template" })).toHaveCount(
    0
  )
  expect(consoleProblems).toEqual([])
})

test("photos become clips, and a timeline runs across them, undone in one step", async ({
  page,
  signedInUser: _user,
  consoleProblems,
}) => {
  test.skip(!hasStorage, "Needs a bucket (NEON_BRANCH or STORAGE_TESTS)")
  test.setTimeout(240_000)
  const garage = await makeTestPicture("Garage.png")
  const store = await makeTestPicture("Store.png")
  await createKitByHand(page)
  await page.getByRole("tab", { name: "Footage" }).click()
  for (const file of [garage, store]) {
    await page.getByTestId("footage-file").setInputFiles(file)
    await expect(page.getByText("Clip uploaded")).toBeVisible({
      timeout: 30_000,
    })
  }
  for (const name of ["Garage", "Store"]) {
    await expect(
      page.getByRole("listitem").filter({ hasText: name }).getByText("Ready")
    ).toBeVisible({ timeout: 90_000 })
  }

  // A photo is a 6-second still clip: too short for a whole timeline alone.
  await page
    .getByRole("listitem")
    .filter({ hasText: "Garage" })
    .getByRole("link", { name: "Garage" })
    .click()
  await page
    .getByRole("tablist", { name: "Editor tools" })
    .getByRole("tab", { name: "Templates" })
    .click()
  const clipForm = page.getByRole("form", { name: "Timeline" })
  await clipForm
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Acme")
  await clipForm
    .getByRole("textbox", { name: "Chapters" })
    .fill("1998 | Founded in a garage")
  await clipForm.getByRole("button", { name: "Build timeline video" }).click()
  await expect(clipForm.getByRole("alert")).toContainText(
    "This clip runs 6.0 s"
  )

  // A video of both photos: a chapter each.
  await page.goto("/videos")
  await page.getByRole("button", { name: "New video" }).click()
  await page.getByRole("textbox", { name: "Name" }).fill("Our story")
  await page.getByRole("button", { name: "Create video" }).click()
  await expect(page).toHaveURL(/\/videos\/[^/]+$/, { timeout: 20_000 })
  await page.getByRole("button", { name: "Choose from footage" }).click()
  const picker = page.getByRole("list", { name: "Footage to add" })
  await picker.getByRole("button", { name: /Garage/ }).click()
  await picker.getByRole("button", { name: /Store/ }).click()
  await page.getByRole("button", { name: "Add 2 clips" }).click()
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()
  await expect(page.getByLabel("Playback position")).toHaveText(
    "0:00.0 / 0:12.0",
    { timeout: 60_000 }
  )

  await page.getByRole("button", { name: "Template" }).click()
  const dialog = page.getByRole("dialog", { name: "Template for every clip" })
  await dialog.getByRole("button", { name: "Timeline" }).click()
  const form = dialog.getByRole("form", { name: "Timeline" })
  await form
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("25 years of Acme")
  await form
    .getByRole("textbox", { name: "Chapters" })
    .fill("1998 | Founded in a garage\n2005 | First store")
  await expectNoViolations(page)
  await form.getByRole("button", { name: "Build timeline video" }).click()
  await expect(page.getByText("Timeline on 2 clips")).toBeVisible({
    timeout: 60_000,
  })
  await expect(dialog).toBeHidden()

  await page.getByRole("button", { name: "Undo template" }).click()
  await expect(page.getByText("Template undone")).toBeVisible()
  expect(consoleProblems).toEqual([])
})
