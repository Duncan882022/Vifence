# ARCHITECTURAL TECHNICAL SPECIFICATION & IMPLEMENTATION GUIDE
## REALTIME WORKFORCE HEATMAP & EVENT SYSTEM (SMART HELMET CAM)

> **Module 05 (Hiệu quả công việc) — nguồn sự thật tạm thời.**  
> UI/FE Module 05 làm theo tài liệu này cho đến khi backend Population/Identity/Event engines sẵn sàng.

---

## 1. TỔNG QUAN HỆ THỐNG & TRIẾT LÝ THIẾT KẾ

### 1.1. Mục tiêu
Hệ thống Giám sát Nhân lực Realtime qua Smart Helmet (CHT):

- Vị trí realtime mũ/CHT + heading
- Người đang được camera quan sát (Object / Worker), không raw detection spam
- Nội suy vị trí công nhân từ GPS mũ + heading + khoảng cách ước lượng
- Heatmap mật độ nhân lực (4 layer độc lập)
- Face recognition khi đủ điều kiện; Object ID cho người chưa xác định; deferred Re-ID
- Event chỉ khi meaningful state change

### 1.2. Pipeline
```
Helmet Stream → Video + GPS + Helmet ID + Time + IMU/Heading
  → Person / Upper-body / Face Detection
  → Tracking → Track ID → Object ID
  → Face / Re-ID / Position Estimation
  → Worker Entity (khi đủ bằng chứng)
```

### 1.3. 10 Nguyên tắc cốt lõi
1. **Rule 01:** Raw Person Detection ≠ Worker Entity
2. **Rule 02:** Track ID ≠ Worker Entity
3. **Rule 03:** Object ID ≠ Unique Worker
4. **Rule 04:** No-Face Persistence — mất mặt vẫn giữ Object ID
5. **Rule 05:** Conservative Dedup — chưa chắc thì không merge
6. **Rule 06:** Retroactive Merging — cho phép gộp hồi tố
7. **Rule 07:** Close-up không làm giảm Population Count
8. **Rule 08:** Chỉ update Population khi Observability HIGH/MEDIUM
9. **Rule 09:** Event Feed ≠ Raw Detection Log
10. **Rule 10:** Heatmap ≠ raw detection density

---

## 2. KIẾN TRÚC ĐỊNH DANH 3 TẦNG

| Tầng | Phạm vi | Đặc điểm |
|------|---------|----------|
| **Track ID** | Camera / short-term | Mất khi occlusion / ra FOV |
| **Object ID** | Session / candidate | Giữ qua Full→Upper→Close-up; embedding + best frames |
| **Worker ID** | Global HR | VERIFIED (Face) hoặc DEDUPLICATED (merge) |

**Không** lấy số Object ID làm tổng công nhân.

### Object State Schema
```json
{
  "object_id": "OBJ-20260823-087",
  "helmet_id": "HC-02",
  "first_seen": "2026-08-23T09:00:12+07:00",
  "last_seen": "2026-08-23T09:04:45+07:00",
  "observation_mode": "FULL_BODY",
  "best_body_frame_url": "s3://media/frames/obj_087_body.jpg",
  "best_face_frame_url": "s3://media/frames/obj_087_face.jpg",
  "person_embedding": ["...512 dims"],
  "face_embedding": ["...512 dims"],
  "identity_status": "UNKNOWN",
  "worker_id": null,
  "possible_matches": [
    {
      "candidate_object_id": "OBJ-20260823-001",
      "reid_similarity": 0.84,
      "spatial_temporal_overlap": 0.92
    }
  ]
}
```

---

## 3. OBSERVATION MODES & SCENE OBSERVABILITY

### 3.1. Modes

| Mode | Count | Re-ID | Position | Xử lý |
|------|:-----:|:-----:|:--------:|-------|
| FULL_BODY | Có | Cao | Cao (±1m) | Khởi tạo Object + vị trí |
| UPPER_BODY | Có | TB | TB (±2.5m) | Duy trì Track/Object |
| FACE_CLOSEUP | Không | Rất cao | Không dùng | Face only; không update population |
| PARTIAL_BODY | Không | Kém | Không | Candidate only |

### 3.2. Scene Observability Score
$$S_{obs} = 0.3(1-R_{crop}) + 0.3(1-R_{closeup}) + 0.2\,Q_{motion} + 0.2\,Q_{detector}$$

| Band | Ngưỡng | Population |
|------|--------|------------|
| HIGH | ≥ 0.75 | Update |
| MEDIUM | 0.45–0.75 | Update (trọng số giảm) |
| LOW | < 0.45 | **Giữ** observation hợp lệ gần nhất |

---

## 4. POPULATION COUNT ENGINE

Độc lập Face/Re-ID. Lưu **timeline** theo zone, không cộng dồn các mốc.

KPI: Current / Average / Peak Observed Workforce + Trend.

