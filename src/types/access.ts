export type AccessSubjectType = 'person' | 'vehicle' | 'guest'

export type AccessPresenceStatus = 'inside' | 'outside'

export type AccessGateId = 'gate-main' | 'gate-side1' | 'gate-truck' | 'gate-side2'

export type AccessEventTab = 'all' | 'person' | 'vehicle' | 'guest'

export type AccessOverlayKind = 'person' | 'vehicle' | 'unregistered'

export type AccessExceptionType =
  | 'unregistered-guest'
  | 'late-arrival'
  | 'early-departure'
  | 'after-hours-vehicle'
  | 'overstayed'

export type AccessExceptionAction = 'register' | 'explain' | 'fine' | 'notify'

export interface AccessGate {
  id: AccessGateId
  name: string
  cameraId: string
  streamUrl: string
  zone: string
}

export interface AccessAiDetection {
  x: number
  y: number
  w: number
  h: number
  kind: AccessOverlayKind
  label: string
  sublabel?: string
}

export interface AccessEvent {
  id: string
  subjectType: AccessSubjectType
  name: string
  subjectId: string
  contractorOrType: string
  timeIn: string
  timeOut: string | null
  presence: AccessPresenceStatus
  gate: string
  gateId: AccessGateId
  duration: string
  avatarPersonId?: string
  date: string
}

export interface AccessException {
  id: string
  type: AccessExceptionType
  subject: string
  time: string
  gate: string
  action: AccessExceptionAction
  severity: 'high' | 'medium'
}

export interface AccessMovementPoint {
  id: string
  time: string
  location: string
  action?: 'in' | 'out' | 'pass'
}

export interface AccessWaypoint {
  id: number
  label: string
  x: number
  y: number
}

export interface AccessMovementTrack {
  trackId: string
  personId: string
  personName: string
  subjectType: 'person' | 'vehicle'
  points: AccessMovementPoint[]
  waypoints: AccessWaypoint[]
  pathWaypointIds: number[]
}

export interface AccessPlaybackMarker {
  id: string
  startHour: number
  endHour: number
  kind: 'person' | 'vehicle' | 'exception'
  label: string
}

export interface AccessDayCounts {
  people: number
  vehicles: number
  contractors: number
  exceptions: number
}
