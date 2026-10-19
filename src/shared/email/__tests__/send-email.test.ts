import { createElement } from "react"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { fillPlaceholderEnv } from "@/shared/testing/placeholder-env"

// A local stack without a mail account prints emails instead of sending.
const send = vi.fn()
vi.mock("resend", () => ({
  Resend: class {
    emails = { send }
  },
}))

describe("sendEmail with EMAIL_TRANSPORT=console", () => {
  const before = process.env.EMAIL_TRANSPORT

  beforeAll(() => {
    process.env.EMAIL_TRANSPORT = "console"
    fillPlaceholderEnv()
  })

  afterAll(() => {
    process.env.EMAIL_TRANSPORT = before
  })

  it("prints the email (and its link) to the log, and sends nothing", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {})
    const { sendEmail } = await import("../send-email")
    await sendEmail({
      to: "ada@example.com",
      subject: "Sign in to ReelPilot",
      react: createElement(
        "a",
        { href: "http://localhost:3300/api/auth/magic-link/verify?token=abc" },
        "Sign in"
      ),
    })
    expect(send).not.toHaveBeenCalled()
    const logged = info.mock.calls.map((call) => String(call[0])).join("\n")
    expect(logged).toContain("ada@example.com")
    expect(logged).toContain("magic-link/verify?token=abc")
    info.mockRestore()
  })
})
