# BÁO CÁO GIAI ĐOẠN 0 — THỬ NGHIỆM HYPERFRAMES CHO REELPILOT

> **Ngày:** 16/10/2026 · **Phiên bản:** `hyperframes@0.8.164` (ghim chính xác)  
> **Phạm vi:** 3 composition mẫu 1080×1920, 30fps, 10 giây (300 frame): phụ đề karaoke, Lottie, Three.js. Chạy `check`, `render` và đo thời gian.  
> **Chưa nằm trong phạm vi lần này:** transcribe tiếng Việt (máy chưa có `whisper-cpp`), render Docker hoặc cloud, `@hyperframes/sdk` (D1).

---

## 1. KẾT LUẬN NHANH

- ✅ **Go về mặt kỹ thuật:** cả 3 composition (phụ đề karaoke trên a-roll + audio, 3 Lottie overlay, nền Three.js) đều qua `hyperframes check` và render ra MP4 1080×1920 đúng nội dung (đã kiểm tra frame bằng mắt).
- ⏱️ **Tốc độ:** trung vị **18–23 giây cho 10 giây video** (**khoảng 2× chậm hơn thời gian thực**) trên desktop 12 luồng với 5 worker. Chưa đạt KPI "≤ 1×" trong kế hoạch. Cần đo lại trên Linux/Docker, nơi có thể bật fast capture.
- 🎯 **Tất định:** 0/300 frame khác nhau giữa 2 lần render độc lập, ở cả 3 composition (so md5 từng frame).
- 🖥️ **Không có GPU vẫn ổn với cảnh nhẹ:** `--no-browser-gpu` chỉ chậm hơn khoảng 12% với Three.js và không chậm hơn với phụ đề. Rủi ro "WebGL chậm trên VPS" nhỏ hơn dự kiến, nhưng **chưa thử cảnh nặng** (nhiều blur, model glTF lớn).
- 🐛 **2 lỗi thiết kế được phát hiện và sửa** (Lottie phải là sub-composition; phụ đề cần margin), xem mục 5.
- ⚠️ **Phát hiện lớn nhất không đến từ benchmark:** repo ReelPilot thật (`aalleejustadev/ReelPilot`) là **editor biến quay màn hình thành video quảng cáo**, đã có mô hình dữ liệu thuần (`src/shared/motion`). Kế hoạch v2 cần điều chỉnh, xem mục 7.

---

## 2. MÔI TRƯỜNG ĐO

| Thành phần | Giá trị |
| :--- | :--- |
| CPU | Intel Core i5-12400 (12 luồng) |
| RAM | 31,8 GB (khoảng 6,3 GB còn trống lúc đo) |
| GPU | Intel UHD Graphics 730 (iGPU), Chrome dùng ANGLE/D3D11 |
| OS | Windows 11 Pro |
| Node.js | v24.12.0 |
| Chrome | `chrome-headless-shell` 150.0.7871.24 (cache của Puppeteer) |
| FFmpeg | 6.1.1 qua `ffmpeg-static` (cục bộ trong thư mục spike, không cài vào hệ thống) |
| FFprobe | 4.0.2 qua `ffprobe-static` (bản cũ, chưa thấy ảnh hưởng) |
| Số worker | auto, HyperFrames tự chọn 5 Chrome worker |
| Chất lượng | mặc định `looks` (CRF 16), MP4 H.264 |

> ⚠️ Đây là **máy desktop có iGPU**, không phải VPS. Chế độ `--no-browser-gpu` dùng để mô phỏng máy chủ không có GPU, nhưng CPU, ổ đĩa và RAM vẫn khác một VPS thật.

---

## 3. KẾT QUẢ ĐO THỜI GIAN RENDER

Mỗi composition render 3 lần, cùng cấu hình (`--quality looks`, auto = 5 worker). Thời gian là con số HyperFrames tự báo cáo.

