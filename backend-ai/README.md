# Vifence Safety AI — Local Backend (POC)

> **Production / VMS:** Kiến trúc đích, ma trận camera × scenario, ngưỡng detect và lộ trình Phase 1–3 — xem [`Vifence_VMS-Spec-v1.md`](../Vifence_VMS-Spec-v1.md) (chốt 2026-08-10).

Backend Python chạy **local** để test 2 mục tiêu AI cho module An toàn lao động:

1. Stream webcam + phát hiện **hút thuốc** (`smoking`)
2. Phát hiện **dấu hiệu cháy nổ** (`fire`) — lửa + khói

Đây là bản **POC chạy độc lập**, chưa nối vào `Vifence-CMS` frontend hay hệ
thống `be_vision_ai` production. Mục tiêu: verify model + pipeline chạy đúng
trên máy local trước khi tích hợp thật.

## Kiến trúc

```
Webcam (cv2.VideoCapture)
    → CameraStream (thread nền, luôn giữ frame mới nhất)
        → DetectionEngine (thread nền, chạy theo DETECTION_FPS)
            → SmokingDetector  (YOLOv11, model: Enos-123/smoking-detection — cũng là detector
                                 tạm dùng cho vape, xem mục "Vape" bên dưới)
            → FireDetector     (YOLOv26, model: SalahALHaismawi/yolov26-fire-detection)
            → FlameBlobDetector (heuristic màu sắc, bắt lửa xanh dương/bật lửa khò)
                → PersistenceDebouncer (yêu cầu detect liên tục đủ lâu mới confirm)
                    → EventStore (lưu RAM + data/events.jsonl + snapshot .jpg)
    → FastAPI
        GET  /health              trạng thái camera + từng model
        GET  /events               danh sách sự kiện đã xác nhận
        GET  /events/{id}/snapshot ảnh chụp lúc vi phạm
        WS   /ws/live               stream frame (base64 JPEG) + bbox + event mới
        WS   /ws/analyze            nhận frame từ mobile browser → trả detections
        GET  /                      trang test viewer (canvas + sidebar)
        GET  /debug/frame.jpg           [debug] frame hiện tại camera đang giữ
        GET  /debug/raw_detections      [debug] confidence thật mọi detector (conf=0.05), kể cả dưới ngưỡng báo động
```

Cả 2 model đều được **tự tải về từ Hugging Face Hub khi chạy lần đầu** (cache
tại `~/.cache/huggingface`), không cần commit file `.pt` nào vào repo.

## Cài đặt & chạy

```bash
cd backend-ai
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # sửa CAMERA_SOURCE nếu cần
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Mở trình duyệt: **http://localhost:8000** — sẽ thấy webcam live + bbox detect
theo thời gian thực, sự kiện đã xác nhận hiện ở sidebar bên phải.

> Lần chạy đầu tiên sẽ chậm hơn vì phải tải model (vài chục MB) — theo dõi log
> terminal để biết tiến trình `Đang tải model...` / `Model sẵn sàng`.

## Cấu hình (`.env`)

| Biến | Ý nghĩa | Mặc định |
|---|---|---|
| `CAMERA_SOURCE` | `0` = webcam mặc định, hoặc `rtsp://...`, hoặc path file mp4 để test không cần webcam | `0` |
| `DETECTION_FPS` | Số lần chạy inference/giây | `5` |
| `STREAM_FPS` | FPS gửi qua WebSocket cho viewer | `12` |
| `SMOKING_MODEL_REPO` / `SMOKING_MODEL_FILE` | Model Hugging Face cho hút thuốc (+ tạm dùng cho vape) | `Enos-123/smoking-detection` |
| `FIRE_MODEL_REPO` / `FIRE_MODEL_FILE` | Model Hugging Face cho cháy nổ | `SalahALHaismawi/yolov26-fire-detection` |
| `FLAME_HEURISTIC_CONF_THRESHOLD` | Ngưỡng detector heuristic lửa xanh dương | `0.35` |
| `SMOKING_CONF_THRESHOLD` / `FIRE_CONF_THRESHOLD` | Ngưỡng confidence tối thiểu | `0.5` / `0.5` |
| `EVENT_COOLDOWN_SECONDS` | Nghỉ giữa 2 event cùng loại | `30` |

