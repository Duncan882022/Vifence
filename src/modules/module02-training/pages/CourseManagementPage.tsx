import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, BookOpen } from 'lucide-react'
import { PageLayout, Panel } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import { useTrainingCourseStore } from '@/store/trainingCourse.store'
import {
  getAllTrainingCourses,
  groupLabel,
} from '../services/trainingReport.service'
import { formatCourseMeta } from '../data/trainingCourseMeta'
import type { TrainingCourseMock } from '../data/trainingMockData'

const ZONES: TrainingCourseMock['zone'][] = ['OCP1-A', 'OCP1-B']

const GROUP_STYLE: Record<TrainingCourseMock['group'], string> = {
  upcoming: 'text-blue-400 bg-blue-500/15',
  active: 'text-green-400 bg-green-500/15',
  completed: 'text-gray-400 bg-gray-500/15',
}

interface FormState {
  title: string
  zone: TrainingCourseMock['zone']
  sessionDate: string
  startTime: string
  endTime: string
  total: string
}

const INITIAL_FORM: FormState = {
  title: '',
  zone: 'OCP1-A',
  sessionDate: '2026-06-25',
  startTime: '08:00',
  endTime: '12:00',
  total: '20',
}

function displayDate(sessionDate: string): string {
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(sessionDate)) return sessionDate
  const [y, m, d] = sessionDate.split('-')
  return y && m && d ? `${d}/${m}/${y}` : sessionDate
}

export function CourseManagementPage() {
  const customCourses = useTrainingCourseStore(s => s.customCourses)
  const addCourse = useTrainingCourseStore(s => s.addCourse)
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const allCourses = useMemo(
    () => getAllTrainingCourses(customCourses),
    [customCourses],
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSaved(false)
    if (!form.title.trim()) {
      setError('Vui lòng nhập tên khoá học')
      return
    }
    const total = Number(form.total)
    if (!Number.isFinite(total) || total < 1) {
      setError('Số học viên dự kiến phải ≥ 1')
      return
    }
    const [y, m, d] = form.sessionDate.split('-')
    addCourse({
      title: form.title.trim(),
      zone: form.zone,
      sessionDate: `${d}/${m}/${y}`,
      startTime: form.startTime,
      endTime: form.endTime,
      total,
    })
    setForm({ ...INITIAL_FORM, sessionDate: form.sessionDate })
    setError(null)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <PageLayout>
      <div className="flex items-center gap-3 shrink-0">
        <Link
          to="/module02"
          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Về giám sát
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-3 min-h-0 flex-1">
        <Panel title="Tạo khoá học" className="shrink-0 xl:h-fit">
          <form onSubmit={handleSubmit} className="space-y-3 p-1">
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Tên khoá học
              </span>
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="VD: An toàn điện cơ"
                className="w-full px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Khu vực
              </span>
              <select
                value={form.zone}
                onChange={e => setForm(f => ({ ...f, zone: e.target.value as TrainingCourseMock['zone'] }))}
                className="w-full px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
              >
                {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Ngày diễn ra
              </span>
              <input
                type="date"
                value={form.sessionDate}
                onChange={e => setForm(f => ({ ...f, sessionDate: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Bắt đầu
                </span>
                <input
                  type="time"
                  value={form.startTime}
                  onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Kết thúc
                </span>
                <input
                  type="time"
                  value={form.endTime}
                  onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </label>
            </div>

            <label className="block space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Số học viên dự kiến
              </span>
              <input
                type="number"
                min={1}
                value={form.total}
                onChange={e => setForm(f => ({ ...f, total: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </label>

            {error && <p className="text-[11px] text-red-400">{error}</p>}
            {saved && <p className="text-[11px] text-green-400">Đã tạo khoá học mới</p>}

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Tạo khoá học
            </button>
          </form>
        </Panel>

        <Panel
          title="Danh sách khoá học"
          noPadding
          className="flex-1 min-h-[320px] sm:min-h-[420px] flex flex-col"
        >
          <div className="px-3 py-2 border-b border-[#1e2433] shrink-0">
            <p className="text-[10px] text-muted-foreground">
              {allCourses.length} ca · gồm ca hệ thống và ca vừa tạo
            </p>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-[#1e2433]">
            {allCourses.map(course => (
              <div key={course.id} className="px-3 py-3 flex items-start gap-3 hover:bg-[#1a2235]/30 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <BookOpen className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[11px] font-semibold text-foreground">{course.title}</p>
                    <span className={cn(
                      'text-[8px] font-bold px-1.5 py-0.5 rounded',
                      GROUP_STYLE[course.group],
                    )}>
                      {groupLabel(course.group)}
                    </span>
                    {course.id.startsWith('custom-') && (
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                        Mới tạo
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {formatCourseMeta(course.startTime, course.endTime, displayDate(course.sessionDate), course.zone)}
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 mt-1 tabular-nums">
                    {course.group === 'upcoming'
                      ? `Đăng ký ${course.total} học viên`
                      : `${course.present ?? 0}/${course.total} có mặt · ${course.exceptions} ngoại lệ`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </PageLayout>
  )
}