| Composition | Chế độ | Lần 1 | Lần 2 | Lần 3 | **Trung vị** | Hệ số so với thời lượng | Capture (trung vị) |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| Phụ đề karaoke (a-roll + audio) | GPU | 39,0s | 22,7s | 22,9s | **22,9s** | 2,3× | 15,4s |
| Lottie × 3 | GPU | 18,7s | 47,4s* | 18,2s | **18,7s** | 1,9× | 11,5s |
| Three.js | GPU | 50,9s* | 18,2s | 19,6s | **19,6s** | 2,0× | 12,0s |
| Phụ đề karaoke | không GPU | 31,1s | 19,7s | 19,7s | **19,7s** | 2,0× | 13,5s |
| Three.js | không GPU | 22,0s | 21,2s | 33,9s* | **22,0s** | 2,2× | 15,1s |

\* Lượt bất thường (chậm gấp 2–2,5×). Máy chỉ còn khoảng 6 GB RAM trống và có ứng dụng khác chạy, nên **độ dao động lớn**. Lần render đầu tiên trong ngày (trước benchmark) còn chậm hơn: phụ đề 100,7s, Lottie 46,8s, do phải tải font và khởi động cache.

**Phân rã thời gian:** bước **capture chiếm khoảng 60–70%**, encode khoảng 3–4s, compile/setup khoảng 3s. Muốn nhanh hơn thì phải tối ưu capture: fast capture, nhiều worker hơn, hoặc render phân tán.

**Ngoại suy thô (cần kiểm chứng):** video 60 giây sẽ mất khoảng 2 phút trên một máy tương đương. Khớp với KPI "time-to-publish < 5 phút" nếu không phải xếp hàng chờ.

---

## 4. KIỂM TRA CHẤT LƯỢNG & TÍNH TẤT ĐỊNH

| Kiểm tra | Kết quả |
| :--- | :--- |
| `hyperframes check` (lint, runtime, layout, motion, contrast) | 3/3 qua, 0 lỗi, 0 cảnh báo (sau khi sửa) |
| Định dạng đầu ra | H.264 1080×1920, 30fps, đúng 300 frame / 10,000s. Phụ đề có AAC 48 kHz |
| Tất định (md5 từng frame, lượt 1 so với lượt 2) | Phụ đề **0/300**, Lottie **0/300**, Three.js **0/300** frame khác nhau |
| Kiểm tra bằng mắt (`frames/*-sheet.png`) | Highlight từng từ đúng thời điểm. Tiếng Việt có dấu đúng. 3 Lottie độc lập. Khối 3D xoay mượt theo thời gian |
| Chưa kiểm tra | Đồng bộ môi/tiếng trên footage thật, footage nặng hoặc dài, font thương hiệu, render trong Docker/Linux |

---

## 5. PHÁT HIỆN KỸ THUẬT (QUAN TRỌNG CHO COMPILER)

