import type { TrainingAttendee } from '../components/TrainingEventTable'
import { attendeeHasException } from '../components/TrainingEventTable'

/** Demo snapshot: 11:30 sáng 24/06/2026 — TB-A xong, CNTB/PCCC/DCE đang chạy, ca chiều sắp mở */
export const DEMO_NOW = { hours: 11, minutes: 30 }
export const DEMO_TODAY_KEY = '24/06'

export type CourseGroup = 'upcoming' | 'active' | 'completed' | 'cancelled'

/** Ca đã/đang chạy — có số liệu điểm danh */
export function courseGroupHasMetrics(group: CourseGroup): boolean {
  return group === 'active' || group === 'completed'
}

export interface TrainingCourseMock {
  id: string
  title: string
  zone: 'OCP1-A' | 'OCP1-B'
  /** Phòng / khu đào tạo trong zone */
  location?: string
  sessionDate: string
  startTime: string
  endTime: string
  group: CourseGroup
  present?: number
  total: number
  exceptions: number
  attendees: TrainingAttendee[]
  action?: 'notify' | 'view'
}

function isoToCourseDate(iso: string): string {
  const [, mm, dd] = iso.split('-')
  return `${dd}/${mm}`
}

function statsFromAttendees(attendees: TrainingAttendee[]) {
  const exceptions = attendees.filter(a => attendeeHasException(a)).length
  const present = attendees.filter(a => a.currentStatus !== 'absent').length
  return { present, total: attendees.length, exceptions, attendees }
}

/** Project one history record into listing shape for a specific session. */
function attendeeForSession(
  a: TrainingAttendee,
  courseName: string,
  isoDate: string,
): TrainingAttendee | null {
  const rec = a.courseHistory.find(
    r => r.courseName === courseName && r.sessionDate === isoDate,
  )
  if (!rec) return null
  return {
    ...a,
    currentStatus: rec.status,
    currentCourse: courseName,
    courseDate: isoToCourseDate(isoDate),
    courseStart: rec.startTime,
    courseEnd: rec.endTime,
    actualTime: rec.sessions[0]?.in ?? '—',
    exceptionMinutes: rec.minutesDelta,
  }
}

function attendeesFromHistory(
  all: TrainingAttendee[],
  courseName: string,
  isoDate: string,
): TrainingAttendee[] {
  return all
    .map(a => attendeeForSession(a, courseName, isoDate))
    .filter((a): a is TrainingAttendee => a !== null)
}

function courseFromAttendees(
  meta: Omit<TrainingCourseMock, 'present' | 'total' | 'exceptions' | 'attendees'>,
  rows: TrainingAttendee[],
): TrainingCourseMock {
  const stats = statsFromAttendees(rows)
  return {
    ...meta,
    present: courseGroupHasMetrics(meta.group) ? stats.present : undefined,
    total: stats.total,
    exceptions: stats.exceptions,
    attendees: rows,
  }
}

function enrolledStub(
  partial: Pick<TrainingAttendee, 'id' | 'employeeCode' | 'name' | 'avatarColor' | 'company' | 'companyCode' | 'role' | 'currentCourse' | 'courseStart' | 'courseEnd'>,
): TrainingAttendee {
  return {
    ...partial,
    currentStatus: 'absent',
    courseDate: DEMO_TODAY_KEY,
    actualTime: '—',
    exceptionMinutes: 0,
    courseHistory: [],
  }
}

/** Ca chiều chưa mở — đăng ký, chưa có trong Sự kiện */
const UPCOMING_ENROLLED: Record<string, TrainingAttendee[]> = {
  'Vận hành máy nâng': [
    enrolledStub({ id: 'e-vhmn-1', employeeCode: 'NV000556', name: 'Ngô Thanh Sơn', avatarColor: '#34D399', company: 'Delta Corp', companyCode: 'DC-001', role: 'Kỹ sư kết cấu', currentCourse: 'Vận hành máy nâng', courseStart: '13:00', courseEnd: '17:00' }),
    enrolledStub({ id: 'e-vhmn-2', employeeCode: 'NV001089', name: 'Lưu Đức Minh', avatarColor: '#C084FC', company: 'Minh Phát JSC', companyCode: 'MP-004', role: 'Kỹ thuật viên điện', currentCourse: 'Vận hành máy nâng', courseStart: '13:00', courseEnd: '17:00' }),
    enrolledStub({ id: 'e-vhmn-3', employeeCode: 'NV001140', name: 'Đỗ Văn Long', avatarColor: '#38BDF8', company: 'XYZ JSC', companyCode: 'XY-002', role: 'Vận hành thiết bị', currentCourse: 'Vận hành máy nâng', courseStart: '13:00', courseEnd: '17:00' }),
    enrolledStub({ id: 'e-vhmn-4', employeeCode: 'NV001141', name: 'Võ Thị Hằng', avatarColor: '#F472B6', company: 'Sunrise Const.', companyCode: 'SR-005', role: 'Nhân viên an toàn', currentCourse: 'Vận hành máy nâng', courseStart: '13:00', courseEnd: '17:00' }),
  ],
  'KT xây dựng': [
    enrolledStub({ id: 'e-ktxd-1', employeeCode: 'NV001150', name: 'Hoàng Văn Phúc', avatarColor: '#10B981', company: 'ABC Construction', companyCode: 'AB-003', role: 'Giám sát thi công', currentCourse: 'KT xây dựng', courseStart: '14:00', courseEnd: '17:00' }),
    enrolledStub({ id: 'e-ktxd-2', employeeCode: 'NV001151', name: 'Lê Thị Thu Hà', avatarColor: '#EC4899', company: 'Delta Corp', companyCode: 'DC-001', role: 'Kế toán công trường', currentCourse: 'KT xây dựng', courseStart: '14:00', courseEnd: '17:00' }),
    enrolledStub({ id: 'e-ktxd-3', employeeCode: 'NV001152', name: 'Trương Văn Dũng', avatarColor: '#F97316', company: 'XYZ JSC', companyCode: 'XY-002', role: 'Thợ hàn bậc 2', currentCourse: 'KT xây dựng', courseStart: '14:00', courseEnd: '17:00' }),
  ],
  'AT môi trường': [
    enrolledStub({ id: 'e-atmt-1', employeeCode: 'NV001160', name: 'Bùi Văn Thanh', avatarColor: '#F59E0B', company: 'Minh Phát JSC', companyCode: 'MP-005', role: 'Thợ xây bậc 3', currentCourse: 'AT môi trường', courseStart: '14:00', courseEnd: '17:00' }),
    enrolledStub({ id: 'e-atmt-2', employeeCode: 'NV001161', name: 'Nguyễn Thị Xuân', avatarColor: '#A78BFA', company: 'Sunrise Const.', companyCode: 'SR-005', role: 'Nhân viên hành chính', currentCourse: 'AT môi trường', courseStart: '14:00', courseEnd: '17:00' }),
  ],
}