```json
{
  "zone_id": "ZONE-A3",
  "timestamp": "2026-08-23T17:42:00+07:00",
  "observed_count": 31,
  "observability": 0.88,
  "breakdown": {
    "full_body_count": 25,
    "upper_body_count": 6,
    "verified_identities": 11,
    "unknown_objects": 20
  },
  "helmet_references": ["HC-02"]
}
```

---

## 5. DEFERRED DEDUP & RETROACTIVE MERGE

- Similarity < 0.92 → lưu candidate, **không merge ngay**
- Đủ Face / Re-ID / Time / Position / Trajectory → merge hồi tố nhiều Object → 1 Worker
- `OBJECT_MERGED` chỉ Audit log, **không** hiện Event Feed chính

---

## 6. POSITION ESTIMATION (không Beacon)

Stack đề xuất khi không có BLE:

1. **EKF** — GPS (1Hz) + IMU (50Hz) → helmet pose mượt
2. **Map Matching** — snap vào polygon/walkable zone
3. **VIO / bbox depth** — hỗ trợ khi GPS yếu; distance từ full-body bbox
4. **Low-pass per Object** — `α≈0.2–0.35` theo mode
5. **Không** ước vị trí cho `FACE_CLOSEUP` / `PARTIAL_BODY`

Forward geodesic: Bearing = Heading_H + Δθ; Lat/Lon worker từ (Lat_H, Lon_H, Bearing, D).

---

## 7. HEATMAP REALTIME & TTL

### 7.1. 4 Layer độc lập
1. **Khu vực** — polygon, tên zone  
2. **Mật độ** — KDE / accumulated heat (không raw frame)  
3. **Người** — Active / Recently Observed / Verified Worker  
4. **Mũ / lộ trình** — GPS, online, heading cone, trajectory  

### 7.2. TTL Live layer
| Trạng thái | Thời gian | UI |
|------------|-----------|-----|
| ACTIVE | 0–30s | Opacity cao, update live |
| RECENTLY_OBSERVED | 30–120s | Opacity TB, vị trí static |
| EXPIRED | >120s | Xóa khỏi Live; giữ history heat |

### 7.3. Heat sampling
- Max **1 heat point / Object / 3s**
- `W_heat = C_pos × S_obs × TimeDecay`
- Decay alpha ~15s không observation mới

### 7.4. Time filter
`Live | 5 phút | 15 phút | 1 giờ | Ca`

### 7.5. Header (compact)
```
Helmet 01 ● · Helmet 02 ● · 28 quan sát · 11 định danh
[Live|5p|15p|1h|Ca] | [Khu vực|Người|Mật độ|Mũ]
```
Không hiển thị GPS/Observability/Objects chips trên chrome — thông tin đó nằm trên map.

---

## 8. EVENT ENGINE

### 8.1. UI Event types (có feed)
| Type | Trigger | Cooldown |
|------|---------|----------|
| POPULATION_OBSERVED | S_obs≥0.75, count đổi rõ | 3 phút/zone |
| POPULATION_CHANGE | \|Δ\|≥5 hoặc ≥20% /15p | 5 phút/zone |
| HIGH_DENSITY | >0.8 người/m² | 10 phút/zone |
| IDENTITY_VERIFIED | Face ≥0.90 | Immediate |

`OBJECT_MERGED` — Audit only.

### 8.2. Filter UI
`Tất cả | Nhân lực | Định danh | Mật độ | Hệ thống`

**Không** dùng tab Persons / raw "Phát hiện người".

### 8.3. WebSocket channels

**Đã triển khai:** `WS /ws/patrol/live?cameras=HC-01,HC-02&token=` — push `live_bundle` (metrics + workforce) ~2.5s + heartbeat 10s.

FE: `createPatrolLiveFeed` → ưu tiên WS, fallback HTTP `GET /patrol/live/bundle`.

Mục tiêu tách kênh (tương lai): `HELMET_STATE` · `OBJECT_STATE` · `POPULATION_STATE` · `EVENT`

Frontend state (KV, không append detection vô hạn):

```
helmets = {}
objects = {}
zonePopulation = {}
events = []
heatPoints = []
```

### 8.4. Triển khai FE hiện tại (Module 05 — **SQLite day bundle + live poll**)

**Component:** `PatrolEventsPanel` (không dùng shared `EventList`).

**Nguồn dữ liệu sự kiện (poll ~3s, một người một thẻ/ngày từ SQLite):**

| Nguồn | Hook / service | Endpoint |
|-------|----------------|----------|
| Day bundle | `usePatrolDayBundle` → `patrolDayEvents.service` | `GET /patrol/day/bundle?date=` |
| Live metrics + workforce | `usePatrolLivePoll` | `WS /ws/patrol/live` (ưu tiên) → fallback `GET /patrol/live/bundle` |
| Mobile HC-02 bridge | `patrolMobileMetricsBridge` | Snapshot stream/person từ `MobileCameraFeed` |

