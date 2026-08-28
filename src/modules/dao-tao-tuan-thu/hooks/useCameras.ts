import { useEffect, useCallback } from 'react'
import { useCameraStore } from '../store/cameraStore'

export type { CameraWithWorker } from '../store/cameraStore.types'

export function useCameras(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false
  const { cameras, status, error, fetch, refetch } = useCameraStore()

  useEffect(() => {
    if (!enabled) return
    void fetch()
  }, [fetch, enabled])

  const refresh = useCallback(() => {
    void refetch()
  }, [refetch])

  return {
    cameras,
    loading: status === 'loading',
    error,
    refresh,
  }
}