## macOS: lỡ bắt nhầm camera iPhone (Continuity Camera)

Nếu log hiện cảnh báo `AVCaptureDeviceTypeExternal is deprecated for Continuity
Cameras` và camera bị **connect/disconnect liên tục mỗi giây**, hoặc hình
toàn màu đen — nhiều khả năng `CAMERA_SOURCE=0` đang trỏ vào camera của
iPhone (qua Continuity Camera) thay vì camera build-in của Mac.

Cách tìm đúng index camera build-in:

```bash
python3 -c "
import cv2
for idx in range(4):
    cap = cv2.VideoCapture(idx)
    ok, frame = cap.read()
    print(idx, 'opened' if cap.isOpened() else 'closed', None if not ok else frame.shape)
    cap.release()
"
```

Thử lần lượt từng index còn hoạt động (`opened`) trong `CAMERA_SOURCE` của
`.env` cho đến khi thấy đúng hình từ camera máy tính. Trên máy có cả FaceTime
HD Camera + iPhone Camera, thường camera máy tính sẽ ở index khác `0` (ví dụ
`1`).

## Test không cần webcam

Đặt `CAMERA_SOURCE` trỏ tới 1 file video mp4 có cảnh hút thuốc/cháy để test
mà không cần đứng trước webcam:

```
CAMERA_SOURCE=/duong/dan/toi/video-test.mp4
```

## Model đang dùng & giới hạn đã biết

- **Cháy nổ** — `SalahALHaismawi/yolov26-fire-detection` (YOLOv26-S, 3 class:
  `fire`, `smoke`, `other`), mAP50 ≈ 0.95. Đã thử `rabahdev/fire-smoke-yolov8n`
  (D-Fire) trước đó nhưng model đó gần như không nhận ra lửa bật lửa thường cỡ
  nhỏ cận cảnh (confidence đo thực tế chỉ ~0.10-0.15 dù lửa hiện rõ trong
  khung hình — model chỉ train trên lửa/khói quy mô lớn). Model hiện tại bắt
  lửa nhỏ tốt hơn hẳn (đo thực tế 0.4-0.75 cùng cảnh) nhờ có class `other`
  riêng hứng vùng màu giống lửa (da người dưới đèn ấm) thay vì nhét vào
  `fire`. Vẫn giữ thêm lớp phòng vệ: `FireDetector` tính tỉ lệ pixel màu da
  trong bbox, loại bỏ detection nếu > 45% diện tích là da (xem
  `app/detectors/fire_detector.py`).
- **Lửa xanh dương (bật lửa khò/torch)** — không model YOLO fire/smoke nào ở
  trên nhận ra vì dataset train hầu như toàn lửa cam/đỏ. Được bù bằng
  `FlameBlobDetector` (heuristic màu sắc, xem mục riêng bên dưới).
- **Hút thuốc** — `Enos-123/smoking-detection`: YOLOv11-Medium, fine-tune trên
  dataset cigarette thật từ Roboflow (1 class `cigarette`, mAP@0.5 ≈ 83%,
  precision ≈ 86%). Đây là **model cộng đồng**, chưa qua kiểm định kỹ trên bối
  cảnh công trường Việt Nam (góc quay xa, ánh sáng công nghiệp...) → khả năng
  cao cần fine-tune lại với dữ liệu camera công trường thật trước khi đưa vào
  production.
- Nếu 1 trong các model tải/load lỗi (mất mạng, đổi repo...), server **vẫn
  chạy bình thường** với các detector còn lại — xem `/health` để biết detector
  nào đang `ready: false` và lý do (`error`).

## Vape — chưa có detector chuyên biệt, tạm dùng chung model hút thuốc

Đã tìm trên Hugging Face + Roboflow: **chưa có model vape-detection public nào
tải trực tiếp (`.pt`) được** — các lựa chọn tìm thấy hoặc chỉ có qua Roboflow
Inference API (cần tài khoản + API key riêng, không chạy local được), hoặc chỉ
là dataset/bài báo nghiên cứu chưa có checkpoint train sẵn.

**Quyết định hiện tại:** tạm dùng chung `SmokingDetector` (`Enos-123/smoking-detection`,
chỉ biết class `cigarette`) cho cả vape — best-effort, không có gì đảm bảo:

