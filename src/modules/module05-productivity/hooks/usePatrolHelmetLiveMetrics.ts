import { useEffect, useRef, useState } from 'react'
import {
  fetchVmsDetections,
  getVmsBackendUrl,
  type VmsDetectionSnapshot,
} from '@/modules/module03-safety/services/vmsDetections.service'

export interface PatrolHelmetLiveMetrics {
  connected: boolean
  personCount: number
  uniqueWorkers: number
  identifiedWorkers: number
  activePpeViolations: number
  ppeAlertsToday: number
  workerNames: string[]
}

const EMPTY: PatrolHelmetLiveMetrics = {
  connected: false,
  personCount: 0,
  uniqueWorkers: 0,
  identifiedWorkers: 0,
  activePpeViolations: 0,
  ppeAlertsToday: 0,
  workerNames: [],
}

const PPE_VIOLATION_BEHAVIORS = new Set(['no_helmet', 'no_vest', 'no_shoes'])
/** Giữ số người/vi phạm khi 1–2 frame AI miss — tránh KPI nhảy 1 → 0. */
const PERSON_COUNT_HOLD_MS = 6000
const VIOLATION_COUNT_HOLD_MS = 5000

function todayIsoDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function reduceSnapshot(
  snapshot: VmsDetectionSnapshot,
  workerIds: Set<string>,
  workerNames: Map<string, string>,
): Pick<
  PatrolHelmetLiveMetrics,
  'personCount' | 'uniqueWorkers' | 'identifiedWorkers' | 'activePpeViolations' | 'workerNames'
> {
  const ppeMetrics = snapshot.metrics.ppe as { person_count?: number; ppe_violations?: number } | undefined
  const personDetections = snapshot.detections.filter(d => d.behavior === 'person')
  let personCount = Number(ppeMetrics?.person_count ?? personDetections.length)
  let activePpeViolations = Number(
    ppeMetrics?.ppe_violations
    ?? snapshot.detections.filter(d => PPE_VIOLATION_BEHAVIORS.has(d.behavior)).length,
  )

  for (const det of personDetections) {
    if (det.worker_id) {
      workerIds.add(det.worker_id)
      if (det.worker_name) {
        workerNames.set(det.worker_id, det.worker_name)
      }
    }
  }

  return {
    personCount,
    uniqueWorkers: workerIds.size,
    identifiedWorkers: workerNames.size,
    activePpeViolations,
    workerNames: [...workerNames.values()].slice(0, 5),
  }
}

async function fetchPpeAlertCount(backendUrl: string, cameraId: string): Promise<number> {
  const date = todayIsoDate()
  const res = await fetch(`${backendUrl}/events?limit=200&date=${date}`, {
    headers: { 'ngrok-skip-browser-warning': 'true' },
    mode: 'cors',
  })
  if (!res.ok) return 0
  const rows = await res.json() as Array<{ camera_id?: string; scenario_id?: string }>
  return rows.filter(
    row =>
      row.camera_id === cameraId
      && typeof row.scenario_id === 'string'
      && row.scenario_id.startsWith('PPE'),
  ).length
}

/** Live KPI từ VMS HC-01 — person count, gallery match, PPE alerts. */
export function usePatrolHelmetLiveMetrics(
  cameraId = 'HC-01',
  pollMs = 2200,
): PatrolHelmetLiveMetrics {
  const [metrics, setMetrics] = useState<PatrolHelmetLiveMetrics>(EMPTY)
  const workerIdsRef = useRef(new Set<string>())
  const workerNamesRef = useRef(new Map<string, string>())
  const backendLiveRef = useRef(false)
  const lastPersonCountRef = useRef(0)
  const lastPersonAtRef = useRef(0)
  const lastViolationCountRef = useRef(0)
  const lastViolationAtRef = useRef(0)

  useEffect(() => {
    const backendUrl = getVmsBackendUrl()
    if (!backendUrl) return

    let stopped = false
    let timerId = 0

    const applyHold = (
      current: number,
      lastRef: { current: number },
      atRef: { current: number },
      holdMs: number,
    ) => {
      const now = Date.now()
      if (current > 0) {
        lastRef.current = current
        atRef.current = now
        return current
      }
      if (now - atRef.current <= holdMs) {
        return lastRef.current
      }
      lastRef.current = 0
      return 0
    }

    const tick = async () => {
      if (stopped) return
      try {
        const [snapshot, ppeAlertsToday] = await Promise.all([
          fetchVmsDetections(backendUrl, cameraId),
          fetchPpeAlertCount(backendUrl, cameraId),
        ])
        if (stopped) return
        backendLiveRef.current = true
        const reduced = reduceSnapshot(snapshot, workerIdsRef.current, workerNamesRef.current)
        const personCount = applyHold(
          reduced.personCount,
          lastPersonCountRef,
          lastPersonAtRef,
          PERSON_COUNT_HOLD_MS,
        )
        const activePpeViolations = applyHold(
          reduced.activePpeViolations,
          lastViolationCountRef,
          lastViolationAtRef,
          VIOLATION_COUNT_HOLD_MS,
        )
        setMetrics({
          connected: true,
          ...reduced,
          personCount,
          activePpeViolations,
          ppeAlertsToday,
        })
        timerId = window.setTimeout(tick, pollMs)
      } catch {
        if (stopped) return
        setMetrics(prev => ({
          ...prev,
          connected: backendLiveRef.current,
        }))
        timerId = window.setTimeout(tick, pollMs * 2)
      }
    }

    void tick()
    return () => {
      stopped = true
      window.clearTimeout(timerId)
      workerIdsRef.current.clear()
      workerNamesRef.current.clear()
      backendLiveRef.current = false
      lastPersonCountRef.current = 0
      lastPersonAtRef.current = 0
      lastViolationCountRef.current = 0
      lastViolationAtRef.current = 0
    }
  }, [cameraId, pollMs])

  return metrics
}
