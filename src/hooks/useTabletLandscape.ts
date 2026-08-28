import { useMediaQuery } from './useMediaQuery'

/**
 * Tablet xoay ngang (iPad…) — width có thể ≥1024 nhưng chiều cao viewport hẹp.
 * Tailwind `max-lg:landscape` không bắt được case này.
 */
export function useTabletLandscape(): boolean {
  return useMediaQuery(
    '(orientation: landscape) and (max-height: 900px) and (min-width: 640px)',
  )
}
