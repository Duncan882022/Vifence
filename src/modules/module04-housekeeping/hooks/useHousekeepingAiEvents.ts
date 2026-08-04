import { useEffect, useState } from 'react'
import type { HousekeepingEventRecord } from '../types/housekeepingAi.types'
import { fetchHousekeepingAiEvents } from '../services/housekeepingAiEvents.service'
import {
  MOBILE_AI_BACKEND_STORAGE_KEY,
  getMobileAiBackendUrl,
} from '@/modules/module02-training/services/mobileAiBackend.service'

export function useHousekeepingAiEvents(pollMs = 5000): HousekeepingEventRecord[] {
  const [records, setRecords] = useState<HousekeepingEventRecord[]>([])

  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      const url = getMobileAiBackendUrl()
      const rows = await fetchHousekeepingAiEvents(url || undefined)
      if (!cancelled) setRecords(rows)
    }

    void poll()
    const timer = window.setInterval(() => { void poll() }, pollMs)

    const onStorage = (e: StorageEvent) => {
      if (e.key === MOBILE_AI_BACKEND_STORAGE_KEY) void poll()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('vifence-mobile-ai-backend-changed', poll)

    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('vifence-mobile-ai-backend-changed', poll)
    }
  }, [pollMs])

  return records
}
