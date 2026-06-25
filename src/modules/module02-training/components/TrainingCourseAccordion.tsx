import { useState, useRef, useEffect } from 'react'
import { ChevronRight, ChevronDown, Bell, Lock } from 'lucide-react'
import { cn } from '@/utils/cn'
import {
  type AttendanceStatus,
  SessionBadge,
  StatusBadges,
} from './TrainingEventTable'

type CourseGroup = 'upcoming' | 'active' | 'completed'

interface CourseAttendee {
  name: string
  contractor: string
  status: AttendanceStatus
  flags?: AttendanceStatus[]
}

interface Course {
  id: string
  num: number
  title: string
  location: string
  sessionDate: string
  startTime: string
  endTime: string
  group: CourseGroup
  present?: number
  total: number
  exceptions: number
  attendees: CourseAttendee[]
  action?: 'notify' | 'view'
}

function getAttendeeBadges(att: CourseAttendee): AttendanceStatus[] {
  const primary = att.status
  const flags = (att.flags ?? []).filter(f => f !== primary)
  const order: AttendanceStatus[] = [
    'late', 'attending', 'away', 'left-early', 'skipped', 'insufficient', 'completed', 'absent',
  ]
  return [...new Set([primary, ...flags])].sort(
    (a, b) => order.indexOf(a) - order.indexOf(b),
  )
}

