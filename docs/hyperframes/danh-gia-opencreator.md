# Đánh giá OpenCreator (krillinai) — lấy làm gốc hay trích ý tưởng?

> **Ngày:** 20/10/2026 · **Repo:** https://github.com/krillinai/OpenCreator (trước là KrillinAI) · **Kết luận:** **không lấy làm gốc**, trích có chọn lọc.

## 1. Hai sản phẩm khác nhau

| | ReelPilot (của mình) | OpenCreator |
| :--- | :--- | :--- |
| Sản phẩm | Web SaaS "motion studio": quay màn hình hoặc tải footage lên, sửa trong editor, ra video quảng cáo hoặc giới thiệu sản phẩm; có template nấu ăn | App desktop chạy local, dùng Codex CLI làm agent cho creator. Lõi là **dịch và lồng tiếng video** (URL/file → ASR → dịch → TTS → burn phụ đề) |
| Người dùng | Nhiều user, workspace, chia sẻ link | Một người trên máy của mình, không có tài khoản |
| Frontend | Next.js 16, React 19, Server Actions | Vite, React 18, Electron 43 |
| Backend | Next.js + worker pg-boss | Daemon Fastify + engine Go (CLI/HTTP) |
| DB | Postgres + Prisma | SQLite |
| Render | HyperFrames (Remotion làm dự phòng) dựng composition React | ffmpeg + libass. Remotion chỉ dùng cho video người que |
| LLM | Anthropic (AI SDK) | Codex (ChatGPT login hoặc key), API tương thích OpenAI |
| Triển khai | Docker compose local (M7) | Bộ cài Electron, **không có Docker** |
| Kích thước | Nhỏ, dễ đọc | ~156k dòng TS + 25k dòng Go, comment chủ yếu tiếng Trung |
| Licence | — | Apache-2.0 (được phép chép code) |
| Hoạt động | 1 người | 13,7k sao, ~35 contributor, v3.2.8 ra 18/10/2026, viết lại nhiều trong năm 2026 |

## 2. Vì sao không lấy làm gốc

1. **Khác bài toán.** OpenCreator không có editor timeline nhiều track, camera 3D, motion graphics, brand kit, template theo thể loại hay link chia sẻ, tức là toàn bộ thứ ReelPilot đang làm. Timeline của nó chỉ để sửa phụ đề.
2. **Khác kiến trúc.** Desktop một người dùng, SQLite, gắn chặt vào giao thức Codex app-server và Electron. Muốn chạy trên web nhiều user bằng Docker thì phải viết lại phần lớn.
3. **Mất hết công đã làm.** Các mốc M6–M9, M12 (HyperFrames, StagePlayer, export, recipe, voiceover, 33/33 Playwright trên Docker) sẽ phải port lại sang một stack khác.
4. **Chi phí đọc hiểu cao.** Repo đang được viết lại rất nhanh (65 commit trong 7 ngày), comment tiếng Trung. Đi theo upstream sẽ liên tục vỡ.

## 3. Nên trích gì (xếp theo giá trị cho ReelPilot)

