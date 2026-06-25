import type { KPIData } from '@/types/api'
import {
  getSessionStatus,
  attendeeHasException,
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

const LIVE_STATUSES: AttendanceStatus[] = ['attending', 'late', 'away']

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
  studyingNow: number
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

function courseGroupDetail(stats: Pick<TrainingDayStats, 'coursesCompleted' | 'coursesActive' | 'coursesUpcoming' | 'coursesCancelled'>): string {
  const parts: string[] = []
  if (stats.coursesCompleted > 0) parts.push(`${stats.coursesCompleted} đã hoàn thành`)
  if (stats.coursesActive > 0) parts.push(`${stats.coursesActive} đang diễn ra`)
  if (stats.coursesUpcoming > 0) parts.push(`${stats.coursesUpcoming} sắp diễn ra`)
  if (stats.coursesCancelled > 0) parts.push(`${stats.coursesCancelled} huỷ`)
  return parts.join(' · ')
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

  /** Đối chiếu: đếm trực tiếp HV có ngoại lệ trong ngày (đi trễ, về sớm, …) */
  const exceptionsFromAttendees = includeLive
    ? attendees.filter(
      s => s.courseDate === dateKey && attendeeHasException(s),
    ).length
    : exceptions
  const attendanceRate = enrolledStarted > 0
    ? Math.round((recorded / enrolledStarted) * 1000) / 10
    : 0

  let coursesLive = 0
  let studyingNow = 0

  if (includeLive) {
    coursesLive = active.filter(
      c => getSessionStatus(c.startTime, c.endTime) === 'in-session',
    ).length
    studyingNow = attendees.filter(
      s => s.courseDate === dateKey
        && getSessionStatus(s.courseStart, s.courseEnd) === 'in-session'
        && LIVE_STATUSES.includes(s.currentStatus),
    ).length
  }

  return {
    dateLabel: dayCourses[0]?.sessionDate ?? `${dateKey}/2026`,
    coursesTotal: dayCourses.length,
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
  }
}

function buildMetrics(today: TrainingDayStats, yesterday: TrainingDayStats): KPIData[] {
  return [
    {
      label: 'Khoá học trong ngày',
      value: today.coursesTotal,
      unit: 'ca',
      detail: courseGroupDetail(today),
      ...delta(today.coursesTotal, yesterday.coursesTotal),
      previousValue: yesterday.coursesTotal,
      higherIsBetter: true,
    },
    {
      label: 'Học viên ghi nhận',
      value: today.recorded,
      unit: 'người',
      detail: today.enrolledStarted > 0
        ? `Trên ${today.enrolledStarted} học viên ca đã chạy`
        : 'Chưa có ca nào bắt đầu',
      ...delta(today.recorded, yesterday.recorded),
      previousValue: yesterday.recorded,
      higherIsBetter: true,
    },
    {
      label: 'Ngoại lệ trong ngày',
      value: today.exceptions,
      unit: 'người',
      detail: today.enrolledStarted > 0
        ? `${Math.round((today.exceptions / today.enrolledStarted) * 1000) / 10}% trên ca đã chạy`
        : undefined,
      ...delta(today.exceptions, yesterday.exceptions),
      previousValue: yesterday.exceptions,
      higherIsBetter: false,
    },
    {
      label: 'Tỷ lệ tuân thủ',
      value: today.attendanceRate,
      unit: '%',
      detail: today.enrolledStarted > 0
        ? `${today.recorded}/${today.enrolledStarted} học viên ca đã chạy`
        : 'Chưa có ca nào bắt đầu',
      ...delta(today.attendanceRate, yesterday.attendanceRate),
      previousValue: yesterday.attendanceRate,
      higherIsBetter: true,
      changeUnit: 'điểm %',
    },
  ]
}

/** Full Tier-1 daily dashboard — cumulative for calendar day, not live-only. */
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
