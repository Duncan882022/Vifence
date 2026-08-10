# VIFENCE CMS — VMS + AI SPEC v1

**Version:** 1.0  
**Ngày chốt:** 2026-08-10  
**Trạng thái:** Approved for implementation  
**Phạm vi:** Module 03 (Giám sát ATLĐ) + nền VMS backend — dự án thật, không demo overlay FE

---

## 1. Mục tiêu

Chuyển Vifence từ kiến trúc **“FE chụp frame → BE analyze → FE vẽ overlay”** sang **VMS chuẩn**:

- **Backend** ingest video, chạy AI, confirm vi phạm, cắt clip, burn-in bbox.
- **Frontend** chỉ xem **HLS live** + **clip sự kiện** + bảng KPI — **không** patch overlay analyze client-side.

Nguyên tắc sản phẩm (khớp `Vifence_Prod.md`):

> **Evidence Based:** mọi sự kiện có thumbnail + clip MP4 truy xuất được.

---

## 2. Quyết định đã chốt (Decision log)

| ID | Quyết định |
|----|------------|
| D1 | Nguồn video: **2 MP4 loop trên VPS** (`A-03`, `A-04`); sau này thay **RTSP** — **cùng pipeline**, không đổi FE contract. |
| D2 | Live FE: **HLS** (`.m3u8`). WebRTC deferred. |
| D3 | Clip sự kiện: **3–5 giây** tổng, **burn-in bbox** trên clip + thumbnail. |
| D4 | Ma trận camera × scenario — xem §4. |
| D5 | Mesh BPTC-001: **camera mới** (mặt tiền giàn giáo); train từ ảnh site + frame harvest A-03/A-04. |
| D6 | Mesh train: **1 class YOLO `mesh_cover`** trước; vi phạm **thiếu / rách / bẩn** = rule trên detect + zone (§6.3). |
| D7 | Label: team nội bộ **seed 150–300 ảnh/class**; sau đó pseudo-label + **duyệt trên CMS**. |
| D8 | Ưu tiên implement: **BE stream + clip + train máy/mesh**; tool vẽ polygon **sau** API zones. |
| D9 | **Không** patch overlay FE — VMS BE-first. |
| D10 | Spec v1 này là **gate** trước khi code Phase 1. |

---

## 3. Kiến trúc đích

```text
┌─────────────────────────────────────────────────────────────┐
│ VPS (backend-ai)                                            │
│                                                             │
│  Ingest worker (1/camera)                                   │
│    ffmpeg -stream_loop -1 -re -i {source}                   │
│    → decode @ 25fps → ring buffer 30s                       │
│    → AI sampler @ 5–8 FPS                                   │
│                                                             │
│  AI + Event engine (per camera, scenario matrix §4)           │
│    track ID → candidate → confirmed (§5)                    │
│    on confirm → clip 3–5s + thumbnail burn-in               │
│                                                             │
│  Live out: HLS per camera                                   │
│    GET /stream/{camera_id}/index.m3u8                       │
│                                                             │
│  Events API (existing + mở rộng)                            │
│    GET /events/{id}/clip                                    │
│    GET /events/{id}/snapshot                                │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│ Frontend (Module 03)                                          │
│   Live tile: <video src={hlsUrl} /> — NO overlay TSX          │
│   Event modal: clip MP4 từ BE                                 │
│   Config (phase sau): zones, label queue                        │
└───────────────────────────────────────────────────────────────┘
```

**Deprecate (không sửa thêm):**

- `captureCameraAnalyzeFrame`, `*Overlay.tsx` analyze loop trên live A-03/A-04
- Seek hardcode trong `eventPlaybackClip.ts`

---

## 4. Ma trận Camera × Scenario

### 4.1 Camera inventory v1

