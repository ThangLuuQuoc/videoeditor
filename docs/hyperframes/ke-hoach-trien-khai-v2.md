# KẾ HOẠCH CHI TIẾT: CHUYỂN REELPILOT SANG HYPERFRAMES & NÂNG GIÁ TRỊ SẢN PHẨM

> **Dự án:** ReelPilot (AI Video Editor / Automation cho video ngắn)  
> **Phiên bản kế hoạch:** v2 — cập nhật 16/10/2026  
> **Mục tiêu:** Chuyển sang kiến trúc Video-as-Code mã nguồn mở (Apache 2.0) với **HyperFrames**, **tận dụng tối đa các adapter và hạ tầng render có sẵn** thay vì tự viết lại, và dồn nguồn lực vào các tính năng tạo ra giá trị cho người dùng.  
> **Địa điểm lưu trữ:** `docs/hyperframes/ke-hoach-trien-khai-v2.md`  
> ⚠️ **Một phần đã lỗi thời** sau khi đọc mã ReelPilot thật (16/10/2026): xem `README.md` (trạng thái hiện tại) và `bao-cao-giai-doan-0.md` mục 7–8. Viết lại thành v3 là việc còn mở.

### Thay đổi so với v1

| Hạng mục | v1 | v2 |
| :--- | :--- | :--- |
| Lottie / Three.js | Tự viết hook `window.__seekFrame`, `window.__render3DFrame` (các clip ghi đè lẫn nhau) | Dùng frame adapter có sẵn trong runtime HyperFrames |
| Skia (`canvaskit-wasm`) | Module riêng | **Bỏ**: không có adapter sẵn, nặng, giá trị thấp với video ngắn |
| Render cloud | Tự dựng Docker + BullMQ từ đầu | Thử `@hyperframes/aws-lambda` / `@hyperframes/gcp-cloud-run` trước, tự dựng chỉ khi cần |
| Phụ đề | Tự gọi Whisper | Dùng `npx hyperframes transcribe` (Parakeet, dự phòng Whisper) + bước hậu kiểm cho tiếng Việt |
| Schema | Trộn frame và giây, thiếu audio/video/text | Một đơn vị thời gian (ms), có danh mục asset, transcript tách riêng, versioning |
| Lộ trình | 10 tuần, test dồn cuối, không có MVP | Tuần 0–1 thử nghiệm nhanh có go/no-go, **MVP ở tuần 5**, test liên tục |
| Sản phẩm | Không có | Thêm mục tiêu người dùng, KPI và backlog tính năng ưu tiên |

---

## 1. MỤC TIÊU SẢN PHẨM & KPI

### 1.1. Người dùng mục tiêu *(giả định, cần xác nhận bằng phỏng vấn hoặc dữ liệu hiện có)*

| Nhóm | Nhu cầu chính | Sẵn sàng trả tiền vì |
| :--- | :--- | :--- |
| Creator / KOL | Đăng đều đặn lên TikTok, Reels, Shorts | Tiết kiệm thời gian dựng, phụ đề đẹp, cắt clip từ video dài |
| Agency / team marketing | Sản xuất nhiều video cho nhiều khách hàng | Brand kit, template, tạo hàng loạt |
| Shop online / SME | Video sản phẩm, quảng cáo | Tạo video từ ảnh/catalog, nhiều phiên bản quảng cáo |

### 1.2. Lời hứa giá trị
> *"Từ video thô hoặc ý tưởng đến reel sẵn sàng đăng trong vài phút, phụ đề tiếng Việt chuẩn, đúng nhận diện thương hiệu."*

Công nghệ (HyperFrames, adapter, cluster) chỉ là phương tiện. Mỗi giai đoạn trong lộ trình phải gắn với ít nhất một KPI dưới đây.

### 1.3. KPI

| KPI | Định nghĩa | Mục tiêu MVP *(đề xuất, cần chốt)* |
| :--- | :--- | :--- |
| **Time-to-publish** | Thời gian từ lúc upload/nhập prompt đến khi có MP4 cuối | < 5 phút với video 60 giây |
| **Thời gian render** | Thời gian render ÷ thời lượng video (1080×1920, 30fps) | ≤ 1× trên cloud |
| **Chi phí render / video** | Chi phí hạ tầng cho một video 60 giây | Đo ở tuần 0–1, đặt ngưỡng sau |
| **Tỷ lệ AI edit thành công** | % lệnh chỉnh sửa bằng chat được áp dụng đúng, không phải sửa tay | ≥ 85% |
| **Độ chính xác phụ đề tiếng Việt** | Tỷ lệ lỗi từ (WER) sau bước hậu kiểm | ≤ 8% |
| **Tỷ lệ render lỗi** | % job render thất bại hoặc phải chạy lại | < 1% |
| **Người dùng quay lại** | % người dùng xuất video ≥ 2 lần trong 7 ngày | Đặt ngưỡng sau khi có dữ liệu beta |

