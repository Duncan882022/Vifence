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

Merge code **không** tự bật gì cả. Không có `VITE_MEDIAMTX_HOST` thì HC-02 giữ
nguyên luồng cũ — chủ ý như vậy để bản demo đang chạy không gãy.

Cần đủ ba bước dưới đây, thiếu bước nào cũng không hoạt động.

### Bước 1 — Cài MediaMTX trên VPS

Chạy cùng máy với backend AI để backend pull RTSP qua `127.0.0.1` (không tốn
băng thông ra ngoài, không phụ thuộc mạng công cộng).

```bash
cd /opt/vifence
curl -L -o mediamtx.tar.gz \
  https://github.com/bluenviron/mediamtx/releases/latest/download/mediamtx_linux_amd64.tar.gz
tar xzf mediamtx.tar.gz
cp /opt/vifence/backend-ai/deploy/mediamtx.yml /opt/vifence/mediamtx.yml
```

systemd unit:

```ini
[Unit]
Description=MediaMTX
After=network.target

[Service]
ExecStart=/opt/vifence/mediamtx /opt/vifence/mediamtx.yml
Restart=always
WorkingDirectory=/opt/vifence

[Install]
WantedBy=multi-user.target
```

Mở firewall: `8889/tcp` (WebRTC signaling), `8888/tcp` (HLS), `8189/udp` (ICE),
`8554/tcp` (RTSP nội bộ — chỉ mở nếu cần truy cập từ ngoài).

### Bước 2 — Backend chạy AI trên luồng HC-02

Thêm HC-02 vào `VMS_CAMERA_SOURCES` trong `scripts/deploy-backend-contabo.sh`
(dòng ghi `.env` production):

```bash
VMS_CAMERA_SOURCES=A-03:...,A-04:...,HC-01:rtsp://127.0.0.1:8554/hc-01,HC-02:rtsp://127.0.0.1:8554/hc-02
```

Sau khi có MediaMTX, HC-01 cũng nên trỏ về `127.0.0.1:8554/hc-01` thay vì gateway
của hãng — MediaMTX pull một lần rồi fan-out, thay vì mỗi consumer tự kéo.

### Bước 3 — Frontend biết địa chỉ MediaMTX

Thêm vào `.env.ghpages` rồi build lại:

```bash
VITE_MEDIAMTX_WEBRTC_URL=https://217.217.253.247.nip.io/mediamtx/webrtc
VITE_MEDIAMTX_HLS_URL=https://217.217.253.247.nip.io/mediamtx/hls
```

> **Bắt buộc dùng HTTPS.** CMS chạy trên GitHub Pages (HTTPS) nên không gọi được
> endpoint HTTP — trình duyệt chặn mixed content. `getUserMedia` ở trang phát
> sóng cũng đòi secure context. Cách dựng TLS: xem phần cuối `mediamtx.yml`.

### Kiểm tra sau khi bật

```bash
curl -s https://<host>/health | jq '.cameras'   # phải thấy HC-02
```

`stream_online: true` nghĩa là MediaMTX đang nhận luồng và AI worker đọc được.

---

## 6b. Triển khai code

| Thành phần | Cách deploy | Kích hoạt |
|---|---|---|
| Frontend | `.github/workflows/deploy-pages.yml` | Tự chạy khi push `main` |
| Backend | `.github/workflows/deploy-backend-contabo.yml` | Thủ công (`workflow_dispatch`) |
| MediaMTX | Cài tay trên VPS | Bước 1 ở trên |

Backend phải deploy **trước** frontend: FE build mới sẽ gọi `/ws/stream/...`, nếu
backend chưa có endpoint đó thì FE rơi về polling (không gãy, nhưng mất lợi ích).

---

## 7. Vận hành hằng ngày

**Người đeo mũ** mở trên điện thoại:

```
https://duncan882022.github.io/Vifence/phat-song?helmet=HC-02
```

Bấm **Bắt đầu phát sóng**, cấp quyền camera + vị trí, để máy trong túi áo. Trang
giữ màn hình sáng suốt ca và tự phát lại khi có mạng trở lại. Hết ca bấm **Dừng
phát sóng**.

Nếu nút hiện **"Chưa sẵn sàng phát sóng"** thì chưa cấu hình xong MediaMTX —
xem lại mục 6.

**Người giám sát** mở CMS như bình thường. Module 05 hiện cả hai mũ trong lưới
camera, không cần thao tác gì thêm. CMS không còn hỏi quyền camera/GPS khi kiến
trúc mới đã bật — việc đó thuộc về trang phát sóng.

---

## 8. Khi HC-02 có bodycam thật

Xoá `HC-02` khỏi `VITE_HELMET_WHIP_IDS`, trỏ path `hc-02` của MediaMTX tới RTSP
của bodycam. Trang `/phat-song` không cần dùng nữa. **Phía CMS không đổi dòng nào.**
