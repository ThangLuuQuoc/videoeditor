import { execFile } from "node:child_process"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

import ffmpegPath from "ffmpeg-static"

/**
 * A short MP4 with a hard cut at 2s, made with the bundled ffmpeg; 5s long
 * unless `seconds` asks for more (the recipe template needs room).
 */
export async function makeTestVideo(seconds = 5) {
  const dir = await mkdtemp(join(tmpdir(), "reelpilot-e2e-"))
  const file = join(dir, "Product demo.mp4")
  await promisify(execFile)(ffmpegPath ?? "ffmpeg", [
    "-hide_banner",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=duration=2:size=640x360:rate=30",
    "-f",
    "lavfi",
    "-i",
    `smptebars=duration=${Math.max(1, seconds - 2)}:size=640x360:rate=30`,
    "-filter_complex",
    "[0:v][1:v]concat=n=2:v=1[v]",
    "-map",
    "[v]",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    file,
  ])
  return file
}

/** A small solid-colour PNG, as a photo someone would upload. */
export async function makeTestPicture(name = "garlic.png") {
  const dir = await mkdtemp(join(tmpdir(), "reelpilot-e2e-"))
  const file = join(dir, name)
  await promisify(execFile)(ffmpegPath ?? "ffmpeg", [
    "-hide_banner",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=0x22aa55:s=320x320",
    "-frames:v",
    "1",
    file,
  ])
  return file
}
