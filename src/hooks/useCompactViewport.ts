import { useMediaQuery } from './useMediaQuery'
import { useTabletLandscape } from './useTabletLandscape'

/**
 * Viewport gọn — phone, tablet dọc, iPad ngang (height hẹp dù width ≥1024).
 * Dùng chung Module 05 và TrainingCameraPanel thay vì chỉ `(max-width: 1023px)`.
 */
export function useCompactViewport() {
  const isMobileLayout = useMediaQuery('(max-width: 1023px)')
  const isTabletLandscape = useTabletLandscape()
  const isCompactLayout = isMobileLayout || isTabletLandscape
  /** Desktop rộng thật — không tính iPad ngang. */
  const isWideDesktop = useMediaQuery('(min-width: 1024px)') && !isTabletLandscape

  return {
    isMobileLayout,
    isTabletLandscape,
    isCompactLayout,
    isWideDesktop,
  }
}
