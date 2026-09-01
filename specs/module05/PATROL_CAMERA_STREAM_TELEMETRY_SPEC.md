# Module 05 — Overlay thời gian + GPS trên luồng camera (HC-02 & Drone)

> **Rev.1** — Overlay FE trên `CameraChrome` (HC-02 / DR-*). **Không** đổi schema `live/bundle`.

---

## 1. Yêu cầu nghiệp vụ

Khi xem camera tuần tra trên lưới Module 05:

| Camera | Hiện trạng | Mục tiêu |
|--------|------------|----------|
| **HC-01** | Luồng RTSP bodycam có **OSD thiết bị** — ngày/giờ + tọa độ GPS **burn-in** trên video | Giữ nguyên (không cần CMS vẽ thêm) |
| **HC-02** | Video qua MediaMTX/WHIP hoặc legacy-mobile — **không** có OSD thiết bị | Hiển thị **thời gian VN + GPS** trên tile, **cùng vị trí/kiểu** như HC-01 |
| **DR-*** (flycam) | Tương tự HC-02 — không OSD | Hiển thị **thời gian VN + GPS + heading** (nếu có) |

Người giám sát phải đọc được **khi nào** và **ở đâu** ghi hình mà không cần mở bản đồ.

---

## 2. Phân biệt HC-01 vs HC-02 / Drone

```
HC-01 (bodycam IP)
  RTSP gateway ──▶ OSD thiết bị (datetime + lat/lng trên pixel video)
  CMS chỉ phát video — không vẽ lại telemetry

HC-02 / DR-*
  WHIP / RTMP / RTSP ──▶ không OSD
  CMS phải vẽ overlay HTML trên CameraChrome
```

**Không** nhầm với yêu cầu “thêm field vào `GET /patrol/live/bundle`” — bundle hiện tại đủ dùng (xem §4).

---

## 3. Thiết kế UI overlay

### 3.1. Vị trí & lớp z-index

Gắn vào **`CameraChrome`** (`src/modules/module02-training/components/CameraToolbar.tsx`) — dùng chung mọi luồng (bodycam, mobile, flycam).

```
┌─────────────────────────────────────┐
│ LIVE  [flight mode]     [toolbar] │  z-8
│                                     │
│         (video + ROI)               │
│                                     │
│ 01/09/2026 15:32:08                 │  z-7 — góc trái dưới, TRÊN gradient CameraInfoBar
│ 20.9331°N  105.7542°E  ·  90°      │     hoặc góc phải dưới nếu trùng tên cam
│ Helmet 02                           │  CameraInfoBar (sẵn có)
└─────────────────────────────────────┘
```

- Font: `font-mono`, `text-[9px]` compact / `text-[10px]` bình thường
- Màu chữ: `text-white/90`, nền `bg-black/55 backdrop-blur-sm px-1.5 py-0.5 rounded`
- **HC-01:** `streamType === 'bodycam' && id === 'HC-01'` → **không** render overlay CMS (tránh trùng OSD thiết bị)
- **HC-02:** `HC-*` còn lại + `streamType` bodycam/mobile
- **Drone:** `DR-*` + `streamType === 'flycam'`

### 3.2. Định dạng hiển thị

| Field | Format | Ghi chú |
|-------|--------|---------|
| Thời gian | `DD/MM/YYYY HH:mm:ss` | Múi `Asia/Ho_Chi_Minh` — dùng `formatVnIsoTimestamp` / helper tương đương, **tick 1s** khi online |
| Vĩ độ | `xx.xxxx°N` hoặc `°S` | 4 chữ số thập phân |
| Kinh độ | `xxx.xxxx°E` hoặc `°W` | 4 chữ số thập phân |
| Heading | `· NN°` | Chỉ khi `heading != null`; icon la bàn tùy chọn |

Khi **chưa có GPS fix** (stream online nhưng thiếu tọa độ):

```
01/09/2026 15:32:08
GPS: đang chờ tín hiệu…
```

Khi **offline**: ẩn overlay telemetry (giữ badge OFFLINE).

---

## 4. Nguồn dữ liệu (không đổi API bundle)

Ưu tiên theo thứ tự — **per `cameraId`**:

