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
  /** Phone / tablet dọc — layout stacked. */
  isCompactLayout?: boolean
  /** iPad ngang — width ≥1024 nhưng viewport thấp. */
  isTabletLandscape?: boolean
  /** @deprecated dùng isCompactLayout */
  isMobileLayout?: boolean
}

/**
 * Module 05 — bọc TrainingCameraPanel với layout patrol + preload AI person detect.
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
  isCompactLayout: isCompactLayoutProp,
  isTabletLandscape = false,
  isMobileLayout = false,
}: PatrolCameraPanelProps) {
  const isCompactLayout = isCompactLayoutProp ?? isMobileLayout

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
      defaultSidebarOpen
      aspectVideoGrid
      mobileCompactVideo={isCompactLayout}
      mobileStackedNoScroll={isCompactLayout && !isTabletLandscape}
      preferCompactVideo={isTabletLandscape}
      streamWhenOffline
      compactVideoMaxClass={
        isTabletLandscape
          ? 'max-h-[min(36dvh,320px)]'
          : 'max-h-[min(41dvh,360px)] sm:max-h-[min(45dvh,396px)] max-lg:landscape:max-h-[min(32dvh,288px)]'
      }
      filterTabs={filterTabs}
      filterFn={filterFn}
      groupFn={groupFn}
    />
  )
}
