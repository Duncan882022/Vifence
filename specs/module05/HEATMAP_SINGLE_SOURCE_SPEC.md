# Module 05 — Heatmap: Một nguồn sự thật (Presences)

> **Trạng thái:** Yêu cầu refactor — thay thế kiến trúc 3 nguồn hiện tại  
> **Liên quan:** Peak time gom nhóm `obj-*` (PR #220), KPI ngày, tab Sự kiện  
> **Cập nhật:** 2026-09-01

---

## 1. Vấn đề nghiệp vụ (hiện trạng — SAI)

Heatmap site (`PatrolDensityHeatmap`) đang ghép chấm theo **3 nguồn fallback**:

| Thứ tự | Nguồn | File / API |
|--------|--------|------------|
| 1 | **Presences** | `GET /patrol/day/presences` → `buildPatrolPresenceHeatmapDots` |
| 2 | **Registry** | `patrolHeatmapPersonRegistry` (sessionStorage) → `getHeatmapPersonDots` |
| 3 | **Day events** | Tab sự kiện → `buildPatrolDayHeatmapDots` |

### Hậu quả

- Cùng một màn hình: **map ≠ KPI ≠ tab sự kiện** tùy thời điểm poll.
- Chấm “live” từ registry **không** đi qua dwell / tripwire / peak gom nhóm → dễ lệch sổ cái.
- Người vận hành không trả lời được: *“Chấm này đã tính lượt gặp chưa?”*
- Peak time mới (≥30 người → 1 `obj-*`) chỉ áp BE; registry vẫn pin từng track → map vẫn loang nhiều chấm xanh.

**Kết luận nghiệp vụ:** Ba nguồn là nợ kỹ thuật (tránh map trống), **không** phải yêu cầu sản phẩm. Cần bỏ.

---

## 2. Nguyên tắc đúng

### 2.1. Một sổ cái

```
Camera + AI + GPS
       ↓
  Event Aggregator (dwell, identity, peak crowd, tripwire)
       ↓
  SQLite: appearances / daily presences
       ↓
  ┌─────────────┬─────────────┬─────────────┐
  │  Heatmap    │  Tab sự kiện │  KPI ngày   │
  │  (GPS dot)  │  (thẻ)       │  day_stats  │
  └─────────────┴─────────────┴─────────────┘
        Cùng subject_id · cùng counted · cùng tier
```

- **Presences** = nguồn sự thật duy nhất cho **chấm trên bản đồ**.
- Tab sự kiện = **view** khác của cùng ledger (không feed riêng cho map).
- Registry sessionStorage **không** quyết định vị trí / số chấm heatmap.

### 2.2. “Live” trên map (định nghĩa lại)

| Không phải live | Là live (1 nguồn) |
|-----------------|-------------------|
| Pin từng frame video (registry) | Presence có `ended_at` trong cửa sổ gần (mặc định **120s**) |
| Chấm trước khi BE ghi sổ | Chấm **sau** aggregator commit — **đúng nghiệp vụ** |
| ROI bbox trên video | ROI vẫn realtime riêng (`PatrolPersonRoiOverlay`) — **không** thay heatmap dot |

**Trade-off đã chấp nhận:** Map trễ vài giây so với video; **data chuẩn**, đối soát được với KPI.

**Trade-off không chấp nhận:** Map nhanh nhưng khác số liệu báo cáo.

### 2.3. Liên kết Rule 09 / Rule 10 (spec heatmap gốc)

- **Rule 09:** Event Feed ≠ Raw Detection Log → events không được là nguồn map độc lập.
- **Rule 10:** Heatmap ≠ raw detection density → dots = **entity đã ghi presence**, không pin detection.

---

## 3. Quy tắc vẽ chấm (presences only)

### 3.1. API

- **Chính:** `GET /patrol/day/presences?date=YYYY-MM-DD`
- **Bundle ngày:** `GET /patrol/day/bundle` (đã có presences — ưu tiên tái dùng)

### 3.2. Filter (giữ logic hiện có trong `buildPatrolPresenceHeatmapDots`)

| Option | Nghiệp vụ |
|--------|-----------|
| `countedOnly: true` | Chỉ lượt qua tripwire polygon site — **đồng bộ KPI** |
| `includeUnassigned: true` | Hiển thị `obj-*` (Đối tượng) — gồm peak crowd **1 obj / nhóm** |
| `liveOnly` + cam online | `ended_at` trong `PATROL_LIVE_RECENT_MS` (120s) → opacity cao |
| `collapsePresencesBySession` | Gộp duplicate aggregator — 1 chấm / entity |

### 3.3. Màu tầng (token chung — không đổi)

| Tier | Màu | Ý nghĩa |
|------|-----|---------|
| `object` | green-400 | Chưa định danh / `obj-*` (kể cả nhóm peak) |
| `person` | sky-400 | `tk-*`, pers draft |
| `identity` | violet-400 | Gallery / NV đã verify |

`peak_group_index` chỉ dùng **ROI video** — **không** tạo thêm presence / chấm map.

### 3.4. GPS

- Ưu tiên `gps_lat_end` / `gps_lng_end` trên presence.
- Fallback vị trí mũ trong ca (`helmetPositionsById`) khi thiếu GPS fix.
- Flymap DR-*: giữ filter riêng (`filterPatrolPresencesForHeatmap`) — không ảnh hưởng site heatmap.

---

## 4. Phạm vi refactor FE

### 4.1. Sửa

| File | Việc |
|------|------|
| `PatrolDensityHeatmap.tsx` | `filteredDots` **chỉ** từ `buildPatrolPresenceHeatmapDots(scopedPresences, …)` |
| `patrolDayHeatmapDots.ts` | Giữ builder; **không** gọi từ heatmap map body |
| `patrolHeatmapPersonRegistry.ts` | Ngừng dùng cho map dots; (tuỳ chọn) xóa hoặc chỉ heat grid sample nội bộ |
| `patrolPersonEventsBridge.ts` | Bỏ `syncPatrolPersonEventsToHeatmap` cho map |
| Poll live | Tăng tần suất poll presences/bundle khi `anyCameraOnline` (đề xuất **2–3s**) |

### 4.2. Không sửa (giữ)

- `PatrolPersonRoiOverlay` — bbox live trên video.
- KPI overlay góc map (`dayStats` từ API) — vẫn từ `day_stats`, đã cùng BE.
- Peak time BE (`record_peak_crowd_frame`) — đã ghi 1 `obj-*`.

### 4.3. Xóa fallback (bắt buộc)

```tsx
// ❌ BỎ — PatrolDensityHeatmap.tsx
mergePatrolHeatmapDetectionDots([registryDots], …)
buildPatrolDayHeatmapDots(scopedEvents, …)

// ✅ CHỈ
buildPatrolPresenceHeatmapDots(scopedPresences, { countedOnly: true, includeUnassigned: true, … })
```

---

## 5. Phạm vi BE (xác nhận — ít thay đổi)

- Aggregator + `daystore.touch_*` + tripwire: **đã đủ** làm sổ cái.
- Peak crowd: 1 presence `obj-*` / camera / phiên peak — **đã có** (PR #220).
- (Tuỳ chọn phase 2) Push/SSE khi upsert appearance để giảm trễ live **không** thêm nguồn thứ hai.

---

## 6. Tiêu chí nghiệm thu

### 6.1. Nhất quán

- [ ] Số chấm xanh `object` trên map ≤ `day_stats.object_count` (cùng ngày, cùng filter counted).
- [ ] Click / hover chấm → cùng `subject_id` với popup lịch sử xuất hiện.
- [ ] Peak ≥30 người: **1 chấm xanh** nhóm trên map; ROI video vẫn `#1…#N`.

### 6.2. Không còn 3 nguồn

- [ ] Không gọi `getHeatmapPersonDots()` trong `PatrolDensityHeatmap`.
- [ ] Không gọi `buildPatrolDayHeatmapDots()` cho map site.
- [ ] `sessionStorage vifence_patrol_heatmap_persons_v2` không ảnh hưởng vị trí chấm map.

### 6.3. Live (chấp nhận trễ)

- [ ] Cam online + người trong site: chấm xuất hiện trong **≤30s** sau khi BE ghi presence (poll 3s + dwell).
- [ ] Cam offline: chấm mờ / không `inCameraView` — không pin registry giả.

### 6.4. Test

- [ ] Cập nhật `patrolDayHeatmapDots.test.ts` — không test registry merge cho map.
- [ ] Test integration: presences mock → `PatrolDensityHeatmap` filteredDots length khớp entity unique.

---

## 7. Phase 2 (không chặn phase 1)

| Hạng mục | Mục đích |
|----------|----------|
| Poll presences 2s khi live | Giảm trễ cảm nhận |
| SSE/WebSocket `presence_upsert` | Chấm gần realtime vẫn 1 nguồn |
| Hiển thị `headcount` trên popup nhóm peak | Map 1 chấm, popup “Nhóm · N người” |

---

## 8. Tài liệu liên quan

- `specs/module05/REALTIME_WORKFORCE_HEATMAP_SPECIFICATION.md` — Rule 09, 10 (giữ nguyên triết lý)
- `specs/module05/HELMET_UNIFIED_PIPELINE.md` — GPS/detections vào backend trước heatmap
- Peak time: `backend-ai/app/patrol/peak_time.py`

---

## 9. Ghi chú cho Ban TGĐ (one-liner)

> **Bản đồ tuần tra chỉ vẽ người đã ghi vào sổ lượt gặp chính thức — cùng số liệu báo cáo. Video vẫn xem realtime; chấm bản đồ có thể chậm vài giây nhưng luôn đúng.**
