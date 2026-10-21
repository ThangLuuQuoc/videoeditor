# KẾ HOẠCH V3 — REELPILOT TRÊN HYPERFRAMES

> **Ngày:** 19/10/2026 · **Repo:** `ThangLuuQuoc/videoeditor` (nhánh `main`)
> **Thay thế:** `ke-hoach-trien-khai-v2.md`. V2 viết trước khi có mã ReelPilot nên giả định sai về sản phẩm và kiến trúc (xem mục 1.3).
> **Đọc kèm:** `README.md` (trạng thái và cách chạy), `../build-plan.md` (kế hoạch gốc của ReelPilot), `../decisions.md`.
> Thời lượng ở đây là **ước lượng cho 1 người** và cần chỉnh lại sau mỗi milestone.

---

## TIẾN ĐỘ (cập nhật 19/10/2026)

| Milestone | Trạng thái |
| :--- | :--- |
| M6 Gia cố engine | Khung 4:5 ✅ · test hồi quy seek + bước Chrome trong CI ✅ · `Dockerfile` (app + worker) ✅ (test render + giọng đọc đạt trong container) · footage dài thật ⏳ (cần video quay màn hình thật từ chủ dự án) · lỗi chập chờn: đã ghi lại, chưa có nguyên nhân gốc |
| M7 Deploy | ✅ **đổi phạm vi (19/10):** chỉ Docker local để test (Q3). `deploy/local/compose.yml` (app + worker + Postgres + S3); đăng nhập bằng magic link in ra log; Playwright 33/33 đạt khi chạy với stack (gồm export và giọng đọc) |
| M8 Template & AI first cut | ✅ cấp clip + cấp video, có hoàn tác; test unit/DB/Playwright |
| M9 Giọng đọc + phụ đề | ✅ với provider `test`; provider thật (Q5) chưa chọn; nhạc nền chưa làm |
| M10, M11 | chưa bắt đầu |
| M12 Template theo thể loại | 🔧 **nấu ăn bước 1 ✅** (form công thức → video 9:16, graphic `list`, `step`); **ảnh (1b) ✅** với provider `test`; **đọc các bước + công thức cho cả video (1c) ✅**; **timeline (bước 2) ✅** (clip ảnh, Ken Burns, mốc thời gian, thanh chương); data, làm đẹp chưa làm |
| M13 Ý từ OpenCreator | 🔧 (thêm 21/10): **bản dịch (A) ✅**, **bộ đăng bài (B) ✅**; AI điền form, hàng loạt, ảnh AI cùng tông, thư viện template, giao diện tiếng Việt chưa làm |

Chi tiết từng hạng mục: `README.md` mục 2.

## 0. TÓM TẮT

- **Đã xong (V2.5):** ReelPilot V1 (editor biến quay màn hình thành video quảng cáo) giờ export bằng **HyperFrames** và xem trước bằng **StagePlayer**, cả hai chạy chung một shim. App **không còn runtime Remotion**. Bằng chứng: khớp từng frame với Remotion, test export thật với DB + S3, toàn bộ Playwright bản desktop đạt.
- **V3 có 3 mục tiêu theo thứ tự:**
  1. **Chạy được ở production** (M6–M7).
  2. **Có lý do để người dùng quay lại**: template + AI first cut, rồi giọng đọc + phụ đề tiếng Việt (M8–M9).
  3. **Kênh tăng trưởng**: nhiều phiên bản/khung hình, Try-it từ URL (M10–M11).
- **Đã chốt (19/10):** Q1 không cần lo license (repo gốc public, đi kèm video hướng dẫn); Q3 chỉ deploy Docker local. Còn mở: Q2 thị trường, Q4 bỏ hẳn Remotion, Q5 provider giọng đọc, Q6 tên/điều khoản.

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
| Q1 | **License mã ReelPilot** | ✅ **Đã chốt 19/10:** không cần quan tâm. ReelPilot là repo public đi kèm video hướng dẫn trên YouTube | — |
| Q2 | **Thị trường đầu tiên** | Việt Nam trước: giọng đọc + phụ đề tiếng Việt là khác biệt rõ nhất; giao diện song ngữ để sau | M9 |
| Q3 | **Nơi deploy** | ✅ **Đã chốt 19/10:** hiện chỉ Docker ở máy local để test. Hostinger/cloud để sau | M7 (local) |
| Q4 | **Bỏ hẳn Remotion** (`RENDER_ENGINE=remotion`, `remotion`, `@remotion/bundler`, `@remotion/renderer`) | Giữ làm phương án dự phòng đến hết M7 (2 tuần production không có sự cố render), rồi gỡ và đổi tên `src/remotion` → `src/stage` | M6 (phần dọn dẹp) |
| Q5 | **Giọng đọc (TTS)** — build plan §10 ghi "no voice planned" | Mở lại cho M9 qua adapter. Tiếng Việt: thử 2–3 nhà cung cấp cloud và Kokoro chạy local (HyperFrames hỗ trợ sẵn); chọn theo chất lượng nghe thử + chi phí | M9 |
| Q6 | Tên sản phẩm, domain, điều khoản (đang là `TODO(owner)` trong build plan) | Chốt trước khi mở cho người dùng ngoài | M7 |
| Q7 | **Mô hình tạo ảnh** (ảnh nguyên liệu/bước còn thiếu trong template thể loại) | Qua adapter như giọng đọc: `generateImage` của AI SDK, `IMAGE_PROVIDER` = openai \| google \| test. Cần chốt nhà cung cấp, ngân sách/ngày, và có gắn nhãn "ảnh minh họa" không | M12 bước 1b |

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

