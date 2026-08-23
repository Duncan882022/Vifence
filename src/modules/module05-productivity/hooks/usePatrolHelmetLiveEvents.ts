import { useEffect, useState } from 'react'
import type { PatrolEvent } from '../data/patrolMockData'
import {
  fetchPatrolHelmetAggregateLiveEvents,
  fetchPatrolHelmetAggregateMetrics,
} from '../services/patrolLiveEvents.service'
import { DEFAULT_PATROL_CAMERA_IDS } from '../data/patrolCameras'
import { isPatrolHelmetCameraId } from '../data/patrolHelmetScope'
import { getVmsBackendUrl } from '@/modules/module03-safety/services/vmsDetections.service'
import { getMobileAiBackendUrl, pingMobileAiBackend } from '@/modules/module02-training/services/mobileAiBackend.service'
import {
  getPatrolMobilePpeEvents,
  subscribePatrolMobilePpeEvents,
} from '@/services/patrolMobileEventsBridge'
import { syncPatrolPersonEventsToHeatmap } from '@/services/patrolHeatmapPersonRegistry'
import { stripPatrolPpeEvents } from '../utils/patrolPpeVisibility'

function mergeEvents(backend: PatrolEvent[], mobile: PatrolEvent[]): PatrolEvent[] {
  const byId = new Map<string, PatrolEvent>()
  for (const ev of backend) byId.set(ev.id, ev)
  for (const ev of mobile) {
    if (!byId.has(ev.id)) byId.set(ev.id, ev)
  }
  return [...byId.values()].sort(
    (a, b) => new Date(b.lockedAt).getTime() - new Date(a.lockedAt).getTime(),
  )
}

export function usePatrolHelmetLiveEvents(
  cameraIds: readonly string[] = DEFAULT_PATROL_CAMERA_IDS,
  pollMs = 3000,
) {
  const [backendReachable, setBackendReachable] = useState(false)
  const [streamOnline, setStreamOnline] = useState(false)
  const [backendEvents, setBackendEvents] = useState<PatrolEvent[]>([])
  const [mobileEvents, setMobileEvents] = useState<PatrolEvent[]>(() => getPatrolMobilePpeEvents())

  useEffect(() => {
    return subscribePatrolMobilePpeEvents(setMobileEvents)
  }, [])

  useEffect(() => {
    const backendUrl = getMobileAiBackendUrl() || getVmsBackendUrl()
    const ids = cameraIds.filter(isPatrolHelmetCameraId)
    if (!backendUrl || ids.length === 0) {
      setBackendReachable(false)
      setStreamOnline(false)
      setBackendEvents([])
      return
    }

    let stopped = false
    let timerId = 0

    const tick = async () => {
      if (stopped) return
      try {
        const online = await pingMobileAiBackend(backendUrl)
        if (stopped) return
        if (!online) {
          setBackendReachable(false)
          setStreamOnline(false)
          // Giữ mobile events — không xoá khi backend ping fail tạm
          timerId = window.setTimeout(tick, pollMs * 2)
          return
        }

        const [rows, metrics] = await Promise.all([
          fetchPatrolHelmetAggregateLiveEvents(ids, backendUrl),
          fetchPatrolHelmetAggregateMetrics(ids, backendUrl),
        ])
        if (stopped) return
        setBackendReachable(true)
        setStreamOnline(Boolean(metrics?.stream_online) || getPatrolMobilePpeEvents().length > 0)
        setBackendEvents(rows)
        timerId = window.setTimeout(tick, pollMs)
      } catch {
        if (stopped) return
        setBackendReachable(false)
        timerId = window.setTimeout(tick, pollMs * 2)
      }
    }

    void tick()
    return () => {
      stopped = true
      window.clearTimeout(timerId)
    }
  }, [cameraIds.join(','), pollMs])

  const events = mergeEvents(stripPatrolPpeEvents(backendEvents), stripPatrolPpeEvents(mobileEvents))
  const online = streamOnline || mobileEvents.length > 0

  useEffect(() => {
    syncPatrolPersonEventsToHeatmap(events)
  }, [events])

  return { backendReachable: backendReachable || mobileEvents.length > 0, streamOnline: online, events }
}