| # | Phát hiện | Hệ quả / cách xử lý |
| :-: | :--- | :--- |
| 1 | **Lottie được seek theo `[data-composition-id]` gần nhất, không theo clip.** Ban đầu đặt 3 instance Lottie trong clip thường (`data-start` 1 / 3,5 / 6 giây) thì instance 2 và 3 đã chạy hết khi xuất hiện, đứng ở frame cuối. Lint có cảnh báo trước (`nested_structure_needs_subcomposition`). | Compiler phải sinh **mỗi clip Lottie thành một sub-composition** (inline `data-composition-id` + `data-width`/`data-height` + timeline rỗng dài bằng clip). Đã sửa và kiểm chứng trên frame. |
| 2 | **Phụ đề: từ đang đọc phóng to 1,15× lấn mất khoảng trắng** ("BẠNĐẾN", "ĐÚNGCHUẨNTIKTOK"). | Dùng `margin: 0 0.12em` cho `.word`. Đã sửa. Nên có test golden-frame cho mỗi preset phụ đề. |
| 3 | **Three.js:** runtime phát `CustomEvent("hf-seek")` trên `window` với `detail.time`, đặt `window.__hfThreeTime`, và chờ `window.THREE.DefaultLoadingManager`. | Scene viết dạng `renderAt(t)` thuần, lắng nghe `hf-seek`. Khi dùng ES module (three r180 không còn bản UMD) phải gán `window.THREE = THREE`. Root bắt buộc có `data-duration`. |
| 4 | **Font:** compiler tự tải font Inter/Roboto từ Google Fonts và chèn `@font-face` để kết quả tất định. Tiếng Việt có dấu hiển thị đúng. | Production phải cache hoặc tự host font (máy render không nên ra Internet). Cần chọn bộ font thương hiệu có đủ dấu tiếng Việt. |
| 5 | **Capture mode = `screenshot`.** Chế độ `--experimental-fast-capture` (nhanh khoảng 2× theo docs) không bật được trên máy này. | Đo lại trên Linux/Docker. Đây có thể là chênh lệch lớn về chi phí. |
| 6 | Phụ đề + video a-roll là composition **chậm nhất**, chủ yếu ở bước capture. | Kiểm tra lại với footage thật. Thử bỏ `-webkit-text-stroke`/`text-shadow` hoặc dùng `--quality draft` cho bản preview. |
| 7 | `check` (lint + runtime + layout + motion + contrast) bắt được cả lỗi cấu trúc lẫn lỗi bố cục (canvas chạm mép). | Đưa `hyperframes check` vào CI và vào bước kiểm tra trước khi render HTML do AI sinh ra. |

---

## 6. QUAN SÁT VỀ BẢO MẬT & VẬN HÀNH

- **Telemetry bật mặc định** (ẩn danh, theo thông báo của CLI). Trên máy chủ production nên chạy `hyperframes telemetry disable`. Lần thử này mình không tắt vì đó là cấu hình toàn cục của máy.
- **Máy dev đang đặt `NODE_TLS_REJECT_UNAUTHORIZED=0`** và npm báo đang kết nối registry qua **HTTP thường**. Cả hai làm tăng rủi ro tấn công chuỗi cung ứng khi cài package. Nên sửa cấu hình proxy/CA của công ty thay vì tắt kiểm tra TLS.
- `init` mặc định tự cài AI skill vào cấu hình agent. Lần này mình đã chặn bằng `HYPERFRAMES_SKIP_SKILLS=1`.
- Thư viện (gsap, lottie-web, three) được chép vào `assets/` từ npm thay vì tải từ CDN lúc render. Đây cũng là cách nên dùng cho production (không fetch giữa chừng, dễ chặn network).

---

## 7. ĐỐI CHIẾU VỚI QUYẾT ĐỊNH TRONG KẾ HOẠCH

### 7.1. Repo ReelPilot thật đã có sẵn editor, nên **tận dụng, không xây lại**

Đọc mã `aalleejustadev/ReelPilot` (commit `09b152b`, 28/09/2026):

| Thành phần | Hiện trạng | Phụ thuộc Remotion? |
| :--- | :--- | :--- |
| Mô hình dữ liệu `src/shared/motion` (camera, shot, cắt/tốc độ/chuyển cảnh, text, graphics, lens) — khoảng 2.000 dòng | Thuần TypeScript + zod, đã là "nguồn dữ liệu gốc" | **Không** |
| Editor UI `src/features/footage` + `projects` (timeline đa track, inspector, AI director, phân tích footage) — khoảng 14.000 dòng | Hoàn chỉnh V1 | Chỉ 4 file dùng `@remotion/player` |
| Compositions `src/remotion` (FootageStage, ProjectStage, Graphics, TextLayer, Layouts) — khoảng 3.500 dòng | Component React, chỉ dùng `useCurrentFrame`, `AbsoluteFill`, `delayRender` | **Có**, đây là phần cần thay |
| Export (`pg-boss` worker + `@remotion/renderer`, tự host trên VPS) | Chạy được, không dùng Lambda | 1 file `render-process.ts` |

