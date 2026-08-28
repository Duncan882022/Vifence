import { useMediaQuery } from './useMediaQuery'

/**
 * Tablet xoay ngang (iPad…) — width có thể ≥1024 nhưng chiều cao viewport hẹp.
 * Tailwind `max-lg:landscape` không bắt được case này.
 * `(pointer: coarse)` loại màn hình desktop landscape height thấp.
 */
export function useTabletLandscape(): boolean {
  return useMediaQuery(
    '(orientation: landscape) and (max-height: 1024px) and (min-width: 640px) and (pointer: coarse)',
  )
}
