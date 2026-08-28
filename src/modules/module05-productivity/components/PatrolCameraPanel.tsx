import { useEffect } from 'react'
import { TrainingCameraPanel } from '@/modules/module02-training/components/TrainingCameraPanel'
import { preloadFaceDetection } from '@/modules/module02-training/services/faceDetection.service'
import type { TrainingCamera } from '@/modules/module02-training/data/trainingCameras'

export interface PatrolCameraPanelProps {
  selectedId?: string
  onSelectCamera?: (cam: TrainingCamera) => void
  onStreamCountChange?: (count: number) => void
  cameras: TrainingCamera[]
  defaultCameraIds: readonly string[]
  filterTabs: string[]
  filterFn: (tab: string) => TrainingCamera[]
  groupFn: (cameras: TrainingCamera[]) => { key: string; cameras: TrainingCamera[] }[]
  isMobileLayout?: boolean
}

/**
 * Module 05 — bọc TrainingCameraPanel với layout patrol + preload AI person detect.
 * Mobile: stack dọc 16:9, scroll theo trang — không cap max-h viewport.
 */
export function PatrolCameraPanel({
  selectedId,
  onSelectCamera,
  onStreamCountChange,
  cameras,
  defaultCameraIds,
  filterTabs,
  filterFn,
  groupFn,
  isMobileLayout = false,
}: PatrolCameraPanelProps) {
  useEffect(() => {
    preloadFaceDetection()
  }, [])

  return (
    <TrainingCameraPanel
      selectedId={selectedId}
      onSelectCamera={onSelectCamera}
      onStreamCountChange={onStreamCountChange}
      cameras={cameras}
      defaultCameraIds={defaultCameraIds}
      defaultSidebarOpen={false}
      aspectVideoGrid
      mobileCompactVideo={isMobileLayout}
      mobileStackedNoScroll={isMobileLayout}
      streamWhenOffline
      filterTabs={filterTabs}
      filterFn={filterFn}
      groupFn={groupFn}
    />
  )
}
