import type { KPIData } from '@/types/api'
import {
  getSessionStatus,
  attendeeHasException,
  getAttendeeBadges,
  EXCEPTION_ATTENDANCE_STATUSES,
  type AttendanceStatus,
  type TrainingAttendee,
} from '../components/TrainingEventTable'

import type { CourseGroup } from '../data/trainingMockData'
import { courseGroupHasMetrics } from '../data/trainingMockData'

export interface TrainingCourseKpiInput {
  group: CourseGroup
  sessionDate: string
  startTime: string
  endTime: string
  present?: number
  total: number
  exceptions: number
}

/** Demo anchor date — all mock records for "today" use 24/06/2026 */
export const DEMO_TODAY = '24/06/2026'

/** Trọng số điểm tuân thủ: lớp vận hành · tham gia · (100 − % ngoại lệ) */
export const COMPLIANCE_WEIGHTS = { course: 0.35, attendance: 0.4, exception: 0.25 } as const

/** HV đã check-in, còn trong lớp live (kể cả đi trễ, tạm vắng) */
const LIVE_STUDYING_STATUSES: AttendanceStatus[] = ['attending', 'late', 'away']

export type ExceptionCountMap = Partial<Record<AttendanceStatus, number>>

export interface TrainingDayStats {
  dateLabel: string
  coursesTotal: number
  coursesActive: number
  coursesUpcoming: number
  coursesCancelled: number
  coursesCompleted: number
  coursesLive: number
  recorded: number
  enrolledStarted: number
  upcomingEnrolled: number
  exceptions: number
  attendanceRate: number
  /** HV đã check-in, còn trong lớp live (kể cả đi trễ, tạm vắng) */
  studyingNow: number
  /** HV vắng mặt ở lớp đang live */
  absentLive: number
  /** Tổng HV đăng ký các lớp đang live */
  enrolledLive: number
  /** % lớp kế hoạch / tổng lớp ngày — (tổng − huỷ) / tổng, vd. 6/7 */
  courseDayProgressRate: number
  /** Số lớp kế hoạch (tổng − huỷ) */
  coursesPlanned: number
  /** % lớp vận hành / kế hoạch (trừ huỷ) — dùng cho điểm tuân thủ */
  courseRunRate: number
  exceptionRate: number
  exceptionByStatus: ExceptionCountMap
  /** Điểm tuân thủ tổng hợp (0–100) */
  complianceScore: number
  /** Đóng góp có trọng số thô (1 chữ số thập phân) */
  complianceParts: { course: number; attendance: number; exceptionClean: number }
  /** Đóng góp làm tròn (0–35 / 0–40 / 0–25) — cộng đúng bằng complianceScore */
  compliancePartsDisplay: { course: number; attendance: number; exceptionClean: number }
}

export interface TrainingDailySummary {
  today: TrainingDayStats
  yesterday: TrainingDayStats
  metrics: KPIData[]
}

function dayPrefix(sessionDate: string): string {
  return sessionDate.slice(0, 5)
}

function delta(current: number, previous: number): Pick<KPIData, 'change' | 'changeType'> {
  const change = Math.round((current - previous) * 10) / 10
  if (change === 0) return { change: 0, changeType: 'neutral' }
  return { change, changeType: change > 0 ? 'increase' : 'decrease' }
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return Math.round((numerator / denominator) * 1000) / 10
}

export function computeComplianceScore(
  courseRunRate: number,
  attendanceRate: number,
  exceptionRate: number,
): number {
  const parts = computeComplianceWeightedParts(courseRunRate, attendanceRate, exceptionRate)
  return Math.round(parts.course + parts.attendance + parts.exceptionClean)
}

export function computeComplianceWeightedParts(
  courseRunRate: number,
  attendanceRate: number,
  exceptionRate: number,
): { course: number; attendance: number; exceptionClean: number } {
  const exceptionClean = Math.max(0, 100 - exceptionRate)
  return {
    course: Math.round(courseRunRate * COMPLIANCE_WEIGHTS.course * 10) / 10,
    attendance: Math.round(attendanceRate * COMPLIANCE_WEIGHTS.attendance * 10) / 10,
    exceptionClean: Math.round(exceptionClean * COMPLIANCE_WEIGHTS.exception * 10) / 10,
  }
}

