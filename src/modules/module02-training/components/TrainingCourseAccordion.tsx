import { useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'
import { TrialLockPopup } from '@/components/common/TrialLock/TrialLockPopup'
import { useTrialLock } from '@/hooks/useTrialLock'
import { TRAINING_ATTENDEES } from './TrainingEventTable'
import { buildTrainingCourses, type TrainingCourseMock } from '../data/trainingMockData'
import { TrainingCourseListHeader, TrainingCourseListRow } from './TrainingCourseListRow'

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
    <TrainingCourseListRow
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

        <TrainingCourseListHeader />

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
