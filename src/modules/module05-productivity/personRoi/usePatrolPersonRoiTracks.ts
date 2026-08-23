import { useEffect, useState } from 'react'
import { getPatrolPersonRoiEngine } from './patrolPersonRoiEngine'
import type { PersonRoiDisplay } from './types'

/** Hook overlay — subscribe engine + rAF predict @ ~60 FPS. */
export function usePatrolPersonRoiTracks(cameraId: string): PersonRoiDisplay[] {
  const engine = getPatrolPersonRoiEngine(cameraId)
  const [tracks, setTracks] = useState<PersonRoiDisplay[]>(() => engine.getDisplayTracks())
  const [tick, setTick] = useState(0)

  useEffect(() => {
    return engine.subscribe(() => {
      setTracks(engine.getDisplayTracks())
    })
  }, [engine])

  useEffect(() => {
    let raf = 0
    let last = 0
    const loop = (now: number) => {
      if (now - last >= 16) {
        last = now
        setTracks(engine.predictDisplay(now))
        setTick(t => (t + 1) % 1_000_000)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [engine])

  void tick
  return tracks
}
