import { z } from "zod"

/**
 * Server environment. Add a variable here in the slice that first uses it,
 * and mirror it in .env.example.
 */
const envSchema = z.object({
  // Neon pooled connection for app traffic.
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  // Direct connection: Prisma migrations and the pg-boss job queue (it takes
  // advisory locks, which PgBouncer's transaction mode doesn't keep).
  DATABASE_URL_UNPOOLED: z.url({ protocol: /^postgres(ql)?$/ }),

  BETTER_AUTH_SECRET: z
    .string()
    .min(
      32,
      "Must be at least 32 characters. Generate one with: openssl rand -base64 32"
    ),
  BETTER_AUTH_URL: z.url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),

  RESEND_API_KEY: z.string().startsWith("re_"),
  EMAIL_FROM: z.string().min(1),
  /** "console" prints emails to the server log (a local stack only). */
  EMAIL_TRANSPORT: z.enum(["resend", "console"]).default("resend"),

  // AI text through the Vercel AI SDK registry (src/shared/ai). Add a
  // provider here and in the registry together, with its own key below.
  AI_TEXT_PROVIDER: z.enum(["anthropic"]),
  AI_TEXT_MODEL: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-"),
  // "off" skips AI vision in the worker (describing key moments). Tests and
  // CI turn it off; unit tests cover it with a mock model.
  AI_VISION: z.enum(["on", "off"]).default("on"),

  // Voiceover (optional: unset turns it off). "test" is a tone, for
  // development and CI only.
  VOICE_PROVIDER: z.enum(["openai", "elevenlabs", "test"]).optional(),
  VOICE_MODEL: z.string().min(1).optional(),
  VOICE_ID: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  ELEVENLABS_API_KEY: z.string().min(1).optional(),

  // Neon Object Storage for the linked branch. Written by `neon env pull`.
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  AWS_ENDPOINT_URL_S3: z.url(),
  AWS_REGION: z.string().min(1),

  // Remotion company licence key for renders (M5 exports). Optional: not
  // needed for individuals and small teams (see remotion.dev/license).
  /** Export renderer: HyperFrames (default) or the original Remotion path. */
  RENDER_ENGINE: z.enum(["hyperframes", "remotion"]).default("hyperframes"),
  /**
   * HyperFrames capture workers: a number or "auto". 1 by default: with
   * "auto" HyperFrames split a render across 5 Chrome workers on a GPU
   * machine, one hung, and the retried frames came out without footage
   * (hyperframes-seek test; docs/hyperframes/README.md §5).
   */
  RENDER_WORKERS: z
    .string()
    .regex(/^(auto|[1-9]\d?)$/)
    .default("1"),
  REMOTION_LICENSE_KEY: z.string().min(1).optional(),

  NEXT_PUBLIC_APP_URL: z.url(),
})

/** A real voice provider needs its model, voice and key. */
const voiceSchema = envSchema.superRefine((env, ctx) => {
  const provider = env.VOICE_PROVIDER
  if (!provider || provider === "test") return
  const key = provider === "openai" ? "OPENAI_API_KEY" : "ELEVENLABS_API_KEY"
  for (const name of ["VOICE_MODEL", "VOICE_ID", key] as const) {
    if (!env[name]) {
      ctx.addIssue({
        code: "custom",
        path: [name],
        message: `Required when VOICE_PROVIDER is ${provider}.`,
      })
    }
  }
})

export type Env = z.infer<typeof envSchema>

/** Parses env vars, listing every problem by name (never by value). */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = voiceSchema.safeParse(source)
  if (parsed.success) return parsed.data

  const problems = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n")
  throw new Error(
    `Invalid environment variables:\n${problems}\nSee .env.example for the full list.`
  )
}
