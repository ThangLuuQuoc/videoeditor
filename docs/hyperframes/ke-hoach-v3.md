# KẾ HOẠCH V3 — REELPILOT TRÊN HYPERFRAMES

> **Ngày:** 19/10/2026 · **Repo:** `ThangLuuQuoc/videoeditor` (nhánh `main`)
> **Thay thế:** `ke-hoach-trien-khai-v2.md`. V2 viết trước khi có mã ReelPilot nên giả định sai về sản phẩm và kiến trúc (xem mục 1.3).
> **Đọc kèm:** `README.md` (trạng thái và cách chạy), `../build-plan.md` (kế hoạch gốc của ReelPilot), `../decisions.md`.
> Thời lượng ở đây là **ước lượng cho 1 người** và cần chỉnh lại sau mỗi milestone.

---

## 0. TÓM TẮT

- **Đã xong (V2.5):** ReelPilot V1 (editor biến quay màn hình thành video quảng cáo) giờ export bằng **HyperFrames** và xem trước bằng **StagePlayer**, cả hai chạy chung một shim. App **không còn runtime Remotion**. Bằng chứng: khớp từng frame với Remotion, test export thật với DB + S3, toàn bộ Playwright bản desktop đạt.
- **V3 có 3 mục tiêu theo thứ tự:**
  1. **Chạy được ở production** (M6–M7).
  2. **Có lý do để người dùng quay lại**: template + AI first cut, rồi giọng đọc + phụ đề tiếng Việt (M8–M9).
  3. **Kênh tăng trưởng**: nhiều phiên bản/khung hình, Try-it từ URL (M10–M11).
- **Cần chủ dự án chốt trước khi đi xa (mục 3):** license mã ReelPilot (repo đang public), thị trường mục tiêu, nơi deploy, thời điểm bỏ hẳn Remotion.

---

## 1. ĐIỂM XUẤT PHÁT

### 1.1. Sản phẩm (ReelPilot V1, theo `build-plan.md`)
Founder quay app (hoặc upload video) → AI phân tích các khoảnh khắc chính → **motion studio**: camera 3D, cắt/tốc độ/chuyển cảnh, text, 12 kiểu graphics, lens, AI director → export MP4 (16:9, 9:16, 1:1) hoặc link chia sẻ. Brand kit (màu, font, logo) lấy từ URL của site. Miễn phí, chưa deploy. **Chưa có audio**: footage bị bỏ tiếng khi xử lý.

### 1.2. Đã làm trong đợt chuyển engine (16–19/10/2026)

| Hạng mục | Kết quả |
| :--- | :--- |
| Export bằng HyperFrames (`RENDER_ENGINE`, mặc định `hyperframes`) | Khớp Remotion: 445/445 và 407/407 frame (PSNR ≥ 34 dB, SSIM ≥ 0,99); render nhanh ngang hoặc hơn (40s/44s, 53s/81s) |
| Preview bằng `StagePlayer`, gỡ `@remotion/player` | Toàn bộ Playwright desktop đạt (72 đạt, 1 bỏ qua), gồm mọi test editor |
| Test | `hyperframes-seek.test.ts` (mã vạch từng frame), `render-export.test.ts` (DB + S3 thật), `exports.spec.ts` 3/3 |
| Tài liệu | `README.md`: trạng thái, cách dựng lại, 11 vấn đề đã biết |

### 1.3. V2 đã sai ở đâu (để không lặp lại)

| V2 giả định | Thực tế |
| :--- | :--- |
| Sản phẩm phụ đề talking-head / reels cho creator | Video quảng cáo từ quay màn hình cho founder/SaaS |
| Phải thiết kế schema UTS mới | `src/shared/motion` (zod, thuần) đã là nguồn dữ liệu gốc |
| Bỏ Remotion Lambda vì đắt | ReelPilot vốn đã tự render bằng worker `pg-boss` |
| Preview bằng `<hyperframes-player>` | Iframe làm mất tương tác với sân khấu; dùng `StagePlayer` + shim |
| Ưu tiên Lottie/Three.js | Không cần: graphics của ReelPilot là React/CSS |

---

