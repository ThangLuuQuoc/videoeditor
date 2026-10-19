# HyperFrames cho ReelPilot — trạng thái & hướng dẫn làm tiếp

> **Cập nhật:** 19/10/2026 · **Nhánh:** `main` = `hyperframes-export` trên `ThangLuuQuoc/videoeditor`
> Đọc file này trước tiên khi tiếp tục trên máy khác. Mọi tài liệu kế hoạch và mã thử nghiệm nằm trong `docs/hyperframes/`.

## 1. Mục tiêu đang làm

Thay **engine render export** của ReelPilot từ Remotion (`@remotion/renderer`, license riêng) sang **HyperFrames** (Apache 2.0), **giữ nguyên** các composition React trong `src/remotion`. Editor (preview bằng `@remotion/player`) chưa đổi, để làm sau.

## 2. Trạng thái

| Hạng mục | Trạng thái | Bằng chứng |
| :--- | :--- | :--- |
| Spike HyperFrames (phụ đề, Lottie, Three.js) | ✅ xong | `bao-cao-giai-doan-0.md` mục 1–6 |
| Bridge: composition ReelPilot render qua HyperFrames bằng shim `remotion` | ✅ xong | `bao-cao-giai-doan-0.md` mục 8: seek footage 6/6 lượt × 195/195 frame chính xác, tất định 0/265 frame lệch |
| Tích hợp vào app: `RENDER_ENGINE=hyperframes` (mặc định) / `remotion` | ✅ code xong, typecheck + lint sạch | xem mục 3 |
| Render project 2 clip qua `renderVideo()` của app | ✅ chạy được | 14,8s video, 445 frame, render 40s (Remotion: 44s); font brand kit (Bebas Neue) hiển thị |
| So pixel với bản Remotion cùng props | ✅ **khớp** | 445/445 frame ≥ 34,4 dB PSNR (trung vị 37,2), SSIM ≥ 0,990 — `spike-phase0/e2e/results/` |
| `render-export.test.ts` (job export thật: Postgres + SeaweedFS S3 + render + upload) | ✅ 2/2 đạt | engine mặc định = HyperFrames; cách chạy ở mục 4 |
| Project nặng graphics: magnifier (`OffthreadVideo` thứ 2), logo + end card (`Img`), callout, lower-third, split, stat, chuyển cảnh zoom | ✅ **khớp Remotion** | 407/407 frame ≥ 34,2 dB, SSIM ≥ 0,990; HyperFrames 53s so với Remotion 81s; `spike-phase0/e2e/render-graphics.mts`, `results/compare-graphics.png` |
| Test hồi quy seek trong repo: `src/shared/render/__tests__/hyperframes-seek.test.ts` | ✅ đạt (24s) | footage mã vạch + server có Range; **đã kiểm chứng test fail** khi cố ý làm hỏng shim. Chạy khi có `STORAGE_TESTS` (CI) hoặc `RENDER_TESTS=1` |
| CI (`.github/workflows/ci.yml`) | ✅ đã thêm bước | cache `~/.cache/puppeteer` + `npx hyperframes browser ensure`, `HYPERFRAMES_NO_TELEMETRY=1`. Repo `videoeditor` **chưa có lượt chạy Actions nào** (cần bật Actions trong Settings) |
| Playwright `tests/e2e/exports.spec.ts` (qua giao diện: build app + worker + Postgres + SeaweedFS) | ✅ **3/3 đạt** (4,1 phút, 19/10) | export clip + tải về + chia sẻ/tắt chia sẻ; báo export cũ sau khi sửa; export + chia sẻ cả video. Engine = HyperFrames (mặc định, không đặt `RENDER_ENGINE`) |
| Thay `@remotion/player` trong editor | ✅ **`StagePlayer`** (19/10), đã gỡ `@remotion/player` | Playwright desktop toàn bộ: 72 đạt, 1 bỏ qua; **mọi test editor/player đạt** (phát/dừng, J/K/L, bước frame, kéo trên sân khấu, toàn màn hình, project nhiều clip). Chạy lại `exports.spec.ts` với player mới: **3/3 đạt** (3,4 phút). Lý do không dùng `<hyperframes-player>`: `docs/decisions.md` 2026-10-19 |
| Kế hoạch V3 theo repo thật | ✅ `ke-hoach-v3.md` (19/10) | thay `ke-hoach-trien-khai-v2.md` |
| **V3 M6:** khung 4:5 (1080×1350) | ✅ | editor, export ("Feed"), trang chia sẻ; render thử ra 1080×1350 |
| **V3 M6:** image Docker cho worker (`Dockerfile.worker`) | ⏳ **chưa build xong** | lần 1 lỗi đường dẫn Chrome (đã sửa); lần 2 Docker Desktop sập giữa chừng do máy quá tải. Cần build lại khi máy rảnh, rồi chạy `render-export.test.ts` trong container |
| **V3 M8:** template + AI first cut | ✅ | 4 template; cấp clip (một bước hoàn tác) và cấp video (mọi clip + chuyển cảnh, "Undo template"); unit + DB test (gồm nhánh AI với model giả lập); `templates.spec.ts` 2/2 |
| **V3 M9:** giọng đọc + phụ đề | ✅ (provider thật chưa chọn) | script (tự viết hoặc AI viết) → TTS từng câu → phụ đề theo câu, tô từ đang đọc → preview phát tiếng → export trộn tiếng. `voiceover.test.ts` (DB + S3 + render: im lặng trước câu đầu, có tiếng trong câu) và `voice.spec.ts` (giao diện → MP4 có audio) đều đạt với `VOICE_PROVIDER=test` |

