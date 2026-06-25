import { TRAINING_COURSES } from '@/modules/module02-training/components/TrainingCourseAccordion'
import type { TrainingCourseMock } from '@/modules/module02-training/data/trainingMockData'
import { courseGroupHasMetrics } from '@/modules/module02-training/data/trainingMockData'
import { resolveCourseLocation } from '@/modules/module02-training/data/trainingCameras'
import {
  attendanceStatusConfig,
  attendeeHasException,
  getAttendanceDetailLine,
  getAttendeeBadges,
} from '@/modules/module02-training/components/TrainingEventTable'

export function getAllTrainingCourses(customCourses: TrainingCourseMock[]): TrainingCourseMock[] {
  return [...TRAINING_COURSES, ...customCourses]
}

/** DD/MM/YYYY or DD/MM → ISO YYYY-MM-DD */
export function sessionDateToIso(sessionDate: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) return sessionDate
  const full = sessionDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (full) return `${full[3]}-${full[2]}-${full[1]}`
  const short = sessionDate.match(/^(\d{2})\/(\d{2})$/)
  if (short) return `2026-${short[2]}-${short[1]}`
  return sessionDate
}

/** ISO YYYY-MM-DD → DD/MM/YYYY */
export function isoToDisplayDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

export interface TrainingReportRow {
  id: string
  sessionDate: string
  title: string
  zone: string
  location: string
  startTime: string
  endTime: string
  group: TrainingCourseMock['group']
  present: number
  total: number
  exceptions: number
  attendanceRate: number
}

export interface TrainingReportAttendeeRow {
  sessionDate: string
  title: string
  zone: string
  location: string
  startTime: string
  endTime: string
  courseGroup: TrainingCourseMock['group']
  employeeCode: string
  name: string
  company: string
  companyCode: string
  role: string
  statusLabels: string
  statusDetail: string
  hasException: boolean
}

export interface TrainingReportSummary {
  courseCount: number
  attendeeSlots: number
  recorded: number
  exceptions: number
  complianceRate: number
  rows: TrainingReportRow[]
  attendeeRows: TrainingReportAttendeeRow[]
}

const GROUP_LABEL: Record<TrainingCourseMock['group'], string> = {
  upcoming: 'Sắp diễn ra',
  active: 'Đang diễn ra',
  completed: 'Đã hoàn thành',
  cancelled: 'Đã Huỷ',
}

export const COURSE_GROUP_DOT: Record<TrainingCourseMock['group'], string> = {
  upcoming: 'bg-blue-400',
  active: 'bg-green-400',
  completed: 'bg-gray-400',
  cancelled: 'bg-red-400',
}

export const COURSE_GROUP_STYLE: Record<TrainingCourseMock['group'], string> = {
  upcoming: 'text-blue-400 bg-blue-500/15',
  active: 'text-green-400 bg-green-500/15',
  completed: 'text-gray-400 bg-gray-500/15',
  cancelled: 'text-red-400 bg-red-500/15',
}

export const COURSE_GROUP_ORDER: TrainingCourseMock['group'][] = [
  'upcoming', 'cancelled', 'active', 'completed',
]

export function groupLabel(group: TrainingCourseMock['group']): string {
  return GROUP_LABEL[group]
}

export function filterTrainingCourses(
  courses: TrainingCourseMock[],
  query: string,
): TrainingCourseMock[] {
  const q = query.trim().toLowerCase()
  if (!q) return courses
  return courses.filter(c => {
    const location = resolveCourseLocation(c.title, c.zone, c.location)
    const haystack = [
      c.title,
      c.zone,
      location,
      c.sessionDate,
      groupLabel(c.group),
      c.startTime,
      c.endTime,
    ].join(' ').toLowerCase()
    return haystack.includes(q)
  })
}

function inDateRange(sessionDate: string, fromIso: string, toIso: string): boolean {
  const iso = sessionDateToIso(sessionDate)
  return iso >= fromIso && iso <= toIso
}

function displaySessionDate(sessionDate: string): string {
  return sessionDate.includes('/') && sessionDate.length >= 10
    ? sessionDate
    : isoToDisplayDate(sessionDateToIso(sessionDate))
}

function buildAttendeeRows(courses: TrainingCourseMock[]): TrainingReportAttendeeRow[] {
  const rows: TrainingReportAttendeeRow[] = []

  for (const c of courses) {
    const sessionDate = displaySessionDate(c.sessionDate)
    const location = resolveCourseLocation(c.title, c.zone, c.location)

    for (const att of c.attendees) {
      const badges = getAttendeeBadges(att)
      rows.push({
        sessionDate,
        title: c.title,
        zone: c.zone,
        location,
        startTime: c.startTime,
        endTime: c.endTime,
        courseGroup: c.group,
        employeeCode: att.employeeCode,
        name: att.name,
        company: att.company,
        companyCode: att.companyCode,
        role: att.role,
        statusLabels: badges.map(b => attendanceStatusConfig[b].label).join(', '),
        statusDetail: c.group === 'upcoming'
          ? 'Chưa bắt đầu'
          : c.group === 'cancelled'
            ? 'Đã Huỷ'
            : (getAttendanceDetailLine(att) || attendanceStatusConfig[badges[0]].label),
        hasException: attendeeHasException(att),
      })
    }
  }

  return rows.sort((a, b) => {
    const byDate = sessionDateToIso(a.sessionDate).localeCompare(sessionDateToIso(b.sessionDate))
    if (byDate !== 0) return byDate
    const byCourse = a.title.localeCompare(b.title, 'vi')
    return byCourse !== 0 ? byCourse : a.name.localeCompare(b.name, 'vi')
  })
}

