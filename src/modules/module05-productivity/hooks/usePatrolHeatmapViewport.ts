/**
 * Breakpoint heatmap — iPhone / iPad / desktop / landscape.
 */
import { useMediaQuery } from '@/hooks/useMediaQuery'

export interface PatrolHeatmapViewport {
  isPhone: boolean
  isTablet: boolean
  isDesktop: boolean
  isLandscapeMobile: boolean
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
  const isCoarsePointer = useMediaQuery('(pointer: coarse)')

  const mapZoom = isPhone
    ? (isLandscapeMobile ? 17 : 16)
    : isTablet
      ? (isLandscapeMobile ? 17 : 16)
      : 17

  const embeddedMapClass = isPhone
    ? isLandscapeMobile
      ? 'h-[min(52dvh,300px)] min-h-[200px]'
      : 'h-[min(46dvh,380px)] min-h-[240px]'
    : isTablet
      ? isLandscapeMobile
        ? 'h-[min(56dvh,340px)] min-h-[220px]'
        : 'h-[min(48dvh,460px)] min-h-[280px]'
      : 'lg:flex-1 lg:min-h-[220px] max-lg:h-[min(44dvh,420px)] max-lg:min-h-[280px]'

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
    isCoarsePointer,
    embeddedMapClass,
    modalMapClass,
    mapZoom,
    compactChrome: isPhone || isTablet || isCoarsePointer,
  }
}
