import { useEffect, useCallback } from 'react'
import { useCameraStore } from '../store/cameraStore'

export type { CameraWithWorker } from '../store/cameraStore.types'

export function useCameras() {
  const { cameras, status, error, fetch, refetch } = useCameraStore()

  useEffect(() => {
    void fetch()
  }, [fetch])

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