**Hệ quả với kế hoạch v2:**
1. **D1 gần như đã có đáp án:** `src/shared/motion` chính là "UTS". Không cần thiết kế schema mới ở mục 7 của kế hoạch, chỉ cần mở rộng schema hiện có.
2. **Phạm vi migrate thu nhỏ còn khoảng 3.500 dòng** (lớp `src/remotion`) + 4 điểm gắn Player + 1 file render, không phải "xây lại editor".
3. **Lý do "thay Remotion Lambda đắt tiền" không đúng:** ReelPilot đã render tự host. Lý do còn lại để chuyển là **license Remotion** (repo vẫn để `TODO(owner)`) và lợi thế với AI agent.
4. **Định vị sản phẩm khác giả định:** video quảng cáo từ quay màn hình. Footage bị bỏ tiếng; voiceover, phụ đề và nhạc đang nằm trong mục "Later". Backlog giá trị ở kế hoạch v2 (cắt khoảng lặng, talking-head) cần viết lại theo đúng sản phẩm này.

### 7.2. Câu hỏi kỹ thuật cần thử nghiệm tiếp
- **Cầu nối React → HyperFrames:** giữ nguyên component trong `src/remotion`, thay `useCurrentFrame()` bằng một context lấy thời gian từ sự kiện `hf-seek` (render đồng bộ bằng `flushSync`), bundle thành 1 trang HTML. Nếu được, có thể migrate mà gần như không viết lại hiệu ứng.
- **Video footage do React tạo động:** HyperFrames trích frame video lúc compile từ `<video data-start>` có sẵn trong HTML. Cần kiểm tra xem video do React gắn vào lúc chạy có được nhận diện và seek chính xác không. Đây là rủi ro lớn nhất.
- **Hiệu năng CSS 3D + blur:** FootageStage dùng perspective, `rotateX/Y`, motion blur bằng SVG, depth of field. Performance guide của HyperFrames cảnh báo blur rất tốn. Cần đo trên footage thật.

---

## 8. THỬ NGHIỆM CẦU NỐI: RENDER FOOTAGESTAGE CỦA REELPILOT QUA HYPERFRAMES

> Thư mục `docs/hyperframes/spike-phase0/reelpilot-bridge/` (xem README trong đó). Spike chạy trên mã ReelPilot commit `09b152b` **không sửa dòng nào**; bản tích hợp vào repo nằm ở `src/remotion/hyperframes/` và `src/shared/render/render-process-hyperframes.ts`.

### 8.1. Cách làm
- Khi bundle bằng esbuild, alias `remotion` → `reelpilot-bridge/src/remotion-shim.tsx`. Shim viết lại đúng **8 API** mà các composition dùng: `AbsoluteFill`, `Sequence` (`from`/`durationInFrames`/`premountFor`/`layout`), `useCurrentFrame`, `useVideoConfig`, `OffthreadVideo` (`trimBefore`/`playbackRate`), `Img`, `delayRender`, `continueRender`.
- `entry.tsx` mount `ProjectStage` (đúng composition mà worker export đang render), lắng nghe `hf-seek` → `flushSync` render frame đó → `waitUntil` cho tới khi mọi `<video>` hiện đúng frame nguồn.
- **Đáp án đúng lấy từ chính code ReelPilot** (`outputLayout`, `projectDurationMs`). Footage kiểm thử in **mã vạch 9 bit** số frame; `verify.mjs` giải mã cả 195 frame đầu ra và so từng frame.

### 8.2. Kết quả