### M7 — Deploy (Docker local, theo Q3) · *trước đây: production, chặn bởi Q1, Q3, Q6*

**Phạm vi hiện tại (✅ xong 19/10):** một image (`Dockerfile`) cho app và worker; `deploy/local/compose.yml` chạy Postgres, SeaweedFS, migrate, tạo bucket, app (cổng 3300), worker (4 CPU / 6 GB). Không cần tài khoản: `EMAIL_TRANSPORT=console` in magic link ra log, `VOICE_PROVIDER=test`. Kiểm chứng: đăng nhập magic link bằng tay; Playwright (`E2E_NO_SERVER=1`) 33/33 đạt khi chạy với stack, gồm upload, template, giọng đọc, export render trong container worker. Cách chạy: `README.md` mục 4.

**Để sau, khi deploy thật** (phạm vi cũ, giữ để tham khảo):
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

### M12 — Template theo thể loại (nấu ăn, timeline, data, làm đẹp) · *thêm 19/10 theo đề xuất của chủ dự án*

**Vì sao:** template M8 chỉ là **bộ style** (look, chữ, chuyển cảnh) cho video quay màn hình. Các dạng video phổ biến như nấu ăn, làm đẹp, data hay kể chuyện theo mốc thời gian cần **template có cấu trúc**: người dùng điền nội dung (món, nguyên liệu, các bước…), app dựng cảnh, đồ họa và phụ đề theo khuôn của thể loại đó, nên họ không phải tự nghĩ bố cục.

**Nguyên tắc:**
- Template thể loại là **hàm thuần** như `applyTemplate`: nội dung + clip → presentation, **một bước hoàn tác**; đồ họa nó thêm có id `tpl-…` nên áp lại sẽ thay thế, không nhân đôi.
- Nội dung đã điền được lưu trong presentation (ví dụ `presentation.recipe`), nên mở lại form vẫn còn và chỉnh xong áp lại được.
- Đồ họa mới là **kiểu graphic thường** (`shared/motion/graphics.ts` + `Graphics.tsx`): chỉnh, kéo, đổi lớp, đổi màu như mọi graphic khác; preview và export dùng chung một component.
- Không dùng camera "màn hình" cho footage quay thật: template thể loại đặt khung phủ kín (không bo góc, không đổ bóng, không lề) và giữ nguyên shot của người dùng.

**Từng thể loại: dùng lại được gì, cần thêm gì**

| Thể loại | Dùng lại | Cần thêm | Thứ tự |
| :--- | :--- | :--- | :--- |
| **Nấu ăn** | `slide` (tên món), `stat`, `split`, tua 2× đoạn chờ, phụ đề giọng đọc | graphic **`list`** (nguyên liệu hiện từng dòng, có dấu tích), graphic **`step`** (nhãn "Bước 2/5" + lời hướng dẫn), sau đó đồng hồ đếm ngược; AI: dán công thức → chia bước + lời đọc | **1** |
| **Timeline / kể chuyện** | `slide` (chương), `lower-third`, chuyển cảnh | ~~mốc thời gian (năm + thanh tiến trình theo chương), **clip ảnh + Ken Burns**~~ ✅ 20/10 | 2 ✅ |
| **Data** | `stat` (số chạy), `slide` | biểu đồ cột/đường/tròn từ bảng nhỏ (dán CSV), bảng xếp hạng động | 3 |
| **Làm đẹp** | `split` (trước/sau), `callout`, `magnifier`/`focus`, look | so sánh trước/sau bằng thanh kéo trượt, thẻ sản phẩm (tên, giá, màu), look làm mịn/tông ấm | 4 (cùng nhạc nền) |

