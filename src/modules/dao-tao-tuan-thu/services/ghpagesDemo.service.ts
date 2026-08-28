import { TRAINING_ATTENDEES } from '../components/TrainingEventTable'
import { buildTrainingCourses } from '../data/trainingMockData'
import { MOCK_TRAINING_CAMERAS } from '../data/trainingCameras'
import type { CameraWithWorker } from '../store/cameraStore.types'

export const IS_GHPAGES = import.meta.env.MODE === 'ghpages'

/** Demo CMS — GitHub Pages + dev local khi VITE_DEMO_AUTH=true */
export const IS_DEMO_AUTH = import.meta.env.VITE_DEMO_AUTH === 'true'

export function getGhpagesDemoCameras(): CameraWithWorker[] {
  return MOCK_TRAINING_CAMERAS.map(cam => ({
    id: cam.id,
    name: cam.name,
    rtspUrl: cam.streamUrl ?? '',
    rtspType: 'pull' as const,
    status: 'streaming' as const,
    address: cam.location || cam.zone || 'N/A',
    workerId: null,
    spaceId: null,
    lat: null,
    lng: null,
    ptz: null,
    onvifIp: null,
    onvifPort: null,
    onvifUsername: null,
    onvifPassword: null,
    createdAt: '',
    updatedAt: '',
    worker: null,
    wsUrl: null,
  }))
}

export function getGhpagesDemoCourses() {
  return buildTrainingCourses(TRAINING_ATTENDEES)
}

export function getGhpagesDemoAttendees(courseDate = '24/06') {
  return TRAINING_ATTENDEES.filter(a => a.courseDate === courseDate)
}
