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

  /**
   * Map phủ hết panel — flex-1 + min-h cố định (Leaflet absolute không tạo chiều cao;
   * min-h-0 trên iOS Safari làm map đen/trống dù overlay HUD vẫn hiện).
   */
  const embeddedMapClass = isPhone
    ? 'flex-1 min-h-[min(36dvh,320px)] w-full h-full supports-[height:100dvh]:min-h-[min(36dvh,320px)]'
    : isTablet || isTabletLandscape
      ? 'flex-1 min-h-[200px] w-full h-full max-lg:min-h-[180px] supports-[height:100dvh]:min-h-[min(200px,32dvh)]'
      : 'flex-1 min-h-[240px] w-full h-full'

  const modalMapClass = isPhone
    ? 'flex-1 min-h-[min(50dvh,420px)] w-full h-full'
    : 'flex-1 min-h-[200px] w-full h-full'

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
