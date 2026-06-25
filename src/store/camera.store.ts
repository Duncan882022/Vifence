import { create } from 'zustand'
import type { Camera, CameraLayout } from '@/types/camera'

interface CameraState {
  cameras: Camera[]
  selectedCamera: Camera | null
  layout: CameraLayout
  setCameras: (cameras: Camera[]) => void
  selectCamera: (camera: Camera | null) => void
  setLayout: (layout: CameraLayout) => void
}

export const useCameraStore = create<CameraState>((set) => ({
  cameras: [],
  selectedCamera: null,
  layout: '2x2',
  setCameras: (cameras) => set({ cameras }),
  selectCamera: (selectedCamera) => set({ selectedCamera }),
  setLayout: (layout) => set({ layout }),
}))
