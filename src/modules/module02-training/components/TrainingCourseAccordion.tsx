import { useState } from 'react'
import { ChevronRight, ChevronDown, Bell } from 'lucide-react'
import { cn } from '@/utils/cn'
import { TrialLockPopup } from '@/components/common/TrialLock/TrialLockPopup'
import { useTrialLock } from '@/hooks/useTrialLock'
import {
  Avatar,
  SessionBadge,
  StatusBadges,
  TRAINING_ATTENDEES,
  attendanceStatusConfig,
  getAttendeeBadges,
  getAttendanceDetailLine,
} from './TrainingEventTable'
import { getAttendeeAvatarUrl } from '../data/trainingAvatars'
import { buildTrainingCourses, type TrainingCourseMock } from '../data/trainingMockData'
import { formatCourseMeta } from '../data/trainingCourseMeta'

type CourseGroup = 'upcoming' | 'active' | 'completed'

type Course = TrainingCourseMock

export const TRAINING_COURSES: Course[] = buildTrainingCourses(TRAINING_ATTENDEES)

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
/** Cùng layout cột với Sự kiện (không có cột Khoá học — đang ở trong accordion) */
const ATT_COLS = 'grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]'
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
  return <SessionBadge courseStart={course.startTime} courseEnd={course.endTime} small />
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
  const metaLabel = formatCourseMeta(course.startTime, course.endTime, course.sessionDate, course.zone)

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
            <p className="text-[10px] font-semibold text-foreground truncate leading-snug">
              {course.title}
            </p>
            <p className="text-[9px] text-muted-foreground/70 mt-0.5 truncate leading-snug">{metaLabel}</p>
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
          <div className={cn(
            'grid gap-x-2 px-3 pl-7 py-2 border-b border-[#1e2433]/30 sticky top-0 z-[1] bg-[#07090f]',
            ATT_COLS,
          )}>
            <div />
            {['Học viên', 'Nhà thầu', 'Điểm danh'].map(h => (
              <span key={h} className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">
                {h}
              </span>
            ))}
          </div>

          {visibleAttendees.map(att => {
            const badges = getAttendeeBadges(att)
            const primary = badges[0]
            const detail = getAttendanceDetailLine(att)
            return (
              <div
                key={att.id}
                className={cn(
                  'grid gap-x-2 items-center px-3 pl-7 py-2.5 hover:bg-[#1a2235]/20 transition-colors',
                  ATT_COLS,
                )}
              >
                <Avatar name={att.name} color={att.avatarColor} src={getAttendeeAvatarUrl(att.id)} size="sm" />

                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-foreground truncate leading-tight">{att.name}</p>
                  <p className="text-[9px] text-muted-foreground/60 truncate">{att.role}</p>
                </div>

                <div className="min-w-0" title={`${att.company} (${att.companyCode})`}>
                  <p className="text-[10px] text-primary/75 truncate leading-tight">{att.company}</p>
                  <p className="text-[8px] text-muted-foreground/40">{att.companyCode}</p>
                </div>

                <div className="min-w-0">
                  {course.group === 'upcoming' ? (
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded text-muted-foreground/60 bg-[#1a2235]">
                      Chưa bắt đầu
                    </span>
                  ) : (
                    <>
                      <StatusBadges badges={badges} small />
                      {detail && (
                        <p className={cn('text-[9px] mt-0.5 truncate', attendanceStatusConfig[primary].color + '/80')}>
                          {detail}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}

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
  const { visible: trialVisible, show: showTrial, dismiss: dismissTrial } = useTrialLock()

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
      return ga !== gb ? ga - gb : a.startTime.localeCompare(b.startTime)
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

      <TrialLockPopup visible={trialVisible} onDismiss={dismissTrial} />
    </>
  )
}
