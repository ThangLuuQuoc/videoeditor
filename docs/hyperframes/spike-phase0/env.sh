# Nạp FFmpeg/FFprobe cục bộ vào PATH cho phiên shell hiện tại (không cài vào hệ thống)
SPIKE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$SPIKE_DIR/node_modules/ffmpeg-static:$SPIKE_DIR/node_modules/ffprobe-static/bin/win32/x64:$SPIKE_DIR/node_modules/.bin:$PATH"
export HYPERFRAMES_SKIP_SKILLS=1
