// Mini "UTS compiler": transcript.json -> index.html (HyperFrames composition).
// Usage: node build.mjs
import { readFileSync, writeFileSync } from "node:fs";

const WIDTH = 1080;
const HEIGHT = 1920;
const DURATION_MS = 10000;
const MAX_WORDS_PER_LINE = 3;
const GAP_BREAK_MS = 250; // pause longer than this starts a new caption line

const transcript = JSON.parse(readFileSync(new URL("./transcript.json", import.meta.url), "utf8"));

// Group words into caption lines: break on max words or on a pause.
const lines = [];
for (const [i, w] of transcript.words.entries()) {
  const word = { ...w, id: `w-${String(i + 1).padStart(3, "0")}` };
  const current = lines.at(-1);
  const gap = current ? word.startMs - current.at(-1).endMs : Infinity;
  if (!current || current.length >= MAX_WORDS_PER_LINE || gap > GAP_BREAK_MS) lines.push([word]);
  else current.push(word);
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const sec = (ms) => (ms / 1000).toFixed(3).replace(/\.?0+$/, "");

const captionClips = lines
  .map((line, i) => {
    const start = line[0].startMs;
    const end = line.at(-1).endMs;
    const words = line.map((w) => `<span class="word" id="${w.id}">${esc(w.text)}</span>`).join(" ");
    return `      <div id="cap-${String(i + 1).padStart(3, "0")}" class="clip caption" data-start="${sec(start)}" data-duration="${sec(end - start)}" data-track-index="10">${words}</div>`;
  })
  .join("\n");

const wordTimings = JSON.stringify(
  lines.flat().map(({ id, startMs, endMs }) => ({ id, startMs, endMs })),
);

const html = `<!doctype html>
<html lang="vi" data-resolution="portrait">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${WIDTH}, height=${HEIGHT}" />
    <script src="assets/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: #000; }
      #root { position: relative; width: 100%; height: 100%; font-family: "Segoe UI", Arial, sans-serif; }
      #aroll { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
      .caption {
        position: absolute; left: 60px; right: 60px; top: 1280px; z-index: 10;
        text-align: center; font-size: 92px; font-weight: 900; line-height: 1.15;
        color: #fff; text-transform: uppercase;
        -webkit-text-stroke: 6px #000; paint-order: stroke fill;
        text-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
      }
      .word { display: inline-block; margin: 0 0.12em; transform-origin: 50% 70%; } /* margin keeps gaps when a word scales up */
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${sec(DURATION_MS)}"
         data-width="${WIDTH}" data-height="${HEIGHT}" data-fps="30">
      <video id="aroll" class="clip" src="assets/aroll.mp4" data-start="0" data-duration="${sec(DURATION_MS)}"
             data-track-index="0" muted playsinline></video>
      <audio id="voice" src="assets/voice.wav" data-start="0" data-duration="${sec(DURATION_MS)}"
             data-track-index="1" data-volume="1"></audio>
${captionClips}
    </div>
    <script>
      // Generated from transcript.json. One paused timeline per composition.
      const words = ${wordTimings};
      const tl = gsap.timeline({ paused: true });
      for (const w of words) {
        const t = w.startMs / 1000;
        const d = (w.endMs - w.startMs) / 1000;
        tl.to("#" + w.id, { color: "#FFE600", scale: 1.15, duration: 0.08, ease: "power2.out" }, t)
          .to("#" + w.id, { color: "#FFFFFF", scale: 1.0, duration: 0.08, ease: "power2.in" }, t + d);
      }
      // Pop-in for each caption line.
      document.querySelectorAll(".caption").forEach((el) => {
        const t = Number(el.dataset.start);
        tl.fromTo(el, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.12, ease: "back.out(2)" }, t);
      });
      tl.set({}, {}, ${sec(DURATION_MS)});
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;

writeFileSync(new URL("./index.html", import.meta.url), html);
console.log(`index.html: ${lines.length} caption lines, ${transcript.words.length} words`);