## 3. Thay đổi trong mã nguồn (so với ReelPilot `09b152b`)

| File | Thay đổi |
| :--- | :--- |
| `src/remotion/RenderVideo.tsx` (mới) | `RenderVideo` + `RenderProps` + import font `@fontsource`, tách ra khỏi `Root.tsx` để hai engine dùng chung |
| `src/remotion/Root.tsx` | chỉ còn `<Composition>` của Remotion, import `RenderVideo` |
| `src/remotion/hyperframes/remotion-shim.tsx` (mới) | 8 API Remotion (`AbsoluteFill`, `Sequence`, `useCurrentFrame`, `useVideoConfig`, `OffthreadVideo`, `Img`, `delayRender`, `continueRender`) điều khiển bởi sự kiện `hf-seek` |
| `src/remotion/hyperframes/entry.tsx` (mới) | trang HyperFrames: đọc props từ `<script id="render-props">`, mount `RenderVideo`, xử lý `hf-seek` + `waitUntil` |
| `src/shared/render/render-process-hyperframes.ts` (mới) | tiến trình con cùng giao thức với `render-process.ts`: esbuild bundle (alias `remotion` → shim) → trang HTML → `hyperframes render`; đọc tiến độ từ dòng `@hf-progress` |
| `src/shared/render/index.ts` | chọn tiến trình theo `env.RENDER_ENGINE` |
| `src/shared/render/__tests__/hyperframes-seek.test.ts` (mới) | test hồi quy: render footage mã vạch qua HyperFrames, giải mã từng frame, so với `outputLayout` |
| `.github/workflows/ci.yml` | cache + `npx hyperframes browser ensure`, tắt telemetry |
| `playwright.config.ts` | cổng test đọc từ `E2E_PORT` (mặc định 3100 như CI) |
| 4:5: `FootageStage.tsx` (`stageSizes`), `motion-stage.tsx`, `exports/schema.ts`, `export-dialog.tsx`, `app/v/[token]/page.tsx` | khung feed 4:5 |
| M8: `features/footage/lib/templates.ts`, `template-cut.ts`, `components/templates-panel.tsx`; `features/projects/lib/template-undo.ts`, `components/video-template-dialog.tsx`, `service.ts`/`actions.ts`/`schema.ts`/`queries.ts`; migration `20261019050209_project_template_undo` | template ở cấp clip và cấp video |
| M9: `shared/motion/voice.ts`, `shared/ai/speech.ts`, `features/footage/lib/voice-script.ts`, `voiceover.ts`, `components/voice-panel.tsx`, `remotion/components/VoiceCaptions.tsx`, `remotion/voice-tracks.ts`, `remotion/hyperframes/use-track-audio.ts`; `render-process-hyperframes.ts` (thẻ `<audio>` + tải audio về trước) | giọng đọc + phụ đề |
| `next.config.ts` | `serverExternalPackages` cho `@ffprobe-installer/ffprobe`, `ffmpeg-static` (app đo thời lượng audio) |
| `Dockerfile.worker`, `.dockerignore` | image worker (chưa kiểm chứng) |
| `src/remotion/hyperframes/stage-player.tsx`, `player-clock.ts` (mới) | player của editor thay `@remotion/player`: đồng hồ `requestAnimationFrame` (có phát ngược), co giãn vừa khung, API `play/pause/seekTo/isPlaying/getCurrentFrame` + sự kiện `frameupdate/seeked/play/pause/ended` |
| `next.config.ts` | `turbopack.resolveAlias`: `remotion` → shim (app không còn runtime Remotion) |
| `motion-stage.tsx`, `project-player.tsx`, `footage-editor.tsx`, `stage-items-layer.tsx` | dùng `StagePlayer`/`StagePlayerRef` |
| `src/shared/config/env-schema.ts`, `.env.example` | thêm `RENDER_ENGINE` (`hyperframes` mặc định) |
| `package.json` | thêm `hyperframes@0.8.164`, `esbuild@0.28.2` (ghim chính xác) |

