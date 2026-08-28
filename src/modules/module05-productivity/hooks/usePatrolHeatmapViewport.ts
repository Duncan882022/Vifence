/**
 * Breakpoint heatmap — iPhone / iPad / desktop / landscape.
 */
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useTabletLandscape } from '@/hooks/useTabletLandscape'

export interface PatrolHeatmapViewport {
  isPhone: boolean
  isTablet: boolean
  isDesktop: boolean
  isLandscapeMobile: boolean
  isTabletLandscape: boolean
  isCoarsePointer: boolean
  /** Chiều cao map trong panel nhúng (Tier 3) */
  embeddedMapClass: string
  /** Chiều cao map trong modal phóng to */
  modalMapClass: string
  mapZoom: number
  compactChrome: boolean
}

export function usePatrolHeatmapViewport(): PatrolHeatmapViewport {
  const isPhone = useMediaQuery('(max-width: 639px)')
  const isTablet = useMediaQuery('(min-width: 640px) and (max-width: 1023px)')
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const isLandscapeMobile = useMediaQuery('(max-width: 1023px) and (orientation: landscape)')
  const isTabletLandscape = useTabletLandscape()
  const isCoarsePointer = useMediaQuery('(pointer: coarse)')

  const mapZoom = isPhone
    ? (isLandscapeMobile ? 17 : 16)
    : isTablet || isTabletLandscape
      ? (isLandscapeMobile || isTabletLandscape ? 17 : 16)
      : 17

  const embeddedMapClass = isPhone || isTablet || isTabletLandscape
    ? 'min-h-[220px] h-full w-full supports-[height:100dvh]:min-h-[min(220px,38dvh)]'
    : 'min-h-[280px] h-full w-full'

  const modalMapClass = isPhone
    ? 'flex-1 min-h-0'
    : isTablet
      ? 'flex-1 min-h-[50dvh]'
      : 'flex-1 min-h-0'

  return {
    isPhone,
    isTablet,
    isDesktop,
    isLandscapeMobile,
    isTabletLandscape,
    isCoarsePointer,
    embeddedMapClass,
    modalMapClass,
    mapZoom,
    compactChrome: isPhone || isTablet || isTabletLandscape || isCoarsePointer,
  }
}
