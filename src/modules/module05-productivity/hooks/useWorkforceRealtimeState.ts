import { useEffect, useState } from 'react'
import {
  EMPTY_WORKFORCE_SNAPSHOT,
  type WorkforceSnapshot,
} from '../types/workforceHeatmap'
import { fetchWorkforceSnapshot } from '../services/workforceState.service'

const POLL_MS = 2000

/** Frontend KV state per MD — poll until WS channels ship. */
export function useWorkforceRealtimeState(
  cameras: string[] = ['HC-01', 'HC-02'],
): WorkforceSnapshot {
  const [snap, setSnap] = useState<WorkforceSnapshot>(EMPTY_WORKFORCE_SNAPSHOT)

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      const next = await fetchWorkforceSnapshot(cameras)
      if (!cancelled && next) setSnap(next)
    }
    void tick()
    const id = window.setInterval(() => { void tick() }, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameras.join(',')])

  return snap
}