- Vape dạng pod nhỏ, cầm gần miệng theo tư thế hút thuốc → **có thể** bị nhận
  nhầm thành `cigarette` do hình dáng elongated tương tự (chưa kiểm chứng
  bằng thiết bị vape thật).
- Vape dạng box mod (hộp vuông, to) → hình dáng khác hẳn cigarette, **nhiều
  khả năng sẽ không được phát hiện**.
- Đám mây hơi (vapor cloud) thở ra → không có detector riêng xử lý, có thể
  hoặc không trigger `smoke` class của `FireDetector` tuỳ độ đậm/khoảng cách,
  chưa kiểm chứng.

Khi cần độ chính xác thật cho vape, 2 hướng nâng cấp:

1. Đăng ký Roboflow API key (free tier) và gọi model
   `cigarette-vape-detection-lagrc-4ypjd` (9827 ảnh train, có class `vape`
   riêng) qua Inference API thay vì chạy local hoàn toàn.
2. Tự thu thập ảnh vape thật (nhiều góc, nhiều loại thiết bị) và fine-tune lại
   `SmokingDetector` với class `vape` bổ sung.

## Kiến trúc sự kiện — khớp với frontend `Vifence-CMS`

Output map thẳng theo dictionary nhóm **PCCC** đã có trong
`src/modules/module03-safety/data/safetyMonitoringDictionary.ts`:

| behavior | scenario_id | scenario_name |
|---|---|---|
| `smoking` | `PCCC-001` (đã có ở frontend) | Phát hiện hút thuốc ngoài khu vực cho phép |
| `fire` | `PCCC-002` (**đề xuất bổ sung**, chưa có ở frontend) | Phát hiện dấu hiệu cháy nổ |

## Lửa xanh dương (bật lửa khò) & nhầm lẫn bật lửa ↔ điếu thuốc

Test thực tế phát hiện 2 vấn đề với bật lửa khò (torch lighter, ngọn lửa màu
**xanh dương** thay vì cam/đỏ thường thấy):

1. **`FireDetector` (YOLO) không nhận ra lửa xanh dương** — model train trên
   dataset D-Fire gần như toàn lửa cam/đỏ cỡ lớn (cháy nhà, cháy rừng), không
   có mẫu lửa xanh dương/cận cảnh nhỏ như bật lửa khò → confidence gần 0.
   **Đã thêm** `FlameBlobDetector` (`app/detectors/flame_blob_detector.py`) —
   detector heuristic không cần model ML, dò theo 2 bước: (1) khoanh vùng màu
   xanh dương, (2) xác nhận có "lõi cháy trắng" (pixel rất sáng, gần bão hoà
   camera) bên trong mới báo — tránh nhầm với vật thể xanh dương tĩnh (quần
   áo, đồ nhựa, máy tạo ẩm...). Cả `FireDetector` và `FlameBlobDetector` cùng
   chung `behavior="fire"`, dùng chung 1 debounce/event.

