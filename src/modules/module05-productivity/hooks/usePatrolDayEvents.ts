/**
 * Thẻ sự kiện trong ngày, đọc thẳng từ SQLite của server.
 *
 * Thay đường cũ: gom sự kiện ATLĐ từ nhiều nguồn rồi lọc, gộp trùng và suy lại
 * tầng ở trình duyệt. Ở đây một người là một thẻ mỗi ngày — đó là khoá chính
 * của bảng, và tầng do server chốt, nên không còn chỗ cho hai máy nhìn ra hai
 * kết quả khác nhau.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PatrolEvent } from '../data/patrolMockData'
import {
  fetchPatrolDayObjects,
  fetchPatrolDayPersons,
  type PatrolDayObject,
  type PatrolDayPerson,
} from '../services/patrolDayEvents.service'
import { filterPatrolDayObjectsForDisplay } from '../utils/patrolDayObjectFilter'

const POLL_MS = 3000

function isoFrom(sec: number): string {
  return new Date(Math.round(sec * 1000)).toISOString()
}

function personToEvent(row: PatrolDayPerson): PatrolEvent {
  const identified = row.status === 'identified'
  return {
    id: `pers:${row.persId}`,
    type: 'PERSON_DETECTED',
    cameraId: '',
    cameraName: '',
    zoneId: 'ZONE_SITE',
    zoneName: 'Cầu Sông Hốt',
    objectId: identified ? (row.idenCode ?? row.persId) : row.persId,
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
}

function objectToEvent(row: PatrolDayObject): PatrolEvent {
  return {
    id: `obj:${row.objId}`,
    type: 'PERSON_DETECTED',
    cameraId: '',
    cameraName: '',
    zoneId: 'ZONE_SITE',
    zoneName: 'Cầu Sông Hốt',
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
}

export interface PatrolDayEventsState {
  events: PatrolEvent[]
  loading: boolean
  reachable: boolean
  refresh: () => void
}

export function usePatrolDayEvents(date?: string): PatrolDayEventsState {
  const [events, setEvents] = useState<PatrolEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [reachable, setReachable] = useState(false)
  const [tick, setTick] = useState(0)
  const stopped = useRef(false)

  useEffect(() => {
    stopped.current = false

    const load = async () => {
      const [persons, objects] = await Promise.all([
        fetchPatrolDayPersons(date),
        fetchPatrolDayObjects(date),
      ])
      if (stopped.current) return
      const displayObjects = filterPatrolDayObjectsForDisplay(objects, persons)
      setReachable(persons.length > 0 || displayObjects.length > 0 || true)
      setEvents([
        ...persons.map(personToEvent),
        ...displayObjects.map(objectToEvent),
      ].sort((a, b) => Date.parse(b.lockedAt) - Date.parse(a.lockedAt)))
      setLoading(false)
    }

    void load()
    const timer = window.setInterval(() => { void load() }, POLL_MS)
    return () => {
      stopped.current = true
      window.clearInterval(timer)
    }
  }, [date, tick])

  return useMemo(
    () => ({ events, loading, reachable, refresh: () => setTick(t => t + 1) }),
    [events, loading, reachable],
  )
}
