import { useEffect, useState } from 'react'
import { getPatrolPersonRoiEngine } from './patrolPersonRoiEngine'
import type { PersonRoiDisplay } from './types'

const EMPTY: PersonRoiDisplay[] = []

/**
 * Nhịp cập nhật overlay. 30 FPS đã vượt ngưỡng mắt thấy mượt với khung chữ nhật,
 * trong khi 60 FPS buộc React dựng lại toàn bộ box mỗi frame và tranh CPU với
 * bộ giải mã video — chính nó làm hình giật khi mở nhiều tile.
 */
const OVERLAY_UPDATE_INTERVAL_MS = 1000 / 30

/** Dịch dưới ngưỡng này thì không đáng để React render lại. */
const MIN_VISIBLE_SHIFT_PX = 0.4

function tracksVisuallyEqual(a: PersonRoiDisplay[], b: PersonRoiDisplay[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    const prev = a[i]
    const next = b[i]
    if (prev.trackId !== next.trackId) return false
    if (prev.state !== next.state) return false
    if (prev.label !== next.label) return false
    if (prev.workerId !== next.workerId) return false
    for (let j = 0; j < 4; j += 1) {
      if (Math.abs(prev.bbox[j] - next.bbox[j]) > MIN_VISIBLE_SHIFT_PX) return false
    }
  }
  return true
}

/** Hook overlay — subscribe engine + rAF predict, tiết chế ở 30 FPS. */
export function usePatrolPersonRoiTracks(cameraId: string): PersonRoiDisplay[] {
  const engine = getPatrolPersonRoiEngine(cameraId)
  const [tracks, setTracks] = useState<PersonRoiDisplay[]>(() => engine.getDisplayTracks())

  useEffect(() => {
    return engine.subscribe(() => {
      setTracks(prev => {
        const next = engine.getDisplayTracks()
        return tracksVisuallyEqual(prev, next) ? prev : next
      })
    })
  }, [engine])

  useEffect(() => {
    let raf = 0
    let lastUpdate = 0

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (now - lastUpdate < OVERLAY_UPDATE_INTERVAL_MS) return
      lastUpdate = now

      const nextTracks = engine.predictDisplay(now)
      setTracks(prev => {
        if (nextTracks.length === 0) return prev.length === 0 ? prev : EMPTY
        // Người đứng yên → giữ nguyên tham chiếu để React bỏ qua render.
        return tracksVisuallyEqual(prev, nextTracks) ? prev : nextTracks
      })
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [engine])

  return tracks
}