/** Phân bổ phần dư làm tròn (largest remainder) để 3 chip cộng đúng bằng totalScore */
export function computeComplianceDisplayParts(
  parts: { course: number; attendance: number; exceptionClean: number },
  totalScore: number,
): { course: number; attendance: number; exceptionClean: number } {
  type PartKey = keyof typeof parts
  const keys: PartKey[] = ['course', 'attendance', 'exceptionClean']
  const floored = keys.map(key => ({
    key,
    floor: Math.floor(parts[key]),
    frac: parts[key] - Math.floor(parts[key]),
  }))
  const remainder = totalScore - floored.reduce((sum, entry) => sum + entry.floor, 0)
  const sorted = [...floored].sort((a, b) => b.frac - a.frac)
  const result = { course: 0, attendance: 0, exceptionClean: 0 }
  for (const { key, floor } of floored) {
    result[key] = floor
  }
  for (let i = 0; i < remainder; i++) {
    result[sorted[i % sorted.length].key]++
  }
  return result
}

/** Màu thành phần tuân thủ — khớp icon Lớp học / Học viên / Ngoại lệ */
export const COMPLIANCE_FACTOR_COLORS = {
  course: '#4ade80',
  attendance: '#22d3ee',
  exception: '#fb923c',
} as const

/** Thang nhiệt: thấp đỏ → cao xanh (không dùng blue) */
export function percentToHeatColor(percent: number): string {
  const t = Math.max(0, Math.min(100, percent)) / 100
  if (t <= 0.5) {
    const u = t / 0.5
    const r = Math.round(239 + (251 - 239) * u)
    const g = Math.round(68 + (146 - 68) * u)
    const b = Math.round(68 + (60 - 68) * u)
    return `rgb(${r}, ${g}, ${b})`
  }
  const u = (t - 0.5) / 0.5
  const r = Math.round(251 + (74 - 251) * u)
  const g = Math.round(146 + (222 - 146) * u)
  const b = Math.round(60 + (128 - 60) * u)
  return `rgb(${r}, ${g}, ${b})`
}

export function complianceScoreColorClass(score: number): string {
  if (score >= 75) return 'text-green-400'
  if (score >= 40) return 'text-orange-400'
  return 'text-red-400'
}

/** Màu gauge / số điểm tuân thủ — đỏ → cam → xanh */
export function complianceScoreStrokeColor(score: number): string {
  return percentToHeatColor(score)
}

export function formatComplianceBreakdown(stats: Pick<
  TrainingDayStats,
  'courseRunRate' | 'attendanceRate' | 'exceptionRate'
>): string {
  return `Lớp ${stats.courseRunRate}% · TG ${stats.attendanceRate}% · NL ${stats.exceptionRate}%`
}

export function formatCourseDayRingTitle(stats: TrainingDayStats): string {
  return [
    `${stats.coursesPlanned}/${stats.coursesTotal} lớp kế hoạch`,
    `${stats.coursesCancelled} huỷ`,
    `${stats.coursesLive} đang · ${stats.coursesCompleted} xong · ${stats.coursesUpcoming} sắp`,
  ].join(' · ')
}

function countExceptionsByStatus(attendees: TrainingAttendee[]): ExceptionCountMap {
  const map: ExceptionCountMap = {}
  for (const s of attendees) {
    if (!attendeeHasException(s)) continue
    for (const badge of getAttendeeBadges(s)) {
      if (EXCEPTION_ATTENDANCE_STATUSES.includes(badge)) {
        map[badge] = (map[badge] ?? 0) + 1
      }
    }
  }
  return map
}

function isLiveInClass(s: TrainingAttendee, dateKey: string): boolean {
  return s.courseDate === dateKey
    && getSessionStatus(s.courseStart, s.courseEnd) === 'in-session'
}

function isStudyingNow(s: TrainingAttendee): boolean {
  return LIVE_STUDYING_STATUSES.includes(s.currentStatus)
}