| # | Ý tưởng / module | Nằm ở (OpenCreator) | Gắn vào chỗ nào của ReelPilot | Cách lấy |
| :-- | :--- | :--- | :--- | :--- |
| 1 | **Ép lời đọc vừa thời lượng:** gộp câu ngắn, ước lượng độ dài, tăng tốc 0,95–1,15× (tối đa 1,30×), không vừa thì nhờ LLM viết ngắn lại | `runtime/krillinai/internal/service/dubbing/{fit,optimizer,estimator}.go`, `config-example.toml [dubbing]` | M9 voiceover và M12 1c (câu đọc của bước bị dài hơn clip) | Port thuật toán sang TS trong `shared/motion/voice.ts` (khoảng 200 dòng), không chép engine Go |
| 2 | **Edge-TTS** (miễn phí, có giọng tiếng Việt `vi-VN-HoaiMyNeural`, `vi-VN-NamMinhNeural`) và adapter MiniMax | `runtime/krillinai/pkg/*` (tts) | Q5 chưa chốt provider TTS thật. Có thể thêm `VOICE_PROVIDER=edge` để dev/test có tiếng thật, không tốn phí | Viết adapter mới trong `src/shared/ai/speech.ts` |
| 3 | **ASR → phụ đề từ tiếng gốc của footage** (Whisper, faster-whisper…) | `internal/service/audio2subtitle.go`, `timestamps.go` | Hiện footage bị bỏ tiếng. Có thể giữ tiếng và tạo phụ đề tự động cho video có người nói | Job mới `transcribe-footage` dùng Whisper API, giữ định dạng caption hiện có |
| 4 | **Font phụ đề theo hệ chữ** (độ rộng grapheme theo script, font dự phòng) | `internal/service/srt_embed.go`, `assets/creator-subtitle-fonts` | Bebas Neue không có dấu tiếng Việt | Thêm font dự phòng tiếng Việt cho brand kit và caption |
| 5 | **Chấm điểm highlight** (hook, thông tin, cảm xúc, độ trọn vẹn) | `apps/daemon/src/creator/clip/analyzer.ts` | Job `analyze-footage` (key moments) và AI director / first cut (M8) | Mượn rubric và prompt |
| 6 | **Pipeline theo stage, artifact có version:** sửa một bước thì các bước sau bị đánh dấu cũ | `apps/daemon/src/creator/templates/{types,registry,stage-runner}.ts` | Recipe: công thức → ảnh → TTS → render; cơ chế fingerprint export đã có | Mượn mô hình khi M12 thêm bước (AI tách công thức, đồng hồ đếm ngược) |
| 7 | **Kiểm tra đầu ra giữa các stage** (chặn ảnh hoặc media lỗi trước khi render) | `creator/stickman/validation-executor.ts`, `output-validation.ts` | Ảnh AI (M12 1b), TTS | Thêm bước kiểm tra trước khi enqueue render |
| 8 | **Tính năng mới: dịch và lồng tiếng video** | Engine Go `runtime/krillinai` (CLI + HTTP server) | Nếu muốn thêm "Translate this video": chạy engine Go như một service riêng trong `deploy/local/compose.yml`, gọi qua HTTP | Chỉ làm khi có nhu cầu. Đây là module duy nhất tách được nguyên khối |
| 9 | Provider ảnh/video (Seedream, Kling, Veo) | `apps/daemon/src/image-generation`, `video-generation/service.ts` | Q7 provider ảnh | Tham khảo cách gọi API |

## 4. Đề xuất thứ tự

1. **#2 Edge-TTS + #1 ép lời đọc**: gỡ được nút thắt "chỉ có giọng test" của M9/M12, ít rủi ro.
2. **#4 font tiếng Việt**: sửa lỗi người dùng nhìn thấy ngay.
3. **#3 ASR footage**: mở ra phụ đề tự động cho footage có tiếng.
4. #5–#7 khi làm tiếp M8 và M12. #8 chỉ khi quyết định thêm tính năng dịch video.

## 5. Đề xuất thêm sau khi đọc kỹ README (21/10/2026)

Nguồn: README của OpenCreator (các mục "Creator Tools", "Creation Templates", "Schedules and Dedicated Task Threads", "Models Supported"). Bảng dưới gồm những ý **chưa có** trong mục 3, xếp theo giá trị so với công sức.

