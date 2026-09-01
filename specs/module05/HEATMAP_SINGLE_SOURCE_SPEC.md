# Module 05 — Heatmap: Một nguồn sự thật (Presences)

> **Trạng thái:** Yêu cầu refactor — thay thế kiến trúc 3 nguồn hiện tại  
> **Liên quan:** Peak time — lượt gặp gom 1 `obj-*`, hiện diện đếm đủ (PR #220), KPI ngày  
> **Cập nhật:** 2026-09-01 (rev.2 — tách Lượt gặp vs Hiện diện)

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
- Peak time: **lượt gặp** đã gom 1 `obj-*` trên BE, nhưng registry vẫn pin từng track → map lệch cả hai chiều (encounter lẫn hiện diện).

**Kết luận nghiệp vụ:** Ba nguồn là nợ kỹ thuật (tránh map trống), **không** phải yêu cầu sản phẩm. Cần bỏ.

---

## 1.1. Peak time — hai chiều đếm (KHÔNG gom cả hai)

Giờ cao điểm (≥30 silhouette/khung, exit ≤25) có **hai sổ khác nhau**:

| Chiều | Nghiệp vụ | Giờ đông | Nguồn |
|--------|-----------|----------|--------|
| **Lượt gặp / sự kiện** | Đếm encounter đã qua tripwire (`counted=1`) | Chưa định danh → **gom 1 `obj-*`** / camera / phiên peak (lock sự kiện) | `record_peak_crowd_frame`, `day_stats.unassigned_observations` |
| **Hiện diện (present)** | Có bao nhiêu người đang trong khung / site | **Đếm đủ N** — không gom thành 1 | `metrics.display_person_count`, `metrics.person_count`, peak `person_count` cộng dồn phiên |

**Quy tắc vàng:** Gom nhóm peak chỉ áp **ledger lượt gặp**. **Present count luôn = số người thực tế** (silhouette đủ gate hiển thị).

Ví dụ 35 người chưa rõ mặt:
- Lượt gặp đối tượng trong ngày: **+1** (một `obj-*` nhóm)
- Hiện diện live trên camera: **35** (`display_person_count`)
- ROI video: **35 bbox** với `#1…#35` (cùng `worker_id` nhóm)

**Sai lầm cần tránh trong tài liệu / implement:** Coi “peak = 1” cho mọi thứ — đặc biệt present count, KPI mật độ, overlay “N người trong khung”.

---

## 2. Nguyên tắc đúng

### 2.1. Một sổ cái

```
Camera + AI + GPS
       ↓
  Event Aggregator (dwell, identity, peak crowd, tripwire)
       ↓
  SQLite: appearances / daily presences          metrics live (person_count)
       ↓                                              ↓
  ┌─────────────┬─────────────┬─────────────┐   Hiện diện N (present)
  │  Heatmap    │  Tab sự kiện │  KPI ngày   │   — KHÔNG gom peak
  │  (GPS dot)  │  (thẻ)       │  day_stats  │
  └─────────────┴─────────────┴─────────────┘
        Cùng subject_id · cùng counted · cùng tier (lượt gặp)
```

- **Presences** = nguồn sự thật duy nhất cho **chấm lượt gặp trên bản đồ** (entity đã ghi sổ).
- **Hiện diện live (present)** = `display_person_count` / mobile metrics — **đếm đủ**, tách khỏi số chấm encounter.
- Tab sự kiện = **view** ledger lượt gặp (không feed riêng cho map).
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
| `includeUnassigned: true` | Hiển thị `obj-*` (Đối tượng) — peak crowd = **1 entity encounter** trên map, không phải present count |
| `liveOnly` + cam online | `ended_at` trong `PATROL_LIVE_RECENT_MS` (120s) → opacity cao |
| `collapsePresencesBySession` | Gộp duplicate aggregator — 1 chấm / entity |

### 3.3. Màu tầng (token chung — không đổi)

| Tier | Màu | Ý nghĩa |
|------|-----|---------|
| `object` | green-400 | Chưa định danh / `obj-*` (peak: 1 chấm = 1 lượt gặp nhóm, **không** = N người hiện diện) |
| `person` | sky-400 | `tk-*`, pers draft |
| `identity` | violet-400 | Gallery / NV đã verify |

`peak_group_index` / `peak_group_size` dùng **ROI video** (#1…#N, “Nhóm M”) — **không** quyết định present count.

### 3.5. Present vs chấm map (peak)

| Hiển thị | Nguồn | Giờ đông 35 người |
|----------|--------|-------------------|
| KPI / overlay **hiện diện** | `display_person_count`, live bundle | **35** |
| Chấm map **lượt gặp** | presences `obj-*` counted | **1 chấm xanh** (1 entity nhóm) + chấm riêng người đã định danh |
| Tab sự kiện / `unassigned_observations` | appearances counted | **+1 lượt** nhóm (không +35) |
| ROI video | detections | **35 bbox** `#1…#35` |

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
- Peak time BE (`record_peak_crowd_frame`) — gom **lượt gặp** 1 `obj-*`; metrics vẫn `display_person_count` = N.

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
- Peak crowd: 1 **encounter** `obj-*` / camera / phiên peak — **đã có** (PR #220). Present count **không** gom.
- Xác nhận mobile/live bundle trả `display_person_count` = số silhouette đủ gate khi peak active.
- (Tuỳ chọn phase 2) Push/SSE khi upsert appearance để giảm trễ live **không** thêm nguồn thứ hai.

---

## 6. Tiêu chí nghiệm thu

### 6.1. Nhất quán

- [ ] Số chấm xanh `object` trên map ≤ `day_stats.unassigned_observations` (encounter counted, cùng ngày).
- [ ] Click / hover chấm → cùng `subject_id` với popup lịch sử xuất hiện.
- [ ] Peak ≥30 người, 35 silhouette:
  - [ ] **Present:** `display_person_count` = **35** (không = 1)
  - [ ] **Lượt gặp:** `unassigned_observations` +1 cho nhóm (không +35)
  - [ ] **Map encounter:** 1 chấm xanh entity nhóm (+ chấm riêng người đã định danh)
  - [ ] **ROI video:** `#1…#35`

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
| Popup chấm nhóm peak | “Nhóm · N người” (`peak_group_size`) — present N tách khỏi 1 encounter |
| Overlay hiện diện trên map | Bind `display_person_count` live, không suy từ số chấm encounter |

---

## 8. Tài liệu liên quan

- `specs/module05/REALTIME_WORKFORCE_HEATMAP_SPECIFICATION.md` — Rule 09, 10 (giữ nguyên triết lý)
- `specs/module05/HELMET_UNIFIED_PIPELINE.md` — GPS/detections vào backend trước heatmap
- Peak time: `backend-ai/app/patrol/peak_time.py`

---

## 9. Ghi chú cho Ban TGĐ (one-liner)

> **Lượt gặp trên bản đồ = sổ chính thức (giờ đông gom 1 đối tượng). Hiện diện = đếm đủ số người trong khung — hai con số khác nhau, cùng đúng nghiệp vụ.**
