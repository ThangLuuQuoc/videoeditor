#!/usr/bin/env bash
# Phase-0 render benchmark. Usage: bash bench.sh [runs]
# Writes one CSV row per render to results/bench.csv.
set -u
cd "$(dirname "$0")"
source ./env.sh
RUNS="${1:-3}"
mkdir -p results renders/bench logs/bench
CSV=results/bench.csv
echo "composition,mode,run,wall_s,reported,capture,encode,size" > "$CSV"

render() { # name mode run extra-args...
  local name=$1 mode=$2 run=$3; shift 3
  local out="renders/bench/${name}-${mode}-${run}.mp4" log="logs/bench/${name}-${mode}-${run}.log"
  local t0=$(date +%s%N)
  (cd "$name" && hyperframes render --output "../$out" "$@" > "../$log" 2>&1)
  local rc=$? t1=$(date +%s%N)
  local wall=$(awk -v a="$t0" -v b="$t1" 'BEGIN{printf "%.1f",(b-a)/1e9}')
  local summary=$(grep "rendered in" "$log" | sed 's/.*rendered in //')
  local stats=$(grep -A1 "rendered in" "$log" | tail -1)
  local cap=$(echo "$stats" | grep -o "capture [0-9m. ]*s" | sed 's/capture //')
  local enc=$(echo "$stats" | grep -o "encode [0-9m. ]*s" | sed 's/encode //')
  local size=$(grep "rendered in" "$log" | awk -F'·' '{gsub(/^ +| +$/,"",$1); print $1}')
  [ $rc -ne 0 ] && summary="FAILED rc=$rc"
  echo "$name,$mode,$run,$wall,$summary,$cap,$enc,$size" | tee -a "$CSV"
}

for run in $(seq 1 "$RUNS"); do
  for name in captions-karaoke lottie-overlay three-bg; do
    render "$name" gpu "$run"
  done
done

# Simulate a GPU-less VPS: software WebGL / compositing.
for run in $(seq 1 "$RUNS"); do
  for name in captions-karaoke three-bg; do
    render "$name" nogpu "$run" --no-browser-gpu
  done
done

# Determinism: per-frame MD5 of two independent renders must match.
for name in captions-karaoke lottie-overlay three-bg; do
  a="renders/bench/${name}-gpu-1.mp4"; b="renders/bench/${name}-gpu-2.mp4"
  if [ -f "$a" ] && [ -f "$b" ]; then
    ffmpeg -v error -i "$a" -map 0:v -f framemd5 - | grep -v '^#' > "results/${name}-1.md5"
    ffmpeg -v error -i "$b" -map 0:v -f framemd5 - | grep -v '^#' > "results/${name}-2.md5"
    diffs=$(diff "results/${name}-1.md5" "results/${name}-2.md5" | grep -c '^<')
    echo "determinism,$name,frames_differing=$diffs/$(wc -l < "results/${name}-1.md5")" | tee -a results/determinism.txt
  fi
done
echo DONE
