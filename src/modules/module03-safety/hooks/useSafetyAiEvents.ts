import { useEffect, useSyncExternalStore } from 'react'
import { getMobileAiBackendUrl } from '@/modules/module02-training/services/mobileAiBackend.service'
import { getSafetyTodayDate } from '../data/safetyDemoDate'
import {
  fetchSafetyAiEvents,
  SAFETY_AI_EVENTS_CHANGED,
} from '../services/safetyAiEvents.service'
import {
  getSafetyEventsSnapshot,
  setSafetyEventsSnapshot,
  subscribeSafetyEvents,
} from '../store/safetyEventsStore'
import type { SafetyViolationRecord } from '../types/safety.types'

/** Poll sự kiện — overlay vẫn refresh ngay qua SAFETY_AI_EVENTS_CHANGED. */
export const SAFETY_AI_EVENTS_POLL_MS = 60 * 1000

let pollRefCount = 0
let pollTimerId = 0
let pollMsActive = SAFETY_AI_EVENTS_POLL_MS

async function refreshSafetyEvents(): Promise<void> {
  const url = getMobileAiBackendUrl()
  if (!url) return

  const result = await fetchSafetyAiEvents(url, getSafetyTodayDate())
  if (result.ok) {
    setSafetyEventsSnapshot(result.records)
  }
}

function startSafetyEventsPolling(pollMs: number): void {
  pollMsActive = pollMs
  void refreshSafetyEvents()
  pollTimerId = window.setInterval(() => { void refreshSafetyEvents() }, pollMs)
  window.addEventListener('vifence-mobile-ai-backend-changed', onRefresh)
  window.addEventListener(SAFETY_AI_EVENTS_CHANGED, onRefresh)
}

function stopSafetyEventsPolling(): void {
  window.clearInterval(pollTimerId)
  window.removeEventListener('vifence-mobile-ai-backend-changed', onRefresh)
  window.removeEventListener(SAFETY_AI_EVENTS_CHANGED, onRefresh)
}

function onRefresh(): void {
  void refreshSafetyEvents()
}

/** Poll sự kiện AI từ backend — một nguồn dữ liệu chung cho dashboard / popup / playback. */
export function useSafetyAiEvents(pollMs = SAFETY_AI_EVENTS_POLL_MS): SafetyViolationRecord[] {
  useEffect(() => {
    pollRefCount += 1
    if (pollRefCount === 1) startSafetyEventsPolling(pollMs)
    else if (pollMs !== pollMsActive) {
      stopSafetyEventsPolling()
      startSafetyEventsPolling(pollMs)
    }
    return () => {
      pollRefCount -= 1
      if (pollRefCount === 0) stopSafetyEventsPolling()
    }
  }, [pollMs])

  return useSyncExternalStore(
    subscribeSafetyEvents,
    getSafetyEventsSnapshot,
    () => [],
  )
}