| # | Ý từ OpenCreator | Áp vào ReelPilot | Vì sao đáng làm | Công sức |
| :-- | :--- | :--- | :--- | :--- |
| A | **Dịch video** (phụ đề song ngữ, lồng tiếng) | Nút "Bản tiếng Anh" (hoặc ngôn ngữ khác) cho video công thức và timeline: dịch chữ, đọc lại bằng giọng mới, render lại thành một phiên bản | Công thức và câu chuyện đã là dữ liệu có cấu trúc (`presentation.recipe`, `presentation.story`), nên **không cần nhận dạng giọng nói**: chỉ dịch chữ rồi dựng lại. OpenCreator phải nghe video mới làm được việc này | Thấp |
| B | **Tạo ảnh bìa** (vài phương án để so) + **viết bài đăng** (Xiaohongshu) | Mỗi lần export kèm **bộ đăng bài**: ảnh bìa (một frame + tiêu đề, 3 phương án), tiêu đề, mô tả, hashtag theo nền tảng; trang chia sẻ dùng ảnh bìa làm ảnh xem trước | Export hiện chỉ có MP4 và link chia sẻ; đây là việc người dùng phải làm tay trước khi đăng. Ảnh bìa render bằng chính HyperFrames (một frame tĩnh) | Thấp – vừa |
| C | **Thư viện template** có kết quả mẫu, cài đặt, tag, tác giả | Mỗi template có video xem trước; thêm **"Lưu bản chỉnh sửa này thành template của tôi"** (theo brand kit) | Template hiện chỉ có một dòng mô tả. Template riêng của brand giúp người dùng quay lại dùng tiếp | Vừa |
| D | **Chạy hàng loạt và lên lịch** (mỗi lịch một luồng, chạy lần lượt) | Dán bảng hoặc CSV gồm nhiều công thức hay nhiều dòng dữ liệu, app tạo ra nhiều video và xếp hàng render; sau đó có thể lên lịch | Rất hợp kênh nấu ăn và **template data** sắp làm. Template đều là hàm thuần nên chạy hàng loạt dễ. Trùng với M10 (export hàng loạt) | Vừa |
| E | **Kịch bản video ngắn** theo nền tảng, độ dài, giọng điệu | "Lên kế hoạch trước khi quay": AI viết danh sách cảnh cần quay rồi **tự điền form** công thức hoặc timeline (dán link hay đoạn văn là ra công thức hoặc các chương) | Gỡ chỗ khó nhất là bắt đầu từ trang trắng; mở rộng việc "AI tách công thức" đã có trong kế hoạch M12 | Thấp – vừa |
| F | **Hình minh họa giữ nhân vật và phong cách nhất quán** (Stick Figure Animation) | Ảnh AI cho công thức (M12 bước 1b) dùng chung một mô tả phong cách và một ảnh tham chiếu, để mọi ảnh trong một video cùng tông | Ảnh tạo riêng lẻ dễ lệch tông nhau. Nên đưa vào trước khi chốt Q7 | Thấp |
| G | **Giao diện 43 ngôn ngữ** | Giao diện ReelPilot bằng **tiếng Việt** (i18n) | Q2 chọn Việt Nam là thị trường đầu tiên, nhưng giao diện hiện toàn tiếng Anh | Vừa |

**Để sau hoặc không làm:**
- **Tải video từ nền tảng** (YouTube, TikTok…, dùng yt-dlp): vướng điều khoản và bản quyền. Nếu làm, chỉ cho nhập video của chính người dùng.
- **Tạo video bằng AI** (Seedance, Kling, Veo) để lấp clip thiếu: chi phí cao; chờ sau Q7.
- **Chỉnh video bằng trò chuyện với agent:** đã có AI director (`directEdit`); nâng lên thành hội thoại khi có nhu cầu.
- **Trình sửa phụ đề có dạng sóng âm, lưu nhiều phiên bản:** làm cùng mục #3 (phụ đề từ tiếng gốc) ở trên.

**Thứ tự đề xuất** (đã đưa vào `ke-hoach-v3.md`, M13):
1. **A** bản dịch + **B** bộ đăng bài: ít công, người dùng thấy giá trị ngay.
2. **E** AI điền form công thức hoặc timeline.
3. **D** hàng loạt, làm cùng template **data** (M12).
4. **F** đưa vào bước 1b khi chốt Q7.
5. **C** thư viện template và **G** giao diện tiếng Việt: việc nền tảng, sau M12.