## 2. MỤC TIÊU & NGUYÊN TẮC

**Mục tiêu V3:** người dùng thật dùng được bản production, tạo video đầu tiên trong vài phút và có lý do quay lại.

**Nguyên tắc (giữ theo `build-plan.md`):**
1. **Vertical slice**, mỗi milestone đạt Definition of Done (§14.1): migration → zod → service + unit test → UI từ `shared/ui` → Playwright happy path → ghi `decisions.md`.
2. **Mỗi milestone kết thúc bằng commit + push**, cùng cập nhật `docs/hyperframes/README.md`. Bị kẹt giữa chừng thì vẫn push, kèm ghi chú chỗ kẹt.
3. **Preview = render**: mọi tính năng hình ảnh đi qua `src/remotion` + shim; không có đường render thứ hai.
4. **Không thêm API Remotion mới** vào composition. Nếu cần, mở rộng shim kèm test (bundle sẽ báo lỗi nếu dùng API chưa có).
5. Giới hạn chi phí nằm trong `shared/config/limits.ts`; nhà cung cấp AI/giọng đọc đi qua adapter (§10).

---

## 3. QUYẾT ĐỊNH CẦN CHỐT (CHẶN CÁC MILESTONE SAU)

| # | Câu hỏi | Đề xuất | Chặn |
| :-: | :--- | :--- | :--- |
| Q1 | **License mã ReelPilot.** Repo gốc không có LICENSE nhưng `videoeditor` đang public | Xin phép tác giả và thêm LICENSE; trong lúc chờ, **chuyển repo sang private** | M7 (deploy công khai) |
| Q2 | **Thị trường đầu tiên** | Việt Nam trước: giọng đọc + phụ đề tiếng Việt là khác biệt rõ nhất; giao diện song ngữ để sau | M9 |
| Q3 | **Nơi deploy** | Theo build plan: app Hostinger Node.js + worker Docker trên VPS Hostinger. Cloud Run/Lambda (HyperFrames có sẵn) chỉ khi hàng đợi render quá tải | M7 |
| Q4 | **Bỏ hẳn Remotion** (`RENDER_ENGINE=remotion`, `remotion`, `@remotion/bundler`, `@remotion/renderer`) | Giữ làm phương án dự phòng đến hết M7 (2 tuần production không có sự cố render), rồi gỡ và đổi tên `src/remotion` → `src/stage` | M6 (phần dọn dẹp) |
| Q5 | **Giọng đọc (TTS)** — build plan §10 ghi "no voice planned" | Mở lại cho M9 qua adapter. Tiếng Việt: thử 2–3 nhà cung cấp cloud và Kokoro chạy local (HyperFrames hỗ trợ sẵn); chọn theo chất lượng nghe thử + chi phí | M9 |
| Q6 | Tên sản phẩm, domain, điều khoản (đang là `TODO(owner)` trong build plan) | Chốt trước khi mở cho người dùng ngoài | M7 |

---

## 4. KPI

Lấy từ build plan §16, bổ sung ngưỡng đề xuất (chốt lại sau 2 tuần có dữ liệu thật):

| KPI | Đo bằng | Ngưỡng đề xuất |
| :--- | :--- | :--- |
| Kích hoạt: đăng ký → export đầu tiên | `exports` theo workspace | ≥ 40% trong 7 ngày |
| Thời gian từ footage tới video đầu tiên | upload → export READY | trung vị < 10 phút |
| Thời gian render | `durationMs` export / thời lượng video | ≤ 3× trên VPS 4 vCPU (hiện đo trên máy dev: 2,7–3,9× tuỳ nội dung) |
| Tỷ lệ export lỗi | `FAILED` / tổng | < 1% |
| Video mỗi workspace hoạt động / tháng | `projects` | ≥ 3 |
| Lượt xem link chia sẻ | `/v/[token]` | theo dõi (chưa đặt ngưỡng) |
| Try-it → đăng ký (sau M11) | trial → user | ≥ 10% |

---

## 5. LỘ TRÌNH

Đánh số tiếp theo build plan (M6, M7, M8 cũ đã chuyển sang mục "Later"; ở đây đánh lại cho V3).