| Camera ID | Tên | Nguồn v1 | Nguồn production | Vị trí |
|-----------|-----|----------|------------------|--------|
| **A-03** | Cam 03 | `ttdv-a-cam03-test.mp4` loop VPS | RTSP TBD | Block T.Bắc — Mép biên |
| **A-04** | Cam 04 | `ttdv-a-cam04-test.mp4` loop VPS | RTSP TBD | Block T.Bắc — Lồng thang |
| **A-05** | Cam 05 (mesh) | TBD — ảnh site / stream sau | RTSP mặt tiền giàn giáo | Mặt tiền giàn giáo |

> **A-05** là camera mới cho BPTC-001. Không bật mesh event trên A-03/A-04; chỉ **harvest frame** từ 2 cam đó để train `mesh_cover`.

### 4.2 Scenario bật theo camera

| Camera | Nhóm | Scenario ID | Behaviors / engine |
|--------|------|-------------|-------------------|
| **A-03** | BPTC | BPTC-007, BPTC-008, BPTC-009 | `mud`, `water`, `object` — `road_analyzer` |
| **A-03** | ATGT | ATGT-002, ATGT-004 | `speeding`, `hard_median`, `no_soft_median` — `atgt_engine` |
| **A-04** | PPE | PPE-001, PPE-002, PPE-003 | `no_helmet`, `no_vest`, `no_shoes` — `ppe_engine` |
| **A-04** | PCCC | PCCC-001, PCCC-002 | `smoking`, `fire` — `pccc_engine` |
| **A-04** | WAH | WAH-001 | `no_harness` — `wah_engine` |
| **A-04** | DZ | DZ-003 | `crane_proximity` — `crane_proximity_engine` |
| **A-05** | BPTC | BPTC-001 | `mesh_missing`, `mesh_torn`, `mesh_dirty` — `mesh_engine` (mới) |

**Một camera = một worker ingest + N analyzer theo bảng trên** (không gộp 4 model trên FE).

### 4.3 Live HLS URL (contract FE)

```text
{VITE_MOBILE_AI_BACKEND_URL}/stream/{camera_id}/index.m3u8
```

Ví dụ: `https://217.217.253.247.nip.io/stream/A-03/index.m3u8`

FE `TrainingCamera.streamUrl` / `getStreamUrlForCamera` trỏ HLS thay MP4 static khi flag VMS bật.

---

## 5. Tiêu chí detect & ghi event

### 5.1 Ba lớp ngưỡng

| Lớp | Mục đích | Conf | Ghi event? |
|-----|----------|------|------------|
| **Track** | Giữ track ID ổn định | 0.45–0.55 | Không |
| **Candidate** | Debug / metric nội bộ | 0.65–0.75 | Không |
| **Confirmed** | Ghi DB + cắt clip | Xem §5.2 | **Có** |

### 5.2 Ngưỡng confirm theo scenario

| Scenario / behavior | Confirm liên tục | Conf event | Cooldown track |
|---------------------|------------------|------------|----------------|
| PPE (`no_*`) | 2.0 s | ≥ **0.85** | 900 s |
| WAH (`no_harness`) | 2.0 s | ≥ **0.85** | 900 s |
| DZ (`crane_proximity`) | 2.0 s | ≥ **0.85** | 900 s |
| ATGT (`speeding`, lane) | 2.0 s | ≥ **0.85** | 600 s |
| PCCC smoking | 2.5 s | ≥ **0.85** | 900 s |
| PCCC fire | **6.0 s** | ≥ **0.88** | 900 s |
| BPTC mud / water | 2.0 s | ≥ **0.80** | 600 s |
| BPTC object | 2.0 s | ≥ **0.85** | 600 s |
| BPTC mesh (`mesh_*`) | 2.0 s | ≥ **0.85** | 1800 s |

`VIOLATION_MAX_GAP_SECONDS = 3.0` (giữ như hiện tại).

**FPS AI trên stream:** 5–8 FPS / camera (đủ ATLĐ, tiết kiệm CPU).

### 5.3 Clip & thumbnail (D3)