2. **Vật hình trụ nhỏ cầm gần miệng (bật lửa, ống hút...) bị `SmokingDetector`
   nhận nhầm thành điếu thuốc** — đã xác nhận với cả thân bật lửa lẫn **ống
   hút** (ảnh trắng/đầu hồng, conf lên tới 0.85). Đây là hạn chế thật của
   model cộng đồng `Enos-123/smoking-detection` (chỉ 1 class `cigarette`,
   dataset train không có "hard negative" là bật lửa/ống hút/bút/vape để
   phân biệt) — đã nâng `SMOKING_CONF_THRESHOLD` lên `0.5` để giảm bớt, nhưng
   **chưa giải quyết triệt để** vì các vật này vẫn đạt confidence rất cao
   (0.6-0.85).

   **Đã thử và loại bỏ:** lọc theo "đóm lửa" ở đầu vật thể (vùng đỏ/cam bão
   hoà cao, tương tự cách lọc da người cho fire) — không khả thi vì đầu ống
   hút màu (hồng/đỏ) cũng cho ra đúng dải màu đó, không phân biệt được với
   đầu điếu thuốc đang cháy bằng heuristic màu sắc trên 1 frame đơn.

   **Đã thử và ĐẢO NGƯỢC:** ban đầu bắt "hút thuốc" phải có khói bay lên gần
   đầu điếu mới xác nhận (dùng class `smoke` của `FireDetector`). Về lý
   thuyết đúng (khói là bằng chứng phân biệt điếu thuốc thật với vật vô tri),
   nhưng **test thực tế với điếu thuốc đang cháy thật cho kết quả 0/38 lần
   bắt được `smoke`** trong 1 phiên hút thật — khói thuốc lá quá mỏng so với
   khói cháy/hoả hoạn mà model được train để nhận diện. Yêu cầu này khiến hệ
   thống bỏ sót toàn bộ vi phạm hút thuốc thật (false-negative), tệ hơn nhiều
   so với vấn đề ban đầu (thỉnh thoảng báo nhầm ống hút/bật lửa).

   **Quyết định cuối cùng:** `smoking` xác nhận trực tiếp qua model cigarette
   như ban đầu (không yêu cầu khói). Chỉ giữ lại 1 phần của ý tưởng khói: nếu
   khói THỰC SỰ xuất hiện gần đầu điếu (camera bắt được rõ), khói đó được quy
   cho hành vi hút thuốc và **không** tính thêm là "cháy nổ" độc lập — tránh 1
   hành vi tạo 2 sự kiện cùng lúc. Khói không nằm gần vật giống điếu thuốc vẫn
   tính là cháy nổ bình thường. Xử lý ống hút/bật lửa bị nhận nhầm vẫn dựa vào
   `SMOKING_CONF_THRESHOLD` + khuyến nghị duyệt snapshot trước khi xử lý.

## Mobile camera → backend máy cá nhân (GitHub Pages)

Luồng dùng khi mở **https://duncan882022.github.io/Vifence/module03** trên điện
thoại:

```
Điện thoại (GitHub Pages)
  → getUserMedia (camera điện thoại)
  → chụp frame JPEG ~1.8s/lần
  → WSS /ws/analyze qua ngrok/Cloudflare Tunnel
      → Máy tính cá nhân (backend-ai)
          → YOLO + heuristic
          → trả detections + events
  → FE vẽ bbox + badge "Hút thuốc" / "Cháy nổ"
```

### Cách chạy demo

**Trên máy tính:**

```bash
cd backend-ai
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000
# Terminal khác:
ngrok http 8000
# Copy URL dạng https://xxxx.ngrok-free.app
```

**Trên điện thoại:**

1. Mở `https://duncan882022.github.io/Vifence/module03`
2. Chọn camera **Mobile** (vd Duncan IPhone) → cho phép camera
3. Bấm icon ⚙ trên khung hình → dán URL ngrok → **Lưu & kết nối**
4. Giữ điện thoại quay hiện trường — AI chạy trên máy tính, kết quả hiện trên
   màn hình điện thoại (badge AI xanh khi kết nối OK)

> URL ngrok lưu trong `localStorage` (`vifence_mobile_ai_backend_url`) — không
> hardcode lúc build GitHub Pages. Mỗi lần restart ngrok free cần dán URL mới.

> Trang GitHub Pages là HTTPS → backend phải lộ qua **HTTPS/WSS** (ngrok tự lo).

## Bước tích hợp tiếp theo (chưa làm trong POC này)

1. Verify độ chính xác model hút thuốc/cháy nổ trên webcam thật, điều chỉnh
   `*_CONF_THRESHOLD` / `*_EVENT_MIN_DURATION_SECONDS` cho phù hợp.
2. Thêm scenario `PCCC-002` vào `safetyMonitoringDictionary.ts` +
   `safetyScenarios.ts` (frontend) để có icon/label/mock hiển thị đồng bộ.
3. Đổi transport `WS /ws/live` sang đúng format MPEG-TS mà
   `CameraJsmpegFeed.tsx` đang consume (cần thêm bước mux qua `ffmpeg`), hoặc
   viết 1 component viewer mới dùng thẳng format JSON hiện tại.
4. Nối `POST /events` (khi có sự kiện mới) sang API thật `/safety-violations`
   của `be_vifence` thay vì chỉ lưu local JSONL.
5. Đánh giá thay `basant18/Smoking-detection-YOLO26s` bằng model tự train
   trên dữ liệu camera công trường thật nếu độ chính xác chưa đạt.
