export type TrainingZone = 'OCP1-A' | 'OCP1-B'

export const COURSE_ZONE_BY_TITLE: Record<string, TrainingZone> = {
  'Toolbox A': 'OCP1-A',
  'Cọc nhồi B': 'OCP1-A',
  'KT xây dựng': 'OCP1-A',
  'AT môi trường': 'OCP1-A',
  'An toàn đầu ca': 'OCP1-A',
  'PCCC C': 'OCP1-B',
  'Điện cơ E': 'OCP1-B',
  'Vận hành máy nâng': 'OCP1-B',
  'Máy hạng nặng': 'OCP1-B',
}

export function getCourseZone(courseName: string): TrainingZone {
  return COURSE_ZONE_BY_TITLE[courseName] ?? 'OCP1-A'
}

/** DD/MM, DD/MM/YYYY, or ISO YYYY-MM-DD → DD/MM/YYYY */
export function toDisplaySessionDate(date: string): string {
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) return date
  if (/^\d{2}\/\d{2}$/.test(date)) return `${date}/2026`
  const [y, m, d] = date.split('-')
  if (y && m && d) return `${d}/${m}/${y}`
  return date
}

export function formatCourseMeta(
  startTime: string,
  endTime: string,
  sessionDate: string,
  zone: TrainingZone,
): string {
  return `${startTime} – ${endTime} · ${toDisplaySessionDate(sessionDate)} · ${zone}`
}