**Thiếu chung, ảnh hưởng mọi thể loại:** clip ảnh tĩnh (hiện clip phải là video), nhạc nền + giảm âm lượng khi có giọng đọc (M9 còn mở), chế độ **phủ kín khung** (cover) cho video dọc lệch tỉ lệ.

**Bước 1 — Nấu ăn (✅ 19/10, chưa có ảnh):**
- `shared/motion/recipe.ts`: `recipeSchema` (tên món, dòng phụ như "25 phút · 2 người", nguyên liệu ≤ 12 dòng, bước 1–10, ngôn ngữ vi/en) và nhãn theo ngôn ngữ ("Nguyên liệu", "Bước 2/5", "Lưu công thức").
- `features/footage/lib/genres/recipe.ts`: `applyRecipe` chia thời lượng video: slide mở đầu → thẻ nguyên liệu → các bước chia đều → end card 3 giây; báo lỗi khi clip quá ngắn so với số bước.
- Tab Templates có mục "By genre" → form công thức → "Build recipe video".
- Mỗi nguyên liệu và mỗi bước có chỗ cho **một ảnh tùy chọn** (khóa S3); thẻ nguyên liệu hiện ảnh nếu có.
- ~~Áp cho cả video nhiều clip, lấy các bước làm lời đọc (mỗi bước dài đúng bằng câu đọc)~~ ✅ 20/10 (bước 1c). Còn để sau: AI tách công thức, đồng hồ đếm ngược, quản lý ảnh ở cấp video.

**Bước 1b — Ảnh cho công thức (chủ dự án đề xuất 19/10; ✅ 20/10 với `IMAGE_PROVIDER=test`, nhà cung cấp thật chờ Q7):** người dùng chuẩn bị nguyên liệu, công thức, các bước; chỗ nào **thiếu ảnh** thì tải lên hoặc **gọi mô hình tạo ảnh**.
- HyperFrames render được: ảnh là `<img>` trên trang, shim đã có `Img` và chờ ảnh tải (`delayRender`); ảnh không cần seek nên không gặp lỗi frame trống của video. Hiệu ứng Ken Burns làm bằng CSS theo frame.
- ReelPilot phải làm: tải ảnh lên S3 cho từng mục; nút "Tạo bằng AI" từng mục và "Tạo tất cả ảnh còn thiếu"; `shared/ai/image.ts` dùng `generateImage` của AI SDK (giống `speech.ts`): `IMAGE_PROVIDER` = openai | google | test (test = ảnh giữ chỗ, cho dev/CI), giới hạn số ảnh mỗi ngày.
- Bước không có video thì dùng ảnh + Ken Burns; video chỉ gồm ảnh cần **clip ảnh** (hiện clip phải là video).
- Ảnh AI cho nguyên liệu thường ổn; ảnh minh họa thao tác dễ sai, nên gắn nhãn "ảnh minh họa" và cho thay.
- **Câu hỏi mở Q7:** nhà cung cấp tạo ảnh và ngân sách (giống Q5 cho giọng đọc).

**Bước 2 — Timeline / kể chuyện (✅ 20/10):** ảnh tải lên được như video (worker giữ thành clip tĩnh 6 s); Ken Burns zoom chậm bên trong khung; graphic `milestone` (năm, sự kiện, một dòng) và `progress` (thanh chương đầy dần theo chương). Form "Timeline": tiêu đề, dòng phụ, chương mỗi dòng `năm | sự kiện | một dòng`, câu end card. Trên cả video: một chương mỗi clip khi số clip bằng số chương (ảnh xen kẽ zoom vào/ra), không thì các chương chia đều thời gian. Một ảnh 6 s **không đủ** cho cả timeline (tiêu đề 2,6 s + chương 1,5 s + end card 3 s), nên timeline dành cho video nhiều clip. Để sau: đọc lời từng chương (như recipe 1c), ảnh AI cho chương thiếu ảnh, chọn độ dài cho clip ảnh.

**Xong khi:** từ một clip nấu ăn và một công thức, 1 thao tác cho ra video 9:16 có tiêu đề, nguyên liệu, từng bước và end card; preview và export giống nhau; hoàn tác một bước; có test unit + Playwright.

### M13 — Ý lấy từ OpenCreator · *thêm 21/10/2026, chi tiết và lý do: `danh-gia-opencreator.md` mục 5*

Theo thứ tự đề xuất (mã A–G là mã trong tài liệu đó):