| Field | Giá trị |
|-------|---------|
| **Độ dài clip** | **3–5 s** tổng (mặc định **5 s**: −1 s trước `confirmed_at`, +4 s sau) |
| **Format** | MP4 H.264, cùng resolution nguồn hoặc max 1080p |
| **Burn-in** | Bbox vi phạm + label scenario (vd `PCCC-002 88%`) trên **clip** và **thumbnail** |
| **Thumbnail** | Frame tại `confirmed_at`, crop quanh bbox (reuse logic `snapshot_compose`) |
| **API** | `GET /events/{id}/clip`, `GET /events/{id}/snapshot` |

Metadata event bổ sung (Phase 1):

```json
{
  "clip_file": "events/2026-08-10/{id}.mp4",
  "confirmed_at": 1735689600.0,
  "clip_start_at": 1735689599.0,
  "clip_end_at": 1735689604.0,
  "frame_width": 1920,
  "frame_height": 1080
}
```

---

## 6. Train data & auto_train

### 6.1 Task registry (mở rộng `auto_train/tasks.py`)

| Task ID | Classes YOLO | Camera / nguồn | Seed (label tay) | Ghi chú |
|---------|--------------|----------------|------------------|---------|
| `crane_machinery` | `tower_crane`, `crane_green`, `sany_drill` | A-04, site | 200–300 ảnh | Thay OWLv2 runtime |
| `road_material` | `mud`, `water`, `material` | A-03 | 150–200 ảnh | BPTC-007/008/009 |
| `fire` | `fire`, `smoke` | A-04 | 100+ | PCCC-002 |
| `smoking` | `cigarette` | A-04 | 100+ | PCCC-001 |
| `ppe_helmet` | `hard_hat` | A-04 | 150+ | |
| `ppe_vest` | `safety_vest` | A-04 | 150+ | |
| `ppe_shoes` | `safety_shoes` | A-04 | 150+ | |
| `wah_harness` | `safety_harness` | A-04 | 150+ | |
| **`safety_mesh_cover`** | **`mesh_cover`** | A-05, ảnh site, harvest A-03/A-04 | **150–300 ảnh** | **Mới — §6.3** |

### 6.2 Quy trình label (D7)

```text
Phase 0 — Seed (bắt buộc)
  Team nội bộ gán 150–300 ảnh/class (CVAT / Label Studio)
  Export YOLO → train baseline → promote v1

Phase 1 — Pseudo-label
  BE collect frame khi conf ≥ 0.75, track stable ≥ 5 frame
  Không overlap regression FP set

Phase 2 — Duyệt CMS (sau Phase 1 BE)
  Queue: conf 0.5–0.75, operator reject, model disagree
  Duyệt → vào dataset gold
```

### 6.3 Mesh BPTC-001 (D5, D6)

**Train (1 class):**

- Class: `mesh_cover` — tấm lưới bao che xanh lá, pattern lỗ, trên giàn giáo.
- **Không** dùng tên `crane_green`, `cover`, `green` (tránh nhầm máy xúc).

**Hard negative bắt buộc:** máy xúc xanh, cây, áo phản quang, polygon UI.

**Vi phạm (rule trên detect, không train class riêng giai đoạn 1):**

| Behavior | Điều kiện rule (trong zone facade) |
|----------|-------------------------------------|
| `mesh_missing` | Polygon zone bắt buộc có lưới; coverage `mesh_cover` < **60%** diện tích zone ≥ 2 s |
| `mesh_torn` | Panel `mesh_cover` detect + heuristic rách (gap contour / low texture continuity) |
| `mesh_dirty` | Panel detect + màu xám/bụi (HSV deviation từ baseline xanh) ≥ ngưỡng |

Tất cả map `scenario_id: BPTC-001`, khác `scenario_name` theo behavior (đã có trong `schemas.py`).

---

## 7. ROI & zones (Phase 2 — sau stream + clip)