| Kiểm tra | Kết quả |
| :--- | :--- |
| Bundle mã ReelPilot không sửa | ✅ chỉ cần alias, không thiếu API nào |
| `hyperframes check` | ✅ 0 lỗi, 0 cảnh báo (cả 2 fixture) |
| **Seek footage chính xác** (giữ 0–3 giây ở 1×, cắt 3–5 giây, 5–12 giây ở 2×; GOP 60) | Lần đầu **194/195**, sai đúng frame tại điểm cắt. Sau khi sửa: **6/6 lượt × 195/195 frame chính xác** (4 GPU + 2 phần mềm) |
| Hiệu ứng (intro rise 3D, 2 camera shot tilt/turn/zoom + drift, push transition sang đoạn 1,5×, headline tiếng Việt có từ nhấn mạnh) | ✅ hiển thị đúng khi kiểm tra frame bằng mắt |
| **Tất định** (fixture chuyển động, 2 lượt) | Trước khi sửa 116/265 frame lệch (PSNR ≥ 53,6 dB); **sau khi sửa: 0/265, PSNR = ∞** |
| Thời gian render | Fixture cắt (6,5 giây video): 18–29 giây. Fixture chuyển động (8,8 giây): khoảng 24,5 giây. Tức **khoảng 3× thời lượng video** |
| Bất thường | 1/6 lượt (chế độ phần mềm) gặp `media_readiness_timeout` 45 giây. HyperFrames tự chạy lại 39 frame, **kết quả vẫn đúng** nhưng mất 5 phút 12 giây |

### 8.3. Lỗi đã gặp và cách sửa (quan trọng)
**Hai bên cùng điều khiển một thẻ `<video>`.** Runtime HyperFrames theo dõi mọi `video, audio` được thêm vào DOM (`MutationObserver`) và có thể đổi `currentTime`. Video của đoạn đã premount sẵn ở frame 150 bị runtime kéo về thời gian composition (frame 90). Khi đoạn đó bắt đầu hiện, shim thấy frame đích "không đổi" nên không seek lại. Cách sửa trong shim:
1. Ở **mọi** `hf-seek`, kiểm tra lại toàn bộ video đang mount (`reassertVideos`).
2. Sau `seeked` thì kiểm tra `currentTime` có đúng không, sai thì seek lại (tối đa 4 lần).
3. Trước khi cho chụp, rà lại thêm một lượt (`videosSettled`).
4. Seek vào **giữa frame** (`(n + 0,5) / 30`) để tránh rơi vào frame trước.

Lỗi này cũng là nguyên nhân của chuyện "không tất định" ở fixture chuyển động. Sau khi sửa thì cả hai đều hết.

### 8.4. Kết luận cho kế hoạch
- ✅ **Hướng "giữ nguyên composition React, chỉ thay engine" là khả thi.** Có thể bỏ `@remotion/renderer` ở phía export mà gần như không viết lại hiệu ứng: khoảng 280 dòng shim + 80 dòng entry thay cho việc viết lại khoảng 3.500 dòng `src/remotion`.
- ⚠️ **Shim trở thành mã tự bảo trì**, phải bám theo đúng hành vi của Remotion (premount, `Sequence` lồng nhau…). Cần bộ test mã vạch này trong CI.
- 🔜 **Chưa làm:** project nhiều clip, magnifier, logo `Img`, font của brand kit (`@fontsource`), thay `@remotion/player` trong editor bằng `<hyperframes-player>`, render trong Docker/Linux, so sánh pixel với bản Remotion hiện tại.

---

## 9. CÁCH CHẠY LẠI

```bash
cd docs/hyperframes/spike-phase0
npm install
source env.sh                          # đưa ffmpeg/ffprobe cục bộ vào PATH
(cd captions-karaoke && node build.mjs) # transcript.json -> index.html
(cd three-bg && hyperframes check)
bash bench.sh 3                         # render 3 lần mỗi composition, kết quả trong results/
```

Cấu trúc thư mục:

| Đường dẫn | Nội dung |
| :--- | :--- |
| `captions-karaoke/` | `transcript.json` + `build.mjs` (mini compiler) → `index.html`; a-roll và audio tổng hợp bằng FFmpeg |
| `lottie-overlay/` | 3 instance Lottie là sub-composition; `assets/burst-anim.js` là Lottie JSON viết tay |
| `three-bg/` | Scene Three.js r180 (ES module), lắng nghe `hf-seek` |
| `renders/` | MP4 kết quả (thư mục `renders/bench/` chứa các lần chạy benchmark) |
| `results/` | `bench.csv`, `determinism.txt`, md5 từng frame |
| `frames/` | Contact sheet dùng để kiểm tra bằng mắt |
