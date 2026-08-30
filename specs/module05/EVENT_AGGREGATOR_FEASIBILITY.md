# Patrol Event Aggregator — Phase 2 hoàn tất

## Luồng mới (mặc định bật)

```
ppe_analyzer → sink.record_observation
                    ↓ (PATROL_USE_AGGREGATOR=1, default)
              aggregator.engine.ingest_observation
                    ├─ session_store (Re-ID 180s / cosine ≥0.85)
                    ├─ identity_pipeline.process_identity
                    ├─ behavior_pipeline.process_behavior
                    ├─ tripwire.site_entry_counted (polygon site)
                    └─ flush.flush_session (≥10s / finalize)
                              ↓
                    daystore.upsert_track_appearance
                    (session_id, counted, event_payload_json)
```

### Tắt aggregator (legacy)

```bash
PATROL_USE_AGGREGATOR=0
```

## Schema v6 (`appearances`)

| Cột | Ý nghĩa |
|---|---|
| `track_id` | ptk-* ByteTrack |
| `session_id` | sess-* ổn định qua Re-ID |
| `counted` | 1 = đã qua tripwire, tính KPI lượt gặp |
| `event_payload_json` | JSON chuẩn |
| `interactions_json` | touch object |

## Anti-duplicate

- **Re-ID memory**: 180s, cosine ≥ 0.85 hoặc IoU ≥ 0.30 — gộp session khi mất track
- **Tripwire**: GPS trong polygon Cầu Sông Hốt → `counted=1` một lần / session
- **KPI `encounters_standard`**: chỉ đếm `counted=1`

## FE sync

- `/patrol/day/appearances` + `/patrol/day/bundle` trả `session_id`, `counted`, JSON payload
- Popup lịch sử dedupe theo `id`, hiển thị track/session

## Files

```
backend-ai/app/patrol/aggregator/
  lost_track_memory.py, tripwire.py (+ Phase 1 modules)
backend-ai/tests/test_patrol_aggregator.py
src/.../patrolDayEvents.service.ts
src/.../PatrolEventDetailModal.tsx
```
