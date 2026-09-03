/**
 * Ghép feed detections với đồng hồ của video — bbox bám đúng khung hình đang xem.
 *
 * Không đánh giá lại theo rAF: overlay chỉ đổi khi AI có frame mới (~6 FPS), nên
 * kiểm tra ở 10Hz là đủ và rẻ hơn nhiều so với 60 lần re-render mỗi giây.
 * Các overlay bên dưới vẫn tự nội suy bằng rAF để chuyển động mượt.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { VideoClockSource } from '@/modules/module02-training/hooks/useHlsVideoSource'
import type { VmsDetectionFeed } from '../context/VmsDetectionContext'
import { OverlayTimeBuffer } from '../utils/overlayTimeSync'
import {
  getPatrolClientServerSkewMs,
  getPatrolLiveRoiDelayMs,
  updatePatrolClientServerSkew,
} from '@/services/patrolRuntimeBridge'
import { useOverlayBufferGate } from '@/modules/module02-training/hooks/useCameraBufferReadiness'
import { getCameraBufferedAheadMs } from '@/services/cameraBufferReadiness'

/** Nhịp đối chiếu snapshot ↔ đồng hồ video. */
const RESOLVE_INTERVAL_MS = 33

export interface SyncedVmsDetectionFeed extends VmsDetectionFeed {
  /** Đã khớp bbox theo wallclock hay đang dùng snapshot mới nhất. */
  timeAligned: boolean
  /** Lệch giữa bbox và khung hình (ms) — hiện trên toolbar khi debug. */
  driftMs: number | null
  /** Đang chờ các tile đệm đủ trước khi vẽ hộp đầu tiên. */
  waitingForBuffer: boolean
}

export function useSyncedVmsDetections(
  feed: VmsDetectionFeed,
  clock: VideoClockSource | null,
  options?: { fallbackLagMs?: number; useRuntimeLagHint?: boolean },
): SyncedVmsDetectionFeed {
  const bufferRef = useRef(new OverlayTimeBuffer())
  const configuredLagMs = options?.fallbackLagMs
  const useRuntimeLagHint = options?.useRuntimeLagHint ?? false
  const gate = useOverlayBufferGate()
  const [resolved, setResolved] = useState<{
    snapshot: VmsDetectionFeed['snapshot']
    timeAligned: boolean
    driftMs: number | null
  }>({ snapshot: null, timeAligned: false, driftMs: null })

  // Feed tắt hoặc đổi camera → xoá lịch sử, tránh vẽ bbox của luồng trước.
  useEffect(() => {
    if (feed.active) return
    bufferRef.current.clear()
    setResolved({ snapshot: null, timeAligned: false, driftMs: null })
  }, [feed.active])

  // Snapshot đổi vài lần mỗi giây; giữ trong ref để vòng resolve không bị dựng
  // lại theo từng frame AI.
  const snapshotRef = useRef(feed.snapshot)
  snapshotRef.current = feed.snapshot

  useEffect(() => {
    if (feed.snapshot) {
      bufferRef.current.push(feed.snapshot)
      updatePatrolClientServerSkew(feed.snapshot.server_emit_ms)
    }
  }, [feed.snapshot])

  useEffect(() => {
    if (!feed.active) return

    const tick = () => {
      const snapshot = snapshotRef.current

      // Backend đã chọn đúng khung hình rồi thì đừng chọn lại lần nữa: buffer FE
      // sẽ lùi thêm một quãng lag nữa và bbox tụt lại phía sau người.
      if (snapshot?.overlay_sync === 'aligned') {
        const driftMs = snapshot.overlay_drift_ms ?? 0
        setResolved(prev => (
          prev.snapshot === snapshot && prev.timeAligned && prev.driftMs === driftMs
            ? prev
            : { snapshot, timeAligned: true, driftMs }
        ))
        return
      }

      const displayMs = clock?.getDisplayWallclockMs() ?? null
      const hintLag = snapshot?.overlay_lag_hint_ms
      // Mức đệm đo được là độ trễ thật của chính luồng này — sát hơn hằng số
      // cấu hình, nhất là khi mạng làm buffer co giãn.
      const measuredLagMs = snapshot?.camera_id
        ? getCameraBufferedAheadMs(snapshot.camera_id)
        : null
      const runtimeLagMs = useRuntimeLagHint
        ? (hintLag != null && hintLag > 0 ? hintLag : getPatrolLiveRoiDelayMs())
        : undefined
      const fallbackLagMs = configuredLagMs
        ?? (measuredLagMs != null && measuredLagMs > 0 ? measuredLagMs : runtimeLagMs)

      const next = bufferRef.current.resolve(displayMs, {
        fallbackLagMs,
        clientServerSkewMs: getPatrolClientServerSkewMs(),
      })

      setResolved(prev => {
        if (
          prev.snapshot === next.snapshot
          && prev.timeAligned === next.matched
          && prev.driftMs === next.driftMs
        ) {
          return prev
        }
        return {
          snapshot: next.snapshot,
          timeAligned: next.matched,
          driftMs: next.driftMs,
        }
      })
    }

    tick()
    const timer = window.setInterval(tick, RESOLVE_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [feed.active, clock, configuredLagMs, useRuntimeLagHint])

  return useMemo(
    () => ({
      ...feed,
      // Chưa đệm đủ thì độ trễ luồng chưa ổn định: hộp vẽ ra lúc này rơi lệch
      // hẳn khỏi người rồi mới tự nhảy về chỗ đúng vài giây sau. Thà chưa vẽ.
      snapshot: gate.open ? resolved.snapshot : null,
      timeAligned: gate.open && resolved.timeAligned,
      driftMs: gate.open ? resolved.driftMs : null,
      waitingForBuffer: !gate.open,
    }),
    [feed, resolved, gate.open],
  )
}
