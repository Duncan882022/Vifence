/**
 * KPI đếm chuẩn từ server — Người · Lượt gặp · Quan sát chưa gán.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchPatrolDayStats,
  type PatrolDayStats,
} from '../services/patrolDayEvents.service'

const POLL_MS = 3000

const EMPTY: PatrolDayStats = {
  date: '',
  workersStandard: 0,
  personCount: 0,
  identityCount: 0,
  encountersStandard: 0,
  unassignedObservations: 0,
}

export function usePatrolDayStats(date?: string) {
  const [stats, setStats] = useState<PatrolDayStats>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [reachable, setReachable] = useState(false)
  const mounted = useRef(true)

  const refresh = useCallback(async () => {
    const data = await fetchPatrolDayStats(date)
    if (!mounted.current) return
    if (data) {
      setStats(data)
      setReachable(true)
    } else {
      setReachable(false)
    }
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

  return { stats, loading, reachable, refresh }
}