### M6 — Gia cố engine (≈ 1–1,5 tuần)
**Mục tiêu:** tin được engine trước khi có người dùng thật.
- Tìm nguyên nhân gốc của lỗi chập chờn khi máy quá tải (`README.md` mục 5, điểm 11): chạy lặp có giữ video, xem frame sai, rồi sửa trong shim hoặc giới hạn `--workers` theo số CPU.
- **Footage thật:** quay màn hình dài 3–10 phút, VFR, GOP lớn, 1440p/4K. Đo thời gian render và bộ nhớ; thêm fixture vào `hyperframes-seek.test.ts` nếu lộ lỗi.
- **Khung 4:5** (đã hứa trong §1.2 build plan nhưng chưa có code): thêm vào `stageSizes`, editor, export, kèm test.
- **Image Docker cho worker:** Chrome (`npx hyperframes browser ensure`), thư viện hệ thống, font (gồm subset tiếng Việt), `HYPERFRAMES_NO_TELEMETRY=1`, healthcheck. Chạy `render-export.test.ts` **bên trong container**.
- Đo đạc: log engine, thời gian từng pha (compile/capture/encode) vào `exports`; cảnh báo khi > ngưỡng.
- (Khi tiện) Playwright bản mobile, bật GitHub Actions. Chủ dự án tạm gác 2 việc này ngày 19/10.

**Xong khi:** footage thật render đúng (mã vạch hoặc so pixel với Remotion), container render đạt test, lỗi chập chờn có nguyên nhân và cách sửa (hoặc được giới hạn có chủ đích).

### M7 — Deploy production (≈ 1 tuần) · *chặn bởi Q1, Q3, Q6*
- Neon branch `production`, bucket production, CORS; biến môi trường thật (OAuth, Resend, Anthropic).
- App lên Hostinger Node.js; worker Docker lên VPS; tách worker khỏi máy chạy app.
- Sentry (`SENTRY_DSN` đã có trong env), sao lưu DB, runbook khi render kẹt (dừng hẳn job, xoá file tạm).
- Trang pháp lý (§11), CSP + HSTS (đã ghi trong `next.config.ts` là việc của lúc deploy).

**Xong khi:** đăng ký → quay/upload → chỉnh → export → chia sẻ chạy trên domain thật; Playwright chạy được với URL production (bộ smoke test).

### M8 — Template & AI first cut (§7.16) (≈ 2 tuần)
**Vì sao trước tiên:** biến editor mạnh nhưng phức tạp thành "một chạm có video đẹp", đúng chỗ kích hoạt người dùng.
- Template = preset trong `shared/motion`: look, kiểu text, lens, chuyển cảnh, slide mở đầu, end card. Gồm 4 mẫu theo build plan: launch, feature demo, social ad 9:16, walkthrough.
- AI first cut: AI director v2 (§7.4b H) áp dụng template cho mọi clip trong video, **là một thay đổi có thể hoàn tác**, có giải thích.
- Ảnh xem trước template render bằng chính composition (`StagePlayer` hoặc snapshot).

**Xong khi:** từ footage mới, 1 thao tác cho ra video "trông có đạo diễn"; KPI thời gian tới video đầu tiên < 10 phút trên tập beta.

### M9 — Giọng đọc + phụ đề (≈ 2 tuần) · *chặn bởi Q2, Q5*
- **Đường audio:** composition có track audio (voiceover, nhạc nền); shim thêm `<Audio>`/âm thanh trên `<video>`; HyperFrames trộn audio bằng FFmpeg; `StagePlayer` phát audio đồng bộ. Test lệch tiếng/hình.
- **Voiceover từ script:** AI viết script theo các khoảnh khắc chính → TTS qua adapter → timing theo câu.
- **Phụ đề:** timing lấy từ TTS (không cần nhận dạng giọng nói). Preset phụ đề kiểu reels, font có đủ dấu tiếng Việt.
- Nhạc nền: thư viện có license rõ ràng; ducking khi có giọng đọc.

**Xong khi:** video có giọng đọc tiếng Việt và phụ đề khớp từng câu, export và chia sẻ được; không lệch tiếng quá 1 frame.