## 4. Dựng lại trên máy mới

```bash
git clone https://github.com/ThangLuuQuoc/videoeditor.git && cd videoeditor
git switch hyperframes-export        # nếu main chưa có nhánh này
npm ci                               # chạy cả prisma generate
npx next typegen                     # sinh PageProps/RouteContext, nếu không typecheck báo lỗi
npm run typecheck && npx eslint src/remotion src/shared/render src/shared/config
```

Render thử project 2 clip (không cần DB/S3):

```bash
# terminal 1: phục vụ footage thử qua HTTP có Range (giống link S3 đã ký)
node docs/hyperframes/spike-phase0/e2e/serve.mjs docs/hyperframes/spike-phase0/reelpilot-bridge/fixtures 8791
# terminal 2, ở thư mục gốc repo
SAMPLE_MEDIA_URL=http://127.0.0.1:8791/footage.mp4 RENDER_ENGINE=hyperframes TSX_TSCONFIG_PATH=tsconfig.json \
  node --env-file=docs/hyperframes/spike-phase0/e2e/ci.env --conditions=react-server --import tsx \
  docs/hyperframes/spike-phase0/e2e/render-sample.mts out-hyperframes.mp4
# so sánh: cùng lệnh với RENDER_ENGINE=remotion (lần đầu Remotion tải Chrome Headless Shell ~190 MB), rồi
#   ffmpeg -i out-remotion.mp4 -i out-hyperframes.mp4 -lavfi "psnr;ssim" -f null -
# Chạy từng render một: chạy song song trên máy ít RAM, compositor của Remotion đã hết bộ nhớ (exit 3221226505).
```

`ci.env` chỉ chứa **giá trị placeholder giống CI** (`.github/workflows/ci.yml`), không có secret thật.

Export end-to-end như CI (Postgres + SeaweedFS trong Docker). `local.env` dùng cổng **55432/18333** để không đụng các dịch vụ khác đang chạy trên máy; `ci.env` dùng 5432/8333 như CI:

