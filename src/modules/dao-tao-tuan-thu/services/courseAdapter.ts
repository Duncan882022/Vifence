/**
 * courseAdapter.ts
 * Chuyển đổi CourseApiItem (từ backend) → TrainingCourseMock (format của FE)
 *
 * Mapping logic:
 *  - status 'active'   → group 'active'
 *  - status 'inactive' → group 'upcoming'
 *  - status 'cancelled'→ group 'cancelled'
 *
 * Các field chưa có trong backend (attendees, present, exceptions, zone)
 * sẽ dùng giá trị mặc định / mock khi cần.
 */

import type { CourseApiItem } from '@/api/course.api'
import type { TrainingCourseMock, CourseGroup } from '../data/trainingMockData'
import { getCourseZone } from '../data/trainingCourseMeta'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Lấy HH:mm từ ISO datetime string (theo múi giờ local) */
function extractTime(iso: string | null): string {
  if (!iso) return '00:00'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '00:00'
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Lấy DD/MM/YYYY từ ISO datetime string (theo múi giờ local) */
function extractDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  // toLocaleDateString có thể trả về M/D/YYYY tuỳ trình duyệt, dùng Intl
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}

/** Map backend status → frontend CourseGroup */
function mapStatus(status: string): CourseGroup {
  switch (status) {
    case 'active':    return 'active'
    case 'cancelled': return 'cancelled'
    case 'inactive':
    default:          return 'upcoming'
  }
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export function adaptApiCourse(api: CourseApiItem): TrainingCourseMock {
  let group: CourseGroup = 'upcoming'

  if (api.status === 'cancelled') {
    group = 'cancelled'
  } else if (api.startTime && api.endTime) {
    const now = new Date()
    const start = new Date(api.startTime)
    const end = new Date(api.endTime)

    if (now >= end) {
      group = 'completed'
    } else if (now >= start && now < end) {
      group = 'active'
    } else {
      group = 'upcoming'
    }
  } else {
    group = mapStatus(api.status)
  }
  const startTime = extractTime(api.startTime)
  const endTime = extractTime(api.endTime)
  const sessionDate = extractDate(api.startDate) || extractDate(api.startTime) || ''
  const zone = (api.zone as 'OCP1-A' | 'OCP1-B') || getCourseZone(api.name)

  // Tính stats từ danh sách course_workers (joinedload)
  const cws = api.courseWorkers ?? (api as any).workers ?? []
  const present = cws.filter(cw => (cw.attendanceStatus ?? '').toLowerCase() !== 'absent').length
  const exceptions = cws.filter(cw =>
    ['late', 'early_leave', 'insufficient', 'skip'].includes((cw.attendanceStatus ?? '').toLowerCase())
  ).length

  return {
    id: api.id,
    title: api.name,
    zone,
    sessionDate,
    startTime,
    endTime,
    group,
    present,
    total: api.expectedAttendees || 0, // Map từ expectedAttendees trong DB (ví dụ 20)
    exceptions,
    attendees: [],
    // Action button
    action: group === 'upcoming' ? 'notify' : group === 'active' ? 'view' : undefined,
  }
}


export function adaptApiCourses(items: CourseApiItem[]): TrainingCourseMock[] {
  return items.map(adaptApiCourse)
}
