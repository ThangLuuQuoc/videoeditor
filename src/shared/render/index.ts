import "server-only"

import { spawn } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { createInterface } from "node:readline"

import { env } from "@/shared/config/env"

import type { RenderProps } from "@/remotion/Root"

// The compositions in src/remotion rendered to MP4 in headless Chrome, by
// HyperFrames (default, ./render-process-hyperframes.ts: Apache-2.0, the
// compositions bundled with a Remotion shim) or Remotion (§4,
// ./render-process.ts), picked by RENDER_ENGINE. Each render runs in its own
// process: the renderers can't load under the worker's "react-server"
// condition, and Chrome's memory goes with it.

const renderProcess = {
  hyperframes: "src/shared/render/render-process-hyperframes.ts",
  remotion: "src/shared/render/render-process.ts",
} as const

export class RenderError extends Error {}

/**
 * Renders `props` to an H.264 MP4 at `outputPath`, with the voiceover mixed
 * in when a clip has one (HyperFrames only; the Remotion engine renders no
 * audio). `onProgress` gets 0–1; aborting `signal` stops it.
 */
export async function renderVideo(input: {
  props: RenderProps
  outputPath: string
  onProgress?: (progress: number) => void
  signal?: AbortSignal
}): Promise<{ durationMs: number }> {
  const dir = await mkdtemp(join(tmpdir(), "reelpilot-render-"))
  try {
    const jobFile = join(dir, "job.json")
    await writeFile(
      jobFile,
      JSON.stringify({ props: input.props, outputPath: input.outputPath })
    )
    return await new Promise((done, fail) => {
      const child = spawn(
        process.execPath,
        [
          "--import",
          "tsx",
          resolve(process.cwd(), renderProcess[env.RENDER_ENGINE]),
          jobFile,
        ],
        { stdio: ["ignore", "pipe", "pipe"], signal: input.signal }
      )
      let result: { durationMs: number } | null = null
      createInterface({ input: child.stdout }).on("line", (line) => {
        let message: { progress?: number; durationMs?: number }
        try {
          message = JSON.parse(line) as typeof message
        } catch {
          return // the renderer's own logging
        }
        if (typeof message.progress === "number") {
          input.onProgress?.(message.progress)
        }
        if (typeof message.durationMs === "number") {
          result = { durationMs: message.durationMs }
        }
      })
      // The last of stderr explains a failure.
      let stderr = ""
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-4000)
      })
      child.on("error", fail)
      child.on("close", (code) => {
        if (code === 0 && result) done(result)
        else fail(new RenderError(`Render failed (exit ${code}): ${stderr}`))
      })
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
