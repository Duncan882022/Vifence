import { ChevronRight, ChevronDown, Bell } from 'lucide-react'
import { cn } from '@/utils/cn'
import {
  Avatar,
  SessionBadge,
  StatusBadges,
  attendanceStatusConfig,
  getAttendeeBadges,
  getAttendanceDetailLine,
} from './TrainingEventTable'
import { getAttendeeAvatarUrl } from '../data/trainingAvatars'
import { formatCourseMeta } from '../data/trainingCourseMeta'
import { resolveCourseLocation } from '../data/trainingCameras'
import type { TrainingCourseMock } from '../data/trainingMockData'

export const COL_TG = 'w-[38px] shrink-0'
export const COL_NCL = 'w-[24px] shrink-0'
export const COL_STATUS = 'w-[74px] shrink-0'
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

function CourseStatusCell({ course }: { course: TrainingCourseMock }) {
  if (course.group === 'upcoming') {
    return <UpcomingBadge small />
  }
  if (course.group === 'cancelled') {
    return (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap text-red-400 bg-red-500/15">
        Huỷ
      </span>
    )
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

export function TrainingCourseListHeader() {
  return (
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
  )
}

export interface TrainingCourseListRowProps {
  course: TrainingCourseMock
  isOpen: boolean
  showAllAtt: boolean
  onToggle: () => void
  onToggleAttendees: () => void
  onNotify: () => void
  showCustomBadge?: boolean
}

export function TrainingCourseListRow({
  course,
  isOpen,
  showAllAtt,
  onToggle,
  onToggleAttendees,
  onNotify,
  showCustomBadge = false,
}: TrainingCourseListRowProps) {
  const visibleAttendees = showAllAtt
    ? course.attendees
    : course.attendees.slice(0, PREVIEW_COUNT)
  const extra = course.attendees.length - PREVIEW_COUNT
  const location = resolveCourseLocation(course.title, course.zone, course.location)
  const metaLabel = formatCourseMeta(
    course.startTime,
    course.endTime,
    course.sessionDate,
    course.zone,
    location,
  )

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
              {showCustomBadge && course.id.startsWith('custom-') && (
                <span className="ml-1.5 text-[8px] font-bold px-1 py-0.5 rounded bg-primary/15 text-primary align-middle">
                  Mới tạo
                </span>
              )}
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
              type="button"
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
          {course.attendees.length === 0 ? (
            <p className="px-3 pl-7 py-3 text-[10px] text-muted-foreground/60">
              {course.group === 'cancelled'
                ? 'Ca đã huỷ — không có học viên'
                : 'Chưa có học viên đăng ký'}
            </p>
          ) : (
            <>
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
                      ) : course.group === 'cancelled' ? (
                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded text-red-400/80 bg-red-500/10">
                          Đã huỷ
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
                  type="button"
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
            </>
          )}
        </div>
      )}
    </div>
  )
}
