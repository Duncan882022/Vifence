import { CameraGridPanel } from '@/components/common/CameraGrid/CameraGridPanel'
import type { TrainingCamera } from '@/components/common/CameraGrid/CameraGridPanel'
import { useMediaQuery } from '@/hooks/useMediaQuery'

/** Sidebar patrol — rộng hơn bản cũ ~10%. */
const PATROL_SIDEBAR_LG = 'lg:w-[141px]'
const PATROL_SIDEBAR_COMPACT = 'max-lg:landscape:w-[119px]'
const PATROL_SIDEBAR_COMPACT_PX = 119
const PATROL_SIDEBAR_COLLAPSED_PX = 24

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
  /**
   * Giới hạn hàng grid desktop trước khi scroll.
   * Mặc định 1 hàng — scroll xem hàng 2 (Drone). `null` = hiện hết khi phóng to tier.
   */
  desktopMaxVisibleRows?: number | null
}

/**
 * Module 05 — bọc CameraGridPanel với layout patrol.
 * Desktop / iPad: 1 hàng cố định + scroll trong Tier 2; phóng to tier → đủ hàng.
 * Phone dọc: stack 16:9, scroll theo trang.
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
  isCompactLayout = false,
  isTabletLandscape = false,
  desktopMaxVisibleRows,
}: PatrolCameraPanelProps) {
  const isTablet = useMediaQuery('(min-width: 640px) and (max-width: 1023px)')
  /** Chỉ phone nhỏ scroll trang; iPad (dọc/ngang) scroll lồng trong Tier 2. */
  const mobileStackedNoScroll = isCompactLayout && !isTabletLandscape && !isTablet
  const resolvedMaxVisibleRows = desktopMaxVisibleRows === null
    ? undefined
    : (desktopMaxVisibleRows ?? 1)

  return (
    <CameraGridPanel
      selectedId={selectedId}
      onSelectCamera={onSelectCamera}
      onStreamCountChange={onStreamCountChange}
      cameras={cameras}
      defaultCameraIds={defaultCameraIds}
      defaultSidebarOpen={false}
      desktopMaxVisibleRows={resolvedMaxVisibleRows}
      sidebarOpenClass={PATROL_SIDEBAR_LG}
      sidebarCompactClass={PATROL_SIDEBAR_COMPACT}
      sidebarCompactPx={PATROL_SIDEBAR_COMPACT_PX}
      sidebarCollapsedPx={PATROL_SIDEBAR_COLLAPSED_PX}
      sidebarCollapsedClass="lg:w-6"
      sidebarThumbCompact
      sidebarThumbFullWidth
      aspectVideoGrid
      mobileCompactVideo={isCompactLayout}
      mobileStackedNoScroll={mobileStackedNoScroll}
      preferCompactVideo={isTabletLandscape}
      streamWhenOffline
      minimalCameraTile
      filterTabs={filterTabs}
      filterFn={filterFn}
      groupFn={groupFn}
    />
  )
}