```bash
docker run -d --name rp-pg -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=reelpilot -p 55432:5432 postgres:17
# Git Bash trên Windows: đặt MSYS_NO_PATHCONV=1 và dùng $(cygpath -w "$PWD/.github/s3-ci.json")
docker run -d --name rp-s3 -p 18333:8333 -v "$PWD/.github/s3-ci.json:/etc/seaweedfs/s3.json:ro" \
  chrislusf/seaweedfs:4.47 server -dir=/data -s3 -s3.port=8333 -s3.config=/etc/seaweedfs/s3.json
set -a; source docs/hyperframes/spike-phase0/e2e/local.env; set +a
npm run storage:cors -- --create-bucket
npx prisma migrate deploy
npx vitest run src/features/exports/__tests__/render-export.test.ts --hookTimeout=180000 --testTimeout=600000
```

Đã chạy trên máy dev ngày 16/10/2026: **2/2 đạt**. Lần đầu có thể timeout ở `beforeAll` (20s mặc định) vì bước transform chậm, nên phải tăng `--hookTimeout`.
Playwright export qua giao diện (dùng chung Postgres + SeaweedFS ở trên):

```bash
set -a; source docs/hyperframes/spike-phase0/e2e/local.env; set +a   # E2E_PORT=3200
npm run storage:cors -- --create-bucket                              # thêm CORS cho localhost:3200
npx playwright install chromium
npx playwright test tests/e2e/exports.spec.ts --project=desktop      # tự build app, chạy server + worker
```

`npx vitest run` (toàn bộ) **không nạp env** thì có 2 file lỗi sẵn từ trước (`describe-moment`, `graphics`: thiếu biến môi trường). Nạp `local.env` như trên thì hết.

## 5. Vấn đề đã biết / chỗ dễ kẹt

1. **Lỗi `currentTime` non-finite**: khi chưa biết `video.duration` (NaN), không được kẹp theo duration. Đã xử lý trong `targetTime`. **Seek không thành công thì render phải fail**: `seekToFrame` thử lại tối đa 30 giây (không gán lại `currentTime` khi đang seek, vì làm vậy sẽ khởi động lại lượt tải), sau đó ném lỗi ra cấp trang để HyperFrames dừng hẳn.
2. **Font 404**: font của `@fontsource` phải dùng URL tính từ gốc (`publicPath: "/assets"` trong esbuild), vì runtime nạp font tính từ trang.
3. **Runtime HyperFrames tự đồng bộ mọi `<video>` nằm trong composition root** theo đồng hồ của composition (hàm chọn: có `data-start` **hoặc** nằm trong `[data-composition-id]`). Vì vậy `#render-stage` (React) được **đặt bên cạnh `#root`, không nằm trong nó** (`render-process-hyperframes.ts`, hàm `page()`). Nếu đặt vào trong, runtime và shim giằng co nhau: frame sai lẻ tẻ (PSNR khoảng 9 dB), video hiện ở thời điểm toàn cục thay vì thời điểm của clip (`spike-phase0/e2e/results/compare-clip2.png`). Shim vẫn seek lại mọi video ở mỗi `hf-seek` để phòng hờ.
3b. **Nguồn media phải hỗ trợ HTTP Range** (S3, R2, GCS, SeaweedFS đều có). Với server không có Range, Chrome không seek được vào phần chưa tải: render **fail có báo lỗi** (kẹt ở frame 0), không xuất frame sai. Server thử nghiệm có Range: `spike-phase0/e2e/serve.mjs`.
4. **Thỉnh thoảng gặp `media_readiness_timeout` (45s)**: 1/6 lượt khi render ở chế độ phần mềm. HyperFrames tự chụp lại các frame thiếu, kết quả vẫn đúng nhưng chậm (5 phút). Cần giám sát khi chạy production.
5. **Bebas Neue không có glyph tiếng Việt** ("ớ" rơi về font dự phòng). Chọn font brand kit có subset `vietnamese`.
6. **Windows**: `core.autocrlf=true` làm `prettier --check` báo 305 file. Đây là lỗi kết thúc dòng, không phải lỗi code; chạy prettier trên Linux/CI hoặc đặt `core.autocrlf=input`.
7. **Mạng máy dev cũ**: npm registry đi qua `http://`, `NODE_TLS_REJECT_UNAUTHORIZED=0`. `npm ci` có lúc lỗi mạng giữa chừng; chạy lại với `--fetch-retries=6`.
8. Chrome cho HyperFrames nằm ở cache của Puppeteer (`~/.cache/puppeteer`) và được tải bằng `npx hyperframes browser ensure` (CI đã có bước này). **Repo chưa có Dockerfile cho worker** (build plan để deploy ở mục Later). Khi viết, image cần: `npx hyperframes browser ensure` lúc build, thư viện hệ thống cho Chrome (`npx playwright install-deps chromium` hoặc tương đương), `HYPERFRAMES_NO_TELEMETRY=1`, `HYPERFRAMES_NO_UPDATE_CHECK=1`, và nguồn media có HTTP Range.
9. Docker Desktop có thể treo (`docker info` không trả lời) và nút restart trong giao diện cũng có thể treo theo. Cách đã dùng: dừng hẳn các tiến trình `Docker Desktop`/`com.docker.backend` rồi mở lại. Việc này khởi động lại **mọi** container trên máy.
10. **Cổng 3100 có thể bị dự án khác chiếm** (trên máy dev: `auth-platform-auth-server-1`). Playwright đặt `reuseExistingServer` khi không chạy CI nên sẽ dùng nhầm server đó, và mọi trang trả "404 Not Found" trơn. Dùng `E2E_PORT` (đã thêm vào `playwright.config.ts`); `local.env` đặt `E2E_PORT=3200` cùng `BETTER_AUTH_URL`/`NEXT_PUBLIC_APP_URL` cổng 3200, rồi chạy lại `npm run storage:cors` để thêm CORS cho origin mới.

