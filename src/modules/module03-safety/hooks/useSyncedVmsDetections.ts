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

/** Nhịp đối chiếu snapshot ↔ đồng hồ video. */
const RESOLVE_INTERVAL_MS = 33

export interface SyncedVmsDetectionFeed extends VmsDetectionFeed {
  /** Đã khớp bbox theo wallclock hay đang dùng snapshot mới nhất. */
  timeAligned: boolean
  /** Lệch giữa bbox và khung hình (ms) — hiện trên toolbar khi debug. */
  driftMs: number | null
}

export function useSyncedVmsDetections(
  feed: VmsDetectionFeed,
  clock: VideoClockSource | null,
  options?: { fallbackLagMs?: number; useRuntimeLagHint?: boolean },
): SyncedVmsDetectionFeed {
  const bufferRef = useRef(new OverlayTimeBuffer())
  const configuredLagMs = options?.fallbackLagMs
  const useRuntimeLagHint = options?.useRuntimeLagHint ?? false
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

  useEffect(() => {
    if (feed.snapshot) {
      bufferRef.current.push(feed.snapshot)
      updatePatrolClientServerSkew(feed.snapshot.server_emit_ms)
    }
  }, [feed.snapshot])

  useEffect(() => {
    if (!feed.active) return

    const tick = () => {
      const displayMs = clock?.getDisplayWallclockMs() ?? null
      const hintLag = feed.snapshot?.overlay_lag_hint_ms
      const fallbackLagMs = configuredLagMs ?? (
        useRuntimeLagHint && hintLag != null && hintLag > 0
          ? hintLag
          : useRuntimeLagHint
            ? getPatrolLiveRoiDelayMs()
            : undefined
      )
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
  }, [feed.active, feed.snapshot?.overlay_lag_hint_ms, clock, configuredLagMs, useRuntimeLagHint])

  return useMemo(
    () => ({
      ...feed,
      snapshot: resolved.snapshot,
      timeAligned: resolved.timeAligned,
      driftMs: resolved.driftMs,
    }),
    [feed, resolved],
  )
}