---

## 2. ĐỒNG BỘ THUẬT NGỮ & KHÁI NIỆM

1. **Composition (HyperFrames):** File HTML có phần tử gốc `data-composition-id`, `data-width`, `data-height`, `data-duration`. Mỗi clip có `id`, `class="clip"`, `data-start`, `data-duration` (đơn vị giây). Đây là định dạng mà player và renderer đọc trực tiếp.
2. **Universal Timeline Schema (UTS):** JSON mô tả dự án của ReelPilot (assets, tracks, clips, transcript, brand kit). Vai trò của UTS phụ thuộc vào **quyết định D1** (mục 3).
3. **Frame adapter (của HyperFrames):** Cơ chế runtime seek animation đến đúng frame N trước khi chụp. Runtime đã hỗ trợ sẵn **GSAP, CSS, Anime.js, Lottie, Three.js, Web Animations, TypeGPU**. Interface `FrameAdapter` trong `@hyperframes/core` (API v0, còn thử nghiệm) chỉ dùng khi cần tích hợp một runtime chưa có.
4. **Deterministic rendering:** `time = floor(frame) / fps`. Không dùng `Date.now()`, `requestAnimationFrame`, `Math.random()` không seed, không fetch giữa chừng. Mọi asset tải xong trước frame 0.
5. **Word-level transcript:** Danh sách từ kèm `startMs`/`endMs`, lưu **tách khỏi** phần style phụ đề, để có thể đổi giọng đọc hoặc đổi style mà không mất timing.
6. **Render path:** CLI → Producer → Engine (mức kiểm soát tăng dần). Nơi chạy: local/Docker, HyperFrames Cloud, AWS Lambda, Google Cloud Run.

---

## 3. QUYẾT ĐỊNH KIẾN TRÚC CẦN CHỐT (CUỐI TUẦN 1)

| ID | Câu hỏi | Phương án | Đề xuất |
| :--- | :--- | :--- | :--- |
| **D1** | Nguồn dữ liệu gốc (source of truth) của một dự án là gì? | **A.** UTS JSON là gốc, compiler sinh ra HTML composition.<br>**B.** HTML composition là gốc, UI và AI agent chỉnh qua `@hyperframes/sdk` (đã có JSON patch, undo/redo, adapter lưu trữ). Kèm theo một file manifest nhỏ chứa asset, transcript, brand kit. | **Nghiêng về B** nếu thử nghiệm cho thấy SDK đáp ứng đủ các thao tác của timeline. B giữ được lợi thế "agent-native", bỏ được cả lớp compiler, và không phải đồng bộ hai nguồn dữ liệu. Chọn A nếu cần chạy song song nhiều engine lâu dài hoặc SDK còn thiếu thao tác quan trọng. |
| **D2** | Render ở đâu? | Docker tự quản / AWS Lambda / Cloud Run / HyperFrames Cloud | Thử Cloud Run hoặc Lambda bằng package chính thức, so sánh chi phí với một VPS chạy `render --docker`. |
| **D3** | Có giữ `RemotionAdapter` không? | Giữ lâu dài / chỉ giữ trong giai đoạn chuyển đổi | **Chỉ giữ để so sánh chất lượng** trong lúc chuyển đổi, sau đó bỏ. Bảo trì hai engine tốn gấp đôi và đi ngược mục tiêu thoát license. |
| **D4** | Engine nhận dạng giọng nói cho tiếng Việt? | `hyperframes transcribe` (Whisper `large-v3`, `--language vi`) / WhisperX forced alignment / API bên ngoài | Đo WER và độ lệch timestamp trên 20 clip tiếng Việt thật rồi mới chọn. |

---

## 4. KIẾN TRÚC HỆ THỐNG MỤC TIÊU

