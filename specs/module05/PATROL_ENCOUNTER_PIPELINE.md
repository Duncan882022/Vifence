# Module 05 — Pipeline ghi sự kiện tuần tra (Encounter)

> **Trạng hái:** Chuẩn nghiệp vụ thống nhất — implement dần  
> **Cập nhật:** 2026-09-01

---

## 1. Mục tiêu

**Không bỏ sót ai** có hình thù người trong khung camera. Ghi đúng tier, snapshot rõ nhất, đồng bộ map/KPI.

---

## 2. Thang 3 tầng (chốt tại frame tốt nhất)

| Bằng chứng | Tier | Ghi chú |
|------------|------|---------|
| Silhouette người | **Đối tượng** | Luôn ghi — không cần mặt |
| + mặt đủ rõ (`face_eligible`, score ≥ 1.05) | **Người** | |
| + khớp gallery / HR | **Định danh** | Chỉ thăng tầng, không hạ |

Tiếp tục bám track → thăng tầng khi bằng chứng rõ hơn → cập nhật lịch sử.

---

## 3. Cửa sổ 2 giây

Mobile HC-* analyze ~**320 ms**/frame → **2 s ≈ 6 frame**.

| Tham số | Giá trị | Ý nghĩa |
|---------|---------|---------|
| **Max tích lũy** | **2 s** | Trong lúc còn track — chờ frame rõ hơn để thăng tier |
| **Min chốt (tuỳ chọn)** | ~0.5 s / ≥2 frame | Lọc flash 1 frame |
| **Mất track / ra khung** | **Finalize ngay** | Người lướt qua (<2 s) vẫn ghi — không đợi đủ 2 s |

**Quy tắc vàng — giữ frame cũ:**

> Trong 2 s, nếu **không** có frame tốt hơn → **vẫn giữ và chốt frame đã có**.  
> **Cấm** chờ frame mới mà xóa / bỏ qua snapshot candidate → dẫn tới miss.

Implement: `TrackSession.best_observation` — monotonic theo `snapshot_score`; finalize luôn flush observation tốt nhất.

---

## 4. Map = KPI = lượt gặm

Xem [`HEATMAP_SINGLE_SOURCE_SPEC.md`](./HEATMAP_SINGLE_SOURCE_SPEC.md) rev.3.

---

## 5. ROI trên live camera

### 5.1. Vấn đề hiện tại

- BE xử lý frame → trả detection **sau** video đã phát → ROI trên tile **đuổi theo**, gây hiểu nhầm.
- ROI không chính xác = người xem tin sai tier/vị trí.

### 5.2. Quyết định

| Chế độ | Mặc định | Ghi chú |
|--------|----------|---------|
| **ROI live trên tile** | **BẬT** (nút bbox toolbar) | `getCameraBboxVisible` — user tắt/bật |
| **Đồng bộ thời gian** | Buffer **5 s** | `PATROL_LIVE_ROI_DELAY_MS` + `useSyncedVmsDetections` |
| **Publisher local** | Không delay | `usePatrolLocalFrameAnalyze` — bbox cùng khung JPEG |
| **Sự kiện / map / tab** | Luôn bật | Nguồn sự thật sau BE xử lý |

ROI có ý nghĩa khi **khớp khung video** (PDT hoặc fallback lag 5 s) — không vẽ bbox “đuổi theo” snapshot mới nhất.

---

## 6. Phạm vi implement

### BE

| File | Việc |
|------|------|
| `config.py` | `patrol_object_confirm_seconds = 2.0`, `patrol_track_accumulation_max_seconds = 2.0` |
| `aggregator/types.py` | `best_observation` + score |
| `aggregator/engine.py` | Cập nhật best mỗi frame |
| `aggregator/flush.py` | Finalize dùng `best_observation`, force snapshot nếu chưa có |
| `patrol_face_anchor.py` | (P0 tiếp) Không drop silhouette YOLO — chỉ hỗ trợ tier |

### FE

| File | Việc |
|------|------|
| `patrolHelmetScope.ts` | `PATROL_LIVE_ROI_DELAY_MS = 5000`; ROI theo bbox toggle |
| `CameraVideoFeed.tsx` | `useSyncedVmsDetections` + ingest từ snapshot đã sync |
| `overlayTimeSync.ts` | Fallback lag ~5 s khi không khớp PDT |

---

## 7. Nghiệm thu

- [ ] Người lướt ~1 s vẫn có 1 lượt gặm + snapshot (finalize + best_obs)
- [ ] Người đứng 2 s — snapshot = frame score cao nhất trong cửa sổ
- [ ] Không có track nào finalize mà mất snapshot vì “chưa đủ đẹp”
- [ ] Tile camera vẽ ROI khi bbox toggle bật; bbox khớp người (lag ≤5 s)
- [ ] Map/KPI vẫn cập nhật sau chốt

---

## 8. One-liner Ban TGĐ

> **Thấy người là ghi — 2 giây chọn ảnh đẹp nhất, không đẹp hơn thì giữ ảnh cũ. Live cam tạm không vẽ khung; tin vào sự kiện và bản đồ.**