11. **Lỗi chập chờn khi máy quá tải** (19/10): khi chạy cả bộ vitest kèm 2 test render song song, `hyperframes-seek` đã fail **1 lần** (frame 3 không thấy footage; lượt đó mất 333 giây so với bình thường 40–90 giây). 6 lượt song song sau đó đều đạt. Production chạy **1 render mỗi lần** (`renderExportJob`), nên ít gặp hơn. Nếu gặp lại: test in danh sách frame sai và giữ video ở `%TEMP%/reelpilot-seek-failure-*.mp4`.
    - Đã thử chờ `requestVideoFrameCallback` sau mỗi lần seek, nhưng callback này **không chạy trong chế độ chụp của HyperFrames**: mỗi frame mất thêm 1 giây timeout, render chậm gấp 4 lần và các test export bị timeout. **Đừng dùng lại cách này.**

12. **HyperFrames chỉ tự tải audio qua HTTPS** ("Only HTTPS URLs are permitted in compositions"). `render-process-hyperframes.ts` tự tải từng dòng thoại vào thư mục project trước khi render, nên chạy được cả với SeaweedFS (HTTP) ở local.
13. **`prisma migrate dev` treo khi chạy không có terminal** (chờ nhập liệu) và để lại tiến trình giữ advisory lock. Dùng `npx prisma migrate dev --create-only --name <tên> < /dev/null` rồi `npx prisma migrate deploy`.
14. **Đừng chạy build Docker cùng lúc với bộ test lớn** trên máy dev: lần 19/10 làm Chrome báo `ERR_INSUFFICIENT_RESOURCES`, worker Playwright tự thoát, và Docker Desktop sập.
15. Bật giọng đọc ở local/CI: `VOICE_PROVIDER=test` (đã có trong `ci.env`, `local.env`, `ci.yml`). Đây là **tiếng bíp thay cho giọng nói**, chỉ dùng để phát triển. Production cần `VOICE_PROVIDER=openai|elevenlabs` + `VOICE_MODEL` + `VOICE_ID` + key (Q5 trong V3).

