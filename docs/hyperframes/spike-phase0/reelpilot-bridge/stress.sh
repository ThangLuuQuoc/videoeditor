#!/usr/bin/env bash
# Repeated renders of the bridged ReelPilot fixtures: seek accuracy + determinism.
# Usage: bash reelpilot-bridge/stress.sh   (from spike-phase0/)
set -u
cd "$(dirname "$0")/.."
source ./env.sh
mkdir -p renders/stress logs/stress results
OUT=results/bridge-stress.txt
: > "$OUT"
node reelpilot-bridge/build.mjs reelpilot-bridge/fixtures/seek-cuts.json rp-seek-cuts | tee -a "$OUT"
node reelpilot-bridge/build.mjs reelpilot-bridge/fixtures/motion.json rp-motion | tee -a "$OUT"

run() { # project mode run extra...
  local p=$1 mode=$2 i=$3; shift 3
  local out="renders/stress/$p-$mode-$i.mp4" log="logs/stress/$p-$mode-$i.log"
  (cd "$p" && hyperframes render --output "../$out" "$@" > "../$log" 2>&1)
  echo "$p $mode #$i rc=$? $(grep 'rendered in' "$log" | sed 's/.*rendered in/rendered in/')" | tee -a "$OUT"
}

for i in 1 2 3 4; do
  run rp-seek-cuts gpu "$i"
  node reelpilot-bridge/verify.mjs "renders/stress/rp-seek-cuts-gpu-$i.mp4" rp-seek-cuts/expected.json | sed 's/^/   /' | tee -a "$OUT"
done
for i in 1 2; do
  run rp-seek-cuts sw "$i" --no-browser-gpu
  node reelpilot-bridge/verify.mjs "renders/stress/rp-seek-cuts-sw-$i.mp4" rp-seek-cuts/expected.json | sed 's/^/   /' | tee -a "$OUT"
done
for i in 1 2; do run rp-motion gpu "$i"; done
for i in 1 2; do ffmpeg -v error -i "renders/stress/rp-motion-gpu-$i.mp4" -map 0:v -f framemd5 - | grep -v '^#' > "results/stress-rp-motion-$i.md5"; done
echo "rp-motion md5 differing: $(diff results/stress-rp-motion-1.md5 results/stress-rp-motion-2.md5 | grep -c '^<')/$(wc -l < results/stress-rp-motion-1.md5)" | tee -a "$OUT"
ffmpeg -hide_banner -i renders/stress/rp-motion-gpu-1.mp4 -i renders/stress/rp-motion-gpu-2.mp4 -lavfi psnr -f null - 2>&1 | grep -o "PSNR.*" | sed 's/^/rp-motion /' | tee -a "$OUT"
echo DONE | tee -a "$OUT"