export const TRAINING_COURSES: Course[] = [
  /* ── ĐANG DIỄN RA ── */
  {
    id: 'c-01', num: 1,
    title: 'Toolbox A', location: 'Phòng Đào Tạo A1 · OCP1-Zone A',
    sessionDate: '24/06/2026', startTime: '07:30', endTime: '09:30',
    group: 'completed', present: 31, total: 38, exceptions: 7,
    attendees: [
      { name: 'Trần Văn Bình',     contractor: 'XYZ JSC',        status: 'left-early' },
      { name: 'Nguyễn Thị Phương', contractor: 'Delta Corp',     status: 'late' },
      { name: 'Đinh Quốc Hùng',    contractor: 'Minh Phát JSC',  status: 'late' },
      { name: 'Trương Văn Khoa',   contractor: 'XYZ JSC',        status: 'absent' },
      { name: 'Cao Văn Nam',       contractor: 'Sunrise Const.', status: 'late' },
      { name: 'Mai Xuân Trường',   contractor: 'Delta Corp',     status: 'absent' },
      { name: 'Phùng Anh Tuấn',    contractor: 'Sunrise Const.', status: 'left-early' },
      { name: 'Hoàng Văn Phúc',    contractor: 'ABC Construction', status: 'attending' },
      { name: 'Lê Thị Thu Hà',     contractor: 'Delta Corp',     status: 'attending' },
      { name: 'Trương Văn Dũng',   contractor: 'XYZ JSC',        status: 'attending' },
    ],
  },
  {
    id: 'c-02', num: 2,
    title: 'Cọc nhồi B', location: 'Phòng Đào Tạo A2 · OCP1-Zone A',
    sessionDate: '24/06/2026', startTime: '08:00', endTime: '12:00',
    group: 'active', present: 23, total: 30, exceptions: 7, action: 'view',
    attendees: [
      { name: 'Phạm Văn Cường',   contractor: 'Delta Corp',       status: 'late' },
      { name: 'Hoàng Văn Em',     contractor: 'XYZ JSC',          status: 'skipped', flags: ['late'] },
      { name: 'Vũ Minh Giang',    contractor: 'ABC Construction', status: 'absent' },
      { name: 'Lý Thị Mỹ Duyên', contractor: 'ABC Construction', status: 'late' },
      { name: 'Phan Minh Tuấn',   contractor: 'Minh Phát JSC',    status: 'insufficient' },
      { name: 'Hồ Quốc Việt',     contractor: 'Delta Corp',       status: 'left-early', flags: ['late'] },
      { name: 'Kiều Thanh Thảo',  contractor: 'ABC Construction', status: 'skipped' },
      { name: 'Bùi Văn Thanh',    contractor: 'Minh Phát JSC',    status: 'attending' },
      { name: 'Nguyễn Thị Xuân',  contractor: 'Sunrise Const.',   status: 'attending' },
    ],
  },
  {
    id: 'c-03', num: 3,
    title: 'PCCC C', location: 'Sân Thực Hành B1 · OCP1-Zone B',
    sessionDate: '24/06/2026', startTime: '08:00', endTime: '12:00',
    group: 'active', present: 28, total: 32, exceptions: 4, action: 'view',
    attendees: [
      { name: 'Lê Văn Dũng',      contractor: 'ABC Construction', status: 'absent' },
      { name: 'Bùi Thị Lan',      contractor: 'Sunrise Const.',   status: 'left-early' },
      { name: 'Đặng Thị Hoa',     contractor: 'XYZ JSC',          status: 'absent' },
      { name: 'Nguyễn Văn Hoàng', contractor: 'XYZ JSC',          status: 'late' },
      { name: 'Phạm Văn An',      contractor: 'XYZ JSC',          status: 'attending' },
      { name: 'Trần Minh Khang',  contractor: 'Sunrise Const.',   status: 'attending' },
    ],
  },
  {
    id: 'c-09', num: 9,
    title: 'Điện cơ E', location: 'Phòng Đào Tạo B2 · OCP1-Zone B',
    sessionDate: '24/06/2026', startTime: '11:30', endTime: '13:30',
    group: 'active', present: 5, total: 12, exceptions: 2, action: 'view',
    attendees: [
      { name: 'Cao Thị Bích',    contractor: 'Delta Corp',       status: 'attending' },
      { name: 'Nguyễn Văn Phú',  contractor: 'ABC Construction', status: 'attending' },
      { name: 'Trần Minh Đức',   contractor: 'XYZ JSC',          status: 'late' },
      { name: 'Lê Thị Phương',   contractor: 'Sunrise Const.',   status: 'attending' },
      { name: 'Vũ Minh Khải',    contractor: 'Minh Phát JSC',    status: 'away', flags: ['late'] },
    ],
  },

  /* ── SẮP DIỄN RA ── */
  {
    id: 'c-05', num: 5,
    title: 'Vận hành máy nâng', location: 'Phòng Đào Tạo B1 · OCP1-Zone B',
    sessionDate: '24/06/2026', startTime: '13:00', endTime: '17:00',
    group: 'upcoming', total: 18, exceptions: 0, action: 'notify',
    attendees: [
      { name: 'Ngô Thanh Sơn',   contractor: 'Delta Corp',     status: 'absent' },
      { name: 'Lưu Đức Minh',    contractor: 'Minh Phát JSC', status: 'absent' },
      { name: 'Phạm Văn An',      contractor: 'XYZ JSC',       status: 'absent' },
      { name: 'Trần Minh Khang',  contractor: 'Sunrise Const.', status: 'absent' },
    ],
  },
  {
    id: 'c-06', num: 6,
    title: 'KT xây dựng', location: 'Phòng Đào Tạo A2 · OCP1-Zone A',
    sessionDate: '24/06/2026', startTime: '14:00', endTime: '17:00',
    group: 'upcoming', total: 15, exceptions: 0, action: 'notify',
    attendees: [
      { name: 'Hoàng Văn Phúc',  contractor: 'ABC Construction', status: 'absent' },
      { name: 'Lê Thị Thu Hà',   contractor: 'Delta Corp',       status: 'absent' },
      { name: 'Trương Văn Dũng', contractor: 'XYZ JSC',          status: 'absent' },
    ],
  },
  {
    id: 'c-07', num: 7,
    title: 'AT môi trường', location: 'Phòng Đào Tạo B1 · OCP1-Zone B',
    sessionDate: '24/06/2026', startTime: '14:00', endTime: '17:00',
    group: 'upcoming', total: 20, exceptions: 0, action: 'notify',
    attendees: [
      { name: 'Bùi Văn Thanh',   contractor: 'Minh Phát JSC',   status: 'absent' },
      { name: 'Nguyễn Thị Xuân', contractor: 'Sunrise Const.', status: 'absent' },
    ],
  },

  /* ── ĐÃ HOÀN THÀNH ── */
  {
    id: 'c-04', num: 4,
    title: 'An toàn đầu ca', location: 'Phòng Đào Tạo A1 · OCP1-Zone A',
    sessionDate: '23/06/2026', startTime: '07:30', endTime: '09:30',
    group: 'completed', present: 34, total: 36, exceptions: 2,
    attendees: [
      { name: 'Cao Văn Nam',       contractor: 'Sunrise Const.',   status: 'completed' },
      { name: 'Trương Văn Khoa',   contractor: 'XYZ JSC',          status: 'absent' },
      { name: 'Nguyễn Thị Phương', contractor: 'Delta Corp',       status: 'completed' },
      { name: 'Hoàng Văn Phúc',    contractor: 'ABC Construction', status: 'completed' },
      { name: 'Lê Thị Thu Hà',     contractor: 'Delta Corp',       status: 'absent' },
    ],
  },
  {
    id: 'c-08', num: 8,
    title: 'Máy hạng nặng', location: 'Xưởng Thực Hành B · OCP1-Zone B',
    sessionDate: '23/06/2026', startTime: '08:00', endTime: '12:00',
    group: 'completed', present: 18, total: 20, exceptions: 3,
    attendees: [
      { name: 'Vũ Minh Giang',    contractor: 'ABC Construction', status: 'skipped' },
      { name: 'Nguyễn Văn Hoàng', contractor: 'XYZ JSC',          status: 'left-early' },
      { name: 'Lưu Đức Minh',     contractor: 'Minh Phát JSC',    status: 'completed' },
      { name: 'Bùi Văn Thanh',    contractor: 'Minh Phát JSC',    status: 'completed' },
      { name: 'Trần Minh Khang',  contractor: 'Sunrise Const.',   status: 'absent' },
    ],
  },
]

