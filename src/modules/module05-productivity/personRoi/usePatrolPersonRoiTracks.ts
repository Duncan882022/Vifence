import { useEffect, useState } from 'react'
import { getPatrolPersonRoiEngine } from './patrolPersonRoiEngine'
import type { PersonRoiDisplay } from './types'

const EMPTY: PersonRoiDisplay[] = []

/** Hook overlay — subscribe engine + rAF predict @ ~60 FPS. */
export function usePatrolPersonRoiTracks(cameraId: string): PersonRoiDisplay[] {
  const engine = getPatrolPersonRoiEngine(cameraId)
  const [tracks, setTracks] = useState<PersonRoiDisplay[]>(() => engine.getDisplayTracks())

  useEffect(() => {
    return engine.subscribe(() => {
      setTracks(engine.getDisplayTracks())
    })
  }, [engine])

  useEffect(() => {
    let raf = 0
    const loop = (now: number) => {
      // Một setState mỗi frame; mảng rỗng dùng lại tham chiếu cũ để React bỏ qua render.
      const nextTracks = engine.predictDisplay(now)
      setTracks(prev => {
        if (nextTracks.length === 0) return prev.length === 0 ? prev : EMPTY
        return nextTracks
      })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [engine])

  return tracks
}