| # | Nguồn | Khi nào | Field |
|---|--------|---------|-------|
| 1 | `live/bundle` → `metrics.cameras[]` | Poll/WS Module 05 | `gps_lat`, `gps_lng` (+ thêm `heading` nếu BE expose qua metrics — hiện có trong `patrol_gps_payload`) |
| 2 | `workforce.helmets[cameraId]` | Cùng bundle | `lat`, `lon`, `heading`, `online` |
| 3 | `getPatrolHelmetGps(cameraId)` | Tab publisher / bridge local | `lat`, `lng`, `updatedAt` |
| 4 | Fallback | Online, chưa GPS | Ẩn tọa độ hoặc `GPS: đang chờ…` — **không** hardcode tên site |

Thời gian overlay:

- **Ưu tiên A:** `workforce.server_time` hoặc `server_time` bundle → parse ISO, hiển thị giờ VN, cộng delta local mỗi giây
- **Ưu tiên B:** `Date.now()` client khi stream online (chấp nhận lệch vài giây so với server)
- **Không** lấy từ `frame_wallclock_ms` VMS — đó là mốc AI frame, không phải OSD người xem

Hook đề xuất: `usePatrolCameraStreamTelemetry(cameraId)` trong `src/modules/module05-productivity/hooks/` — subscribe `usePatrolLivePoll` hoặc context nhẹ, tránh prop-drill qua `CameraGridPanel`.

---

## 5. Luồng triển khai FE (checklist dev)

1. **`PatrolStreamTelemetryOverlay.tsx`** — component presentational nhận `{ datetimeVn, lat, lng, heading, compact }`.
2. **`usePatrolCameraStreamTelemetry.ts`** — merge nguồn §4; memo theo `cameraId`.
3. **`CameraChrome`** — render overlay khi `shouldShowPatrolStreamTelemetry(cam.id)`:
   - `true` cho `HC-02`, `DR-*`
   - `false` cho `HC-01` (OSD thiết bị)
4. **Module05Page** — đảm bảo `usePatrolLivePoll` đã chạy trước khi mở grid (đã có).
5. **Test Vitest:**
   - format datetime VN
   - HC-01 → overlay ẩn
   - HC-02 có gps → hiện 2 dòng
   - DR-03 có heading → hiện góc

**Không** sửa: `build_patrol_live_bundle_payload`, schema WS, `PatrolLiveFeedPayload` — trừ khi metrics thiếu `heading` trên `cameras[]` (chỉ cần 1 dòng BE nếu workforce chưa đủ).

---

## 6. BE tối thiểu (tùy chọn)

Nếu `metrics.cameras[]` chưa có `heading` trong aggregate:

```python
# patrol_runtime.build_patrol_aggregate_metrics_payload — per camera
**patrol_gps_payload(cam_id)  # gps_lat, gps_lng, heading
```

Không thêm block `stream` / `gps` top-level vào bundle — FE đọc trực tiếp per-camera metrics + workforce.

---

## 7. Acceptance criteria

| ID | Given | When | Then |
|----|-------|------|------|
| TELEM-01 | HC-01 online | Xem tile | Video có OSD thiết bị; CMS **không** vẽ thêm datetime/GPS |
| TELEM-02 | HC-02 online + GPS | Xem tile | 2 dòng: `DD/MM/YYYY HH:mm:ss` + tọa độ; cập nhật giây |
| TELEM-03 | HC-02 online, chưa GPS | Xem tile | Thời gian chạy; dòng GPS = “đang chờ tín hiệu…” |
| TELEM-04 | DR-03 proximity + GPS + heading | Xem tile | Thời gian + tọa độ + `NN°` |
| TELEM-05 | Camera offline | Xem tile | Không hiện telemetry; OFFLINE badge |

---

## 8. Prompt ngắn cho agent dev

```
Implement PATROL_CAMERA_STREAM_TELEMETRY_SPEC.md rev.1:
- Overlay datetime VN + GPS trên CameraChrome cho HC-02 và DR-* only.
- HC-01 giữ OSD thiết bị — không overlay CMS.
- Data: live/bundle metrics.cameras + workforce.helmets + patrolHelmetGpsBridge.
- Không đổi live/bundle schema (no stream/gps top-level blocks).
- Tests Vitest + manual Module 05 grid.
```

---

## 9. Liên quan

- `specs/module05/HELMET_UNIFIED_PIPELINE.md` — HC-01/HC-02 cùng pipeline MediaMTX
- `specs/module05/REALTIME_WORKFORCE_HEATMAP_SPECIFICATION.md` — GPS/heading workforce
- `src/modules/module02-training/components/CameraToolbar.tsx` — `CameraChrome`
- `src/utils/vnDateTime.ts` — format giờ VN