```
┌────────────────────────────────────────────────────────────────────────┐
│                   REELPILOT FRONTEND (Next.js / React)                  │
│                                                                        │
│  ┌──────────────────────────┐       ┌───────────────────────────────┐  │
│  │  Chat-to-Edit AI Agent   │       │  Interactive Timeline UI      │  │
│  │  (trả về JSON Patch,     │       │  (Tracks, Layers, Inspector,  │  │
│  │   có diff + undo)        │       │   Brand Kit, Template)        │  │
│  └────────────┬─────────────┘       └──────────────┬────────────────┘  │
│               │                                    │                   │
│               ▼                                    ▼                   │
│      ┌──────────────────────────────────────────────────────────┐      │
│      │  Project state: HTML composition + manifest (D1 = B)      │      │
│      │  hoặc UTS JSON → compiler (D1 = A)                        │      │
│      │  Chỉnh sửa qua @hyperframes/sdk (patch / undo / redo)     │      │
│      └────────────────────────────┬─────────────────────────────┘      │
│                                   │                                    │
│      ┌────────────────────────────▼─────────────────────────────┐      │
│      │  <hyperframes-player srcdoc=...>  (preview, seek, events) │      │
│      └──────────────────────────────────────────────────────────┘      │
└───────────────────────────────────┼────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                   MEDIA INTELLIGENCE SERVICES (giá trị sản phẩm)        │
│  Transcribe (Parakeet/Whisper) + hậu kiểm tiếng Việt │ Cắt khoảng lặng   │
│  Tìm đoạn hay (highlight) │ Auto-reframe 9:16 │ Beat detection nhạc      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                   HYPERFRAMES RUNTIME (có sẵn, không tự viết)            │
│  Frame adapters: GSAP · CSS · Lottie · Three.js · WAAPI · Anime.js       │
│  @hyperframes/shader-transitions · hyperframes lint / check              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                       RENDER & EXECUTION (D2)                           │
│  @hyperframes/producer (backend Node) │ @hyperframes/aws-lambda          │
│  @hyperframes/gcp-cloud-run │ `render --docker` trên VPS                 │
│  Kết quả → S3 / R2 / GCS → Publish TikTok / YouTube / Facebook           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. LỘ TRÌNH TRIỂN KHAI (PHASED ROADMAP)

> Nguyên tắc: **test so sánh frame (golden-frame) chạy liên tục từ tuần 1**, không dồn đến cuối. Mỗi giai đoạn có tiêu chí hoàn thành đo được.

### Giai đoạn 0: Thử nghiệm nhanh & Go/No-go (Tuần 0 – 1)
- **Nhiệm vụ:**
  1. Dựng 3 composition mẫu dạng 1080×1920: (a) phụ đề karaoke trên video talking-head, (b) Lottie overlay, (c) nền Three.js. Dùng runtime có sẵn, **không viết adapter riêng**.
  2. Render bằng `npx hyperframes render --docker` trên một VPS **không có GPU**, sau đó thử Cloud Run hoặc Lambda. Ghi lại thời gian render, chi phí và mức RAM.
  3. Chạy `hyperframes transcribe` trên 20 clip tiếng Việt thật, đo WER và độ lệch timestamp (D4).
  4. Thử `@hyperframes/sdk` với 10 thao tác timeline phổ biến (đổi text, dời/cắt clip, đổi style, thêm/xóa clip, undo) để chốt D1.
  5. Render cùng một nội dung bằng Remotion hiện tại để có mốc so sánh chất lượng.
- **Sản phẩm bàn giao:** Báo cáo 1–2 trang có số liệu, quyết định D1–D4 được ghi lại (ADR).
- **Tiêu chí hoàn thành:** Có quyết định go/no-go. Nếu WebGL trên CPU quá chậm, đưa module 3D xuống backlog.

### Giai đoạn 1: Mô hình dữ liệu & Tách UI khỏi Remotion (Tuần 2 – 3)
- **Nhiệm vụ:**
  1. Định nghĩa schema (mục 7) bằng TypeScript + zod, có hàm `migrate(vN → vN+1)`.
  2. UI timeline chỉ thao tác trên project state (qua SDK nếu D1 = B, qua UTS nếu D1 = A). Không gọi trực tiếp `<Composition>` của Remotion.
  3. Bọc `<hyperframes-player>` thành component React `<ReelPlayer />`: truyền nội dung qua `srcdoc`; đồng bộ play/pause/`seek()` với timeline; khi Inspector thay đổi thì cập nhật lại `srcdoc` (có debounce).
  4. Dựng bộ test golden-frame: chụp một số frame cố định của mỗi template và so sánh pixel trong CI.
- **Sản phẩm bàn giao:** `types/project.ts`, `lib/project/migrate.ts`, `components/player/ReelPlayer.tsx`, file dự án `.reelpilot.json`.
- **Tiêu chí hoàn thành:** Mở, sửa và lưu được một dự án thật. Preview khớp với bản render ở các frame mẫu.

### Giai đoạn 2: MVP giá trị cốt lõi (Tuần 4 – 5)
- **Nhiệm vụ:**
  1. **Phụ đề tiếng Việt:** transcribe → hậu kiểm (từ điển tên riêng/thuật ngữ, sửa dấu, gộp âm tiết) → 5 preset style kiểu TikTok/Reels, tự nhấn mạnh từ khóa.
  2. **Tự cắt khoảng lặng & từ đệm** ("ờ", "à", "thì là") dựa trên transcript.
  3. **5 template** cho video ngắn (talking-head, list/top 5, review sản phẩm, quote, tin tức).
  4. **Chat-to-edit v1:** AI trả về JSON Patch, có kiểm tra schema, hiển thị diff trước khi áp dụng, undo một chạm.
- **Sản phẩm bàn giao:** Bản beta cho 10–20 người dùng thật.
- **Tiêu chí hoàn thành:** Đạt KPI time-to-publish và WER ở mục 1.3 với nhóm beta.

### Giai đoạn 3: Hạ tầng render production (Tuần 6 – 7)
- **Nhiệm vụ:**
  1. Triển khai render path đã chọn ở D2: `@hyperframes/aws-lambda` (Step Functions: plan → renderChunk → assemble, có ước tính chi phí qua SDK) hoặc `@hyperframes/gcp-cloud-run`. Chỉ tự dựng Docker + BullMQ trên VPS nếu số liệu chi phí ở giai đoạn 0 cho thấy rẻ hơn rõ rệt.
  2. Hàng đợi job phía backend: retry, hủy job, theo dõi tiến độ, webhook báo xong.
  3. **Cách ly bảo mật** cho HTML do AI/người dùng sinh ra: chặn network ra ngoài khi render, chỉ cho tải asset từ allowlist, container không có quyền, giới hạn CPU/RAM/thời gian.
  4. Giám sát: thời gian render, tỷ lệ lỗi, chi phí mỗi video.
- **Tiêu chí hoàn thành:** Tỷ lệ render lỗi < 1%, có dashboard chi phí.

### Giai đoạn 4: Mở rộng giá trị (Tuần 8+, ưu tiên theo dữ liệu beta)
- Cắt video dài thành nhiều short, auto-reframe 9:16, brand kit, tạo hàng loạt từ CSV, đăng trực tiếp lên nền tảng (xem mục 8).
- Lottie và Three.js được bật dần theo template, dùng runtime có sẵn.
- Ngừng `RemotionAdapter` sau khi test golden-frame đạt (D3).

---

## 6. TÍCH HỢP ĐỒ HỌA & PHỤ ĐỀ BẰNG RUNTIME CÓ SẴN

### 6.1. Phụ đề word-level (GSAP, một timeline cho mỗi composition)
Toàn bộ hiệu ứng của một composition đăng ký vào **một** timeline duy nhất trong `window.__timelines`, đặt theo `data-composition-id`. Nhờ vậy không có biến global nào bị ghi đè, khác với `window.__seekFrame` ở bản v1.

```html
<div id="stage" data-composition-id="reel-01" data-start="0"
     data-width="1080" data-height="1920" data-duration="12" data-fps="30">

  <video id="a-roll" class="clip" src="assets/interview.mp4"
         data-start="0" data-duration="12" data-track-index="0"></video>

  <div id="cap-001" class="clip caption-box"
       data-start="0.5" data-duration="1.6" data-track-index="10">
    <span class="word" id="w-001">Khám</span>
    <span class="word" id="w-002">phá</span>
    <span class="word" id="w-003">HyperFrames</span>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<script>
  // Sinh ra từ transcript: [{ id, startMs, endMs }]
  const words = [
    { id: "w-001", startMs: 500,  endMs: 900  },
    { id: "w-002", startMs: 900,  endMs: 1300 },
    { id: "w-003", startMs: 1300, endMs: 2100 },
  ];

  const tl = gsap.timeline({ paused: true });
  for (const w of words) {
    const t = w.startMs / 1000;
    const d = (w.endMs - w.startMs) / 1000;
    tl.to(`#${w.id}`, { color: "#FFE600", scale: 1.15, duration: 0.08 }, t)
      .to(`#${w.id}`, { color: "#FFFFFF", scale: 1.0,  duration: 0.08 }, t + d);
  }

  window.__timelines = window.__timelines || {};
  window.__timelines["reel-01"] = tl;