function computeDayStats(
  courses: TrainingCourseKpiInput[],
  attendees: TrainingAttendee[],
  dateKey: string,
  includeLive: boolean,
): TrainingDayStats {
  const dayCourses = courses.filter(c => dayPrefix(c.sessionDate) === dateKey)
  const upcoming = dayCourses.filter(c => c.group === 'upcoming')
  const cancelled = dayCourses.filter(c => c.group === 'cancelled')
  const active = dayCourses.filter(c => c.group === 'active')
  const completed = dayCourses.filter(c => c.group === 'completed')
  const started = dayCourses.filter(c => courseGroupHasMetrics(c.group))

  const recorded = started.reduce((s, c) => s + (c.present ?? 0), 0)
  const enrolledStarted = started.reduce((s, c) => s + c.total, 0)
  const upcomingEnrolled = upcoming.reduce((s, c) => s + c.total, 0)
  const exceptions = started.reduce((s, c) => s + c.exceptions, 0)

  const liveAttendees = includeLive
    ? attendees.filter(s => isLiveInClass(s, dateKey))
    : []

  const exceptionsFromAttendees = includeLive
    ? liveAttendees.filter(s => attendeeHasException(s)).length
    : exceptions

  const exceptionByStatus = includeLive
    ? countExceptionsByStatus(liveAttendees)
    : {}

  const attendanceRate = pct(recorded, enrolledStarted)
  const plannedCourses = dayCourses.length - cancelled.length
  const startedOrDone = active.length + completed.length
  const courseRunRate = pct(startedOrDone, plannedCourses)
  const courseDayProgressRate = pct(plannedCourses, dayCourses.length)

  let coursesLive = 0
  let studyingNow = 0
  let absentLive = 0
  let enrolledLive = 0

  if (includeLive) {
    coursesLive = active.filter(
      c => getSessionStatus(c.startTime, c.endTime) === 'in-session',
    ).length

    enrolledLive = active
      .filter(c => getSessionStatus(c.startTime, c.endTime) === 'in-session')
      .reduce((sum, c) => sum + c.total, 0)

    studyingNow = liveAttendees.filter(isStudyingNow).length
    absentLive = liveAttendees.filter(s => s.currentStatus === 'absent').length
  }

  const exceptionDenominator = includeLive
    ? (studyingNow > 0 ? studyingNow : enrolledLive)
    : enrolledStarted
  const exceptionRate = pct(exceptionsFromAttendees, exceptionDenominator)
  const complianceParts = computeComplianceWeightedParts(courseRunRate, attendanceRate, exceptionRate)
  const complianceScore = Math.round(
    complianceParts.course + complianceParts.attendance + complianceParts.exceptionClean,
  )
  const compliancePartsDisplay = computeComplianceDisplayParts(complianceParts, complianceScore)

  return {
    dateLabel: dayCourses[0]?.sessionDate ?? `${dateKey}/2026`,
    coursesTotal: dayCourses.length,
    coursesPlanned: plannedCourses,
    coursesActive: active.length,
    coursesUpcoming: upcoming.length,
    coursesCancelled: cancelled.length,
    coursesCompleted: completed.length,
    coursesLive,
    recorded,
    enrolledStarted,
    upcomingEnrolled,
    exceptions: exceptionsFromAttendees,
    attendanceRate,
    studyingNow,
    absentLive,
    enrolledLive,
    courseDayProgressRate,
    courseRunRate,
    exceptionRate,
    exceptionByStatus,
    complianceScore,
    complianceParts,
    compliancePartsDisplay,
  }
}

function buildMetrics(today: TrainingDayStats, yesterday: TrainingDayStats): KPIData[] {
  return [
    {
      label: 'Lớp học',
      value: today.coursesTotal,
      unit: 'lớp',
      ...delta(today.coursesTotal, yesterday.coursesTotal),
      previousValue: yesterday.coursesTotal,
      higherIsBetter: true,
    },
    {
      label: 'Học viên',
      value: today.recorded,
      unit: 'học viên',
      detail: today.enrolledStarted > 0 ? `/${today.enrolledStarted}` : undefined,
      ...delta(today.recorded, yesterday.recorded),
      previousValue: yesterday.recorded,
      higherIsBetter: true,
    },
    {
      label: 'Ngoại lệ',
      value: today.exceptions,
      unit: 'học viên',
      ...delta(today.exceptions, yesterday.exceptions),
      previousValue: yesterday.exceptions,
      higherIsBetter: false,
    },
    {
      label: 'Tuân thủ',
      value: today.complianceScore,
      unit: 'điểm',
      detail: formatComplianceBreakdown(today),
      ...delta(today.complianceScore, yesterday.complianceScore),
      previousValue: yesterday.complianceScore,
      higherIsBetter: true,
      changeUnit: 'điểm',
    },
  ]
}

export function computeTrainingDailySummary(
  attendees: TrainingAttendee[],
  courses: TrainingCourseKpiInput[],
  todayDate: string = DEMO_TODAY,
): TrainingDailySummary {
  const todayKey = dayPrefix(todayDate)
  const yesterdayKey = todayKey === '24/06' ? '23/06' : '22/06'

  const today = computeDayStats(courses, attendees, todayKey, true)
  today.dateLabel = todayDate

  const yesterday = computeDayStats(courses, attendees, yesterdayKey, false)

  return {
    today,
    yesterday,
    metrics: buildMetrics(today, yesterday),
  }
}

/** @deprecated use computeTrainingDailySummary */
export function computeTrainingKPIs(
  attendees: TrainingAttendee[],
  courses: TrainingCourseKpiInput[],
): KPIData[] {
  return computeTrainingDailySummary(attendees, courses).metrics
}