## 6. Quyết định còn mở (cần chủ dự án)

- **License mã ReelPilot**: repo gốc `aalleejustadev/ReelPilot` **không có file LICENSE**. Mặc định mọi quyền thuộc tác giả. Cần xin phép trước khi phân phối công khai, hoặc để repo `videoeditor` ở chế độ private.
- **License Remotion**: nếu công ty thuộc diện miễn phí (≤ 3 người) thì lý do chuyển engine chủ yếu là định hướng dài hạn. Cần xác nhận lại trên remotion.pro.
- D1–D4 trong `ke-hoach-trien-khai-v2.md` mục 3. D1 (nguồn dữ liệu gốc) coi như đã có đáp án: `src/shared/motion`.

## 7. Bước tiếp theo

Theo **`ke-hoach-v3.md`** mục 5 (lộ trình M6–M11) và mục 8 (việc ngay tiếp theo). Playwright bản mobile và GitHub Actions: chủ dự án tạm gác lại (19/10/2026).

## 8. Bản đồ tài liệu

| File | Nội dung |
| :--- | :--- |
| `README.md` | (file này) trạng thái + làm tiếp |
| `ke-hoach-v3.md` | **kế hoạch hiện hành**: mục tiêu, quyết định cần chốt, KPI, milestone M6–M11, rủi ro |
| `ke-hoach-trien-khai-v2.md` | kế hoạch v2 (đã được thay bằng V3; giữ để tham khảo) |
| `so-sanh-remotion-hyperframes.md` | so sánh Remotion và HyperFrames, đã đối chiếu docs ngày 16/10/2026 |
| `bao-cao-giai-doan-0.md` | số đo spike, phát hiện kỹ thuật, kết quả bridge |
| `spike-phase0/` | mã spike: 3 composition mẫu, `bench.sh`, `reelpilot-bridge/` (shim gốc, mã vạch, verify), `e2e/render-sample.mts`, kết quả và ảnh frame |

### Sinh lại asset của spike

```bash
cd docs/hyperframes/spike-phase0
npm install && source env.sh          # hyperframes@0.8.164, ffmpeg-static, gsap, lottie-web, three
for p in captions-karaoke lottie-overlay three-bg; do mkdir -p $p/assets; cp node_modules/gsap/dist/gsap.min.js $p/assets/; done
cp node_modules/lottie-web/build/player/lottie.min.js lottie-overlay/assets/
cp node_modules/three/build/three.module.min.js node_modules/three/build/three.core.min.js three-bg/assets/
ffmpeg -y -f lavfi -i "testsrc2=size=1080x1920:rate=30" -t 10 -c:v libx264 -preset veryfast -pix_fmt yuv420p -g 30 captions-karaoke/assets/aroll.mp4
ffmpeg -y -f lavfi -i "sine=frequency=220:duration=10:sample_rate=48000" -af "volume=0.3" captions-karaoke/assets/voice.wav
# Footage mã vạch (đã có sẵn trong repo; lệnh tạo lại):
(cd reelpilot-bridge/fixtures && ffmpeg -y -f lavfi -i "color=c=0x1e293b:s=1920x1080:r=30:d=12" -filter_complex_script footage.filter   -map "[v]" -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -g 60 -keyint_min 60 -sc_threshold 0 -an footage.mp4)
```
`footage.filter` dùng font `C:/Windows/Fonts/arialbd.ttf`; trên Linux đổi sang đường dẫn một file `.ttf` có sẵn.

Các file spike không đưa vào repo vì sinh lại được: thư viện chép từ npm (`assets/gsap.min.js`, `lottie.min.js`, `three*.min.js`), `captions-karaoke/assets/aroll.mp4`, `voice.wav`, MP4 render và log. Lệnh sinh lại nằm trong `bao-cao-giai-doan-0.md` và `spike-phase0/reelpilot-bridge/README.md`.