**Không còn** `usePatrolHelmetLiveEvents`, `mergePatrolAndWorkforceEvents`, hay poll `/patrol/events` live.

**Không có fallback mock** trong tab Sự kiện. Khi chưa có dữ liệu: *「Chưa có sự kiện — đang chờ backend」*.

**Ẩn khỏi feed chính** (`isMeaningfulFeedEvent`):
- `PERSON_DETECTED` — raw detection, không hiển thị
- `PPE_VIOLATION` — khi `PATROL_PPE_UI_HIDDEN = true` (Module 05 hiện tại)

**Tab filter §8.2 → loại sự kiện:**

| Tab | `EventType` |
|-----|-------------|
| Tất cả | Mọi loại meaningful (trừ PERS/PPE ẩn) |
| Nhân lực | `POPULATION_OBSERVED`, `POPULATION_CHANGE` |
| Định danh | `IDENTITY_VERIFIED` |
| Mật độ | `HIGH_DENSITY` |
| Hệ thống | `MACHINE_STOPPED` |

**Camera / zone hiển thị (live):**
- Camera: `PATROL_BODYCAM_LABELS` — `HC-01` → Helmet 01, `HC-02` → Helmet 02
- Zone: luôn `Cầu Sông Hốt` (`PATROL_SITE_NAME`, `ZONE_SITE`)
- GPS HC-02: GPS thật từ backend/bridge; fallback `PATROL_SITE_CENTER` khi stream online nhưng thiếu fix

**Popup chi tiết (`PatrolEventDetailModal`):** loại, tiêu đề, trạng thái, vị trí, đối tượng, thời gian, confidence, GPS, actions — **không snapshot** (backend chưa cung cấp ảnh sự kiện).

**Cấu hình AI (`PatrolCameraAiConfigModal`):** HC-* / DR-* chỉ `patrol_person` (PERS-001); không PPE / ATLĐ Module 03.

**Mock còn lại (không vào feed):** `MOCK_PATROL_EVENTS` chỉ dùng cho playback timeline stub (`patrolCameraPlayback.service`).

---

## 9. UI LAYOUT (Mobile / Compact)

Giữ 2 section: **HEATMAP** | **SỰ KIỆN**

- Heatmap: header + Time tabs + Layer toggles + Map + bottom sheet Object detail
- Sự kiện: filter 5 tab + card meaningful only

Click Object → bottom sheet Unknown (OBJ-*) hoặc Verified (tên + Worker ID + zones).

---

## 10. POC ACCEPTANCE CRITERIA

1. Helmet GPS + heading realtime (<1s)
2. Partial body không tạo Object/count
3. Scale Full→Close giữ 1 Track/Object
4. Close-up → Observability LOW, population **không** tụt
5. Face match → UNKNOWN→VERIFIED
6. Dedup conservative
7. Retroactive merge history
8. 1000 raw detect/phút → Event Feed <5 meaningful
9. Stand still 10 phút → heatmap không cháy đỏ giả
10. Time filter Live ↔ 15 phút đúng

---

## 11. END-TO-END FLOW

```
SMART HELMET (Video+GPS+IMU+ID)
        ↓
PERSON OBSERVATION
   ┌────┴────┐
POPULATION   INDIVIDUAL
(Observability→Scene Count→Zone Timeline)
             (Track→Object→Face/Re-ID→Worker)
        ↓
POSITION ENGINE (Geodesic + EKF + low-pass)
   ┌────┴────┐
HEATMAP      EVENT ENGINE
(Live map)   (Meaningful changes only)
```

---

## 12. GHI CHÚ TRIỂN KHAI (Module 05 FE — cập nhật 2026-08-23)

| Hạng mục | Trạng thái |
|----------|------------|
| Tab Sự kiện | **Live** — backend + workforce poll; không mock |
| Population / Observability | Live từ `/patrol/workforce/state` + metrics HC-01/HC-02 |
| Event POPULATION_* / IDENTITY_* | Workforce engine → `workforceEventsMapper` |
| PPE / PERSON_DETECTED | Ẩn khỏi feed (`PATROL_PPE_UI_HIDDEN`, `isMeaningfulFeedEvent`) |
| MACHINE_STOPPED | Tab **Hệ thống** — backend + workforce |
| WebSocket §8.3 | `WS /ws/patrol/live` + fallback HTTP live/bundle |
| Playback timeline | Vẫn stub `MOCK_PATROL_EVENTS` (tách khỏi feed live) |
| Heading cone | Khi có IMU heading từ stream |
| Object bottom sheet | `WorkforceObjectSheet` trên heatmap |

*Tài liệu chuẩn hóa Realtime Workforce Heatmap & Event — Smart Helmet Cam.*