const UPCOMING_TOTAL: Record<string, number> = {
  'Vận hành máy nâng': 18,
  'KT xây dựng': 15,
  'AT môi trường': 20,
}

function upcomingCourse(
  meta: Omit<TrainingCourseMock, 'present' | 'total' | 'exceptions' | 'attendees'>,
): TrainingCourseMock {
  const attendees = UPCOMING_ENROLLED[meta.title] ?? []
  return {
    ...meta,
    total: UPCOMING_TOTAL[meta.title] ?? attendees.length,
    exceptions: 0,
    attendees,
    action: 'notify',
  }
}

function cancelledCourse(
  meta: Omit<TrainingCourseMock, 'present' | 'total' | 'exceptions' | 'attendees' | 'group'>,
): TrainingCourseMock {
  return {
    ...meta,
    group: 'cancelled',
    total: UPCOMING_TOTAL[meta.title] ?? 0,
    exceptions: 0,
    attendees: [],
  }
}

function yesterdayCourse(
  meta: Omit<TrainingCourseMock, 'present' | 'total' | 'exceptions' | 'attendees'>,
  all: TrainingAttendee[],
  courseName: string,
  isoDate: string,
): TrainingCourseMock {
  const attendees = attendeesFromHistory(all, courseName, isoDate)
  const stats = statsFromAttendees(attendees)
  return { ...meta, ...stats }
}

export function buildTrainingCourses(attendees: TrainingAttendee[]): TrainingCourseMock[] {
  const today = DEMO_TODAY_KEY
  const byCourse = (title: string) =>
    attendees.filter(a => a.currentCourse === title && a.courseDate === today)

  const todayCourses: TrainingCourseMock[] = [
    courseFromAttendees(
      {
        id: 'c-01',
        title: 'Toolbox A', zone: 'OCP1-A',
        sessionDate: '24/06/2026', startTime: '07:30', endTime: '09:30',
        group: 'completed',
      },
      byCourse('Toolbox A'),
    ),
    courseFromAttendees(
      {
        id: 'c-02',
        title: 'Cọc nhồi B', zone: 'OCP1-A',
        sessionDate: '24/06/2026', startTime: '08:00', endTime: '12:00',
        group: 'active', action: 'view',
      },
      byCourse('Cọc nhồi B'),
    ),
    courseFromAttendees(
      {
        id: 'c-03',
        title: 'PCCC C', zone: 'OCP1-B',
        sessionDate: '24/06/2026', startTime: '08:00', endTime: '12:00',
        group: 'active', action: 'view',
      },
      byCourse('PCCC C'),
    ),
    courseFromAttendees(
      {
        id: 'c-09',
        title: 'Điện cơ E', zone: 'OCP1-B',
        sessionDate: '24/06/2026', startTime: '11:30', endTime: '13:30',
        group: 'active', action: 'view',
      },
      byCourse('Điện cơ E'),
    ),
    upcomingCourse({
      id: 'c-05',
      title: 'Vận hành máy nâng', zone: 'OCP1-B',
      sessionDate: '24/06/2026', startTime: '13:00', endTime: '17:00',
      group: 'upcoming',
    }),
    cancelledCourse({
      id: 'c-06',
      title: 'KT xây dựng', zone: 'OCP1-A',
      sessionDate: '24/06/2026', startTime: '14:00', endTime: '17:00',
    }),
    upcomingCourse({
      id: 'c-07',
      title: 'AT môi trường', zone: 'OCP1-A',
      sessionDate: '24/06/2026', startTime: '14:00', endTime: '17:00',
      group: 'upcoming',
    }),
  ]

  const yesterdayCourses: TrainingCourseMock[] = [
    yesterdayCourse(
      {
        id: 'c-04',
        title: 'An toàn đầu ca', zone: 'OCP1-A',
        sessionDate: '23/06/2026', startTime: '07:30', endTime: '09:30',
        group: 'completed',
      },
      attendees,
      'An toàn đầu ca',
      '2026-06-23',
    ),
    yesterdayCourse(
      {
        id: 'c-08',
        title: 'Máy hạng nặng', zone: 'OCP1-B',
        sessionDate: '23/06/2026', startTime: '08:00', endTime: '12:00',
        group: 'completed',
      },
      attendees,
      'Máy hạng nặng',
      '2026-06-23',
    ),
  ]

  return [...todayCourses, ...yesterdayCourses]
}
