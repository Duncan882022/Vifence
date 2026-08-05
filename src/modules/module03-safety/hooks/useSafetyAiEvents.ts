import { useEffect, useState } from 'react'
import {
  getMobileAiBackendUrl,
  MOBILE_AI_BACKEND_STORAGE_KEY,
} from '@/modules/module02-training/services/mobileAiBackend.service'
import { getSafetyTodayDate } from '../data/safetyDemoDate'
import {
  fetchOverlaySafetyEvents,
  fetchSafetyAiEvents,
  SAFETY_AI_EVENTS_CHANGED,
} from '../services/safetyAiEvents.service'
import type { SafetyViolationRecord } from '../types/safety.types'

/** Poll sự kiện AI từ backend JSON — ghép vào panel Safety (PCCC, ATGT, …). */
export function useSafetyAiEvents(pollMs = 5000): SafetyViolationRecord[] {
  const [records, setRecords] = useState<SafetyViolationRecord[]>([])

  useEffect(() => {
    let cancelled = false
    let timerId = 0

    const tick = async () => {
      const url = getMobileAiBackendUrl()
      if (!url) {
        const overlay = await fetchOverlaySafetyEvents()
        if (!cancelled) setRecords(overlay)
        return
      }
      const next = await fetchSafetyAiEvents(url, getSafetyTodayDate())
      if (!cancelled) setRecords(next)
    }

    void tick()
    timerId = window.setInterval(() => { void tick() }, pollMs)

    const onStorage = (e: StorageEvent) => {
      if (e.key === MOBILE_AI_BACKEND_STORAGE_KEY) void tick()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('vifence-mobile-ai-backend-changed', tick)
    window.addEventListener(SAFETY_AI_EVENTS_CHANGED, tick)

    return () => {
      cancelled = true
      window.clearInterval(timerId)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('vifence-mobile-ai-backend-changed', tick)
      window.removeEventListener(SAFETY_AI_EVENTS_CHANGED, tick)
    }
  }, [pollMs])

  return records
}
