import "server-only"

import { render } from "@react-email/components"
import { Resend } from "resend"

import { env } from "@/shared/config/env"
import { AppError } from "@/shared/lib/errors"

let client: Resend | undefined
const resend = () => (client ??= new Resend(env.RESEND_API_KEY))

/**
 * Sends a React Email template as HTML with a plain-text alternative.
 * Throws PROVIDER_FAILED if Resend rejects the message. With
 * EMAIL_TRANSPORT=console (a local stack with no mail account) it prints
 * the plain-text email to the server log instead, so a magic link can be
 * copied from there.
 */
export async function sendEmail(input: {
  to: string
  subject: string
  react: React.ReactElement
}) {
  const [html, text] = await Promise.all([
    render(input.react),
    render(input.react, { plainText: true }),
  ])

  if (env.EMAIL_TRANSPORT === "console") {
    console.info(
      `[email] to ${input.to} · ${input.subject}\n${text}\n[email] end`
    )
    return
  }

  const { error } = await resend().emails.send({
    from: env.EMAIL_FROM,
    to: input.to,
    subject: input.subject,
    html,
    text,
  })

  if (error) {
    throw new AppError(
      "PROVIDER_FAILED",
      "We couldn't send that email. Try again in a moment.",
      { cause: error }
    )
  }
}
