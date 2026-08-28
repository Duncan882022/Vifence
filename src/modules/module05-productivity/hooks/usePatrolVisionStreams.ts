import { useEffect, useState } from 'react'
import {
  fetchPatrolVisionStreamCameras,
  type PatrolVisionStreamCamera,
} from '../services/patrolVisionStreams.service'

/** Vision wsUrl — chỉ fetch khi legacy JSMpeg cần (không có MediaMTX). */
export function usePatrolVisionStreams(enabled: boolean): PatrolVisionStreamCamera[] {
  const [cameras, setCameras] = useState<PatrolVisionStreamCamera[]>([])

  useEffect(() => {
    if (!enabled) {
      setCameras([])
      return
    }
    let cancelled = false
    void fetchPatrolVisionStreamCameras().then(items => {
      if (!cancelled) setCameras(items)
    })
    return () => {
      cancelled = true
    }
  }, [enabled])

  return cameras
}
