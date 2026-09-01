# Module 05 — Heatmap: Một nguồn sự thật (Presences)

> **Trạng thái:** Yêu cầu refactor — thay thế kiến trúc 3 nguồn hiện tại  
> **Liên quan:** Peak time (PR #220 — cần chỉnh count), KPI Nhân sự / Lượt gặp  
> **Cập nhật:** 2026-09-01 (rev.3 — map dots = KPI; peak gom snapshot, không gom lượt gặm)

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
- Chấm “live” từ registry **không** đi qua dwell / tripwire / peak → dễ lệch sổ cái.
- Người vận hành không trả lời được: *“Chấm này đã tính lượt gặp chưa?”*

**Kết luận:** Ba nguồn là nợ kỹ thuật. Cần bỏ — chỉ còn presences.

---

## 1.1. Mô hình đếm chuẩn (map = KPI)

**Ba loại chấm trên map = ba chỉ số KPI — cùng một sổ presences/appearances, không tách nguồn.**

| Chấm map | Màu | KPI tương ứng | Ý nghĩa |
|----------|-----|---------------|---------|
| **Định danh** | violet | `identity_count` | Gallery / NV đã verify — phần **Nhân sự** |
| **Người** | sky | `person_count` | `pers-*` / tk draft — phần **Nhân sự** (chưa định danh) |
| **Đối tượng** | green | `unassigned_observations` | **Lượt gặp · ĐT** — mỗi chấm = **một lần gặp** (`counted=1`), không phải số thẻ/card |

```
Presences / appearances (counted)
        ↓
┌───────────────────────────────────────┐
│  Chấm map  ≡  Overlay góc map  ≡  KPI │
├─────────────┬─────────────┬───────────┤
│ Định danh   │ Người       │ Đối tượng │
│ (violet)    │ (sky)       │ (green)   │
├─────────────┼─────────────┼───────────┤
│ identity    │ person      │ lượt gặm  │
│ _count      │ _count      │ (obj enc.)│
└─────────────┴─────────────┴───────────┘
     └──── Nhân sự KPI ────┘
```

**Quy tắc vàng:** Số chấm xanh **Đối tượng** = **số lần gặp** (`unassigned_observations`), không phải số entity `obj-*` duy nhất hay số thẻ `object_card_count`.

> **Lưu ý implement hiện tại:** Overlay map đang bind `objectCount` ← `object_card_count` — **lệch nghiệp vụ**. Phải bind **lượt gặm** (`unassigned_observations`) cho hàng Đối tượng; builder chấm xanh cũng phải theo **encounter**, không gom 1 chấm/entity khi peak.

---

## 1.2. Peak time — gom snapshot, KHÔNG gom lượt gặm

Giờ cao đông (≥30 silhouette/khung, exit ≤25):

1. **Tách bình thường:** Ai đủ mặt → **Định danh** hoặc **Người** — chấm + KPI như giờ thường.
2. **Phần còn lại (Đối tượng):**
   - **Thẻ / snapshot sự kiện:** **1 ảnh nhóm** (“Nhóm N”) — gom hiển thị, không 30 thẻ riêng.
   - **Đếm lượt gặm:** **đúng số người** chưa định danh trong nhóm — **N lượt**, **N chấm xanh** trên map, KPI **Lượt gặp · ĐT += N**.
3. **ROI video:** vẫn **N bbox** `#1…#N` (cùng tag nhóm trên detection).

Ví dụ 40 silhouette, 5 định danh + 3 người + 32 đối tượng:

| Hạng mục | Giá trị |
|----------|---------|
| Chấm violet | 5 |
| Chấm sky | 3 |
| Chấm green | **32** (= lượt gặm ĐT) |
| KPI Nhân sự | 8 |
| KPI Lượt gặp · ĐT | **32** |
| Thẻ snapshot nhóm | **1** (ảnh “Nhóm 32”) |
| ROI | 40 bbox, 32 cái `#1…#32` thuộc nhóm |

**Sai (PR #220 hiện tại / rev.2 spec):** Gom cả lượt gặm thành 1 `obj-*` → KPI + map chỉ +1. **Không đúng nghiệp vụ.**

**Đúng:** Chỉ **snapshot/thẻ UI** gom; **ledger lượt gặm** ghi **N dòng** (hoặc N counted appearances).

---

## 2. Nguyên tắc refactor heatmap

### 2.1. Một sổ cái

```
Camera + AI + GPS
       ↓
  Event Aggregator (dwell, identity, peak crowd, tripwire)
       ↓
  SQLite: appearances / presences
       ↓
  ┌─────────────┬─────────────┬─────────────┐
  │  Heatmap    │  Tab sự kiện │  KPI Tier1   │
  │  (chấm GPS) │  (thẻ)       │  day_stats  │
  └─────────────┴─────────────┴─────────────┘
           Cùng counted · cùng tier · map ≡ KPI
```

- **Presences** = nguồn duy nhất cho **chấm map**.
- Tab sự kiện = view cùng ledger (peak: thẻ nhóm 1 snapshot, count vẫn N).
- Registry sessionStorage **không** feed map.

### 2.2. “Live” trên map

| Không phải live | Là live (1 nguồn) |
|-----------------|-------------------|
| Pin registry / detection frame | Presence `ended_at` trong **120s** + cam online |
| Chấm trước khi BE ghi sổ | Sau aggregator commit |
| ROI bbox video | `PatrolPersonRoiOverlay` — riêng, realtime |

**Trade-off:** Map trễ vài giây; **data khớp KPI**.

### 2.3. Rule 09 / 10

- Event Feed ≠ raw detection log.
- Heatmap dot = **entity/lượt gặm đã ghi sổ**, không pin YOLO.

---

## 3. Quy tắc vẽ chấm (presences only)

### 3.1. API

- `GET /patrol/day/presences?date=…`
- `GET /patrol/day/bundle` (ưu tiên tái dùng)

### 3.2. Filter

| Option | Nghiệp vụ |
|--------|-----------|
| `countedOnly: true` | Chỉ qua tripwire — khớp KPI |
| `includeUnassigned: true` | Tier `object` — **mỗi lượt gặm một chấm** (peak: N chấm, không gom 1) |
| `liveOnly` + cam online | `ended_at` trong 120s |
| Gom theo entity | Chỉ áp **Người / Định danh** (1 chấm / pers / iden). **Đối tượng: không gom entity lúc peak** — gom theo `presence_seq` / encounter |

### 3.3. Màu tầng

| Tier | Màu | = KPI |
|------|-----|-------|
| `object` | green-400 | Lượt gặm · ĐT |
| `person` | sky-400 | Nhân sự (pers) |
| `identity` | violet-400 | Nhân sự (iden) |

`peak_group_index` / `peak_group_size`: chỉ **ROI + label detection** — không thay đổi số chấm/KPI.

### 3.4. GPS

- `gps_lat_end` / `gps_lng_end` trên presence; fallback vị trí mũ.

---

## 4. Phạm vi refactor

### 4.1. FE

| File | Việc |
|------|------|
| `PatrolDensityHeatmap.tsx` | Chấm **chỉ** từ presences; overlay **Đối tượng** ← `unassignedObservations`, không `object_card_count` |
| `patrolDayHeatmapDots.ts` | Object tier: 1 chấm / lượt gặm (`presence_seq`), không collapse 1 entity peak |
| `patrolHeatmapPersonRegistry.ts` | Bỏ khỏi map |
| `Module05Page.tsx` | Sửa copy peak: “snapshot nhóm, lượt gặm đếm đủ N” |

### 4.2. BE (peak — sửa PR #220)

| Hiện tại (sai) | Cần |
|----------------|-----|
| `record_peak_crowd_frame` → 1 `obj-*`, +1 appearance | Ghi **N counted appearances** (hoặc N track encounter) cho N silhouette chưa định danh |
| 1 snapshot gắn 1 obj | 1 **snapshot nhóm** dùng chung cho thẻ UI; ledger vẫn N lượt |
| KPI `unassigned_observations` +1 | KPI **+N** |

Giữ: tách định danh/người ra pipeline bình thường; ROI `#1…#N`; hysteresis 30/25.

### 4.3. Xóa fallback map (bắt buộc)

```tsx
// ❌ BỎ
getHeatmapPersonDots()
buildPatrolDayHeatmapDots() // cho map site

// ✅ CHỈ
buildPatrolPresenceHeatmapDots(scopedPresences, { countedOnly: true, includeUnassigned: true, … })
```

---

## 5. Tiêu chí nghiệm thu

### 5.1. Map ≡ KPI

- [ ] Số chấm violet = `identity_count`
- [ ] Số chấm sky = `person_count`
- [ ] Số chấm green = `unassigned_observations` (lượt gặm)
- [ ] Overlay góc map khớp ba số trên

### 5.2. Peak (40 người: 5 iden + 3 pers + 32 obj)

- [ ] Chấm: 5 + 3 + **32**
- [ ] KPI Nhân sự = 8; Lượt gặp · ĐT = **32**
- [ ] Tab sự kiện: **1 thẻ snapshot nhóm** cho phần 32 (UI), count ledger **32**
- [ ] ROI: 40 bbox, `#1…#32` trên nhóm

### 5.3. Một nguồn

- [ ] Không registry / events fallback trên map
- [ ] Click chấm → cùng `subject_id` / `presence_seq` với popup lịch sử

### 5.4. Test

- [ ] `test_patrol_peak_time.py`: N members → `unassigned_observations` +N (sau sửa BE)
- [ ] `patrolDayHeatmapDots.test.ts`: object peak → N green dots

---

## 6. Phase 2

| Hạng mục | Mục đích |
|----------|----------|
| Poll presences 2–3s khi live | Giảm trễ |
| SSE `presence_upsert` | Live vẫn 1 nguồn |

---

## 7. Tài liệu liên quan

- `specs/module05/REALTIME_WORKFORCE_HEATMAP_SPECIFICATION.md`
- `specs/module05/EVENT_AGGREGATOR_FEASIBILITY.md`
- `backend-ai/app/patrol/peak_time.py`

---

## 8. Ghi chú Ban TGĐ

> **Chấm bản đồ = số liệu báo cáo. Giờ đông: ảnh sự kiện gom một nhóm, nhưng lượt gặp vẫn đếm đủ từng người chưa nhận diện.**
