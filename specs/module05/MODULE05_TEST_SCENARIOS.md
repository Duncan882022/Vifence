# Module 05 — Test cases (theo code hiện tại)

> **Nguồn sự thật:** code trong `src/modules/module05-productivity/`  
> **Không** dùng tab spec cũ (Nhân lực / Mật độ / Hệ thống) — các tab đó **không tồn tại** trong UI.  
> **Cập nhật:** 2026-09-01

---

## Mục lục

1. [Kiến trúc dữ liệu hiện tại](#1-kiến-trúc-dữ-liệu-hiện-tại)
2. [Điều kiện tiên quyết & dữ liệu test](#2-điều-kiện-tiên-quyết--dữ-liệu-test)
3. [Test tự động](#3-test-tự-động)
4. [Test cases — Điều hướng & layout](#4-test-cases--điều-hướng--layout)
5. [Test cases — Tuần tra `/module05`](#5-test-cases--tuần-tra-module05)
6. [Test cases — Hồ sơ `/module05/ho-so`](#6-test-cases--hồ-sơ-module05ho-so)
7. [Test cases — Quét mặt `/module05/quet-mat`](#7-test-cases--quét-mặt-module05quet-mat)
8. [Test cases — Tích hợp & edge cases](#8-test-cases--tích-hợp--edge-cases)
9. [Ma trận ưu tiên & checklist release](#9-ma-trận-ưu-tiên--checklist-release)

**Quy ước cột:** P = Priority (P0/P1/P2) · TC = Test Case ID

---

## 1. Kiến trúc dữ liệu hiện tại

Hiểu pipeline trước khi test — tránh kỳ vọng sai từ spec cũ.

### 1.1. Luồng trang Tuần tra

```
Module05Page
├── usePatrolDayBundle(patrolViewDate)     → GET /patrol/day/bundle?date=
│   └── bundleToEvents()                   → card id pers:xxx / obj:xxx, type PERSON_DETECTED
├── usePatrolLivePoll()                    → WS /ws/patrol/live → fallback GET /patrol/live/bundle
├── filterPatrolEventsByFlycamAltitude()   → lọc sự kiện DR-03 theo flight_mode
├── derivePatrolDisplayStats()             → KPI Tier1 (backend stats)
└── computePatrolTabCounts()               → badge tab Sự kiện (listing, có thể ≠ KPI)
```

### 1.2. Tab Sự kiện (4 tab — code thực tế)

| Tab key | Label UI | Điều kiện hiển thị card |
|---------|----------|--------------------------|
| `all` | Tất cả | `PERSON_DETECTED` hoặc `IDENTITY_VERIFIED` + snapshot + score gate |
| `object` | Đối tượng | `stage === 'object'` |
| `person` | Người | `stage === 'person'` |
| `identity` | Định danh | `stage === 'profile'` |

Logic: `listPatrolEventsForTab()` → `matchesPatrolEventsTab()` + `dedupePatrolEventsByMasterEntity()`.

**Không hiển thị trên panel:**

- Card **không có** `snapshotUrl` (non-empty)
- Thời gian invalid / tương lai / >90 ngày (`isValidPatrolEventTime`)
- Object score ≥ `1.05` (`PATROL_OBJECT_FACE_SNAPSHOT_SCORE`) — nhầm tầng mặt
- `POPULATION_OBSERVED`, `POPULATION_CHANGE`, `HIGH_DENSITY` — không qua day bundle cards
- DR-03 **aerial**: chỉ `stage === 'object'` (và loại density nếu có)

### 1.3. Heatmap (code thực tế)

| Thành phần | Hành vi |
|------------|---------|
| Toggle **Mật độ** | Bật/tắt **chấm detection** (`showDetections`), không phải canvas KDE |
| Canvas KDE (`PatrolDensityCanvasLayer`) | **`showDensity={false}`** — tắt cố định từ parent |
| Tab thời gian Live/5p/15p/1h/Ca | **Không có UI** — helper `heatmapWindowMs()` tồn tại nhưng không wire |
| Flymap | Clone map drone; chấm một màu; **không** mở `WorkforceObjectSheet` |

### 1.4. Ngày lịch VN

- `getPatrolDefaultPlaybackDate()` = `formatVnDate()` — cắt **0h VN**, không ca/kíp
- `PATROL_PLAYBACK_RETAIN_DAYS = 7`
- **Không** rollover 06:00 (Module 02/03)

---

## 2. Điều kiện tiên quyết & dữ liệu test

### 2.1. Môi trường

| Hạng mục | Yêu cầu |
|----------|---------|
| Backend patrol | `GET /patrol/health` OK; day bundle trả persons/objects |
| MediaMTX playback | `VITE_MEDIAMTX_PLAYBACK_URL` cấu hình |
| Auth | `ensurePatrolAuth()` thành công |
| HTTPS | Bắt buộc cho `/module05/quet-mat` |
| Viewport | Desktop ≥1280px; mobile <1024px; tablet landscape |

### 2.2. Bộ dữ liệu gợi ý

| Dataset | Mục đích |
|---------|----------|
| `pers-A` identified + snapshot score ≥1.05 | Tab **Định danh** |
| `pers-B` person stage + snapshot | Tab **Người** |
| `obj-C` object stage + snapshot score <1.05 | Tab **Đối tượng** |
| `obj-D` object score ≥1.05 | **Ẩn** khỏi mọi tab |
| Person **không** snapshotUrl | **Ẩn** khỏi mọi tab |
| Sự kiện `lockedAt` UTC sau 0h VN | Test ngày 29 vs 28 |
| Hồ sơ draft + identified | Trang hồ sơ |
| DR-03 aerial vs proximity | Flycam filter |

---

## 3. Test tự động

| Lệnh | Phạm vi | Kết quả mong đợi |
|------|---------|------------------|
| `npm test -- --run src/modules/module05-productivity` | 38 file unit | **199/199 PASS** |
| `pytest backend-ai/tests/test_patrol_*.py` | Backend patrol | PASS khi BE sẵn sàng |

**File unit test quan trọng → mirror manual:**

| File | Scenario |
|------|----------|
| `patrolPlayback.service.test.ts` | Ngày VN từ UTC; MediaMTX 404; URL playback base |
| `patrolEventsTabList.test.ts` | Dedupe entity; no snapshot excluded; tab count = list length |
| `patrolEventsFeed.test.ts` | Score gate object vs person |
| `patrolFlycamEventFilter.test.ts` | Aerial vs proximity DR-03 |
| `patrolDayObjectFilter.test.ts` | Object score ≥1.05 hidden |
| `patrolZoneCoverage.test.ts` | KPI khu vực online/GPS |
| `patrolStreamOnline.test.ts` | HC-02 framesLive override offline |
| `patrolFaceScanGuide.test.ts` | Pose readiness, manual capture |

---

## 4. Test cases — Điều hướng & layout

### TC-M05-NAV-01 — Sidebar & routes

| P | TC | Bước | Kết quả mong đợi |
|---|-----|------|------------------|
| P2 | NAV-01-1 | Sidebar → **Hiệu quả công việc** | Submenu: Tuần tra, Hồ sơ công nhân, Quét mặt |
| P2 | NAV-01-2 | Click **Tuần tra** | URL `/module05`; title «Hiệu Quả Công Việc» |
| P2 | NAV-01-3 | Click **Hồ sơ công nhân** | URL `/module05/ho-so` |
| P2 | NAV-01-4 | Click **Quét mặt** | URL `/module05/quet-mat` |
| P2 | NAV-01-5 | Truy cập `/scanner` | Redirect → `/module05/quet-mat` |

### TC-M05-LAY-01 — Layout Tuần tra

| P | TC | Bước | Kết quả mong đợi |
|---|-----|------|------------------|
| P2 | LAY-01-1 | Mở `/module05` desktop | Panel **Tổng Quan** → **Camera** → **HEATMAP** + **SỰ KIỆN** |
| P2 | LAY-01-2 | Sidebar | Width 220px; nội dung không đè sidebar |
| P2 | LAY-01-3 | Thu gọn **Tổng Quan** / **Camera** | `TierCollapseButton` toggle; collapsed camera hiện «X luồng» |
| P2 | LAY-01-4 | Viewport <1024px | Stack dọc; heatmap + sự kiện `min-h-[42dvh]` |
| P2 | LAY-01-5 | Mount page | Sidebar auto collapse (`setSidebarCollapsed(true)`) |

---

## 5. Test cases — Tuần tra `/module05`

### TC-M05-KPI-01 — Tier1 KPI

**Nguồn:** `PatrolKPIs` trong `Module05Page.tsx` · `derivePatrolDisplayStats()` · `computePatrolZoneCoverage()` · `usePatrolFlymapMetrics()`

| P | TC | Điều kiện | Kết quả mong đợi |
|---|-----|-----------|------------------|
| P1 | KPI-01-1 | Có zone visited | **Khu vực tuần tra** = `visited/total`; detail «X% khu có thiết bị tuần tra active» |
| P1 | KPI-01-2 | Cam online, chưa visited | Detail «Thiết bị online — chờ xác nhận phủ khu» |
| P1 | KPI-01-3 | Mọi cam offline | Detail «Chưa có thiết bị tuần tra online» |
| P1 | KPI-01-4 | `personCount + identityCount > 0` | **Nhân sự** = tổng; detail icon UserX (person) + UserCheck (identity) |
| P1 | KPI-01-5 | Headcount = 0, cam online, có stream | «Đang tuần tra — chờ phát hiện» |
| P1 | KPI-01-6 | Headcount = 0, không cam online | «Chưa có dữ liệu hôm nay» |
| P1 | KPI-01-7 | `peak_time_active` trên cam | **Lượt gặp · ĐT** detail «Peak time — mặt rõ định danh…» |
| P1 | KPI-01-8 | `objectEncounterCount > 0` | Detail «Silhouette chưa gán danh tính — không tính Nhân sự» |
| P1 | KPI-01-9 | DR-03 online | **Mật độ flymap** = số; unit «người/khung»; detail «YOLO tầm cao — không cộng Nhân sự» |
| P1 | KPI-01-10 | DR-03 offline | Value «—»; detail «Flycam chưa online» |
| P1 | KPI-01-11 | So sánh KPI vs tab badge | KPI headcount **có thể ≠** tab counts (nguồn khác nhau) — **không báo bug** nếu lệch có chủ đích |

### TC-M05-CAM-01 — Camera Live

**Component:** `PatrolCameraPanel` → `CameraGridPanel` · filter `Bodycam` \| `Flycam`

| P | TC | Bước | Kết quả mong đợi |
|---|-----|------|------------------|
| P1 | CAM-01-1 | Mặc định Live | HC-01, HC-02 (Bodycam); DR-03 (Flycam) |
| P1 | CAM-01-2 | Default selected | **HC-02** highlight |
| P1 | CAM-01-3 | Filter **Bodycam** | Chỉ HC-01, HC-02 |
| P1 | CAM-01-4 | Filter **Flycam** | Chỉ DR-03 |
| P1 | CAM-01-5 | Stream online | Badge LIVE + pulse dot |
| P1 | CAM-01-6 | DR-03 tile | Badge **Tầm cao** hoặc **Tầm thấp** (`patrolFlightModeShortLabel`) |
| P2 | CAM-01-7 | Tier collapsed + Live | Header «X luồng» khớp số tile active |
| P2 | CAM-01-8 | Legacy mobile helmet + handheld | Grid ưu tiên mũ legacy; `PatrolDevicePermissionGate` hiện |

### TC-M05-CAM-02 — Camera Playback

**Service:** `createPatrolPlaybackFetchers()` · `PatrolPlaybackPanel`

| P | TC | Bước | Kết quả mong đợi |
|---|-----|------|------------------|
| P0 | CAM-02-1 | Toggle **Playback** | Timeline + date picker; video area hiện |
| P0 | CAM-02-2 | Date mặc định | = `getPatrolDefaultPlaybackDate()` (hôm nay VN) |
| P0 | CAM-02-3 | Date picker | Min = today−6; max = hôm nay (7 ngày) |
| P0 | CAM-02-4 | Đổi `patrolViewDate` ở Sự kiện | Playback date **đồng bộ** |
| P0 | CAM-02-5 | Có băng MediaMTX | Clip continuous + marker sự kiện 30s (`PATROL_EVENT_CLIP_SEC`) |
| P0 | CAM-02-6 | MediaMTX 404 | Timeline trống; **không** crash |
| P1 | CAM-02-7 | URL video | Qua playback base configured; không lộ IP MediaMTX nội bộ |

### TC-M05-DATE-01 — Ngày lịch VN

**Functions:** `getPatrolEventViewDate()` · `isoDayKey()` · `formatVnDate()`

| P | TC | Input | Thao tác | Kết quả mong đợi |
|---|-----|-------|----------|------------------|
| P0 | DATE-01-1 | `lockedAt = 2026-08-28T17:30:00.000Z` (00:30 VN 29/08) | Chọn ngày 28/08 | **Không** có card |
| P0 | DATE-01-2 | Cùng event | Chọn ngày 29/08 | **Có** card |
| P0 | DATE-01-3 | Event ngày 27 | Click card | `patrolViewDate` → `2026-08-27`; playback theo |
| P0 | DATE-01-4 | Sau 0h VN | Mở app | Default vẫn **ngày mới**; data 23:50 hôm qua thuộc ngày hôm qua |
| P0 | DATE-01-5 | — | Không có logic 06:00 rollover | Playback không bắt đầu 06:00 như Module 02 |

### TC-M05-EVT-01 — Panel Sự kiện — cấu trúc

**Component:** `PatrolEventsPanel.tsx`

| P | TC | Kiểm tra | Kết quả mong đợi |
|---|-----|----------|------------------|
| P0 | EVT-01-1 | 4 tab | **Tất cả · Đối tượng · Người · Định danh** |
| P0 | EVT-01-2 | Badge count | = `listPatrolEventsForTab().length` từng tab |
| P0 | EVT-01-3 | Date picker compact | Prev/next + native date input overlay |
| P1 | EVT-01-4 | `viewDate !== maxViewDate` | Hint «Đang xem ngày trước» (sm+) |
| P1 | EVT-01-5 | Header panel (parent) | DR-03 label: **Tầm thấp · AI** hoặc **Tầm cao · Mật độ** |
| P2 | EVT-01-6 | Compact date picker | **Không** có nút «Hôm nay» (chỉ full mode) |

### TC-M05-EVT-02 — Lọc & hiển thị card

| P | TC | Dữ liệu | Kết quả mong đợi |
|---|-----|---------|------------------|
| P0 | EVT-02-1 | `pers:` + snapshot + stage person | Tab **Người** + **Tất cả** |
| P0 | EVT-02-2 | `obj:` + snapshot score <1.05 | Tab **Đối tượng** |
| P0 | EVT-02-3 | stage profile / identified | Tab **Định danh** |
| P0 | EVT-02-4 | Không `snapshotUrl` | **Ẩn** mọi tab (kể cả Tất cả empty check dùng tab all length) |
| P0 | EVT-02-5 | Object score ≥1.05 | **Ẩn** — mis-tiered face on object |
| P0 | EVT-02-6 | 2 card cùng entity, `lockedAt` khác | Chỉ **1** card — bản `lockedAt` mới hơn |
| P1 | EVT-02-7 | Card hiển thị | Badge stage + subject + giờ + địa điểm + snapshot thumbnail |
| P1 | EVT-02-8 | Card `id` format | `pers:{persId}` hoặc `obj:{objId}` |
| P1 | EVT-02-9 | `type` backend | `PERSON_DETECTED` (aggregated day card — **đúng**, không phải raw frame log) |

### TC-M05-EVT-03 — Tìm kiếm & phân trang

| P | TC | Bước | Kết quả mong đợi |
|---|-----|------|------------------|
| P1 | EVT-03-1 | Gõ tên nhân viên | Debounce 300ms; lọc client-side |
| P1 | EVT-03-2 | Gõ `pers_id` / mã NV | Match haystack `eventSearchHaystack()` |
| P1 | EVT-03-3 | Query không khớp | «Không có kết quả khớp tìm kiếm» |
| P1 | EVT-03-4 | Tab không có item | «Chưa có sự kiện loại này» |
| P1 | EVT-03-5 | >6 cards | Ban đầu 6; scroll → +4 (`IntersectionObserver`) |
| P1 | EVT-03-6 | Footer pagination | «Hiển thị X/Y» hoặc «— N đối tượng|người|định danh|mục —» |

### TC-M05-EVT-04 — Empty states

| P | TC | Điều kiện | Message |
|---|-----|-----------|---------|
| P1 | EVT-04-1 | Hôm nay, bundle rỗng | «Chưa có sự kiện hôm nay — chọn ngày khác phía trên hoặc đang chờ backend» |
| P1 | EVT-04-2 | Ngày quá khứ, rỗng | «Không có sự kiện ngày này — chọn ngày khác phía trên» |

### TC-M05-EVT-05 — Tương tác card

| P | TC | Bước | Kết quả mong đợi |
|---|-----|------|------------------|
| P0 | EVT-05-1 | Click card body | Highlight; `onSelect` → sync `patrolViewDate` |
| P0 | EVT-05-2 | Click snapshot | `PatrolEventDetailModal` mở |
| P1 | EVT-05-3 | Enter trên card | Tương đương click (keyboard) |

### TC-M05-EVT-06 — Modal chi tiết

**Component:** `PatrolEventDetailModal.tsx`

| P | TC | Kiểm tra | Kết quả mong đợi |
|---|-----|----------|------------------|
| P1 | EVT-06-1 | Thông tin cơ bản | Stage badge, subject, camera, zone, thời gian |
| P1 | EVT-06-2 | Lịch sử xuất hiện | `GET /patrol/day/appearances?subject_id=&date=` theo `viewDate` |
| P1 | EVT-06-3 | Gallery faces | Load `fetchPatrolGalleryFaces()` khi có worker id |
| P1 | EVT-06-4 | GPS thiếu | Fallback `PATROL_SITE_CENTER` hoặc label phù hợp |
| P1 | EVT-06-5 | Đóng modal | Portal đóng; list selection giữ nguyên |

### TC-M05-MAP-01 — Heatmap (chế độ thường)

**Component:** `PatrolDensityHeatmap` + `PatrolGeoHeatmap`

| P | TC | Bước | Kết quả mong đợi |
|---|-----|------|------------------|
| P1 | MAP-01-1 | Layer **Khu vực** | Polygon site boundary toggle |
| P1 | MAP-01-2 | Layer **Mật độ** | Toggle **chấm detection** (không phải canvas KDE) |
| P1 | MAP-01-3 | Layer **Mũ** | Marker + route HC-* |
| P1 | MAP-01-4 | Layer **Flycam** | Marker/route DR-03 trên map site |
| P1 | MAP-01-5 | Stats overlay | Đối tượng / Người / Định danh từ `dayStats` |
| P1 | MAP-01-6 | Click chấm | `WorkforceObjectSheet` bottom sheet |
| P1 | MAP-01-7 | Manual identity | Panel gán worker trong sheet (nếu có quyền) |
| P2 | MAP-01-8 | Phóng to heatmap | Fullscreen portal; Escape / backdrop đóng |
| P2 | MAP-01-9 | HC-02 online + GPS | Map follow live GPS HC-02 |
| P1 | MAP-01-10 | DR-03 aerial dots | Chấm DR **không** hiện trên heatmap site (`filterPatrolHeatmapDotsExcludeAerialFlycam`) |

### TC-M05-MAP-02 — Flymap

| P | TC | Bước | Kết quả mong đợi |
|---|-----|------|------------------|
| P1 | MAP-02-1 | Bật **Flymap** (header) | Panel title **FLYMAP**; layer: Khu vực · Mật độ · Drone |
| P1 | MAP-02-2 | Chấm flymap | Màu uniform `PATROL_FLYMAP_DOT_HEX` |
| P1 | MAP-02-3 | Stats | «Phát hiện: N» |
| P1 | MAP-02-4 | Click chấm | **Không** mở object sheet |
| P1 | MAP-02-5 | Follow GPS | DR-03 live GPS khi online |
| P1 | MAP-02-6 | Route | Chỉ drone devices |

### TC-M05-FLY-01 — Flycam flight mode

**Functions:** `filterPatrolEventsByFlycamAltitude()` · `patrolEventMatchesFlycamAltitude()`

| P | TC | Mode DR-03 | Kết quả mong đợi |
|---|-----|------------|------------------|
| P0 | FLY-01-1 | **proximity** | Sự kiện person + profile + identity hiện như HC-* |
| P0 | FLY-01-2 | **aerial** (default) | Feed chỉ **object** stage (+ POPULATION/HIGH_DENSITY nếu có) |
| P1 | FLY-01-3 | aerial | KPI flymap có số; **không** tăng KPI Nhân sự |
| P1 | FLY-01-4 | proximity | Header sự kiện «Tầm thấp · AI» |
| P1 | FLY-01-5 | aerial | Header «Tầm cao · Mật độ» |

### TC-M05-LIVE-01 — Live poll

| P | TC | Kiểm tra | Kết quả mong đợi |
|---|-----|----------|------------------|
| P1 | LIVE-01-1 | WS connected | Metrics + workforce ~2.5s (`PATROL_LIVE_POLL_MS`) |
| P1 | LIVE-01-2 | WS fail | Fallback `GET /patrol/live/bundle` |
| P1 | LIVE-01-3 | Day bundle | Poll 3s khi xem **hôm nay** |
| P1 | LIVE-01-4 | Mount page | `ensurePatrolAuth()` + `syncPatrolIdentityBindingsFromBackend()` |
| P1 | LIVE-01-5 | HC-02 frames live | Online override khi backend báo offline (`patrolStreamOnline`) |

---

## 6. Test cases — Hồ sơ `/module05/ho-so`

**Page:** `WorkerProfileManagementPage.tsx` · **Service:** `patrolWorkerProfile.service.ts`

### TC-M05-PRO-01 — Thống kê & danh sách

| P | TC | Bước | Kết quả mong đợi |
|---|-----|------|------------------|
| P1 | PRO-01-1 | Mở trang | 4 stat: Tổng hồ sơ · Bản nháp · Đã xác minh · Có vector |
| P1 | PRO-01-2 | Backend down | «Backend tuần tra chưa sẵn sàng — kiểm tra URL backend» |
| P1 | PRO-01-3 | **Làm mới** | Gọi `pingPatrolProfileBackend()` + reload list |
| P1 | PRO-01-4 | Search | Lọc: tên, mã NV, đơn vị, pers_id, display_name |
| P1 | PRO-01-5 | Filter **Bản nháp** | Chỉ `status === 'draft'` |
| P1 | PRO-01-6 | Filter **Đã xác minh** | Chỉ `status === 'identified'` |
| P1 | PRO-01-7 | Badge **Nháp** | Hiện trên row draft |
| P1 | PRO-01-8 | Face badge | `{face_count}/3`; xanh khi `face_enrollment_complete` |
| P2 | PRO-01-9 | Link **Về Module 05** | Navigate `/module05` |

### TC-M05-PRO-02 — Import Excel

| P | TC | Bước | Kết quả mong đợi |
|---|-----|------|------------------|
| P0 | PRO-02-1 | **Tải file mẫu** | Download `patrol_workers_template.xlsx` (Họ tên, Mã NV, Đơn vị) |
| P0 | PRO-02-2 | Import file hợp lệ | `POST /patrol/persons/import`; hiện success/failed count |
| P0 | PRO-02-3 | Dòng thiếu Họ tên hoặc Mã | «X dòng thiếu Họ tên hoặc Mã nhân viên» — không import |
| P0 | PRO-02-4 | File rỗng | «File Excel không có dòng hợp lệ» |
| P1 | PRO-02-5 | Accept file types | `.xlsx,.xls,.csv` |

### TC-M05-PRO-03 — CRUD & modal

| P | TC | Bước | Kết quả mong đợi |
|---|-----|------|------------------|
| P1 | PRO-03-1 | **Xem** (Eye) | `WorkerProfileDetailModal` mode view |
| P1 | PRO-03-2 | **Sửa** (Pencil) | Modal edit; `PATCH /patrol/persons/{id}` |
| P1 | PRO-03-3 | **Xóa** (Trash) | Confirm dialog; xóa vector; `DELETE /patrol/persons/{id}` |
| P1 | PRO-03-4 | Gallery trong modal | `WorkerProfileFaceGallery` hiện poses |
| P1 | PRO-03-5 | Link quét mặt | `/module05/quet-mat?code={employee_code}` |
| P1 | PRO-03-6 | Verify draft | `POST /patrol/persons/{id}/verify` khi đủ điều kiện |

---

## 7. Test cases — Quét mặt `/module05/quet-mat`

**Page:** `WorkerFaceScanPage.tsx` · **Panel:** `PatrolFaceScannerPanel.tsx`  
**Poses:** 3 bắt buộc (Chính diện, Quay trái, Quay phải) + 1 tuỳ chọn (Cúi xuống)

### TC-M05-FACE-01 — Phân nhánh mode

| P | TC | Điều kiện | Kết quả mong đợi |
|---|-----|-----------|------------------|
| P0 | FACE-01-1 | `hasPatrolRole('hr')` && không `?code=` | **Admin mode**: tra cứu mã + tạo mới |
| P0 | FACE-01-2 | URL `?code=NV001` | **Self-enroll** dù user là HR |
| P0 | FACE-01-3 | Không role HR, không `?code=` | Self-enroll wizard (quét → profile → done) |

### TC-M05-FACE-02 — Admin tra cứu

| P | TC | Bước | Kết quả mong đợi |
|---|-----|------|------------------|
| P0 | FACE-02-1 | Nhập mã hợp lệ → Tra cứu | `GET /patrol/persons/lookup`; chuyển bước scan bổ sung vector |
| P0 | FACE-02-2 | Mã không tồn tại | Lỗi + gợi ý «Tạo hồ sơ mới» |
| P0 | FACE-02-3 | Scan bổ sung | `POST /patrol/persons/{id}/scan` từng pose |
| P1 | FACE-02-4 | **Tạo hồ sơ mới + quét mặt** | Chuyển enroll wizard (giống self-enroll) |

### TC-M05-FACE-03 — Self-enroll / tạo mới

| P | TC | Bước | Kết quả mong đợi |
|---|-----|------|------------------|
| P0 | FACE-03-1 | Mount enroll mode | `POST /patrol/enroll/session` tạo session |
| P0 | FACE-03-2 | Quét 3 pose | `POST /patrol/enroll/{id}/scan` |
| P0 | FACE-03-3 | Form profile | Họ tên*, Mã NV*, Đơn vị — pre-fill từ `?code=` |
| P0 | FACE-03-4 | Submit không consent | **Blocked** — checkbox bắt buộc |
| P0 | FACE-03-5 | Submit có consent | `POST /patrol/enroll/{id}/complete` + `consented_at` |
| P1 | FACE-03-6 | Hoàn tất admin-create | Link về `/module05/ho-so` |
| P1 | FACE-03-7 | Pose 4 (Cúi xuống) | Tuỳ chọn; progress tính 3 required |

### TC-M05-FACE-04 — Camera & UX

| P | TC | Điều kiện | Kết quả mong đợi |
|---|-----|-----------|------------------|
| P0 | FACE-04-1 | HTTP (không HTTPS) | «Camera chỉ hoạt động trên HTTPS…» |
| P0 | FACE-04-2 | Deny camera permission | Hướng dẫn iPhone/Safari |
| P0 | FACE-04-3 | Unsupported browser | «Trình duyệt không hỗ trợ…» |
| P1 | FACE-04-4 | Ring hướng dẫn | TRÊN · PHẢI · DƯỚI · TRÁI |
| P1 | FACE-04-5 | Manual capture mode | `faceReadyForManualCapture()` gate |

---

## 8. Test cases — Tích hợp & edge cases

### TC-M05-ID-01 — Identity & dedupe

| P | TC | Kiểm tra | Kết quả mong đợi |
|---|-----|----------|------------------|
| P1 | ID-01-1 | Manual identity bind | Card + heatmap label cập nhật sau `syncPatrolIdentityBindingsFromBackend` |
| P1 | ID-01-2 | Gallery worker SGC-* | Tab **Định danh**; badge violet |
| P1 | ID-01-3 | Track ID (tk-*) | Hiển thị stage **Người**, không phải định danh HR |
| P1 | ID-01-4 | Heatmap dedupe | Cùng entity → 1 chấm; ưu tiên `inCameraView` |
| P1 | ID-01-5 | `POST /patrol/persons/{id}/identify` | Gán danh tính từ day card (modal/sheet) |

### TC-M05-ZONE-01 — Phủ khu vực

| P | TC | Điều kiện | Kết quả mong đợi |
|---|-----|-----------|------------------|
| P1 | ZONE-01-1 | Cam online trong polygon | Zone counted visited |
| P1 | ZONE-01-2 | Cam online, GPS ngoài polygon | Chưa visited (chờ GPS vào zone) |
| P1 | ZONE-01-3 | Mọi cam offline | KPI 0/N visited |

### TC-M05-ROI-01 — Module 03 overlay

| P | TC | Kiểm tra | Kết quả mong đợi |
|---|-----|----------|------------------|
| P2 | ROI-01-1 | Live camera HC-* | Person ROI label tier khớp Module 05 tokens |
| P2 | ROI-01-2 | DR proximity | ROI gate `patrolPersonMeetsDrFlycamDisplayGate` |

### TC-M05-OUT-01 — Phạm vi **ngoài** code hiện tại

Các mục sau **không test** vì chưa implement — không báo bug:

| Mục | Trạng thái code |
|-----|-----------------|
| Tab heatmap Live / 5p / 15p / 1h / Ca | Không có UI |
| Tab sự kiện Nhân lực / Mật độ / Hệ thống | Không có UI |
| Canvas KDE density splat | `showDensity={false}` |
| Feed live `POPULATION_OBSERVED` | Không qua day bundle listing |
| Shared `EventList` component | Module 05 dùng `PatrolEventsPanel` riêng |

---

## 9. Ma trận ưu tiên & checklist release

### 9.1. Ưu tiên

| P | Nhóm TC | Lý do |
|---|---------|-------|
| **P0** | DATE-01, CAM-02, EVT-02, FLY-01 | Ngày VN + nguồn card + flycam filter |
| **P0** | PRO-02, FACE-01~04 | Enroll nhân sự production |
| **P1** | KPI-01, MAP-01/02, LIVE-01, EVT-01~06 | Giám sát vận hành |
| **P2** | NAV, LAY, ROI | UX & polish |

### 9.2. Smoke test (15 phút)

1. `/module05` — 4 KPI load; date = hôm nay VN  
2. Tab **Đối tượng / Người / Định danh** — count = số card  
3. Toggle **Playback** — timeline + date sync  
4. Toggle **Flymap** — title FLYMAP; không object sheet  
5. Click heatmap dot (normal) — `WorkforceObjectSheet`  
6. `/module05/ho-so` — search + import 1 dòng  
7. `/module05/quet-mat?code=TEST` — 3 pose + consent  

### 9.3. Checklist release

- [ ] Vitest Module 05: 199/199 pass
- [ ] P0 manual trên staging + backend thật
- [ ] Playback 7 ngày — ≥1 camera có băng
- [ ] DATE-01-1/2 verified quanh 0h VN
- [ ] FLY-01-1/2 aerial vs proximity
- [ ] Import Excel không duplicate mã NV
- [ ] Mobile: heatmap + sự kiện scroll, không overlap sidebar

---

*Tài liệu bám sát code tại commit branch `cursor/module05-test-scenarios-dd1d`.*