| Loại | Cách tạo | Ví dụ |
|------|----------|-------|
| **Polygon tĩnh** | Operator vẽ trên CMS → `POST /cameras/{id}/zones` | ROAD, CRANE_WORK, facade mesh zone |
| **BBox động** | Model + tracker | Person, vehicle, machine |
| **Semi-auto polygon** | Seg/contour từ detect → operator duyệt | Vũng nước, footprint máy |

API zones (spec API, implement Phase 2):

```yaml
POST /cameras/{camera_id}/zones
Body:
  id: string
  type: ROAD | CRANE_WORK | FACADE_MESH | ...
  polygon: [{x, y}]  # normalized 0–1
  rules: [string]
```

Thay hardcode: `road_roi_config.py`, `crane_roi_config.py`, `housekeepingRoiConfig.ts` → **một nguồn BE**.

---

## 8. Frontend thay đổi (Phase 1)

| Thành phần | Trước | Sau v1 |
|------------|-------|--------|
| Live A-03/A-04 | MP4 + `*Overlay.tsx` | HLS URL từ BE |
| Analyze client | POST `/analyze/*/frame` | **Tắt** |
| Event modal | MP4 seek + bbox JSON | **Clip MP4** từ `/events/{id}/clip` |
| Snapshot | JPG (đã crop PCCC) | Thumbnail burn-in từ cùng pipeline clip |

**Giữ nguyên:** Sidebar, KPI strip, bảng sự kiện, filter, nút Xử lý — chỉ đổi nguồn video.

Feature flag gợi ý: `VITE_VMS_MODE=true` trong `.env.ghpages` / `.env.local`.

---

## 9. Backend deliverables — Phase 1 (implementation order)

| # | Deliverable | Acceptance |
|---|-------------|------------|
| P1.1 | Config `CAMERAS` env: id → source path/RTSP | A-03, A-04 loop 24/7 |
| P1.2 | Ingest worker + ring buffer 30 s | Không drop khi AI chậm |
| P1.3 | HLS output `/stream/{id}/index.m3u8` | FE play được trên Chrome |
| P1.4 | Server-side AI @ 5–8 FPS theo §4.2 | Events vẫn qua engines hiện có |
| P1.5 | Clip cutter ffmpeg 3–5 s + burn-in | Modal play clip, không seek cứng |
| P1.6 | `GET /events/{id}/clip` | 200 + video/mp4 |
| P1.7 | Event metadata `clip_file`, `confirmed_at` | JSONL + API list |
| P1.8 | Thêm `safety_mesh_cover` task stub + seed script scaffold | Chưa bật event A-05 |
| P1.9 | Regression gate script (video + `fp_*.png`) | Fail → không deploy |

**Phase 2:** API zones, A-05 ingest, `mesh_engine`, CMS label queue.  
**Phase 3:** RTSP thật, PostgreSQL, auth, retention 90 ngày.

---

## 10. Out of scope v1

- WebRTC live
- Burn-in trên live HLS (chỉ clip + thumbnail)
- Tool vẽ polygon UI (chờ API zones)
- Full active learning UI (chỉ scaffold API)
- Mobile camera MOB-01 trong pipeline VMS

---

## 11. Rủi ro & giả định

| Rủi ro | Giảm thiểu |
|--------|------------|
| VPS CPU không đủ 2 cam × N model | 5–8 FPS AI; queue per camera; tắt OWLv2 |
| HLS latency 2–6 s | Chấp nhận cho ATLĐ; clip event chính xác theo `confirmed_at` |
| Mesh nhầm máy xúc xanh | Hard negative + regression bắt buộc trước promote |
| A-05 chưa có RTSP | Train từ ảnh site trước; stream sau |

---

## 12. Sign-off

| Vai trò | Tên | Ngày | ✓ |
|---------|-----|------|---|
| Product / Owner | | | |
| Tech lead | | | |
| AI / CV | | | |

---

*Tài liệu này là nguồn sự thật cho Phase 1 VMS. Mọi thay đổi ma trận camera, ngưỡng, hoặc clip duration cần bump version (v1.1+).*
