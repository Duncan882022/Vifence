/**
 * useCourses.ts
 * Hook wrapper cho courseStore — tự động trigger fetch khi mount lần đầu.
 */

import { useCallback, useEffect } from 'react'
import { useCourseStore } from '../store/courseStore'
import type { TrainingCourseMock } from '../data/trainingMockData'

export type CourseFetchStatus = 'idle' | 'loading' | 'success' | 'error'

export interface UseCoursesResult {
  courses: TrainingCourseMock[]
  status: CourseFetchStatus
  error: string | null
  refetch: () => void
}

export function useCourses(params?: { startDateFrom?: string; startDateTo?: string }): UseCoursesResult {
  const { courses, status, error, fetch, refetch: storeRefetch } = useCourseStore()

  const paramsStr = JSON.stringify(params)

  useEffect(() => {
    void fetch(params)
  }, [fetch, paramsStr])

  const refetch = useCallback(() => {
    void storeRefetch(params)
  }, [storeRefetch, paramsStr])

  return { courses, status, error, refetch }
}
