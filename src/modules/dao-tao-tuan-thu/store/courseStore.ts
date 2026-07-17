/**
 * courseStore.ts
 * Zustand store lưu danh sách khóa học — chỉ dùng API, không mock.
 * Nếu API fail hoặc chưa load thì courses = [].
 */

import { create } from 'zustand'
import { fetchCourses } from '@/api/course.api'
import { adaptApiCourses } from '../services/courseAdapter'
import { getGhpagesDemoCourses, IS_GHPAGES } from '../services/ghpagesDemo.service'
import type { TrainingCourseMock } from '../data/trainingMockData'

export type FetchStatus = 'idle' | 'loading' | 'success' | 'error'

export interface CourseStore {
  courses: TrainingCourseMock[]
  status: FetchStatus
  error: string | null
  /** Fetch lần đầu — bỏ qua nếu đang loading hoặc đã thành công */
  fetch: (params?: { startDateFrom?: string; startDateTo?: string }) => Promise<void>
  /** Force refetch bất kể trạng thái (dùng sau create/delete) */
  refetch: (params?: { startDateFrom?: string; startDateTo?: string }) => Promise<void>
}

async function doFetch(
  set: (partial: Partial<CourseStore>) => void,
  params?: { startDateFrom?: string; startDateTo?: string }
) {
  if (IS_GHPAGES) {
    set({ courses: getGhpagesDemoCourses(), status: 'success', error: null })
    return
  }

  set({ status: 'loading', error: null })
  try {
    const res = await fetchCourses({ limit: 200, offset: 0, ...params })
    const adapted = adaptApiCourses(res.items)
    set({
      courses: adapted,
      status: 'success',
      error: null,
    })
  } catch (err) {
    console.error('[courseStore] Lỗi kết nối API:', err)
    set({
      courses: [],
      status: 'success',
      error: null,
    })
  }
}

export const useCourseStore = create<CourseStore>((set, get) => ({
  courses: [],
  status: 'idle',
  error: null,

  fetch: async (params) => {
    if (get().status === 'loading') return
    if (get().status === 'success' && !params?.startDateFrom && !params?.startDateTo) return
    await doFetch(set, params)
  },

  refetch: async (params) => {
    await doFetch(set, params)
  },
}))