</script>
```

> **Bài học từ giai đoạn 0:** khi từ đang đọc phóng to 1,15×, nó lấn mất khoảng trắng giữa các từ ("BẠNĐẾN"). Template phải dùng `margin` cho `.word` thay vì dựa vào ký tự cách. Ngoài ra, tiếng Việt có dấu hiển thị đúng: compiler tự chèn `@font-face` (Inter/Roboto) để kết quả tất định. Nhưng bước này **tải font từ Google Fonts** lúc build, nên production cần cache hoặc tự host font.

### 6.2. Lottie & Three.js
- Dùng runtime có sẵn của HyperFrames, viết theo hướng dẫn chính thức. **Không** tự gắn hàm seek vào `window`.
- **Three.js:** bắt buộc khai báo `data-duration` ở phần tử gốc (runtime không tự suy ra được). Không dùng vòng lặp `requestAnimationFrame` hay `clock.getDelta()`. Mọi chuyển động phải là hàm của thời gian được seek. Tải model và texture xong trước frame 0.
- **Lottie:** `autoplay: false`. Tải sẵn file JSON lúc build, không fetch trong lúc render.
  - ⚠️ **Đã kiểm chứng ở giai đoạn 0 (v0.8.164):** runtime tính thời gian Lottie theo `[data-composition-id]` gần nhất, **không theo clip**. Nếu đặt Lottie trong một clip thường có `data-start="3.5"`, animation vẫn chạy từ giây 0 của video và sẽ đứng ở frame cuối khi clip xuất hiện. **Compiler phải sinh mỗi clip Lottie thành một sub-composition** (inline `data-composition-id` + `data-width`/`data-height` + timeline rỗng có độ dài bằng clip). Xem `docs/hyperframes/spike-phase0/lottie-overlay/index.html`.
- **Three.js (đã kiểm chứng):** runtime phát sự kiện `hf-seek` trên `window` với `detail.time` (giây). Scene lắng nghe sự kiện này và render lại. Nếu dùng ES module thì gán `window.THREE = THREE` để runtime chờ được `DefaultLoadingManager` tải xong asset.
- Chỉ khi cần một runtime chưa được hỗ trợ mới viết `FrameAdapter` (`@hyperframes/core`, API v0, có thể đổi trước v1). Khi đó phải ghim phiên bản và có test riêng.

### 6.3. Chuyển cảnh
- Dùng `@hyperframes/shader-transitions` cho chuyển cảnh WebGL. Với template đơn giản, dùng chuyển cảnh CSS/GSAP để render nhẹ hơn trên máy không có GPU.

### 6.4. Đã bỏ: Skia (`canvaskit-wasm`)
Lý do: không có adapter sẵn, WASM nặng vài MB, phải tự viết adapter (API v0). Nhu cầu gradient, blur và hình vector của video ngắn đã được CSS, SVG, Canvas 2D và shader-transitions đáp ứng. Chỉ xem xét lại khi có template cụ thể không làm được bằng các công cụ trên.

---

## 7. THIẾT KẾ DỮ LIỆU (UTS v1 — ĐÃ SỬA)

**Nguyên tắc:**
- **Một đơn vị thời gian:** số nguyên **mili-giây** (`startMs`, `durationMs`). Đổi sang frame: `frame = round(ms × fps / 1000)`. Đổi sang HyperFrames: `data-start = ms / 1000`.
- **Danh mục asset tách riêng:** clip chỉ tham chiếu `assetId`, không chứa URL trực tiếp.
- **Transcript tách khỏi style phụ đề:** đổi style hoặc đổi giọng không làm mất timing.
- **Tên loại track trung lập với nhà cung cấp:** `captions`, không phải `whisper-captions`. Nguồn transcript để ở metadata.
- **ID ổn định** cho mọi đối tượng, để AI có thể patch chính xác.
- Thứ tự lớp vẽ dùng `zIndex` (ứng với CSS `z-index`). `trackIndex` chỉ để hiển thị trên timeline, đúng như cách HyperFrames xử lý.

> Nếu D1 = B, phần `assets`, `transcripts`, `brandKit` vẫn được giữ làm **manifest** đi kèm HTML composition. Phần `tracks` khi đó nằm trong HTML.

### 7.1. Kiểu TypeScript (rút gọn)

```ts
export type Ms = number; // số nguyên, mili-giây

