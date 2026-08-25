# Helmet Pipeline Thống Nhất — HC-01 & HC-02

> Mọi mũ đi chung một đường từ MediaMTX trở đi. Chỉ khác cách publish.

---

## 1. Vấn đề trước khi hợp nhất

Hai mũ chạy hai kiến trúc ngược chiều nhau, mỗi bên tốt một nửa:

| | HC-01 | HC-02 |
|---|---|---|
| Video | RTSP → HLS, chất lượng đầy đủ | JPEG 480px gửi rời qua HTTP |
| AI | Server-side, liên tục | Theo từng request, ~4–5 fps hiệu dụng |
| GPS | Pin tĩnh, không di chuyển | GPS thật nhưng mất khi đóng tab |
| Ai xem được | Mọi máy mở CMS | Chỉ tab đang mở camera |

Hệ quả trên giao diện: một tile mượt, một tile giật; một mũ đứng yên trên bản đồ,
một mũ biến mất khi khoá máy.

---

## 2. Kiến trúc hợp nhất

```
HC-01 (bodycam)   ──RTSP──┐
                          ├──▶ MediaMTX ──┬──▶ record (copy)  ──▶ playback
HC-02 (điện thoại)──WHIP──┘               ├──▶ RTSP nội bộ    ──▶ AI worker
                                          └──▶ WHEP / LL-HLS  ──▶ CMS

GPS + IMU ──WebSocket──▶ backend ──▶ heatmap (mọi viewer)
Detections ──WebSocket──▶ CMS (push, kèm wallclock)
```

Từ MediaMTX trở đi hai mũ **không phân biệt được**: cùng worker, cùng schema
detection, cùng player, cùng overlay, cùng recorder.

---

## 3. Ba nhánh chất lượng

Đây là điểm dễ làm sai nhất.

| Nhánh | Chất lượng | Lý do |
|---|---|---|
| Ghi hình | Nguyên bản, `record: yes` copy | Bằng chứng, xuất clip; re-encode là mất chất lượng vô ích |
| AI detect | Decode từ nguyên bản | Nén thấp → bbox lệch, mất người ở xa |
| Xem live | Có thể hạ | Người xem không cần 720p để biết ai đang ở đâu |

**Không bao giờ cho AI đọc luồng đã hạ chất lượng.** Đó chính là nguyên nhân
bbox HC-02 kém hơn HC-01 ở kiến trúc cũ.

Uplink chỉ gửi **một** luồng tốt (720p ~2 Mbps). Hạ chất lượng làm ở server —
simulcast từ điện thoại tốn gấp đôi băng thông 4G mà không được gì.

Với 1–2 người xem thì không cần transcode: WHEP phát thẳng luồng gốc, độ trễ
thấp nhất và CPU server bằng 0.

---

## 4. Đồng bộ bbox theo thời gian

Lỗi cũ: AI phân tích frame tại thời điểm T và FE vẽ ngay, nhưng HLS đưa khung
hình T tới người xem chậm 2–6 giây → **bbox chạy trước video**.

Cách sửa:

1. Backend gắn `frame_wallclock_ms` (lúc nhận frame từ camera) vào mỗi snapshot
2. ffmpeg HLS bật `program_date_time` → playlist có `EXT-X-PROGRAM-DATE-TIME`
3. FE đọc `hls.playingDate` (hoặc `video.getStartDate()` trên Safari)
4. `OverlayTimeBuffer` chọn snapshot khớp thời điểm khung hình đang hiển thị

WHEP không có PDT nhưng độ trễ chỉ ~300ms nên dùng snapshot mới nhất.

Đối chiếu ở 10Hz và chỉ `setState` khi snapshot đổi — rẻ hơn nhiều so với đánh
giá lại mỗi rAF, trong khi overlay bên dưới vẫn tự nội suy để chuyển động mượt.

---

## 5. Transport detections

| | Trước | Sau |
|---|---|---|
| Cơ chế | HTTP poll 450ms | WebSocket push |
| Độ trễ | 0–450ms ngẫu nhiên | Ngay khi AI xong frame |
| Tải backend | Tăng theo số viewer | Mỗi viewer là một subscriber nhẹ |

`overlay_bus` dùng ngữ nghĩa **latest-state**: subscriber luôn lấy trạng thái mới
nhất, không xếp hàng snapshot cũ. Overlay là dữ liệu tức thời — gửi bù frame quá
khứ chỉ làm bbox trễ thêm.

FE tự rơi về polling sau 3 lần WS thất bại (ngrok free, proxy công ty, backend cũ).

---

## 6. Bật kiến trúc mới

Đặt `VITE_MEDIAMTX_HOST` là đủ. Không đặt → HC-02 giữ nguyên luồng cũ, demo
hiện tại không gãy.

```bash
VITE_MEDIAMTX_HOST=157.66.100.182
VITE_MEDIAMTX_WEBRTC_PORT=8889
VITE_MEDIAMTX_HLS_PORT=8888
```

Backend cần thêm HC-02 vào `VMS_CAMERA_SOURCES` để AI chạy trên luồng đó:

```bash
VMS_CAMERA_SOURCES=...,HC-02:rtsp://127.0.0.1:8554/hc-02
```

Cấu hình MediaMTX mẫu: `backend-ai/deploy/mediamtx.yml`.

---

## 7. Vận hành

Người đeo mũ mở `/phat-song?helmet=HC-02` trên điện thoại, bấm **Bắt đầu phát
sóng**. Trang này giữ màn hình sáng và tự phát lại khi có mạng trở lại.

CMS không còn hỏi quyền camera/GPS khi kiến trúc mới đã bật — việc đó thuộc về
trang phát sóng.

---

## 8. Khi HC-02 có bodycam thật

Xoá `HC-02` khỏi `VITE_HELMET_WHIP_IDS`, trỏ path `hc-02` của MediaMTX tới RTSP
của bodycam. Trang `/phat-song` không cần dùng nữa. **Phía CMS không đổi dòng nào.**
