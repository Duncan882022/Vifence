import { useState } from 'react'
import {
  BookOpen, Users, AlertTriangle, ShieldCheck,
  TrendingUp, TrendingDown, Minus,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import type { TrainingDailySummary } from '../services/trainingKpi.service'
import type { TrainingCourseMock } from '../data/trainingMockData'
import { courseGroupHasMetrics } from '../data/trainingMockData'
import { COURSE_GROUP_STYLE, groupLabel } from '../services/trainingReport.service'
import {
  attendanceStatusConfig,
  EXCEPTION_ATTENDANCE_STATUSES,
  getAttendeeBadges,
  StatusBadges,
  type AttendanceStatus,
} from './TrainingEventTable'
import { formatCourseMeta } from '../data/trainingCourseMeta'

type DetailTab = 'courses' | 'attendees' | 'exceptions' | 'compliance'

const TABS: {
  key: DetailTab
  label: string
  icon: typeof BookOpen
}[] = [
  { key: 'courses', label: 'Khoá học trong ngày', icon: BookOpen },
  { key: 'attendees', label: 'Học viên ghi nhận', icon: Users },
  { key: 'exceptions', label: 'Ngoại lệ trong ngày', icon: AlertTriangle },
  { key: 'compliance', label: 'Tỷ lệ tuân thủ', icon: ShieldCheck },
]

const GROUP_LABEL = groupLabel

interface TrainingDailyDetailDashboardProps {
  summary: TrainingDailySummary
  courses: TrainingCourseMock[]
}

function CompareBadge({
  change,
  changeType,
  changeUnit,
  higherIsBetter = true,
}: {
  change?: number
  changeType?: 'increase' | 'decrease' | 'neutral'
  changeUnit?: string
  higherIsBetter?: boolean
}) {
  if (change === undefined || changeType === undefined) return null
  const isUp = changeType === 'increase'
  const isDown = changeType === 'decrease'
  const isGood = higherIsBetter ? isUp : isDown
  const isBad = higherIsBetter ? isDown : isUp
  const prefix = change > 0 ? '+' : ''

  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-[11px] font-medium',
      isGood && 'text-green-400',
      isBad && 'text-red-400',
      changeType === 'neutral' && 'text-muted-foreground',
    )}>
      {isUp && <TrendingUp className="w-3 h-3" />}
      {isDown && <TrendingDown className="w-3 h-3" />}
      {changeType === 'neutral' && <Minus className="w-3 h-3" />}
      {changeType === 'neutral'
        ? 'Không đổi so với hôm qua'
        : `${prefix}${change}${changeUnit ? ` ${changeUnit}` : ''} so với hôm qua`}
    </span>
  )
}

function StatTile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-[#0b0f1a] border border-[#1e2433] rounded-lg px-4 py-3">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-foreground tabular-nums mt-1">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground/70 mt-1">{sub}</p>}
    </div>
  )
}

