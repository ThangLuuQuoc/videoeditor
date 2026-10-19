// Runs one render with HyperFrames in its own Node process (see ./index.ts),
// with the same protocol as ./render-process.ts (Remotion).
//
// The compositions in src/remotion render unchanged: they are bundled for the
// browser with `remotion` aliased to src/remotion/hyperframes/remotion-shim,
// put on a HyperFrames page (src/remotion/hyperframes/entry.tsx) and rendered
// by the pinned `hyperframes` CLI, which seeks each frame and encodes with the
// bundled ffmpeg. No "server-only" here (plain Node child process).
//
// Usage: node --import tsx render-process-hyperframes.ts <job.json>
// job.json: { props, outputPath }. Prints one JSON line per update:
// {"progress":0.42} … then {"durationMs":12345}.
import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { delimiter, dirname, join, resolve } from "node:path"
import { createInterface } from "node:readline"

import ffprobeInstaller from "@ffprobe-installer/ffprobe"
import { build } from "esbuild"
import ffmpegPath from "ffmpeg-static"

import {
  framesFor,
  stageFps,
  stageSizes,
} from "@/remotion/compositions/FootageStage"
import { projectDurationMs } from "@/remotion/compositions/ProjectStage"
import type { RenderProps } from "@/remotion/RenderVideo"
import { voiceTracks, type AudioTrack } from "@/remotion/voice-tracks"

const send = (message: object) =>
  process.stdout.write(`${JSON.stringify(message)}\n`)

const require = createRequire(import.meta.url)
const root = process.cwd()

/** The browser bundle: the compositions with `remotion` swapped for the shim. */
async function bundleStage(outDir: string) {
  await build({
    entryPoints: { stage: resolve(root, "src/remotion/hyperframes/entry.tsx") },
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "chrome120",
    outdir: outDir,
    jsx: "automatic",
    alias: {
      remotion: resolve(root, "src/remotion/hyperframes/remotion-shim.tsx"),
    },
    // The kit fonts (@fontsource CSS) ship next to the page.
    loader: { ".woff2": "file", ".woff": "file" },
    assetNames: "fonts/[name]-[hash]",
    // Root-relative font URLs: the runtime may load the stylesheet's fonts
    // from the page (not the CSS file's folder).
    publicPath: "/assets",
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "warning",
  })
}

/** Escapes JSON for an inline <script> (no early `</script>`). */
const inlineJson = (value: unknown) =>
  JSON.stringify(value).replace(/</g, "\\u003c")

/** Escapes text for an HTML attribute. */
const attr = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")

/**
 * The voiceover as <audio> clips inside the composition root: the runtime
 * times them and the producer mixes them into the MP4 with ffmpeg.
 */
function audioTags(tracks: AudioTrack[]) {
  const seconds = (ms: number) => (ms / 1000).toFixed(3)
  return tracks
    .map(
      (track, index) =>
        `
      <audio id="voice-${index}" src="${attr(track.src)}" data-start="${seconds(track.startMs)}"
             data-duration="${seconds(track.durationMs)}" data-volume="${track.volume}"></audio>`
    )
    .join("")
}