export interface Project {
  schemaVersion: "1.0.0";
  id: string;
  meta: { title: string; width: number; height: number; fps: 24 | 25 | 30 | 60; durationMs: Ms };
  assets: Record<string, Asset>;
  transcripts: Record<string, Transcript>;
  brandKitId?: string;
  tracks: Track[];
}

export interface Asset {
  id: string;
  kind: "video" | "audio" | "image" | "lottie" | "model3d" | "font";
  url: string;            // chỉ cho phép host trong allowlist
  sha256: string;         // để cache và để render tái lập được
  durationMs?: Ms;
  width?: number; height?: number;
}

export interface Transcript {
  id: string;
  sourceAssetId: string;
  language: "vi" | "en" | string;
  engine: { name: "parakeet" | "whisper" | "whisperx" | "manual"; model?: string };
  words: { id: string; text: string; startMs: Ms; endMs: Ms; confidence?: number }[];
}

export type Track =
  | BaseTrack<"video",  MediaClip>
  | BaseTrack<"audio",  MediaClip>
  | BaseTrack<"image",  VisualClip>
  | BaseTrack<"text",   TextClip>
  | BaseTrack<"lottie", VisualClip>
  | BaseTrack<"threejs", VisualClip & { config: Record<string, number | string> }>
  | BaseTrack<"captions", CaptionClip>
  | BaseTrack<"custom-html", CustomHtmlClip>; // lối thoát cho agent, được đóng hộp

