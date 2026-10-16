# ReelPilot → HyperFrames bridge (spike)

Renders ReelPilot's **unchanged** `src/remotion` compositions (`ProjectStage` → `FootageStage`,
`TextLayer`, `Graphics`, `Layouts`) with HyperFrames instead of `@remotion/renderer`.

## How it works

- `build.mjs` bundles `src/entry.tsx` with esbuild and **aliases `remotion` to `src/remotion-shim.tsx`**
  (and `@` to `../../ReelPilot/src`). No ReelPilot file is edited.
- The shim re-implements the 8 Remotion APIs the compositions use: `AbsoluteFill`, `Sequence`
  (`from`, `durationInFrames`, `premountFor`, `layout`), `useCurrentFrame`, `useVideoConfig`,
  `OffthreadVideo` (`trimBefore`, `playbackRate`), `Img`, `delayRender`, `continueRender`.
- `entry.tsx` listens for HyperFrames' `hf-seek` event, renders that frame with `flushSync`, then
  `waitUntil()`s until every `<video>` is decoded at its exact source frame
  (seek to the middle of the frame, verify after `seeked`, retry, re-check all videos once more).
- The page is a HyperFrames composition with `data-no-timeline` and an explicit `data-duration`
  computed from ReelPilot's own `projectDurationMs()`.
- `src/expected.ts` computes, with ReelPilot's own `outputLayout()`, which footage frame each output
  frame must show; `verify.mjs` decodes a 9-bit barcode burned into the test footage from every
  rendered frame and compares.

## Run

```bash
cd spike-phase0 && source env.sh
node reelpilot-bridge/build.mjs reelpilot-bridge/fixtures/seek-cuts.json rp-seek-cuts
(cd rp-seek-cuts && hyperframes check && hyperframes render --output ../renders/rp-seek-cuts.mp4)
node reelpilot-bridge/verify.mjs renders/rp-seek-cuts.mp4 rp-seek-cuts/expected.json
bash reelpilot-bridge/stress.sh      # repeated renders: seek accuracy + determinism
```

## Fixtures

| File | What it exercises |
| :--- | :--- |
| `fixtures/footage.mp4` | 12 s, 1920×1080, 30 fps, GOP 60; frame number as text + 9-bit barcode |
| `fixtures/seek-cuts.json` | 0–3 s at 1×, 3–5 s removed, 5–12 s at 2× (cut joins), flat camera |
| `fixtures/motion.json` | "rise" intro, 2 camera shots (tilt/turn/zoom, drift), push transition into a 1.5× part, Vietnamese headline with emphasis |

## Known gaps (not covered by this spike)

- Only `ProjectStage` with one clip; multi-clip projects, magnifier graphics, logo `Img` not exercised.
- Brand-kit fonts: the shim does not load `@fontsource` CSS; HyperFrames injected Inter itself.
- Footage audio: ReelPilot strips it, so no audio path was tested.
- The editor preview still uses `@remotion/player`; swapping it for `<hyperframes-player>` is a separate step.