export function buildTrainingReport(
  courses: TrainingCourseMock[],
  fromIso: string,
  toIso: string,
): TrainingReportSummary {
  const filtered = courses
    .filter(c => inDateRange(c.sessionDate, fromIso, toIso))
    .sort((a, b) => sessionDateToIso(a.sessionDate).localeCompare(sessionDateToIso(b.sessionDate)))

  const rows: TrainingReportRow[] = filtered.map(c => {
    const present = c.present ?? 0
    const total = c.total
    const rate = total > 0 && courseGroupHasMetrics(c.group)
      ? Math.round((present / total) * 1000) / 10
      : 0
    return {
      id: c.id,
      sessionDate: displaySessionDate(c.sessionDate),
      title: c.title,
      zone: c.zone,
      location: resolveCourseLocation(c.title, c.zone, c.location),
      startTime: c.startTime,
      endTime: c.endTime,
      group: c.group,
      present,
      total,
      exceptions: c.exceptions,
      attendanceRate: rate,
    }
  })

  const started = rows.filter(r => courseGroupHasMetrics(r.group))
  const recorded = started.reduce((s, r) => s + r.present, 0)
  const attendeeSlots = started.reduce((s, r) => s + r.total, 0)
  const exceptions = started.reduce((s, r) => s + r.exceptions, 0)
  const complianceRate = attendeeSlots > 0
    ? Math.round((recorded / attendeeSlots) * 1000) / 10
    : 0

  return {
    courseCount: rows.length,
    attendeeSlots,
    recorded,
    exceptions,
    complianceRate,
    rows,
    attendeeRows: buildAttendeeRows(filtered),
  }
}

export async function exportTrainingReportExcel(
  summary: TrainingReportSummary,
  fromIso: string,
  toIso: string,
): Promise<void> {
  const XLSX = await import('xlsx')
  const fromDisplay = isoToDisplayDate(fromIso)
  const toDisplay = isoToDisplayDate(toIso)

  const summarySheet: (string | number)[][] = [
    ['BÁO CÁO ĐÀO TẠO'],
    [`Khoảng thời gian: ${fromDisplay} – ${toDisplay}`],
    [],
    ['Chỉ tiêu', 'Giá trị', 'Ghi chú'],
    ['Ca đào tạo', summary.courseCount, 'ca trong khoảng đã chọn'],
    [
      'Học viên ghi nhận',
      summary.recorded,
      summary.attendeeSlots > 0 ? `Trên ${summary.attendeeSlots} đăng ký ca đã chạy` : 'Chưa có ca đã chạy',
    ],
    [
      'Ngoại lệ',
      summary.exceptions,
      summary.attendeeSlots > 0
        ? `${Math.round((summary.exceptions / summary.attendeeSlots) * 1000) / 10}% trên ca đã chạy`
        : '',
    ],
    [
      'Tỷ lệ tuân thủ (%)',
      summary.complianceRate,
      summary.attendeeSlots > 0 ? `${summary.recorded}/${summary.attendeeSlots} học viên` : '',
    ],
    [],
    [
      'Ngày',
      'Khoá học',
      'Khu vực',
      'Vị trí',
      'Giờ bắt đầu',
      'Giờ kết thúc',
      'Trạng thái ca',
      'Có mặt',
      'Đăng ký',
      'Ngoại lệ',
      'Tuân thủ (%)',
    ],
    ...summary.rows.map(r => [
      r.sessionDate,
      r.title,
      r.zone,
      r.location,
      r.startTime,
      r.endTime,
      groupLabel(r.group),
      courseGroupHasMetrics(r.group) ? r.present : '—',
      r.total,
      courseGroupHasMetrics(r.group) ? r.exceptions : '—',
      courseGroupHasMetrics(r.group) ? r.attendanceRate : '—',
    ]),
  ]

  const attendeeSheet: (string | number)[][] = [
    [
      'Ngày',
      'Khoá học',
      'Khu vực',
      'Vị trí',
      'Giờ ca',
      'Trạng thái ca',
      'Mã NV',
      'Họ tên',
      'Nhà thầu',
      'Mã NT',
      'Chức danh',
      'Điểm danh',
      'Chi tiết giờ',
      'Ngoại lệ',
    ],
    ...summary.attendeeRows.map(r => [
      r.sessionDate,
      r.title,
      r.zone,
      r.location,
      `${r.startTime} – ${r.endTime}`,
      groupLabel(r.courseGroup),
      r.employeeCode,
      r.name,
      r.company,
      r.companyCode,
      r.role,
      r.statusLabels,
      r.statusDetail,
      r.hasException ? 'Có' : 'Không',
    ]),
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summarySheet), 'Tổng hợp')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(attendeeSheet), 'Học viên')
  XLSX.writeFile(workbook, `bao-cao-dao-tao_${fromIso}_${toIso}.xlsx`)
}

/** @deprecated use exportTrainingReportExcel */
export function exportTrainingReportCsv(summary: TrainingReportSummary, fromIso: string, toIso: string): void {
  void exportTrainingReportExcel(summary, fromIso, toIso)
}