function CoursesSection({ summary, courses }: TrainingDailyDetailDashboardProps) {
  const { today, yesterday, metrics } = summary
  const metric = metrics[0]
  const started = courses.filter(c => courseGroupHasMetrics(c.group))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-3xl font-bold text-foreground tabular-nums">
            {today.coursesTotal}<span className="text-lg text-muted-foreground ml-1">ca</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">{today.dateLabel}</p>
        </div>
        <CompareBadge {...metric} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatTile label="Sắp diễn ra" value={today.coursesUpcoming} sub={`Hôm qua: ${yesterday.coursesUpcoming}`} />
        <StatTile label="Huỷ" value={today.coursesCancelled} sub={`Hôm qua: ${yesterday.coursesCancelled}`} />
        <StatTile label="Đang diễn ra" value={today.coursesActive} sub={`${today.coursesLive} ca live`} />
        <StatTile label="Đã hoàn thành" value={today.coursesCompleted} sub={`Hôm qua: ${yesterday.coursesCompleted}`} />
        <StatTile label="Tổng ca" value={today.coursesTotal} sub={`Hôm qua: ${yesterday.coursesTotal}`} />
      </div>

      <div className="border border-[#1e2433] rounded-lg overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_100px_80px_60px] gap-2 px-3 py-2 bg-[#0b0f1a] border-b border-[#1e2433] text-[9px] font-bold text-muted-foreground uppercase tracking-wide">
          <span>Khoá học</span>
          <span>Thời gian · Zone</span>
          <span>Trạng thái</span>
          <span className="text-right">TG</span>
          <span className="text-right">NCL</span>
        </div>
        <div className="divide-y divide-[#1e2433] max-h-[min(50vh,420px)] overflow-y-auto">
          {courses.map(course => (
            <div
              key={course.id}
              className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_100px_80px_60px] gap-2 px-3 py-2.5 items-center hover:bg-[#1a2235]/30"
            >
              <span className="text-[11px] font-semibold text-foreground truncate">{course.title}</span>
              <span className="text-[10px] text-muted-foreground truncate">
                {formatCourseMeta(course.startTime, course.endTime, course.sessionDate, course.zone)}
              </span>
              <span className={cn(
                'text-[9px] font-bold px-1.5 py-0.5 rounded w-fit',
                COURSE_GROUP_STYLE[course.group],
              )}>
                {GROUP_LABEL(course.group)}
              </span>
              <span className="text-[10px] text-right tabular-nums">
                {course.present !== undefined
                  ? <>{course.present}<span className="text-muted-foreground/50">/{course.total}</span></>
                  : <span className="text-muted-foreground">—/{course.total}</span>}
              </span>
              <span className={cn(
                'text-[10px] text-right tabular-nums font-semibold',
                course.exceptions > 0 ? 'text-orange-400' : 'text-muted-foreground',
              )}>
                {courseGroupHasMetrics(course.group) ? course.exceptions : '—'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {started.length > 0 && (
        <p className="text-[10px] text-muted-foreground/60">
          {started.length} ca đã/đang chạy · {today.coursesUpcoming} ca chưa bắt đầu · {today.coursesCancelled} ca huỷ
        </p>
      )}
    </div>
  )
}

function AttendeesSection({ summary, courses }: TrainingDailyDetailDashboardProps) {
  const { today, yesterday, metrics } = summary
  const metric = metrics[1]
  const started = courses.filter(c => courseGroupHasMetrics(c.group))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-3xl font-bold text-foreground tabular-nums">
            {today.recorded}<span className="text-lg text-muted-foreground ml-1">người</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Trên {today.enrolledStarted} học viên các ca đã chạy
          </p>
        </div>
        <CompareBadge {...metric} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatTile label="Đang học (live)" value={today.studyingNow} sub="HV đang trong ca" />
        <StatTile label="Ca đã chạy" value={started.length} sub={`${today.enrolledStarted} HV đăng ký`} />
        <StatTile label="Hôm qua" value={yesterday.recorded} sub={`/${yesterday.enrolledStarted} HV ca đã chạy`} />
      </div>

      <div className="border border-[#1e2433] rounded-lg overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1.2fr)_80px_80px_72px] gap-2 px-3 py-2 bg-[#0b0f1a] border-b border-[#1e2433] text-[9px] font-bold text-muted-foreground uppercase tracking-wide">
          <span>Khoá học</span>
          <span className="text-right">Ghi nhận</span>
          <span className="text-right">Tỷ lệ</span>
          <span className="text-right">NCL</span>
        </div>
        <div className="divide-y divide-[#1e2433] max-h-[min(50vh,420px)] overflow-y-auto">
          {started.map(course => {
            const rate = course.present !== undefined && course.total > 0
              ? Math.round((course.present / course.total) * 1000) / 10
              : null
            return (
              <div
                key={course.id}
                className="grid grid-cols-[minmax(0,1.2fr)_80px_80px_72px] gap-2 px-3 py-2.5 items-center hover:bg-[#1a2235]/30"
              >
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-foreground truncate">{course.title}</p>
                  <p className="text-[9px] text-muted-foreground/70 truncate">{course.zone}</p>
                </div>
                <span className="text-[10px] text-right tabular-nums">
                  {course.present ?? 0}<span className="text-muted-foreground/50">/{course.total}</span>
                </span>
                <span className="text-[10px] text-right tabular-nums text-sky-400">
                  {rate !== null ? `${rate}%` : '—'}
                </span>
                <span className={cn(
                  'text-[10px] text-right tabular-nums font-semibold',
                  course.exceptions > 0 ? 'text-orange-400' : 'text-muted-foreground',
                )}>
                  {course.exceptions}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ExceptionsSection({ summary, courses }: TrainingDailyDetailDashboardProps) {
  const { today, metrics } = summary
  const metric = metrics[2]
  const started = courses.filter(c => courseGroupHasMetrics(c.group))

  const exceptionAttendees = started.flatMap(c =>
    c.attendees
      .filter(a => getAttendeeBadges(a).some(b => EXCEPTION_ATTENDANCE_STATUSES.includes(b)))
      .map(a => ({ attendee: a, courseTitle: c.title })),
  )

  const byStatus = EXCEPTION_ATTENDANCE_STATUSES.reduce<Record<AttendanceStatus, number>>((acc, status) => {
    acc[status] = exceptionAttendees.filter(({ attendee }) =>
      getAttendeeBadges(attendee).includes(status),
    ).length
    return acc
  }, {} as Record<AttendanceStatus, number>)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-3xl font-bold text-orange-400 tabular-nums">
            {today.exceptions}<span className="text-lg text-muted-foreground ml-1">người</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {today.enrolledStarted > 0
              ? `${Math.round((today.exceptions / today.enrolledStarted) * 1000) / 10}% trên ca đã chạy`
              : 'Chưa có ca nào bắt đầu'}
          </p>
        </div>
        <CompareBadge {...metric} />
      </div>

      <div className="flex flex-wrap gap-2">
        {EXCEPTION_ATTENDANCE_STATUSES.map(status => (
          <div
            key={status}
            className={cn(
              'px-3 py-2 rounded-lg border border-[#1e2433] bg-[#0b0f1a]',
              byStatus[status] > 0 && attendanceStatusConfig[status].bg,
            )}
          >
            <span className={cn('text-[10px] font-bold', attendanceStatusConfig[status].color)}>
              {attendanceStatusConfig[status].label}
            </span>
            <span className="text-lg font-bold text-foreground tabular-nums ml-2">{byStatus[status]}</span>
          </div>
        ))}
      </div>

      <div className="border border-[#1e2433] rounded-lg overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_120px] gap-2 px-3 py-2 bg-[#0b0f1a] border-b border-[#1e2433] text-[9px] font-bold text-muted-foreground uppercase tracking-wide">
          <span>Học viên</span>
          <span>Nhà thầu</span>
          <span>Khoá học</span>
          <span>Trạng thái</span>
        </div>
        <div className="divide-y divide-[#1e2433] max-h-[min(50vh,420px)] overflow-y-auto">
          {exceptionAttendees.length === 0 ? (
            <p className="px-3 py-6 text-center text-[11px] text-muted-foreground/50">Không có ngoại lệ</p>
          ) : (
            exceptionAttendees.map(({ attendee, courseTitle }) => (
              <div
                key={`${attendee.id}-${courseTitle}`}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_120px] gap-2 px-3 py-2.5 items-center hover:bg-[#1a2235]/30"
              >
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-foreground truncate">{attendee.name}</p>
                  <p className="text-[9px] text-muted-foreground/60">{attendee.companyCode}</p>
                </div>
                <span className="text-[10px] text-muted-foreground truncate">{attendee.company}</span>
                <span className="text-[10px] text-muted-foreground truncate">{courseTitle}</span>
                <StatusBadges badges={getAttendeeBadges(attendee)} small />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function ComplianceSection({ summary, courses }: TrainingDailyDetailDashboardProps) {
  const { today, yesterday, metrics } = summary
  const metric = metrics[3]
  const started = courses.filter(c => courseGroupHasMetrics(c.group))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-3xl font-bold text-sky-400 tabular-nums">
            {today.attendanceRate}<span className="text-lg text-muted-foreground ml-1">%</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {today.recorded}/{today.enrolledStarted} học viên ca đã chạy
          </p>
        </div>
        <CompareBadge {...metric} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatTile label="Hôm nay" value={`${today.attendanceRate}%`} sub={`${today.recorded} ghi nhận`} />
        <StatTile label="Hôm qua" value={`${yesterday.attendanceRate}%`} sub={`${yesterday.recorded} ghi nhận`} />
        <StatTile
          label="Ca đạt 100%"
          value={started.filter(c => c.present === c.total && c.total > 0).length}
          sub={`/${started.length} ca đã chạy`}
        />
      </div>

      <div className="border border-[#1e2433] rounded-lg overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)] gap-3 px-3 py-2 bg-[#0b0f1a] border-b border-[#1e2433] text-[9px] font-bold text-muted-foreground uppercase tracking-wide">
          <span>Khoá học</span>
          <span className="text-right">%</span>
          <span>Tiến độ ghi nhận</span>
        </div>
        <div className="divide-y divide-[#1e2433] max-h-[min(50vh,420px)] overflow-y-auto">
          {started.map(course => {
            const rate = course.total > 0 && course.present !== undefined
              ? Math.round((course.present / course.total) * 1000) / 10
              : 0
            return (
              <div key={course.id} className="px-3 py-3 hover:bg-[#1a2235]/30">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-[11px] font-semibold text-foreground truncate">{course.title}</span>
                  <span className={cn(
                    'text-[11px] font-bold tabular-nums shrink-0',
                    rate >= 90 ? 'text-green-400' : rate >= 70 ? 'text-sky-400' : 'text-orange-400',
                  )}>
                    {rate}%
                  </span>
                </div>
                <div className="h-1.5 bg-[#1e2433] rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      rate >= 90 ? 'bg-green-500' : rate >= 70 ? 'bg-sky-500' : 'bg-orange-500',
                    )}
                    style={{ width: `${Math.min(rate, 100)}%` }}
                  />
                </div>
                <p className="text-[9px] text-muted-foreground/60 mt-1.5 tabular-nums">
                  {course.present ?? 0}/{course.total} học viên · {course.exceptions} ngoại lệ
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function TrainingDailyDetailDashboard({ summary, courses }: TrainingDailyDetailDashboardProps) {
  const [tab, setTab] = useState<DetailTab>('courses')
  const todayCourses = courses.filter(c => c.sessionDate === summary.today.dateLabel)

  const props = { summary, courses: todayCourses }

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <div className="flex border-b border-[#1e2433] shrink-0 overflow-x-auto scrollbar-none">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px shrink-0',
              tab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {tab === 'courses' && <CoursesSection {...props} />}
        {tab === 'attendees' && <AttendeesSection {...props} />}
        {tab === 'exceptions' && <ExceptionsSection {...props} />}
        {tab === 'compliance' && <ComplianceSection {...props} />}
      </div>
    </div>
  )
}
