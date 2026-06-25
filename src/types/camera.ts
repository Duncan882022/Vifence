export type CameraStatus = 'online' | 'offline' | 'error'
export type CameraLayout = '1x1' | '2x2' | '4x4' | '8x8'

export interface Camera {
  id: string
  name: string
  location: string
  zone: string
  status: CameraStatus
  streamUrl?: string
  thumbnailUrl?: string
  lastActivity?: string
}

export interface CameraZone {
  id: string
  name: string
  cameras: Camera[]
}
