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
import {
  dedupePatrolEventsStrictByEntity,
  filterPatrolDayObjectsForDisplay,
  filterPatrolObjectEventsWithLinkedPerson,
  PATROL_OBJECT_FACE_SNAPSHOT_SCORE,
} from '../utils/patrolDayObjectFilter'
import { patrolGalleryWorkerIdFromEmployeeCode } from '../utils/patrolIdentityEntity'
import { applyManualIdentityToPatrolEvents } from '../utils/patrolManualIdentityUi'
import {
  buildPatrolSubjectCameraLookup,
  resolvePatrolSubjectCameraRef,
} from '../utils/patrolEventsUi'
import {
  buildPatrolSubjectGpsLookup,
  resolvePatrolEventGps,
} from '../utils/patrolBundleGps'
import { isPatrolTrackWorkerId } from '../utils/patrolWorkforceEventLabels'
import { getPatrolDefaultPlaybackDate } from '../services/patrolPlayback.service'

const POLL_MS_LIVE = 3000

const EMPTY_STATS: PatrolDayStats = {
  date: '',
  workersStandard: 0,
  personCount: 0,
  identityCount: 0,
  objectCount: 0,
  promotedObjectCount: 0,
  objectEncounterCount: 0,
  encountersStandard: 0,
  unassignedObservations: 0,
  sightingsStreamOffline: 0,
  sightingsTotal: 0,
  sightingsUnqualified: 0,
}

function isoFrom(sec: number): string {
  return new Date(Math.round(sec * 1000)).toISOString()
}

function bundleToEvents(bundle: PatrolDayBundle): PatrolEvent[] {
  const cameraBySubject = buildPatrolSubjectCameraLookup(bundle.presences)
  const gpsBySubject = buildPatrolSubjectGpsLookup(bundle.presences)
  const displayObjects = filterPatrolDayObjectsForDisplay(bundle.objects, bundle.persons)
  const personEvents: PatrolEvent[] = bundle.persons.map(row => {
    const identified = row.status === 'identified'
    const camera = resolvePatrolSubjectCameraRef(cameraBySubject, row.persId)
    const trackWorkerId = row.trackWorkerId?.trim()
      || (isPatrolTrackWorkerId(row.persId) ? row.persId : undefined)
    const gps = resolvePatrolEventGps(
      row.persId,
      { lat: row.gpsLat, lng: row.gpsLng },
      gpsBySubject,
    )
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
      gps,
      snapshotUrl: row.snapshotUrl,
      snapshotScore: row.snapshotScore,
      stage: identified
        ? 'profile'
        : (row.snapshotScore ?? 0) >= PATROL_OBJECT_FACE_SNAPSHOT_SCORE
          ? 'person'
          : 'object',
      employeeCode: row.employeeCode,
      trackWorkerId,
      promotedFrom: row.promotedFrom,
      promotedAt: row.promotedAt,
    } as PatrolEvent
  })
  const objectEvents: PatrolEvent[] = displayObjects.map(row => {
    const camera = resolvePatrolSubjectCameraRef(cameraBySubject, row.objId)
    const gps = resolvePatrolEventGps(
      row.objId,
      { lat: row.gpsLat, lng: row.gpsLng },
      gpsBySubject,
    )
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
      gps,
      snapshotUrl: row.snapshotUrl,
      snapshotScore: row.snapshotScore,
      stage: 'object',
    } as PatrolEvent
  })
  return dedupePatrolEventsStrictByEntity(
    filterPatrolObjectEventsWithLinkedPerson(
      applyManualIdentityToPatrolEvents([...personEvents, ...objectEvents]),
    ),
  ).sort(
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
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const data = await fetchPatrolDayBundle(date)
      if (!mounted.current) return
      if (data) {
        setBundle(data)
        setReachable(true)
      } else {
        setReachable(false)
      }
      setLoading(false)
    } finally {
      inFlight.current = false
    }
  }, [date])

  const isLiveDay = !date || date === getPatrolDefaultPlaybackDate()

  useEffect(() => {
    mounted.current = true
    setLoading(true)
    void refresh()
    if (!isLiveDay) {
      return () => {
        mounted.current = false
      }
    }
    const id = window.setInterval(() => { void refresh() }, POLL_MS_LIVE)
    return () => {
      mounted.current = false
      window.clearInterval(id)
    }
  }, [refresh, isLiveDay])

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
