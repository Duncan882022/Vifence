import { SITE_WAYPOINTS } from '@/data/siteLocations'
import type { AccessMovementTrack, AccessWaypoint } from '@/types/access'

const siteWaypoints: AccessWaypoint[] = SITE_WAYPOINTS.map(({ id, label, x, y }) => ({
  id,
  label,
  x,
  y,
}))

export const ACCESS_MOVEMENT_TRACKS: AccessMovementTrack[] = [
  {
    trackId: 'mv-nguyen-van-an',
    personId: 'NV000123',
    personName: 'Nguyễn Văn An',
    subjectType: 'person',
    waypoints: siteWaypoints,
    pathWaypointIds: [1, 2, 4, 3],
    points: [
      { id: 'p1', time: '07:45:12', location: 'Cổng chính (Vào)', action: 'in' },
      { id: 'p2', time: '08:12:28', location: 'Khu cọc nhồi', action: 'pass' },
      { id: 'p3', time: '09:05:41', location: 'Nhà điều hành', action: 'pass' },
      { id: 'p4', time: '10:15:42', location: 'Kho vật tư · OCP1-A', action: 'pass' },
    ],
  },
  {
    trackId: 'mv-tran-van-binh',
    personId: 'NV000456',
    personName: 'Trần Văn Bình',
    subjectType: 'person',
    waypoints: siteWaypoints,
    pathWaypointIds: [5, 4, 2],
    points: [
      { id: 'p1', time: '07:52:03', location: 'Cổng phụ 2 (Vào)', action: 'in' },
      { id: 'p2', time: '08:05:17', location: 'Nhà điều hành', action: 'pass' },
      { id: 'p3', time: '09:20:44', location: 'Khu cọc nhồi · Cọc nhồi B', action: 'pass' },
    ],
  },
  {
    trackId: 'mv-51d-12345',
    personId: '51D-123.45',
    personName: '51D-123.45',
    subjectType: 'vehicle',
    waypoints: siteWaypoints,
    pathWaypointIds: [1, 3, 5],
    points: [
      { id: 'p1', time: '08:10:22', location: 'Cổng chính (Vào)', action: 'in' },
      { id: 'p2', time: '08:15:08', location: 'Kho vật tư · Khu B', action: 'pass' },
      { id: 'p3', time: '08:22:51', location: 'Cổng phụ 2 (Ra)', action: 'out' },
    ],
  },
]

export function findMovementTrack(query: string): AccessMovementTrack | undefined {
  const q = query.trim().toLowerCase()
  if (!q) return ACCESS_MOVEMENT_TRACKS[0]
  return ACCESS_MOVEMENT_TRACKS.find(t =>
    t.personName.toLowerCase().includes(q)
    || t.personId.toLowerCase().includes(q),
  )
}