### M10 — Nhiều phiên bản & khung hình (≈ 1 tuần)
- Export hàng loạt nhiều khung trong một lần (16:9, 9:16, 1:1, 4:5), hàng đợi theo thứ tự.
- Nhiều phiên bản hook/CTA (text mở đầu, end card) để A/B test, chia sẻ từng bản.

### M11 — Try-it từ URL (§7.1) (≈ 2 tuần)
- Worker quay thử ~30 giây trang công khai → phân tích → AI first cut với template → trang chia sẻ có watermark; giới hạn tần suất, hết hạn sau 7 ngày, chuyển thành dự án khi đăng ký (đúng §7.1, §11).

### Sau V3 (chưa xếp lịch)
Đăng thẳng lên tài khoản quảng cáo; extension Chrome bắt click; thanh toán (build plan §2); mời thành viên; bản địa hoá giao diện; render phân tán (`@hyperframes/aws-lambda`/`gcp-cloud-run`) khi một VPS không đủ.

---

## 6. KIẾN TRÚC V3 (thay đổi so với hiện tại)

```
Editor (Next.js)                         Worker (pg-boss, Docker)
  StagePlayer ─┐                           renderExport job
               ├─ src/remotion (→ src/stage sau Q4)
  shim ────────┘     compositions + graphics + text + [audio M9]
                         │                      │
                 src/shared/motion        render-process-hyperframes
                 (+ templates M8,          esbuild bundle → HyperFrames CLI
                  + voice/captions M9)     → ffmpeg (+ audio mix M9) → S3
```

Thêm theo milestone:
- **M8:** `shared/motion/templates.ts` (zod) và slice `features/templates` (hoặc gộp vào `footage`/`projects`, sẽ chốt khi thiết kế).
- **M9:** `shared/voice` (adapter TTS), track audio trong `Presentation`/`ProjectStageProps`, shim `<Audio>`.
- **Q4:** gỡ `render-process.ts`, `src/remotion/Root.tsx`, `index.ts`, các gói Remotion; đổi tên thư mục.

---

## 7. RỦI RO

| Rủi ro | Mức | Giảm thiểu |
| :--- | :---: | :--- |
| HyperFrames còn mới (0.8.x), đổi API | Trung bình | Ghim phiên bản; nâng cấp chỉ sau khi `hyperframes-seek`, `render-export`, `exports.spec` đều đạt; đọc changelog |
| Shim lệch hành vi Remotion khi thêm tính năng | Trung bình | Nguyên tắc 4; mỗi API mới trong shim đi kèm test |
| Lỗi chập chờn khi tải nặng | Trung bình | M6; production chạy 1 render mỗi lần; test giữ video khi sai |
| VPS không đủ CPU (render 3–4× thời lượng; clip 10 phút ≈ 30–40 phút) | Cao khi có người dùng | Đo ở M6; hàng đợi + thông báo thời gian chờ; Cloud Run/Lambda khi cần (Q3) |
| Lệch tiếng/hình khi thêm audio (M9) | Trung bình | Audio do FFmpeg trộn, không ghi lại từ trình duyệt; test đo độ lệch |
| Chất lượng TTS tiếng Việt và chi phí | Trung bình | Nghe thử A/B ở Q5; giới hạn số phút trong `limits.ts` |
| Font brand kit thiếu glyph tiếng Việt (vd. Bebas Neue) | Thấp | Cảnh báo trong brand kit; font dự phòng có subset `vietnamese` |
| Pháp lý: license ReelPilot, điều khoản | Cao | Q1, Q6 trước M7 |

---

## 8. VIỆC NGAY TIẾP THEO

1. Chủ dự án trả lời **Q1** (license / để repo private) và **Q3** (nơi deploy).
2. M6: dựng image Docker cho worker và chạy `render-export.test.ts` trong container.
3. M6: lấy 2–3 video quay màn hình thật (3–10 phút) để đo và kiểm tra.
4. M6: thêm khung 4:5.
5. Thiết kế dữ liệu template cho M8 (zod trong `shared/motion`) và lấy ý kiến chủ dự án về 4 template mẫu.
