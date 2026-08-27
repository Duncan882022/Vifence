import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchPatrolDayPresences,
  type PatrolDayPresence,
} from '../services/patrolDayEvents.service'

const POLL_MS = 3000

export function usePatrolDayPresences(date?: string) {
  const [presences, setPresences] = useState<PatrolDayPresence[]>([])
  const [loading, setLoading] = useState(true)
  const [reachable, setReachable] = useState(false)
  const mounted = useRef(true)

  const refresh = useCallback(async () => {
    const result = await fetchPatrolDayPresences(date)
    if (!mounted.current) return
    setPresences(result.items)
    setReachable(result.ok)
    setLoading(false)
  }, [date])

  useEffect(() => {
    mounted.current = true
    setLoading(true)
    void refresh()
    const id = window.setInterval(() => { void refresh() }, POLL_MS)
    return () => {
      mounted.current = false
      window.clearInterval(id)
    }
  }, [refresh])

  return { presences, loading, reachable, refresh }
}
