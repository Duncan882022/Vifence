# Module 05 — Test cases theo module

> **Route gốc:** `/module05` · `/module05/ho-so` · `/module05/quet-mat`  
> **Code:** `src/modules/module05-productivity/`  
> **Quy ước:** P0 = blocker · P1 = core · P2 = UX/polish  
> **Cập nhật:** 2026-09-01

---

## Mục lục

| # | Module | Route / vị trí |
|---|--------|----------------|
| 1 | [KPI](#module-1--kpi) | `/module05` — Panel **Tổng Quan** |
| 2 | [Live](#module-2--live) | `/module05` — Camera mode **Live** |
| 3 | [Playback](#module-3--playback) | `/module05` — Camera mode **Playback** |
| 4 | [Heatmap](#module-4--heatmap) | `/module05` — Panel **HEATMAP / FLYMAP** |
| 5 | [Sự kiện](#module-5--sự-kiện) | `/module05` — Panel **SỰ KIỆN** |
| 6 | [Hồ sơ](#module-6--hồ-sơ) | `/module05/ho-so` |
| 7 | [Scan](#module-7--scan) | `/module05/quet-mat` |

**Phụ lục:** [Điều kiện chung](#phụ-lục--điều-kiện-chung) · [Test tự động](#phụ-lục--test-tự-động) · [Checklist release](#phụ-lục--checklist-release)

**Format mỗi TC:**

```
ID | Tên | P | Tiên quyết | Các bước | Kết quả mong đợi
```

---

## Module 1 — KPI

**Vị trí UI:** Panel **Tổng Quan** (Tier1) trên `/module05`  
**Component:** `PatrolKPIs` · `Module05Page.tsx`  
**Nguồn dữ liệu:**

| KPI | Service / hook |
|-----|----------------|
| Khu vực tuần tra | `computePatrolZoneCoverage()` + `usePatrolLivePoll` workforce |
| Nhân sự | `derivePatrolDisplayStats()` ← `dayBundle.stats` |
| Lượt gặp · ĐT | `dayBundle.stats.objectEncounterCount` / `unassignedObservations` |
| Mật độ flymap | `usePatrolFlymapMetrics()` → `GET /patrol/{cameraId}/metrics` |

**Lưu ý:** KPI **Nhân sự** lấy từ backend stats; badge tab **Sự kiện** lấy từ listing — **có thể lệch**, không coi là bug.

---

### TC-KPI-001 — Hiển thị 4 thẻ KPI

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Mở `/module05`, panel Tổng Quan mở |
| **Các bước** | 1. Quan sát Tier1 |
| **Kết quả** | 4 thẻ: **Khu vực tuần tra** · **Nhân sự** · **Lượt gặp · ĐT** · **Mật độ flymap**; mỗi thẻ có icon + value + unit + detail |

---

### TC-KPI-002 — Khu vực: có thiết bị đã phủ khu

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | ≥1 zone visited; cam online hoặc GPS trong polygon |
| **Các bước** | 1. Xem thẻ **Khu vực tuần tra** |
| **Kết quả** | Value = `{visited}/{total}` khu vực; detail = «{X}% khu có thiết bị tuần tra active» |

---

### TC-KPI-003 — Khu vực: online chưa xác nhận phủ

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Cam online; `visitedZones = 0` |
| **Các bước** | 1. Xem detail thẻ Khu vực |
| **Kết quả** | «Thiết bị online — chờ xác nhận phủ khu» |

---

### TC-KPI-004 — Khu vực: mọi thiết bị offline

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | HC-01, HC-02, DR-03 đều offline |
| **Các bước** | 1. Xem detail thẻ Khu vực |
| **Kết quả** | «Chưa có thiết bị tuần tra online» |

---

### TC-KPI-005 — Nhân sự: có dữ liệu ngày

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | `personCount + identityCount > 0` trong day bundle |
| **Các bước** | 1. Xem thẻ **Nhân sự** |
| **Kết quả** | Value = tổng headcount; detail hiện icon UserX (personCount) + UserCheck (identityCount) |

---

### TC-KPI-006 — Nhân sự: chờ phát hiện (cam online)

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Headcount = 0; ≥1 cam online + có stream |
| **Các bước** | 1. Xem detail thẻ Nhân sự |
| **Kết quả** | «Đang tuần tra — chờ phát hiện» |

---

### TC-KPI-007 — Nhân sự: không có dữ liệu hôm nay

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Headcount = 0; không cam online |
| **Các bước** | 1. Xem detail thẻ Nhân sự |
| **Kết quả** | «Chưa có dữ liệu hôm nay» |

---

### TC-KPI-008 — Lượt gặp · ĐT: peak time

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | `peak_time_active` trên metrics cam |
| **Các bước** | 1. Xem detail thẻ **Lượt gặp · ĐT** |
| **Kết quả** | «Peak time — mặt rõ định danh; còn lại gom 1 nhóm ĐT» |

---

### TC-KPI-009 — Lượt gặp · ĐT: có silhouette

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | `objectEncounterCount > 0`; không peak time |
| **Các bước** | 1. Xem detail |
| **Kết quả** | «Silhouette chưa gán danh tính — không tính Nhân sự»; value = số lượt |

---

### TC-KPI-010 — Lượt gặp · ĐT: chưa ghi nhận

| | |
|---|---|
| **P** | P2 |
| **Tiên quyết** | `objectEncounterCount = 0` |
| **Các bước** | 1. Xem detail |
| **Kết quả** | «Chưa ghi nhận lượt gặp Đối tượng» |

---

### TC-KPI-011 — Mật độ flymap: DR-03 online

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | DR-03 stream online |
| **Các bước** | 1. Xem thẻ **Mật độ flymap** |
| **Kết quả** | Value = số người/khung; unit «người/khung»; detail «YOLO tầm cao — không cộng Nhân sự» |

---

### TC-KPI-012 — Mật độ flymap: DR-03 offline

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | DR-03 offline |
| **Các bước** | 1. Xem thẻ Mật độ flymap |
| **Kết quả** | Value = «—»; detail «Flycam chưa online» |

---

### TC-KPI-013 — Mật độ flymap: đang tải

| | |
|---|---|
| **P** | P2 |
| **Tiên quyết** | DR-03 online; API metrics chưa trả |
| **Các bước** | 1. Quan sát ngay sau load |
| **Kết quả** | Detail «Đang tải mật độ…» (transient) |

---

### TC-KPI-014 — Thu gọn panel Tổng Quan

| | |
|---|---|
| **P** | P2 |
| **Tiên quyết** | Desktop |
| **Các bước** | 1. Click collapse **Tổng Quan** |
| **Kết quả** | KPI ẩn; panel header còn; toggle mở lại hiện 4 thẻ |

---

### TC-KPI-015 — KPI không đồng bộ badge tab Sự kiện

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Có dữ liệu ngày; tab Sự kiện có card |
| **Các bước** | 1. So sánh headcount KPI **Nhân sự** vs tổng tab **Người + Định danh** |
| **Kết quả** | Có thể khác nhau (stats backend vs listing có snapshot) — **pass** nếu đúng thiết kế |

---

## Module 2 — Live

**Vị trí UI:** Panel **Camera** · toggle **Live** trên `/module05`  
**Component:** `PatrolCameraPanel` → `CameraGridPanel`  
**Hooks:** `usePatrolVisionStreams` · `usePatrolLivePoll` · `buildPatrolCamerasLive`  
**API:** `WS /ws/patrol/live` → fallback `GET /patrol/live/bundle` (~2.5s)

---

### TC-LIVE-001 — Mặc định mode Live

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Mở `/module05` lần đầu |
| **Các bước** | 1. Xem panel Camera |
| **Kết quả** | Toggle **Live** active; grid camera hiển thị |

---

### TC-LIVE-002 — Grid đủ 3 thiết bị

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Không legacy mobile-only grid |
| **Các bước** | 1. Xem grid Live |
| **Kết quả** | HC-01 (Helmet 01), HC-02 (Helmet 02), DR-03 (Drone 03) |

---

### TC-LIVE-003 — Camera mặc định chọn HC-02

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Fresh load |
| **Các bước** | 1. Quan sát tile highlight |
| **Kết quả** | HC-02 selected (`selectedCamId = 'HC-02'`) |

---

### TC-LIVE-004 — Filter tab Bodycam

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Live mode |
| **Các bước** | 1. Click tab **Bodycam** |
| **Kết quả** | Chỉ HC-01, HC-02; DR-03 ẩn |

---

### TC-LIVE-005 — Filter tab Flycam

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Live mode |
| **Các bước** | 1. Click tab **Flycam** |
| **Kết quả** | Chỉ DR-03 |

---

### TC-LIVE-006 — Badge LIVE khi stream online

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Cam có luồng WHEP/HLS active |
| **Các bước** | 1. Quan sát tile online |
| **Kết quả** | Badge LIVE + pulse dot |

---

### TC-LIVE-007 — Tile offline

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Cam không stream |
| **Các bước** | 1. Quan sát tile offline |
| **Kết quả** | Trạng thái offline; `streamWhenOffline` retry (không crash) |

---

### TC-LIVE-008 — Badge chế độ bay DR-03

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | DR-03 online |
| **Các bước** | 1. Xem góc tile DR-03 |
| **Kết quả** | **Tầm cao** hoặc **Tầm thấp** (`patrolFlightModeShortLabel`) |

---

### TC-LIVE-009 — Chọn camera cập nhật selection

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Live mode |
| **Các bước** | 1. Click tile HC-01 |
| **Kết quả** | HC-01 highlight; `selectedCamId` đổi; stream focus tile đó |

---

### TC-LIVE-010 — Đếm luồng khi panel Camera thu gọn

| | |
|---|---|
| **P** | P2 |
| **Tiên quyết** | Live mode; tier Camera collapsed |
| **Các bước** | 1. Thu gọn panel Camera |
| **Kết quả** | Header hiện «**X** luồng» khớp số stream active |

---

### TC-LIVE-011 — WebSocket live bundle

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Backend WS hoạt động |
| **Các bước** | 1. Mở DevTools WS 2. Quan sát KPI/heatmap ~3s |
| **Kết quả** | Nhận `live_bundle`; metrics + workforce cập nhật |

---

### TC-LIVE-012 — Fallback HTTP khi WS lỗi

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Block WS hoặc server không hỗ trợ WS |
| **Các bước** | 1. Reload trang 2. Quan sát network |
| **Kết quả** | Poll `GET /patrol/live/bundle`; UI vẫn cập nhật |

---

### TC-LIVE-013 — HC-02 online qua frames bridge

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Backend báo HC-02 offline; mobile bridge gửi frames |
| **Các bước** | 1. Xem trạng thái HC-02 |
| **Kết quả** | Coi online (`resolvePatrolCameraOnlineState` + framesLive) |

---

### TC-LIVE-014 — Auth & identity sync on mount

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Fresh load |
| **Các bước** | 1. Quan sát network tab |
| **Kết quả** | Gọi `ensurePatrolAuth()` + `syncPatrolIdentityBindingsFromBackend()` |

---

### TC-LIVE-015 — Legacy mobile helmet permission gate

| | |
|---|---|
| **P** | P2 |
| **Tiên quyết** | `hasLegacyMobileHelmet()` + handheld device |
| **Các bước** | 1. Mở `/module05` trên mobile |
| **Kết quả** | `PatrolDevicePermissionGate` hiện xin quyền camera/mic |

---

### TC-LIVE-016 — Person ROI overlay trên tile

| | |
|---|---|
| **P** | P2 |
| **Tiên quyết** | HC-* live + AI detection |
| **Các bước** | 1. Quan sát overlay bbox trên video |
| **Kết quả** | Label tier khớp token Module 05 (Đối tượng/Người/Định danh) |

---

### TC-LIVE-017 — DR-03 proximity: ROI như helmet

| | |
|---|---|
| **P** | P2 |
| **Tiên quyết** | DR-03 `flight_mode = proximity` |
| **Các bước** | 1. Xem overlay DR-03 |
| **Kết quả** | Person ROI hiển thị (gate `patrolPersonMeetsDrFlycamDisplayGate`) |

---

### TC-LIVE-018 — Expand tier Camera fullscreen

| | |
|---|---|
| **P** | P2 |
| **Tiên quyết** | Desktop |
| **Các bước** | 1. Expand panel Camera |
| **Kết quả** | Grid chiếm full tier; toggle Live/Playback vẫn hoạt động |

---

## Module 3 — Playback

**Vị trí UI:** Panel **Camera** · toggle **Playback** trên `/module05`  
**Component:** `PatrolPlaybackPanel`  
**Service:** `patrolPlayback.service.ts` · `createPatrolPlaybackFetchers()`  
**MediaMTX:** `GET /list` · `GET /get?path=&start=&duration=30`

**Quy tắc ngày:** ngày lịch VN cắt **0h**; retain **7 ngày**; **không** ca/kíp 06:00.

---

### TC-PB-001 — Chuyển sang mode Playback

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | Đang ở Live |
| **Các bước** | 1. Click toggle **Playback** |
| **Kết quả** | Timeline + date picker + vùng video playback hiện |

---

### TC-PB-002 — Date mặc định = hôm nay VN

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | Fresh load `/module05` |
| **Các bước** | 1. Mở Playback |
| **Kết quả** | Date = `getPatrolDefaultPlaybackDate()` (= `formatVnDate()`) |

---

### TC-PB-003 — Giới hạn 7 ngày gần nhất

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | Playback mở |
| **Các bước** | 1. Thử chọn ngày >7 ngày trước |
| **Kết quả** | Min date = hôm nay − 6; không chọn được ngoài range |

---

### TC-PB-004 — Đồng bộ date với panel Sự kiện

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | Cả Playback và Sự kiện visible |
| **Các bước** | 1. Đổi ngày ở Sự kiện 2. Xem Playback |
| **Kết quả** | `patrolViewDate` shared; Playback load băng đúng ngày |

---

### TC-PB-005 — Click card sự kiện sync ngày playback

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | Card sự kiện ngày quá khứ |
| **Các bước** | 1. Click card sự kiện |
| **Kết quả** | `patrolViewDate` = `getPatrolEventViewDate(ev)`; playback timeline đúng ngày |

---

### TC-PB-006 — Sự kiện sau 0h VN thuộc ngày mới

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | Event `lockedAt = 2026-08-28T17:30:00.000Z` (00:30 VN 29/08) |
| **Các bước** | 1. Chọn ngày 28/08 playback 2. Chọn ngày 29/08 |
| **Kết quả** | Ngày 28: không marker event; ngày 29: có marker |

---

### TC-PB-007 — Phát băng continuous MediaMTX

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | MediaMTX có segment cho cam + ngày |
| **Các bước** | 1. Chọn HC-02 + ngày có băng 2. Play clip |
| **Kết quả** | Video phát; URL qua playback base configured |

---

### TC-PB-008 — Marker sự kiện 30 giây

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Có event trong ngày cho camera đang chọn |
| **Các bước** | 1. Xem timeline 2. Click marker event |
| **Kết quả** | Clip `PATROL_EVENT_CLIP_SEC = 30` giây quanh `lockedAt` |

---

### TC-PB-009 — MediaMTX 404 — không crash

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | Ngày/camera không có băng |
| **Các bước** | 1. Chọn ngày không recording |
| **Kết quả** | Timeline trống; không error toast crash |

---

### TC-PB-010 — URL playback không lộ IP nội bộ

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | MediaMTX trả URL nội bộ trong JSON |
| **Các bước** | 1. Play clip 2. Inspect video src |
| **Kết quả** | URL dựng qua `getMediaMtxPlaybackBase()`; không IP raw MediaMTX |

---

### TC-PB-011 — Filter Bodycam/Flycam trên playback

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Playback mode |
| **Các bước** | 1. Tab **Flycam** 2. Chọn DR-03 |
| **Kết quả** | Timeline events lọc theo camera DR-03 |

---

### TC-PB-012 — Không rollover 06:00 Module 02

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | Biết behavior Module 02 |
| **Các bước** | 1. Kiểm tra bounds ngày playback |
| **Kết quả** | Ngày bắt đầu 00:00 VN (`vnDayBounds`), không 06:00 |

---

## Module 4 — Heatmap

**Vị trí UI:** Panel **HEATMAP** / **FLYMAP** trên `/module05`  
**Component:** `PatrolDensityHeatmap` · `PatrolGeoHeatmap` · `WorkforceObjectSheet`  
**Controls:** `PatrolHeatmapSectionControls` · `HeatmapLayerControls`

**Lưu ý code:**

- Toggle **Mật độ** = bật/tắt **chấm detection** (`showDetections`)
- Canvas KDE (`PatrolDensityCanvasLayer`) = **`showDensity={false}`** (tắt)
- **Không có** tab thời gian Live/5p/15p/1h/Ca trên UI

---

### TC-MAP-001 — Panel mặc định HEATMAP

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Mở `/module05` |
| **Các bước** | 1. Xem panel map |
| **Kết quả** | Title **HEATMAP**; bản đồ Leaflet satellite hiện |

---

### TC-MAP-002 — Layer Khu vực

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Heatmap mode |
| **Các bước** | 1. Toggle **Khu vực** off/on |
| **Kết quả** | Polygon site boundary ẩn/hiện |

---

### TC-MAP-003 — Layer Mật độ (detection dots)

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Có presences/events trong ngày |
| **Các bước** | 1. Toggle **Mật độ** off 2. Toggle on |
| **Kết quả** | Chấm detection ẩn/hiện trên map (không phải canvas KDE) |

---

### TC-MAP-004 — Layer Mũ

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | HC-* online |
| **Các bước** | 1. Toggle **Mũ** |
| **Kết quả** | Marker mũ + route HC-* ẩn/hiện |

---

### TC-MAP-005 — Layer Flycam trên heatmap site

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | DR-03 proximity hoặc có GPS |
| **Các bước** | 1. Toggle **Flycam** |
| **Kết quả** | Marker/route drone trên map site ẩn/hiện |

---

### TC-MAP-006 — Stats overlay ĐT / Người / Định danh

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Heatmap mode; có dayStats |
| **Các bước** | 1. Xem góc map |
| **Kết quả** | Overlay đếm 3 tier từ `dayStats` |

---

### TC-MAP-007 — Click chấm → Object sheet

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Heatmap mode; có detection dot |
| **Các bước** | 1. Click chấm trên map |
| **Kết quả** | `WorkforceObjectSheet` bottom sheet mở (Unknown/Verified info) |

---

### TC-MAP-008 — Manual identity trong sheet

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Dot unknown; có quyền gán |
| **Các bước** | 1. Mở sheet 2. Gán worker |
| **Kết quả** | `PatrolManualIdentityPanel` hoạt động; label cập nhật sau sync |

---

### TC-MAP-009 — Phóng to heatmap

| | |
|---|---|
| **P** | P2 |
| **Tiên quyết** | Desktop |
| **Các bước** | 1. Click Maximize 2. Nhấn Escape |
| **Kết quả** | Fullscreen portal; Escape/backdrop đóng; state layer giữ nguyên |

---

### TC-MAP-010 — Follow GPS HC-02

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | HC-02 online + live GPS |
| **Các bước** | 1. Quan sát map heatmap |
| **Kết quả** | Map pan theo GPS HC-02 (`followLiveGps`) |

---

### TC-MAP-011 — DR-03 aerial: chấm không hiện heatmap site

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | DR-03 `flight_mode = aerial` |
| **Các bước** | 1. Xem heatmap site (không flymap) |
| **Kết quả** | Chấm DR aerial bị lọc (`filterPatrolHeatmapDotsExcludeAerialFlycam`) |

---

### TC-MAP-012 — DR-03 proximity: chấm hiện heatmap site

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | DR-03 proximity + có presence |
| **Các bước** | 1. Xem heatmap site |
| **Kết quả** | Chấm DR hiện như HC-* |

---

### TC-MAP-013 — Bật Flymap

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Heatmap mode |
| **Các bước** | 1. Click nút **Flymap** header |
| **Kết quả** | Panel title → **FLYMAP**; layer: Khu vực · Mật độ · Drone |

---

### TC-MAP-014 — Flymap: chấm một màu

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Flymap active; có detection |
| **Các bước** | 1. Quan sát chấm |
| **Kết quả** | Màu uniform `PATROL_FLYMAP_DOT_HEX` |

---

### TC-MAP-015 — Flymap: stats Phát hiện

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Flymap active |
| **Các bước** | 1. Xem overlay stats |
| **Kết quả** | «Phát hiện: {N}» = số chấm filtered |

---

### TC-MAP-016 — Flymap: không mở object sheet

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Flymap active |
| **Các bước** | 1. Click chấm trên flymap |
| **Kết quả** | **Không** mở `WorkforceObjectSheet` (`onDetectionClick` undefined) |

---

### TC-MAP-017 — Flymap: follow GPS drone

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | DR-03 online + GPS |
| **Các bước** | 1. Quan sát flymap |
| **Kết quả** | Map follow DR-03 live GPS |

---

### TC-MAP-018 — Flymap: route chỉ drone

| | |
|---|---|
| **P** | P2 |
| **Tiên quyết** | Flymap; DR di chuyển |
| **Các bước** | 1. Bật layer Drone/route |
| **Kết quả** | Route chỉ `PATROL_DRONE_IDS`; không vẽ route HC-* |

---

### TC-MAP-019 — Dedupe chấm cùng entity

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Nhiều nguồn cùng objectId |
| **Các bước** | 1. Quan sát map |
| **Kết quả** | 1 chấm/entity; ưu tiên `inCameraView` (`mergePatrolHeatmapDots`) |

---

## Module 5 — Sự kiện

**Vị trí UI:** Panel **SỰ KIỆN** trên `/module05`  
**Component:** `PatrolEventsPanel` · `PatrolEventDetailModal`  
**Nguồn:** `usePatrolDayBundle(viewDate)` → `GET /patrol/day/bundle?date=` (poll 3s hôm nay)  
**Pipeline:** `bundleToEvents()` → `filterPatrolEventsByFlycamAltitude()` → panel

**Tab (4):** Tất cả · Đối tượng · Người · Định danh  
**Logic:** `listPatrolEventsForTab()` + dedupe entity + **bắt buộc snapshotUrl**

---

### TC-EVT-001 — Hiển thị 4 tab filter

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | Panel Sự kiện mở |
| **Các bước** | 1. Quan sát tab bar |
| **Kết quả** | **Tất cả · Đối tượng · Người · Định danh** + badge count mỗi tab |

---

### TC-EVT-002 — Badge count khớp số card

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | Có dữ liệu ngày |
| **Các bước** | 1. So sánh badge tab vs số card visible (không search) |
| **Kết quả** | Badge = `listPatrolEventsForTab(events, tab).length` |

---

### TC-EVT-003 — Date picker compact

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | Panel Sự kiện |
| **Các bước** | 1. Dùng prev/next và calendar overlay |
| **Kết quả** | Đổi `viewDate`; min/max 7 ngày VN |

---

### TC-EVT-004 — Hint «Đang xem ngày trước»

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | `viewDate !== hôm nay`; viewport sm+ |
| **Các bước** | 1. Chọn ngày quá khứ |
| **Kết quả** | Hint «Đang xem ngày trước» hiện |

---

### TC-EVT-005 — Header flycam label

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | DR-03 configured |
| **Các bước** | 1. Xem header panel Sự kiện (parent) |
| **Kết quả** | **Tầm thấp · AI** (proximity) hoặc **Tầm cao · Mật độ** (aerial) |

---

### TC-EVT-006 — Card tab Đối tượng

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | `obj:*` + snapshot + score < 1.05 |
| **Các bước** | 1. Tab **Đối tượng** |
| **Kết quả** | Card hiện; badge xanh lá «Đối tượng» |

---

### TC-EVT-007 — Card tab Người

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | `pers:*` stage person + snapshot score ≥ 1.05 |
| **Các bước** | 1. Tab **Người** |
| **Kết quả** | Card hiện; badge sky «Người» |

---

### TC-EVT-008 — Card tab Định danh

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | `pers:*` stage profile / identified |
| **Các bước** | 1. Tab **Định danh** |
| **Kết quả** | Card hiện tên + badge violet «Định danh» |

---

### TC-EVT-009 — Ẩn card không snapshot

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | Person trong bundle không `snapshotUrl` |
| **Các bước** | 1. Tab **Tất cả** |
| **Kết quả** | Card **không** hiện; không đếm badge |

---

### TC-EVT-010 — Ẩn object score ≥ 1.05

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | Object mis-tiered (face score cao) |
| **Các bước** | 1. Kiểm tra tab Đối tượng |
| **Kết quả** | Object bị lọc (`filterPatrolDayObjectsForDisplay` + score gate) |

---

### TC-EVT-011 — Dedupe cùng entity

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | 2 record cùng persId, `lockedAt` khác |
| **Các bước** | 1. Tab **Tất cả** |
| **Kết quả** | 1 card; giữ bản `lockedAt` mới hơn |

---

### TC-EVT-012 — Card id format

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Có card |
| **Các bước** | 1. Inspect event id |
| **Kết quả** | `pers:{persId}` hoặc `obj:{objId}`; type = `PERSON_DETECTED` (day aggregate) |

---

### TC-EVT-013 — DR-03 aerial lọc person/profile

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | DR-03 aerial; có person event từ drone |
| **Các bước** | 1. Tab **Người** / **Định danh** |
| **Kết quả** | Event person/profile từ DR **ẩn**; chỉ object stage |

---

### TC-EVT-014 — DR-03 proximity hiện đủ stage

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | DR-03 proximity |
| **Các bước** | 1. Duyệt 4 tab |
| **Kết quả** | Events DR lọc như HC-* (person + profile + object) |

---

### TC-EVT-015 — Tìm kiếm debounce 300ms

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | ≥1 card |
| **Các bước** | 1. Gõ tên / mã NV / pers_id vào search |
| **Kết quả** | List lọc sau 300ms; placeholder «Tìm tên, mã NV, pers_id…» |

---

### TC-EVT-016 — Search không khớp

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Có card |
| **Các bước** | 1. Gõ chuỗi vô nghĩa |
| **Kết quả** | «Không có kết quả khớp tìm kiếm» |

---

### TC-EVT-017 — Tab rỗng (có data tab khác)

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Tab hiện tại 0 item; tab all > 0 |
| **Các bước** | 1. Chọn tab không có item |
| **Kết quả** | «Chưa có sự kiện loại này» |

---

### TC-EVT-018 — Empty hôm nay

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Hôm nay; bundle rỗng / không card pass filter |
| **Các bước** | 1. Tab **Tất cả** ngày hôm nay |
| **Kết quả** | «Chưa có sự kiện hôm nay — chọn ngày khác phía trên hoặc đang chờ backend» |

---

### TC-EVT-019 — Empty ngày quá khứ

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Ngày quá khứ không data |
| **Các bước** | 1. Chọn ngày cũ |
| **Kết quả** | «Không có sự kiện ngày này — chọn ngày khác phía trên» |

---

### TC-EVT-020 — Infinite scroll 6 + 4

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | >6 cards trong tab |
| **Các bước** | 1. Load tab 2. Scroll xuống |
| **Kết quả** | Ban đầu 6; mỗi lần +4; footer «Hiển thị X/Y» |

---

### TC-EVT-021 — Click card highlight + sync date

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | Card ngày quá khứ |
| **Các bước** | 1. Click card body |
| **Kết quả** | Card highlight; playback date sync (nếu khác ngày) |

---

### TC-EVT-022 — Click snapshot mở modal

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | Card có snapshot |
| **Các bước** | 1. Click thumbnail snapshot |
| **Kết quả** | `PatrolEventDetailModal` mở |

---

### TC-EVT-023 — Modal: lịch sử xuất hiện

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Modal mở; có appearances |
| **Các bước** | 1. Xem section lịch sử |
| **Kết quả** | `GET /patrol/day/appearances?subject_id=&date={viewDate}` |

---

### TC-EVT-024 — Modal: gallery faces

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Card profile có worker id |
| **Các bước** | 1. Mở modal |
| **Kết quả** | Gallery faces load (`fetchPatrolGalleryFaces`) |

---

### TC-EVT-025 — Modal đóng

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Modal đang mở |
| **Các bước** | 1. Click X / backdrop |
| **Kết quả** | Modal đóng; selection list giữ nguyên |

---

### TC-EVT-026 — Manual identify từ card

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Card person chưa định danh |
| **Các bước** | 1. Modal/sheet → gán identity |
| **Kết quả** | `POST /patrol/persons/{id}/identify`; card cập nhật sau reload |

---

## Module 6 — Hồ sơ

**Route:** `/module05/ho-so`  
**Component:** `WorkerProfileManagementPage` · `WorkerProfileDetailModal`  
**Service:** `patrolWorkerProfile.service.ts`

---

### TC-HOSO-001 — Load trang & 4 stat cards

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Backend OK |
| **Các bước** | 1. Mở `/module05/ho-so` |
| **Kết quả** | Stat: **Tổng hồ sơ · Bản nháp · Đã xác minh · Có vector** |

---

### TC-HOSO-002 — Backend không sẵn sàng

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | `pingPatrolProfileBackend()` fail |
| **Các bước** | 1. Mở trang |
| **Kết quả** | Banner «Backend tuần tra chưa sẵn sàng — kiểm tra URL backend»; list rỗng |

---

### TC-HOSO-003 — Làm mới danh sách

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Trang đã load |
| **Các bước** | 1. Click **Làm mới** |
| **Kết quả** | `GET /patrol/persons` reload; spinner rồi list cập nhật |

---

### TC-HOSO-004 — Tìm kiếm hồ sơ

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | ≥2 hồ sơ |
| **Các bước** | 1. Gõ tên / mã NV / đơn vị / pers_id |
| **Kết quả** | Table lọc client-side khớp query |

---

### TC-HOSO-005 — Filter Bản nháp

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Có draft + identified |
| **Các bước** | 1. Click **Bản nháp** |
| **Kết quả** | Chỉ `status === 'draft'`; badge **Nháp** trên row |

---

### TC-HOSO-006 — Filter Đã xác minh

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Có identified |
| **Các bước** | 1. Click **Đã xác minh** |
| **Kết quả** | Chỉ `status === 'identified'` |

---

### TC-HOSO-007 — Face badge vector

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Hồ sơ có face_count |
| **Các bước** | 1. Xem cột Vector |
| **Kết quả** | `{count}/3`; xanh khi `face_enrollment_complete` |

---

### TC-HOSO-008 — Tải file mẫu Excel

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | Panel import |
| **Các bước** | 1. Click **Tải file mẫu** |
| **Kết quả** | Download `patrol_workers_template.xlsx`; cột: Họ tên, Mã nhân viên, Đơn vị |

---

### TC-HOSO-009 — Import Excel hợp lệ

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | File ≥1 dòng hợp lệ |
| **Các bước** | 1. Chọn file 2. **Import hồ sơ** |
| **Kết quả** | `POST /patrol/persons/import`; hiện success/failed; list refresh |

---

### TC-HOSO-010 — Import thiếu Họ tên / Mã NV

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | File có dòng thiếu field |
| **Các bước** | 1. Import |
| **Kết quả** | «X dòng thiếu Họ tên hoặc Mã nhân viên»; không import |

---

### TC-HOSO-011 — Import file rỗng

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | Excel không có dòng data |
| **Các bước** | 1. Import |
| **Kết quả** | «File Excel không có dòng hợp lệ» |

---

### TC-HOSO-012 — Xem chi tiết hồ sơ

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Có hồ sơ |
| **Các bước** | 1. Click **Eye** |
| **Kết quả** | `WorkerProfileDetailModal` view mode; gallery faces |

---

### TC-HOSO-013 — Sửa hồ sơ

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Có hồ sơ |
| **Các bước** | 1. Click **Pencil** 2. Sửa + lưu |
| **Kết quả** | `PATCH /patrol/persons/{persId}` thành công |

---

### TC-HOSO-014 — Xóa hồ sơ

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Hồ sơ test |
| **Các bước** | 1. Click **Trash** 2. Confirm |
| **Kết quả** | `DELETE /patrol/persons/{persId}`; vector xóa; row biến mất |

---

### TC-HOSO-015 — Link quét mặt từ hồ sơ

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Hồ sơ có employee_code |
| **Các bước** | 1. Mở modal/link quét mặt |
| **Kết quả** | Navigate `/module05/quet-mat?code={employee_code}` |

---

### TC-HOSO-016 — Verify draft profile

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Draft đủ vector |
| **Các bước** | 1. Modal verify |
| **Kết quả** | `POST /patrol/persons/{id}/verify`; status → identified |

---

### TC-HOSO-017 — Empty list draft

| | |
|---|---|
| **P** | P2 |
| **Tiên quyết** | Không có draft |
| **Các bước** | 1. Filter **Bản nháp** |
| **Kết quả** | «Chưa có hồ sơ bản nháp — camera sẽ tạo khi nhận diện đủ điều kiện» |

---

### TC-HOSO-018 — Link về Module 05

| | |
|---|---|
| **P** | P2 |
| **Tiên quyết** | Trang hồ sơ |
| **Các bước** | 1. Click **Về Module 05** |
| **Kết quả** | Navigate `/module05` |

---

## Module 7 — Scan

**Route:** `/module05/quet-mat`  
**Component:** `WorkerFaceScanPage` · `PatrolFaceScannerPanel`  
**Poses:** 3 bắt buộc (Chính diện · Quay trái · Quay phải) + 1 tuỳ chọn (Cúi xuống)

---

### TC-SCAN-001 — Admin mode (HR, không ?code=)

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | User `hasPatrolRole('hr')`; URL không có `?code=` |
| **Các bước** | 1. Mở `/module05/quet-mat` |
| **Kết quả** | UI tra cứu mã NV + nút **Tạo hồ sơ mới + quét mặt** |

---

### TC-SCAN-002 — Self-enroll qua ?code=

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | URL `/module05/quet-mat?code=NV001` |
| **Các bước** | 1. Mở link (kể cả user HR) |
| **Kết quả** | Wizard self-enroll; **không** hiện tra cứu admin |

---

### TC-SCAN-003 — Self-enroll không role HR

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | User không HR; không `?code=` |
| **Các bước** | 1. Mở `/module05/quet-mat` |
| **Kết quả** | Wizard: Quét mặt → Thông tin → Hoàn tất |

---

### TC-SCAN-004 — Admin tra cứu mã hợp lệ

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | Admin mode; mã tồn tại |
| **Các bước** | 1. Nhập mã 2. **Tra cứu** |
| **Kết quả** | `GET /patrol/persons/lookup`; chuyển **Bổ sung vector — hồ sơ đã có** |

---

### TC-SCAN-005 — Admin tra cứu mã không tồn tại

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | Admin mode |
| **Các bước** | 1. Nhập mã sai → Tra cứu |
| **Kết quả** | Lỗi + gợi ý dùng **Tạo hồ sơ mới** |

---

### TC-SCAN-006 — Bổ sung vector hồ sơ có sẵn

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | Sau tra cứu thành công |
| **Các bước** | 1. Quét từng pose 2. Hoàn tất |
| **Kết quả** | `POST /patrol/persons/{persId}/scan` mỗi góc; face_count tăng |

---

### TC-SCAN-007 — Tạo hồ sơ mới (admin)

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | Admin mode |
| **Các bước** | 1. Click **Tạo hồ sơ mới + quét mặt** |
| **Kết quả** | Chuyển enroll wizard (giống self-enroll) |

---

### TC-SCAN-008 — Tạo enroll session

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | Enroll mode (self-enroll hoặc admin-create) |
| **Các bước** | 1. Vào bước quét |
| **Kết quả** | `POST /patrol/enroll/session` → sessionId |

---

### TC-SCAN-009 — Quét 3 pose bắt buộc

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | Session active; camera OK |
| **Các bước** | 1. Quét Chính diện 2. Quay trái 3. Quay phải |
| **Kết quả** | Mỗi pose `POST /patrol/enroll/{id}/scan`; progress 3/3 |

---

### TC-SCAN-010 — Pose 4 tuỳ chọn

| | |
|---|---|
| **P** | P2 |
| **Tiên quyết** | 3 pose xong |
| **Các bước** | 1. Quét **Cúi xuống** (optional) |
| **Kết quả** | Pose 4 lưu; không bắt buộc để qua bước profile |

---

### TC-SCAN-011 — Hướng dẫn ring la bàn

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Đang quét |
| **Các bước** | 1. Quan sát UI hướng dẫn |
| **Kết quả** | Nhãn **TRÊN · PHẢI · DƯỚI · TRÁI**; text theo slot |

---

### TC-SCAN-012 — Form profile pre-fill ?code=

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | URL `?code=NV001`; đã quét xong |
| **Các bước** | 1. Bước **Thông tin** |
| **Kết quả** | Mã NV pre-fill; Họ tên + Đơn vị nhập tay |

---

### TC-SCAN-013 — Submit không consent

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | Bước profile |
| **Các bước** | 1. Không tick consent 2. Submit |
| **Kết quả** | **Blocked**; không gọi complete |

---

### TC-SCAN-014 — Submit có consent

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | 3 pose + form đầy đủ |
| **Các bước** | 1. Tick consent 2. Submit |
| **Kết quả** | `POST /patrol/enroll/{id}/complete` + `consented_at`; bước **Hoàn tất** |

---

### TC-SCAN-015 — Hoàn tất admin-create

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Admin tạo mới xong |
| **Các bước** | 1. Xem màn done |
| **Kết quả** | Link về `/module05/ho-so` |

---

### TC-SCAN-016 — Camera HTTP bị chặn

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | Mở trang qua HTTP |
| **Các bước** | 1. Thử bật camera |
| **Kết quả** | «Camera chỉ hoạt động trên HTTPS…» |

---

### TC-SCAN-017 — Từ chối quyền camera

| | |
|---|---|
| **P** | P0 |
| **Tiên quyết** | Browser deny permission |
| **Các bước** | 1. Bật camera |
| **Kết quả** | Hướng dẫn iPhone/Safari cấp quyền |

---

### TC-SCAN-018 — Trình duyệt không hỗ trợ

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Browser không có getUserMedia |
| **Các bước** | 1. Mở trang |
| **Kết quả** | «Trình duyệt không hỗ trợ…» |

---

### TC-SCAN-019 — Manual capture gate

| | |
|---|---|
| **P** | P1 |
| **Tiên quyết** | Manual capture mode |
| **Các bước** | 1. Thử chụp khi face chưa ready |
| **Kết quả** | Nút capture disabled (`faceReadyForManualCapture`) |

---

### TC-SCAN-020 — Legacy /scanner redirect

| | |
|---|---|
| **P** | P2 |
| **Tiên quyết** | — |
| **Các bước** | 1. Truy cập `/scanner` |
| **Kết quả** | Redirect `/module05/quet-mat` |

---

## Phụ lục — Điều kiện chung

| Hạng mục | Yêu cầu |
|----------|---------|
| Backend | `GET /patrol/health` · day bundle · live bundle |
| MediaMTX | Playback URL configured |
| Auth | Patrol token valid |
| HTTPS | Scan module |
| Sidebar | 220px; không overlap |
| Ngày | UTC+7; cắt 0h VN; không ca 06:00 |

**Out of scope (không test — chưa có UI):**

- Tab heatmap thời gian Live/5p/15p/1h/Ca
- Tab sự kiện Nhân lực/Mật độ/Hệ thống
- Canvas KDE density splat
- Feed `POPULATION_OBSERVED` trên panel Sự kiện

---

## Phụ lục — Test tự động

```bash
npm test -- --run src/modules/module05-productivity   # 199 tests
pytest backend-ai/tests/test_patrol_*.py              # backend
```

| Module | Unit test mirror |
|--------|------------------|
| KPI | `patrolZoneCoverage.test.ts` · `patrolDisplayStats.test.ts` |
| Live | `patrolStreamOnline.test.ts` · `patrolLiveFeed.service.test.ts` |
| Playback | `patrolPlayback.service.test.ts` |
| Heatmap | `patrolDayHeatmapDots.test.ts` · `patrolFlycamEventFilter.test.ts` |
| Sự kiện | `patrolEventsTabList.test.ts` · `patrolEventsFeed.test.ts` |
| Hồ sơ | `patrolGalleryFaces.service.test.ts` |
| Scan | `patrolFaceScanGuide.test.ts` · `patrolFaceScanCamera.test.ts` |

---

## Phụ lục — Checklist release

| Module | Smoke (P0) |
|--------|------------|
| KPI | 4 thẻ load; flymap — khi DR offline |
| Live | HC-02 live badge; filter Bodycam/Flycam |
| Playback | Date hôm nay VN; sync từ Sự kiện; 404 không crash |
| Heatmap | Toggle layer; click dot → sheet; Flymap không sheet |
| Sự kiện | 4 tab count đúng; snapshot required; aerial DR filter |
| Hồ sơ | Import 1 dòng; search; face badge |
| Scan | `?code=` 3 pose + consent |

- [ ] Vitest 199/199 pass
- [ ] P0 manual staging
- [ ] Playback 7 ngày có băng
- [ ] Quanh 0h VN: TC-PB-006 / TC-EVT date
- [ ] Mobile: heatmap + sự kiện scroll OK

---

*Tổng: **7 module · 120 test cases** · bám code `module05-productivity`*