const GROUP_ORDER: CourseGroup[] = ['upcoming', 'active', 'completed']

const GROUPS: { key: CourseGroup; label: string; color: string; dotColor: string }[] = [
  { key: 'upcoming',  label: 'SẮP DIỄN RA',   color: 'text-blue-400',  dotColor: 'bg-blue-400'  },
  { key: 'active',    label: 'ĐANG DIỄN RA',  color: 'text-green-400', dotColor: 'bg-green-400' },
  { key: 'completed', label: 'ĐÃ HOÀN THÀNH', color: 'text-gray-400',  dotColor: 'bg-gray-400'  },
]

const TABS: { key: 'all' | CourseGroup; label: string }[] = [
  { key: 'all',       label: 'Tất cả'        },
  { key: 'upcoming',  label: 'Sắp diễn ra'  },
  { key: 'active',    label: 'Đang diễn ra'  },
  { key: 'completed', label: 'Đã hoàn thành' },
]

/** Fixed-width metric columns — flex layout prevents header wrap in narrow panel */
const COL_TG = 'w-[38px] shrink-0'
const COL_NCL = 'w-[24px] shrink-0'
const COL_STATUS = 'w-[74px] shrink-0'
const ATT_COLS = 'grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,88px)]'
const PREVIEW_COUNT = 4

function UpcomingBadge({ small }: { small?: boolean }) {
  return (
    <span className={cn(
      'font-bold rounded whitespace-nowrap inline-flex items-center',
      small ? 'text-[8px] px-1 py-0.5' : 'text-[9px] px-1.5 py-0.5',
      'text-blue-400 bg-blue-500/15',
    )}>
      Sắp diễn ra
    </span>
  )
}

function CourseStatusCell({ course }: { course: Course }) {
  if (course.group === 'upcoming') {
    return <UpcomingBadge small />
  }
  if (course.group === 'completed') {
    return (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap text-gray-400 bg-gray-500/15">
        Đã hoàn thành
      </span>
    )
  }
  return <SessionBadge courseEnd={course.endTime} small />
}

interface CourseRowProps {
  course: Course
  isOpen: boolean
  showAllAtt: boolean
  onToggle: () => void
  onToggleAttendees: () => void
  onNotify: () => void
}

