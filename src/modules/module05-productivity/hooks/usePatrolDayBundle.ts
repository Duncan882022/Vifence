/**
 * Gộp stats + events + objects + presences — một poll /patrol/day/bundle.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PatrolEvent } from '../data/patrolTypes'
import {
  fetchPatrolDayBundle,
  type PatrolDayBundle,
  type PatrolDayStats,
} from '../services/patrolDayEvents.service'
import { filterPatrolDayObjectsForDisplay } from '../utils/patrolDayObjectFilter'
import { patrolGalleryWorkerIdFromEmployeeCode } from '../utils/patrolIdentityEntity'
import {
  buildPatrolSubjectCameraLookup,
  resolvePatrolSubjectCameraRef,
} from '../utils/patrolEventsUi'

const POLL_MS = 3000

const EMPTY_STATS: PatrolDayStats = {
  date: '',
  workersStandard: 0,
  personCount: 0,
  identityCount: 0,
  encountersStandard: 0,
  unassignedObservations: 0,
}

function isoFrom(sec: number): string {
  return new Date(Math.round(sec * 1000)).toISOString()
}

function bundleToEvents(bundle: PatrolDayBundle): PatrolEvent[] {
  const cameraBySubject = buildPatrolSubjectCameraLookup(bundle.presences)
  const displayObjects = filterPatrolDayObjectsForDisplay(bundle.objects, bundle.persons)
  const personEvents: PatrolEvent[] = bundle.persons.map(row => {
    const identified = row.status === 'identified'
    const camera = resolvePatrolSubjectCameraRef(cameraBySubject, row.persId)
    return {
      id: `pers:${row.persId}`,
      type: 'PERSON_DETECTED',
      cameraId: camera.cameraId,
      cameraName: camera.cameraName,
      zoneId: camera.zoneId,
      zoneName: camera.zoneName,
      objectId: identified
        ? (row.employeeCode
            ? patrolGalleryWorkerIdFromEmployeeCode(row.employeeCode)
            : (row.idenCode ?? row.persId))
        : row.persId,
      objectLabel: row.displayName,
      violationLabel: row.displayName,
      startedAt: isoFrom(row.firstSeen),
      lockedAt: isoFrom(row.lastSeen),
      endedAt: null,
      durationSeconds: null,
      status: 'LOCKED',
      confidence: 1,
      gps: { lat: 0, lng: 0 },
      snapshotUrl: row.snapshotUrl,
      stage: identified ? 'profile' : 'person',
    } as PatrolEvent
  })
  const objectEvents: PatrolEvent[] = displayObjects.map(row => {
    const camera = resolvePatrolSubjectCameraRef(cameraBySubject, row.objId)
    return {
      id: `obj:${row.objId}`,
      type: 'PERSON_DETECTED',
      cameraId: camera.cameraId,
      cameraName: camera.cameraName,
      zoneId: camera.zoneId,
      zoneName: camera.zoneName,
      objectId: row.objId,
      objectLabel: 'Đối tượng',
      violationLabel: 'Đối tượng',
      startedAt: isoFrom(row.firstSeen),
      lockedAt: isoFrom(row.lastSeen),
      endedAt: null,
      durationSeconds: null,
      status: 'LOCKED',
      confidence: 1,
      gps: { lat: 0, lng: 0 },
      snapshotUrl: row.snapshotUrl,
      stage: 'object',
    } as PatrolEvent
  })
  return [...personEvents, ...objectEvents].sort(
    (a, b) => Date.parse(b.lockedAt) - Date.parse(a.lockedAt),
  )
}

export interface PatrolDayBundleState {
  bundle: PatrolDayBundle | null
  stats: PatrolDayStats
  events: PatrolEvent[]
  loading: boolean
  reachable: boolean
  refresh: () => void
}

export function usePatrolDayBundle(date?: string): PatrolDayBundleState {
  const [bundle, setBundle] = useState<PatrolDayBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [reachable, setReachable] = useState(false)
  const mounted = useRef(true)

  const refresh = useCallback(async () => {
    const data = await fetchPatrolDayBundle(date)
    if (!mounted.current) return
    if (data) {
      setBundle(data)
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

  const events = useMemo(
    () => (bundle ? bundleToEvents(bundle) : []),
    [bundle],
  )

  const stats = bundle?.stats ?? EMPTY_STATS

  return useMemo(
    () => ({ bundle, stats, events, loading, reachable, refresh }),
    [bundle, stats, events, loading, reachable, refresh],
  )
}
