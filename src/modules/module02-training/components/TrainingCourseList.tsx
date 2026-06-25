import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/utils/cn'
import { TrialLockPopup } from '@/components/common/TrialLock/TrialLockPopup'
import { useTrialLock } from '@/hooks/useTrialLock'
import type { TrainingCourseMock } from '../data/trainingMockData'
import { filterTrainingCourses, COURSE_GROUP_ORDER } from '../services/trainingReport.service'
import { TrainingCourseListHeader, TrainingCourseListRow } from './TrainingCourseListRow'

const GROUP_ORDER = COURSE_GROUP_ORDER

interface TrainingCourseListProps {
  courses: TrainingCourseMock[]
  showSearch?: boolean
  showCustomBadge?: boolean
  emptyMessage?: string
  className?: string
}

export function TrainingCourseList({
  courses,
  showSearch = true,
  showCustomBadge = false,
  emptyMessage = 'Không có khóa học',
  className,
}: TrainingCourseListProps) {
  const [search, setSearch] = useState('')
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set())
  const [expandedAttendees, setExpandedAttendees] = useState<Set<string>>(new Set())
  const { visible: trialVisible, show: showTrial, dismiss: dismissTrial } = useTrialLock()

  const filteredCourses = useMemo(() => {
    const matched = filterTrainingCourses(courses, search)
    return [...matched].sort((a, b) => {
      const ga = GROUP_ORDER.indexOf(a.group)
      const gb = GROUP_ORDER.indexOf(b.group)
      return ga !== gb ? ga - gb : a.startTime.localeCompare(b.startTime)
    })
  }, [courses, search])

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

  return (
    <>
      <div className={cn('flex flex-col', className)}>
        {showSearch && (
          <div className="px-3 py-2 border-b border-[#1e2433] shrink-0 space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Tìm khoá học, khu vực, vị trí..."
                className="w-full pl-8 pr-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-[11px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
            <p className="text-[10px] text-muted-foreground tabular-nums">
              {filteredCourses.length}/{courses.length} ca
              {search.trim() ? ' khớp tìm kiếm' : ' · gồm ca hệ thống và ca vừa tạo'}
            </p>
          </div>
        )}

        <TrainingCourseListHeader />

        {filteredCourses.length === 0 ? (
          <div className="flex items-center justify-center py-10 px-3">
            <p className="text-[10px] text-muted-foreground">{emptyMessage}</p>
          </div>
        ) : (
          filteredCourses.map(course => (
            <TrainingCourseListRow
              key={course.id}
              course={course}
              isOpen={expandedCourses.has(course.id)}
              showAllAtt={expandedAttendees.has(course.id)}
              onToggle={() => toggleCourse(course.id)}
              onToggleAttendees={() => toggleAttendees(course.id)}
              onNotify={showTrial}
              showCustomBadge={showCustomBadge}
            />
          ))
        )}
      </div>

      <TrialLockPopup visible={trialVisible} onDismiss={dismissTrial} />
    </>
  )
}
