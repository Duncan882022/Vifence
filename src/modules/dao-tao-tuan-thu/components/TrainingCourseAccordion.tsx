import { useState, useMemo } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'
import { TrialLockPopup } from '@/components/common/TrialLock/TrialLockPopup'
import { useTrialLock } from '@/hooks/useTrialLock'
import type { TrainingCourseMock } from '../data/trainingMockData'
import { COURSE_GROUP_ORDER } from '../services/trainingReport.service'
import {
  TrainingCourseListHeader,
  TrainingCourseListBody,
  TrainingCourseListRow,
} from './TrainingCourseListRow'
import { useCourses } from '../hooks/useCourses'
import { TRAINING_LIST_EMPTY_TEXT } from './trainingListStates'
import { TrainingFilterTabs } from './TrainingFilterTabs'
import dayjs from 'dayjs'

type CourseGroup = TrainingCourseMock['group']

type Course = TrainingCourseMock

const GROUPS: { key: CourseGroup; label: string; color: string; dotColor: string }[] = [
  { key: 'upcoming',  label: 'SẮP DIỄN RA',   color: 'text-blue-400',  dotColor: 'bg-blue-400'  },
  { key: 'cancelled', label: 'ĐÃ HUỶ',        color: 'text-red-400',   dotColor: 'bg-red-400'   },
  { key: 'active',    label: 'ĐANG DIỄN RA',  color: 'text-green-400', dotColor: 'bg-green-400' },
  { key: 'completed', label: 'ĐÃ HOÀN THÀNH', color: 'text-gray-400',  dotColor: 'bg-gray-400'  },
]

const TABS: { key: 'all' | CourseGroup; label: string }[] = [
  { key: 'all',       label: 'Tất cả'        },
  { key: 'upcoming',  label: 'Sắp diễn ra'  },
  { key: 'cancelled', label: 'Đã Huỷ'        },
  { key: 'active',    label: 'Đang diễn ra'  },
  { key: 'completed', label: 'Đã hoàn thành' },
]

export interface TrainingCourseAccordionProps {
  onPlayback?: (courseId: string, workerId: string, workerName: string, courseName: string) => void;
}

export function TrainingCourseAccordion({ onPlayback }: TrainingCourseAccordionProps = {}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['active', 'upcoming', 'cancelled', 'completed']),
  )
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set())
  const [expandedAttendees, setExpandedAttendees] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<'all' | CourseGroup>('all')
  const { visible: trialVisible, show: showTrial, dismiss: dismissTrial } = useTrialLock()

  const dateParams = useMemo(() => {
    const today = dayjs().format('YYYY-MM-DD')
    const startUtc = dayjs(today).subtract(7, 'hour').toISOString()
    const endUtc = dayjs(today).endOf('day').subtract(7, 'hour').toISOString()
    return {
      startDateFrom: startUtc,
      startDateTo: endUtc,
    }
  }, [])

  const { courses, status } = useCourses(dateParams)

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

  const filteredCourses = courses
    .filter(c => activeTab === 'all' || c.group === activeTab)
    .sort((a, b) => {
      const ga = COURSE_GROUP_ORDER.indexOf(a.group)
      const gb = COURSE_GROUP_ORDER.indexOf(b.group)
      return ga !== gb ? ga - gb : a.startTime.localeCompare(b.startTime)
    })

  const tabCount = (key: 'all' | CourseGroup) =>
    key === 'all' ? courses.length : courses.filter(c => c.group === key).length

  const renderCourse = (course: Course) => (
    <TrainingCourseListRow
      key={course.id}
      course={course}
      isOpen={expandedCourses.has(course.id)}
      showAllAtt={expandedAttendees.has(course.id)}
      onToggle={() => toggleCourse(course.id)}
      onToggleAttendees={() => toggleAttendees(course.id)}
      onNotify={showTrial}
      onPlayback={onPlayback}
    />
  )

  const isLoading = status === 'loading'
  const isEmpty = !isLoading && filteredCourses.length === 0

  return (
    <>
      <div className="flex flex-col flex-1 min-h-0">
        <TrainingFilterTabs
          tabs={TABS.map(t => ({ key: t.key, label: t.label, count: tabCount(t.key) }))}
          activeKey={activeTab}
          onChange={key => setActiveTab(key as typeof activeTab)}
        />

        <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
          <TrainingCourseListHeader />
          <TrainingCourseListBody
            isLoading={isLoading}
            isEmpty={isEmpty}
            emptyText={TRAINING_LIST_EMPTY_TEXT}
          >
            {activeTab === 'all' ? (
              GROUPS.map(group => {
                const groupCourses = filteredCourses.filter(c => c.group === group.key)
                if (groupCourses.length === 0) return null
                const isGroupOpen = expandedGroups.has(group.key)

                return (
                  <div key={group.key}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.key)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 bg-[#0b0f1a]/80 border-b border-[#1e2433]/40 hover:bg-[#1a2235]/40 transition-colors sticky top-0 z-[1]"
                    >
                      {isGroupOpen
                        ? <ChevronDown className={cn('w-3 h-3 shrink-0', group.color)} />
                        : <ChevronRight className={cn('w-3 h-3 shrink-0', group.color)} />
                      }
                      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', group.dotColor)} />
                      <span className={cn('text-[9px] font-bold tracking-wide', group.color)}>{group.label}</span>
                      <span className="text-[9px] text-muted-foreground tabular-nums">({groupCourses.length})</span>
                    </button>
                    {isGroupOpen && groupCourses.map(renderCourse)}
                  </div>
                )
              })
            ) : (
              filteredCourses.map(renderCourse)
            )}
          </TrainingCourseListBody>
        </div>
      </div>

      <TrialLockPopup visible={trialVisible} onDismiss={dismissTrial} />
    </>
  )
}
