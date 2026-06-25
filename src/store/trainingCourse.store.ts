import { create } from 'zustand'
import type { TrainingCourseMock } from '@/modules/module02-training/data/trainingMockData'

export interface CreateCourseInput {
  title: string
  zone: TrainingCourseMock['zone']
  location: string
  sessionDate: string
  startTime: string
  endTime: string
  total: number
}

interface TrainingCourseStore {
  customCourses: TrainingCourseMock[]
  addCourse: (input: CreateCourseInput) => void
}

export const useTrainingCourseStore = create<TrainingCourseStore>((set) => ({
  customCourses: [],
  addCourse: (input) => set((state) => ({
    customCourses: [
      ...state.customCourses,
      {
        id: `custom-${Date.now()}`,
        title: input.title.trim(),
        zone: input.zone,
        location: input.location,
        sessionDate: input.sessionDate,
        startTime: input.startTime,
        endTime: input.endTime,
        group: 'upcoming',
        total: input.total,
        exceptions: 0,
        attendees: [],
        action: 'notify',
      },
    ],
  })),
}))