interface BaseTrack<T extends string, C> {
  id: string; type: T; zIndex: number; trackIndex: number;
  locked?: boolean; muted?: boolean; clips: C[];
}

interface ClipBase {
  id: string; startMs: Ms; durationMs: Ms;
  transitionIn?: Transition; transitionOut?: Transition;
  keyframes?: Keyframe[];
}

interface MediaClip extends ClipBase { assetId: string; trimStartMs: Ms; volume: number; speed?: number }
interface VisualClip extends ClipBase { assetId: string; transform: Transform }
interface TextClip extends ClipBase { text: string; styleRef?: string; transform: Transform }
interface CaptionClip extends ClipBase { transcriptId: string; preset: string; maxWordsPerLine: number; highlightKeywords?: boolean }
interface CustomHtmlClip extends ClipBase { html: string; css?: string; js?: string }

interface Transform { x: number; y: number; scale: number; rotation: number; opacity: number }
interface Keyframe { atMs: Ms; property: keyof Transform | "volume"; value: number; easing: string }
interface Transition { type: "fade" | "slide" | "zoom" | `shader:${string}`; durationMs: Ms }
```

### 7.2. Ví dụ dự án

```json
{
  "schemaVersion": "1.0.0",
  "id": "prj_01",
  "meta": { "title": "Shorts Tech Review", "width": 1080, "height": 1920, "fps": 30, "durationMs": 10000 },
  "assets": {
    "a_interview": { "id": "a_interview", "kind": "video", "url": "https://cdn.reelpilot.app/u1/interview.mp4", "sha256": "…", "durationMs": 10000 },
    "a_music":     { "id": "a_music",     "kind": "audio", "url": "https://cdn.reelpilot.app/lib/beat-01.mp3",  "sha256": "…", "durationMs": 30000 },
    "a_fire":      { "id": "a_fire",      "kind": "lottie", "url": "https://cdn.reelpilot.app/lib/fire_burst.json", "sha256": "…" }
  },
  "transcripts": {
    "t_interview": {
      "id": "t_interview", "sourceAssetId": "a_interview", "language": "vi",
      "engine": { "name": "whisper", "model": "large-v3" },
      "words": [
        { "id": "w1", "text": "Khám", "startMs": 500,  "endMs": 900 },
        { "id": "w2", "text": "phá",  "startMs": 900,  "endMs": 1300 },
        { "id": "w3", "text": "HyperFrames", "startMs": 1300, "endMs": 2100 }
      ]
    }
  },
  "brandKitId": "bk_acme",
  "tracks": [
    { "id": "trk_aroll", "type": "video", "zIndex": 1, "trackIndex": 0, "clips": [
      { "id": "c_aroll", "startMs": 0, "durationMs": 10000, "assetId": "a_interview", "trimStartMs": 0, "volume": 1 }
    ]},
    { "id": "trk_music", "type": "audio", "zIndex": 0, "trackIndex": 1, "clips": [
      { "id": "c_music", "startMs": 0, "durationMs": 10000, "assetId": "a_music", "trimStartMs": 0, "volume": 0.15,
        "keyframes": [{ "atMs": 9000, "property": "volume", "value": 0, "easing": "linear" }] }
    ]},
    { "id": "trk_fx", "type": "lottie", "zIndex": 5, "trackIndex": 2, "clips": [
      { "id": "c_fire", "startMs": 1000, "durationMs": 3000, "assetId": "a_fire",
        "transform": { "x": 540, "y": 960, "scale": 1, "rotation": 0, "opacity": 1 } }
    ]},
    { "id": "trk_caps", "type": "captions", "zIndex": 10, "trackIndex": 3, "clips": [
      { "id": "c_caps", "startMs": 0, "durationMs": 10000, "transcriptId": "t_interview",
        "preset": "tiktok-bold-yellow", "maxWordsPerLine": 3, "highlightKeywords": true }
    ]}
  ]
}
```

---

## 8. ĐỀ XUẤT TĂNG GIÁ TRỊ SẢN PHẨM (BACKLOG ƯU TIÊN)

| # | Tính năng | Giá trị cho người dùng | Công sức | Giai đoạn |
| :-: | :--- | :--- | :---: | :---: |
| 1 | **Phụ đề tiếng Việt chuẩn + preset style** | Gần như mọi video ngắn đều cần phụ đề. Phụ đề tiếng Việt là điểm yếu của đối thủ quốc tế | Trung bình | 2 (MVP) |
| 2 | **Tự cắt khoảng lặng & từ đệm** | Tiết kiệm phần lớn thời gian dựng talking-head | Thấp | 2 (MVP) |
| 3 | **Chat-to-edit (JSON Patch + diff + undo)** | Chỉnh video bằng câu lệnh: "chữ to hơn", "cắt đoạn 0:12" | Trung bình | 2 (MVP) |
| 4 | **Template video ngắn** | Người mới có video đẹp ngay | Thấp | 2 (MVP) |
| 5 | **Cắt video dài thành nhiều short** (tìm hook/đoạn hay) | Tính năng người dùng sẵn sàng trả tiền nhất: 1 podcast thành 10 clip | Cao | 4 |
| 6 | **Auto-reframe 16:9 → 9:16** (bám khuôn mặt/người nói) | Tái sử dụng video ngang cho Reels/TikTok | Cao | 4 |
| 7 | **Brand kit** (logo, màu, font, intro/outro) | Agency và shop giữ đúng nhận diện ở mọi video | Thấp | 4 |
| 8 | **Tạo hàng loạt từ CSV/Google Sheet** | 100 video sản phẩm từ một template. Tận dụng chi phí render thấp nhờ Apache 2.0 | Trung bình | 4 |
| 9 | **Nhiều phiên bản hook/CTA để A/B test** | Tăng hiệu quả quảng cáo | Thấp (khi đã có #8) | 4 |
| 10 | **Đăng trực tiếp & lên lịch** (TikTok, YouTube, Facebook) | Rút ngắn time-to-publish | Trung bình | 4 |
| 11 | **Giọng đọc TTS tiếng Việt + dịch phụ đề đa ngôn ngữ** | Làm video không cần quay mặt, mở rộng ra thị trường khác | Trung bình | 4+ |
| 12 | **Khớp nhịp nhạc (beat sync)** | Cắt cảnh theo nhịp, tăng độ "bắt mắt" | Trung bình | 4+ |
| 13 | **Vòng phản hồi số liệu** (view, retention từ nền tảng) | Gợi ý template và hook hiệu quả theo dữ liệu thật | Cao | 5+ |
| 14 | Nền 3D Three.js | Hiệu ứng đẹp nhưng nặng render, giá trị phụ | Trung bình | Backlog, sau go/no-go |

---

## 9. MA TRẬN RỦI RO & GIẢI PHÁP PHÒNG NGỪA

| Rủi ro | Mức độ | Biện pháp phòng ngừa |
| :--- | :---: | :--- |
| **WebGL/Three.js rất chậm trên máy không có GPU** (Chrome dùng phần mềm thay GPU) | Cao | Đo ở giai đoạn 0. Dùng 3D có giới hạn theo template. Ưu tiên CSS/GSAP. Cân nhắc worker có GPU riêng cho template 3D. |
| **Thực thi HTML/JS do AI hoặc người dùng sinh ra trên máy chủ** (SSRF, đọc file, đào coin) | Cao | **Không tắt sandbox của Chrome.** Chặn network ra ngoài, chỉ cho tải asset từ allowlist, container không có quyền, giới hạn tài nguyên và thời gian. Chạy `hyperframes lint`/`check` trước khi render. |
| **Phụ đề tiếng Việt sai từ hoặc lệch timestamp** | Cao | Đo WER ở giai đoạn 0 (D4). Hậu kiểm bằng từ điển tên riêng. Cho người dùng sửa nhanh trong UI. Cân nhắc forced alignment. |
| **API `FrameAdapter` (v0) và các package HyperFrames còn mới, có thể đổi** | Trung bình | Ghim phiên bản chính xác. Hạn chế viết adapter riêng. Có test golden-frame trước mỗi lần nâng cấp. Đọc changelog định kỳ. |
| **Preview và bản render khác nhau** | Trung bình | HyperFrames dùng chung runtime cho cả hai. Vẫn chạy test golden-frame trong CI và render bằng `--docker` để cố định Chrome, font, FFmpeg. |
| **Font tiếng Việt lỗi dấu hoặc HTML phình to khi nhúng Base64** | Trung bình | Chỉ dùng font có đủ dấu tiếng Việt. Subset theo bộ ký tự Latin mở rộng tiếng Việt. Cache font qua danh mục asset (có `sha256`). |
| **Lệch tiếng và hình (audio drift)** | Thấp | Audio được HyperFrames trộn bằng FFmpeg từ `<audio>`/`<video>`. Vẫn kiểm tra đồng bộ môi trên video talking-head trong bộ test. |
| **Thanh playhead giật do sự kiện `timeupdate` của player chỉ khoảng 10 lần/giây** | Thấp | Khi đang phát, đọc `player.currentTime` theo `requestAnimationFrame` ở **trang chủ** (không phải trong composition). |
| **Chi phí Lambda/Cloud Run vượt dự tính** | Trung bình | Dùng hàm ước tính chi phí trong SDK. Đặt giới hạn concurrency. Dashboard chi phí mỗi video. |
| **Phụ thuộc định hướng của HeyGen** | Thấp | License Apache 2.0 cho phép fork. Giữ lớp manifest/schema của ReelPilot để không bị khóa vào định dạng. |

---

## 10. BƯỚC ĐI TIẾP THEO NGAY BÂY GIỜ (ACTION ITEMS)

1. **Bước 1:** `npx hyperframes init reel-spike` để tạo 3 composition mẫu dạng 1080×1920 (phụ đề, Lottie, Three.js) bằng runtime có sẵn. Chạy `npx hyperframes check` và `npx hyperframes render --docker --output spike.mp4`.
2. **Bước 2:** Đo thời gian và chi phí render trên VPS không GPU và trên Cloud Run hoặc Lambda. Ghi kết quả vào báo cáo giai đoạn 0.
3. **Bước 3:** `npx hyperframes transcribe <clip>.mp4 --engine whisper --model large-v3 --language vi` trên 20 clip tiếng Việt, đo WER và độ lệch timestamp.
4. **Bước 4:** Thử `@hyperframes/sdk` với 10 thao tác timeline để chốt D1.
5. **Bước 5:** Phỏng vấn 5–10 người dùng hiện tại hoặc tiềm năng để xác nhận nhóm mục tiêu (mục 1.1) và thứ tự backlog (mục 8).

---

## 11. NGUỒN THAM KHẢO

- Repo: https://github.com/heygen-com/hyperframes (Apache 2.0)
- Frame adapters: `docs/concepts/frame-adapters.mdx`
- Deterministic rendering: `docs/concepts/determinism.mdx`
- HTML schema: `docs/reference/html-schema.mdx`
- Player: `docs/packages/player.mdx`
- SDK: `docs/packages/sdk.mdx`
- Render paths: `docs/deploy/overview.mdx`, `docs/packages/aws-lambda.mdx`, `docs/packages/gcp-cloud-run.mdx`
- Voice & captions: `docs/guides/voice-and-audio.mdx`, `docs/guides/captions-and-recuts.mdx`
- Performance: `docs/guides/performance.mdx`