1. **Bản dịch cho video công thức và timeline (A)** · ✅ 21/10 (chi tiết: README mục 2, `decisions.md`). Ước lượng ban đầu ≈ 3–4 ngày. Nút "Bản tiếng Anh": dịch `presentation.recipe` hoặc `presentation.story` bằng AI (adapter text đã có), đọc lại bằng giọng mới nếu video có lời đọc, dựng lại bằng chính template rồi render thành một phiên bản. Không cần nhận dạng giọng nói, vì chữ đã có cấu trúc.
   - **Xong khi:** từ một video công thức tiếng Việt có lời đọc, một thao tác ra bản tiếng Anh (chữ trên thẻ, nhãn "Step", lời đọc); test unit + export thật.
2. **Bộ đăng bài khi export (B)** · ✅ 21/10. Ảnh bìa vẽ bằng canvas trong trình duyệt từ frame của bản export (nhanh, không cần worker), không render riêng bằng HyperFrames như dự kiến ban đầu. Ước lượng ban đầu ≈ 3–4 ngày. Ảnh bìa: render một frame tĩnh bằng HyperFrames với tiêu đề lớn, 3 phương án (frame khác nhau hoặc bố cục khác) để chọn; tiêu đề, mô tả, hashtag theo nền tảng (TikTok, Reels, YouTube Shorts) bằng AI; trang chia sẻ dùng ảnh bìa cho `og:image`.
   - **Xong khi:** hộp thoại export có tab "Đăng bài" với ảnh bìa tải về được và chữ copy được; Playwright.
3. **AI điền form (E)** · ≈ 2–3 ngày. Dán đoạn văn hoặc link công thức (hay câu chuyện) thì AI trả về đúng schema `recipeSchema` hoặc `storySchema` để điền form; kèm danh sách cảnh nên quay. Giới hạn số lần mỗi ngày như các tính năng AI khác.
4. **Hàng loạt (D)** · ≈ 1 tuần, làm cùng template **data** của M12. Dán bảng hoặc CSV, mỗi dòng ra một video (công thức hoặc dữ liệu), render xếp hàng một job một lúc (`RENDER_WORKERS=1`); sau đó mới tính lên lịch.
5. **Ảnh AI cùng tông (F)** · ≈ 1 ngày, gộp vào M12 bước 1b khi chốt Q7: một mô tả phong cách chung và (tuỳ provider) một ảnh tham chiếu cho mọi ảnh của một video.
6. **Thư viện template (C)** · ≈ 1 tuần, sau M12: video xem trước cho từng template (render sẵn), tag; "Lưu thành template của tôi" theo brand kit.
7. **Giao diện tiếng Việt (G)** · ≈ 1–2 tuần, sau M12: tách chuỗi giao diện, có tiếng Việt và tiếng Anh (Q2).

Để sau: tải video từ nền tảng (điều khoản), tạo video bằng AI (chi phí, chờ Q7), chỉnh video bằng hội thoại, trình sửa phụ đề có dạng sóng âm (đi cùng phụ đề từ tiếng gốc).

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
| Pháp lý: điều khoản sử dụng (khi mở cho người ngoài) | Thấp lúc này | License đã chốt không cần lo (Q1); điều khoản chỉ cần khi deploy công khai |

---

## 8. VIỆC NGAY TIẾP THEO

1. ~~Q1, Q3~~ đã chốt 19/10. ~~M7 = docker compose local~~ ✅ xong.
2. ~~M6: dựng image Docker cho worker và chạy `render-export.test.ts` trong container.~~ ✅
3. M6: lấy 2–3 video quay màn hình thật (3–10 phút) để đo và kiểm tra (**cần chủ dự án gửi video**).
4. ~~M6: thêm khung 4:5.~~ ✅
5. ~~Thiết kế dữ liệu template cho M8 (zod trong `shared/motion`) và lấy ý kiến chủ dự án về 4 template mẫu.~~ ✅ (M8 xong)
6. ~~M12 bước 1: template nấu ăn~~ ✅, ~~bước 1b ảnh~~ ✅ (provider `test`; chốt Q7 để bật ảnh thật). ~~áp công thức cho cả video, bước làm lời đọc~~ ✅; ~~timeline~~ ✅; tiếp theo → data → làm đẹp. Sau đó M10, M11. Còn mở: provider giọng đọc thật (Q5), nhạc nền, video thật dài để đo (mục 3), thu nhỏ image Docker (4,58 GB).
7. **M13 (ý từ OpenCreator, thêm 21/10):** bản dịch (A) và bộ đăng bài (B) trước, rồi AI điền form (E), hàng loạt (D) cùng template data; ảnh AI cùng tông (F) khi chốt Q7; thư viện template (C) và giao diện tiếng Việt (G) sau M12. Chi tiết: mục 5, M13.