function CourseRow({ course, isOpen, showAllAtt, onToggle, onToggleAttendees, onNotify }: CourseRowProps) {
  const visibleAttendees = showAllAtt
    ? course.attendees
    : course.attendees.slice(0, PREVIEW_COUNT)
  const extra = course.attendees.length - PREVIEW_COUNT
  const timeLabel = `${course.startTime} – ${course.endTime} · ${course.sessionDate}`

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onToggle() }}
        className={cn(
          'flex items-center gap-x-1.5 px-3 py-2 border-b border-[#1e2433]/60 cursor-pointer',
          'hover:bg-[#1a2235]/40 transition-colors',
          isOpen && 'bg-[#1a2235]/25',
        )}
      >
        <div className="flex-1 min-w-0 flex items-start gap-1.5 pl-0.5">
          {isOpen
            ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
            : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
          }
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className="text-[9px] font-bold text-muted-foreground/70 shrink-0 tabular-nums">
                {String(course.num).padStart(2, '0')}
              </span>
              <span className="text-[10px] font-semibold text-foreground truncate leading-snug">
                {course.title}
              </span>
            </div>
            <p className="text-[9px] text-muted-foreground/80 mt-0.5 truncate leading-snug">{timeLabel}</p>
            <p className="text-[8px] text-muted-foreground/50 truncate">{course.location}</p>
          </div>
        </div>

        <div className={cn(COL_TG, 'text-[10px] text-foreground tabular-nums text-right')}>
          {course.present !== undefined
            ? <span>{course.present}<span className="text-muted-foreground/50">/{course.total}</span></span>
            : <span className="text-muted-foreground">—<span className="text-muted-foreground/50">/{course.total}</span></span>
          }
        </div>

        <div className={cn(
          COL_NCL,
          'text-[10px] tabular-nums text-right font-medium',
          course.exceptions > 0 ? 'text-orange-400' : 'text-muted-foreground/50',
        )}>
          {course.exceptions}
        </div>

        <div className={cn(COL_STATUS, 'flex items-center justify-end')} onClick={e => e.stopPropagation()}>
          {course.action === 'notify' ? (
            <button
              onClick={onNotify}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 text-[8px] font-bold hover:bg-blue-500/25 transition-colors whitespace-nowrap"
            >
              <Bell className="w-2.5 h-2.5 shrink-0" />
              Thông báo
            </button>
          ) : (
            <CourseStatusCell course={course} />
          )}
        </div>
      </div>

      {isOpen && (
        <div className="bg-[#07090f] border-b border-[#1e2433]/60">
          <div className={cn('grid gap-x-2 px-3 pl-7 py-1.5 border-b border-[#1e2433]/30', ATT_COLS)}>
            {['Học viên', 'Nhà thầu', 'Điểm danh'].map(h => (
              <span key={h} className="text-[9px] font-semibold text-muted-foreground/50 uppercase tracking-wide">
                {h}
              </span>
            ))}
          </div>

          {visibleAttendees.map((att, i) => (
            <div
              key={`${att.name}-${i}`}
              className={cn(
                'grid gap-x-2 items-center px-3 pl-7 py-1.5 hover:bg-[#1a2235]/20 transition-colors',
                ATT_COLS,
              )}
            >
              <span className="text-[10px] text-foreground/90 truncate leading-snug">{att.name}</span>
              <span className="text-[10px] text-muted-foreground truncate leading-snug">{att.contractor}</span>
              <div className="flex justify-end">
                {course.group === 'upcoming' ? (
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded text-muted-foreground/60 bg-[#1a2235]">
                    Chưa bắt đầu
                  </span>
                ) : (
                  <StatusBadges badges={getAttendeeBadges(att)} small />
                )}
              </div>
            </div>
          ))}

          {extra > 0 && (
            <button
              onClick={onToggleAttendees}
              className="w-full flex items-center justify-center gap-1 py-1.5 text-[9px] text-primary/70 hover:text-primary hover:bg-primary/5 transition-colors border-t border-[#1e2433]/30"
            >
              {showAllAtt ? (
                <>
                  <ChevronDown className="w-2.5 h-2.5 rotate-180" />
                  Thu gọn
                </>
              ) : (
                <>
                  <ChevronDown className="w-2.5 h-2.5" />
                  + {extra} người khác
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function TrainingCourseAccordion() {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['active', 'upcoming', 'completed']),
  )
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set(['c-02']))
  const [expandedAttendees, setExpandedAttendees] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<'all' | CourseGroup>('all')
  const [trialVisible, setTrialVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showTrial() {
    setTrialVisible(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setTrialVisible(false), 2800)
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const toggleCourse = (id: string) => {
    setExpandedCourses(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAttendees = (id: string) => {
    setExpandedAttendees(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const filteredCourses = TRAINING_COURSES
    .filter(c => activeTab === 'all' || c.group === activeTab)
    .sort((a, b) => {
      const ga = GROUP_ORDER.indexOf(a.group)
      const gb = GROUP_ORDER.indexOf(b.group)
      return ga !== gb ? ga - gb : a.num - b.num
    })

  const tabCount = (key: 'all' | CourseGroup) =>
    key === 'all' ? TRAINING_COURSES.length : TRAINING_COURSES.filter(c => c.group === key).length

  const renderCourse = (course: Course) => (
    <CourseRow
      key={course.id}
      course={course}
      isOpen={expandedCourses.has(course.id)}
      showAllAtt={expandedAttendees.has(course.id)}
      onToggle={() => toggleCourse(course.id)}
      onToggleAttendees={() => toggleAttendees(course.id)}
      onNotify={showTrial}
    />
  )

  return (
    <>
      <div className="flex flex-col flex-1 min-h-0">
        {/* Filter tabs */}
        <div className="flex border-b border-[#1e2433] shrink-0 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                'px-2.5 py-2 text-[10px] font-medium whitespace-nowrap shrink-0 transition-colors border-b-2 -mb-px',
                activeTab === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
              <span className={cn(
                'ml-1 px-1 py-0.5 rounded-full text-[8px] font-bold tabular-nums',
                activeTab === t.key ? 'bg-primary/20 text-primary' : 'bg-[#1a2235] text-muted-foreground',
              )}>
                {tabCount(t.key)}
              </span>
            </button>
          ))}
        </div>

        {/* Column headers */}
        <div className="flex items-center gap-x-1.5 px-3 py-1.5 border-b border-[#1e2433] shrink-0 bg-[#0b0f1a]">
          <div className="flex-1 min-w-0 flex items-center gap-1.5 pl-0.5">
            <span className="w-3 shrink-0" aria-hidden />
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
              Khóa học
            </span>
          </div>
          <span className={cn(COL_TG, 'text-[8px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap text-right leading-none')}>
            Tham gia
          </span>
          <span className={cn(COL_NCL, 'text-[8px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap text-right leading-none')}>
            NCL
          </span>
          <span className={cn(COL_STATUS, 'text-[8px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap text-right leading-none')}>
            Trạng thái
          </span>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filteredCourses.length === 0 && (
            <div className="flex items-center justify-center h-20">
              <p className="text-[10px] text-muted-foreground">Không có khóa học</p>
            </div>
          )}

          {activeTab === 'all' ? (
            GROUPS.map(group => {
              const courses = filteredCourses.filter(c => c.group === group.key)
              if (courses.length === 0) return null
              const isGroupOpen = expandedGroups.has(group.key)

              return (
                <div key={group.key}>
                  <button
                    onClick={() => toggleGroup(group.key)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 bg-[#0b0f1a]/80 border-b border-[#1e2433]/40 hover:bg-[#1a2235]/40 transition-colors sticky top-0 z-[1]"
                  >
                    {isGroupOpen
                      ? <ChevronDown className={cn('w-3 h-3 shrink-0', group.color)} />
                      : <ChevronRight className={cn('w-3 h-3 shrink-0', group.color)} />
                    }
                    <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', group.dotColor)} />
                    <span className={cn('text-[9px] font-bold tracking-wide', group.color)}>{group.label}</span>
                    <span className="text-[9px] text-muted-foreground tabular-nums">({courses.length})</span>
                  </button>
                  {isGroupOpen && courses.map(renderCourse)}
                </div>
              )
            })
          ) : (
            filteredCourses.map(renderCourse)
          )}
        </div>
      </div>

      {/* Trial popup */}
      <div
        className={cn(
          'fixed inset-0 z-[200] flex items-center justify-center transition-all duration-300',
          trialVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        onClick={() => setTrialVisible(false)}
      >
        <div
          className={cn(
            'flex flex-col items-center gap-3 bg-[#1a2235] border border-[#2a3855] rounded-2xl px-8 py-6 shadow-2xl shadow-black/60 transition-transform duration-300',
            trialVisible ? 'scale-100' : 'scale-95',
          )}
          onClick={e => e.stopPropagation()}
        >
          <div className="w-10 h-10 rounded-full bg-yellow-500/15 flex items-center justify-center">
            <Lock className="w-5 h-5 text-yellow-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-foreground">Tính năng này không khả dụng ở bản dùng thử !!!</p>
          </div>
        </div>
      </div>
    </>
  )
}
