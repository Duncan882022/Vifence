import { TRAINING_COURSES } from '@/modules/module02-training/components/TrainingCourseAccordion'
import type { TrainingCourseMock } from '@/modules/module02-training/data/trainingMockData'

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
  startTime: string
  endTime: string
  group: TrainingCourseMock['group']
  present: number
  total: number
  exceptions: number
  attendanceRate: number
}

export interface TrainingReportSummary {
  courseCount: number
  attendeeSlots: number
  recorded: number
  exceptions: number
  complianceRate: number
  rows: TrainingReportRow[]
}

const GROUP_LABEL: Record<TrainingCourseMock['group'], string> = {
  upcoming: 'Sắp diễn ra',
  active: 'Đang diễn ra',
  completed: 'Đã hoàn thành',
}

export function groupLabel(group: TrainingCourseMock['group']): string {
  return GROUP_LABEL[group]
}

function inDateRange(sessionDate: string, fromIso: string, toIso: string): boolean {
  const iso = sessionDateToIso(sessionDate)
  return iso >= fromIso && iso <= toIso
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
    const rate = total > 0 && c.group !== 'upcoming'
      ? Math.round((present / total) * 1000) / 10
      : 0
    return {
      id: c.id,
      sessionDate: c.sessionDate.includes('/') && c.sessionDate.length >= 10
        ? c.sessionDate
        : isoToDisplayDate(sessionDateToIso(c.sessionDate)),
      title: c.title,
      zone: c.zone,
      startTime: c.startTime,
      endTime: c.endTime,
      group: c.group,
      present,
      total,
      exceptions: c.exceptions,
      attendanceRate: rate,
    }
  })

  const started = rows.filter(r => r.group !== 'upcoming')
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
  }
}

export function exportTrainingReportCsv(summary: TrainingReportSummary, fromIso: string, toIso: string): void {
  const header = [
    'Ngày',
    'Khoá học',
    'Khu vực',
    'Giờ bắt đầu',
    'Giờ kết thúc',
    'Trạng thái',
    'Có mặt',
    'Đăng ký',
    'Ngoại lệ',
    'Tuân thủ (%)',
  ]
  const lines = summary.rows.map(r => [
    r.sessionDate,
    r.title,
    r.zone,
    r.startTime,
    r.endTime,
    groupLabel(r.group),
    String(r.present),
    String(r.total),
    String(r.exceptions),
    r.group === 'upcoming' ? '—' : String(r.attendanceRate),
  ])
  const csv = [header, ...lines]
    .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `bao-cao-dao-tao_${fromIso}_${toIso}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
