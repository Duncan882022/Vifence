# Patrol Event Aggregator — Đánh giá khả thi & lộ trình

## Hiện trạng lỗi (xác nhận qua code)

| Vấn đề | Nguyên nhân trong code |
|---|---|
| Face vs object loại trừ | `sink._record_observation_legacy` (~220 dòng if/else): có mặt → pers, không → object |
| Data bloat | Mỗi frame gated vẫn gọi `daystore.touch_*` (throttle 10s, không buffer session) |
| Cache phân mảnh | 6 store: `_track_to_*`, lifecycle, registry JSON, identity SQLite, analyzer frame dedupe |
| touch_object không song song | Không có pipeline hành vi riêng; object chỉ là nhánh cuối cùng khi không pers |

## Thiết kế mới (Phase 1 — đã implement)

```
ppe_analyzer → sink.record_observation
                    ↓ (PATROL_USE_AGGREGATOR=1)
              aggregator.engine.ingest_observation
                    ├─ identity_pipeline.process_identity  (cache ptk → skip gallery)
                    ├─ behavior_pipeline.process_behavior  (touch obj-* ∥)
                    └─ flush.flush_session (≥10s / finalize)
                              ↓
                    daystore.upsert_track_appearance (1 row / track)
                    + touch_person_event / touch_object (card ngoài, throttled)
```

### Bật thử nghiệm

```bash
PATROL_USE_AGGREGATOR=1
```

Mặc định `false` — production giữ luồng legacy.

### Schema v5 (`appearances`)

- `track_id` — ptk-*
- `event_payload_json` — JSON chuẩn yêu cầu
- `interactions_json` — mảng touch

### JSON đầu ra

Xem `aggregator/serialize.build_event_payload()`.

## Khả thi tổng thể

| Hạng mục | Khả thi | Ghi chú |
|---|---|---|
| Track cache thống nhất | ✅ Cao | `session_store.py` — Phase 1 xong |
| Identity skip re-gallery | ✅ Cao | `identity_resolved` flag |
| Best-frame 1–3 rồi search 1 lần | ✅ Cao | `best_faces[]` |
| Behavior song song | ⚠️ Trung bình | Pipeline có; **analyzer chưa gửi `touched_object_id`** — cần nối YOLO/object detector |
| 1 appearance / track session | ✅ Cao | `upsert_track_appearance` |
| Giảm 90% INSERT | ✅ Cao | Flush 10s + UPDATE in-place |
| Full spec workforce heatmap | ⚠️ Thấp–TB | Cần Phase 2–4 (Object State JSON, dedup deferred, WS events) |

## Việc còn lại (Phase 2+)

1. **Analyzer → `touched_object_id`**: nối object-in-hand / proximity detector vào `record_observation`
2. **Gộp identity stores**: lifecycle + registry → session_store
3. **Deferred dedup / match_candidates** table
4. **API FE**: expose `event_payload_json` trong `/patrol/day/appearances`
5. **Shadow mode**: chạy aggregator song song legacy, so sánh log trước khi bật prod
6. **Load test**: batch TX per frame thay vì N tx/person

## Rủi ro

- Bật aggregator trên prod ngay → regression tab Người / popup — **phải A/B với flag**
- Dữ liệu cũ không có `track_id` / JSON — FE cần fallback
- touch_object detection chưa có → `interactions[]` rỗng cho đến Phase 2

## Files mới

```
backend-ai/app/patrol/aggregator/
  types.py, session_store.py, identity_pipeline.py,
  behavior_pipeline.py, flush.py, engine.py, serialize.py
backend-ai/tests/test_patrol_aggregator.py
```