function page(props: RenderProps, frames: number, tracks: AudioTrack[]) {
  const { width, height } = stageSizes[props.shape]
  // Exact frame count: the runtime derives frames from seconds × fps.
  const seconds = (frames / stageFps).toFixed(6)
  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <link rel="stylesheet" href="assets/stage.css" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${width}px; height: ${height}px; overflow: hidden; background: #000; }
      #root { position: relative; width: ${width}px; height: ${height}px; }
      #render-stage { position: absolute; top: 0; left: 0; width: ${width}px; height: ${height}px; overflow: hidden; }
    </style>
  </head>
  <body>
    <!-- The composition root only sets size and length. The stage sits beside
         it, over it: the runtime syncs every <video> inside a composition root
         to the composition's clock, which would fight the shim's exact seeks. -->
    <div id="root" data-composition-id="main" data-start="0" data-duration="${seconds}"
         data-width="${width}" data-height="${height}" data-fps="${stageFps}" data-no-timeline>${audioTags(tracks)}</div>
    <div id="render-stage"></div>
    <script id="render-props" type="application/json">${inlineJson(props)}</script>
    <script src="assets/stage.js"></script>
  </body>
</html>
`
}

/** The pinned CLI's entry, run with this Node. */
function hyperframesBin() {
  const pkgPath = require.resolve("hyperframes/package.json")
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    bin: Record<string, string>
  }
  const bin = pkg.bin.hyperframes
  if (!bin) throw new Error("The hyperframes package has no CLI entry.")
  return resolve(dirname(pkgPath), bin)
}

function renderPage(projectDir: string, outputPath: string) {
  const env = {
    ...process.env,
    // The bundled binaries, as src/shared/media uses them.
    PATH: [dirname(ffmpegPath ?? "ffmpeg"), process.env.PATH].join(delimiter),
    HYPERFRAMES_FFPROBE_PATH: ffprobeInstaller.path,
    // A server render: no telemetry, update checks, agent skills, or .env
    // reading (the app's .env holds secrets the CLI has no use for).
    HYPERFRAMES_NO_TELEMETRY: "1",
    HYPERFRAMES_NO_UPDATE_CHECK: "1",
    HYPERFRAMES_SKIP_SKILLS: "1",
    HYPERFRAMES_NO_CAPTURE_DOTENV: "1",
  }
  return new Promise<void>((done, fail) => {
    const child = spawn(
      process.execPath,
      [hyperframesBin(), "render", "--output", outputPath],
      { cwd: projectDir, env, stdio: ["ignore", "pipe", "pipe"] }
    )
    // Our own parent stops us with a signal; take the CLI (and Chrome) down too.
    const stop = () => child.kill()
    process.once("SIGTERM", stop)
    process.once("SIGINT", stop)

    let sent = -1
    let log = ""
    const keep = (text: string) => {
      log = (log + text).slice(-4000)
    }
    createInterface({ input: child.stdout }).on("line", (line) => {
      keep(`${line}\n`)
      // Machine-readable progress: @hf-progress {"code":…,"pct":42}
      const match = /^@hf-progress (\{.*\})$/.exec(line.trim())
      if (!match?.[1]) return
      try {
        const { pct } = JSON.parse(match[1]) as { pct?: number }
        if (typeof pct !== "number") return
        const percent = Math.floor(pct)
        if (percent === sent) return
        sent = percent
        send({ progress: Math.min(1, percent / 100) })
      } catch {
        // Not JSON after all: plain log output.
      }
    })
    child.stderr.on("data", (chunk: Buffer) => keep(chunk.toString()))
    child.on("error", fail)
    child.on("close", (code) => {
      process.off("SIGTERM", stop)
      process.off("SIGINT", stop)
      if (code === 0) done()
      else fail(new Error(`hyperframes render exited ${code}:\n${log}`))
    })
  })
}

/** "audio/mpeg" → ".mp3"; falls back to the link's own extension. */
function audioExtension(contentType: string | null, url: string) {
  const byType: Record<string, string> = {
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/wave": ".wav",
    "audio/ogg": ".ogg",
    "audio/aac": ".aac",
    "audio/mp4": ".m4a",
  }
  const type = contentType?.split(";")[0]?.trim().toLowerCase() ?? ""
  const fromPath = /\.(mp3|wav|ogg|aac|m4a)$/i.exec(new URL(url).pathname)
  return byType[type] ?? (fromPath ? fromPath[0].toLowerCase() : ".mp3")
}

/**
 * Downloads the voiceover next to the page and points each track at its
 * file. The HyperFrames producer only fetches https links itself, and every
 * asset should be on disk before the first frame anyway; a line that can't
 * be fetched fails the render (a silent video would look done).
 */
async function localAudio(tracks: AudioTrack[], dir: string) {
  if (tracks.length === 0) return tracks
  await mkdir(join(dir, "assets", "voice"), { recursive: true })
  return Promise.all(
    tracks.map(async (track, index) => {
      const response = await fetch(track.src, {
        signal: AbortSignal.timeout(60_000),
      })
      if (!response.ok) {
        throw new Error(
          `Couldn't fetch voiceover line ${index + 1} (HTTP ${response.status}).`
        )
      }
      const name = `assets/voice/${index}${audioExtension(
        response.headers.get("content-type"),
        track.src
      )}`
      await writeFile(
        join(dir, name),
        Buffer.from(await response.arrayBuffer())
      )
      return { ...track, src: name }
    })
  )
}

async function main() {
  const job = JSON.parse(await readFile(process.argv[2] ?? "", "utf8")) as {
    props: RenderProps
    outputPath: string
  }
  const frames = framesFor(projectDurationMs(job.props))
  const dir = await mkdtemp(join(tmpdir(), "reelpilot-hyperframes-"))
  try {
    await bundleStage(join(dir, "assets"))
    const tracks = await localAudio(voiceTracks(job.props.clips), dir)
    await writeFile(join(dir, "index.html"), page(job.props, frames, tracks))
    await renderPage(dir, resolve(job.outputPath))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
  send({ durationMs: Math.round((frames / stageFps) * 1000) })
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : error
    )
    process.exit(1)
  }
)
