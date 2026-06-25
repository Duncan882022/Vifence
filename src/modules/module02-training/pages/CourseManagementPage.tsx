import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus } from 'lucide-react'
import { PageLayout, Panel } from '@/components/common/PageLayout/PageLayout'
import { useTrainingCourseStore } from '@/store/trainingCourse.store'
import { getAllTrainingCourses } from '../services/trainingReport.service'
import { getTrainingLocationsByZone, defaultTrainingLocation } from '../data/trainingCameras'
import { TrainingCourseList } from '../components/TrainingCourseList'
import type { TrainingCourseMock } from '../data/trainingMockData'

const ZONES: TrainingCourseMock['zone'][] = ['OCP1-A', 'OCP1-B']

interface FormState {
  title: string
  zone: TrainingCourseMock['zone']
  location: string
  sessionDate: string
  startTime: string
  endTime: string
  total: string
}

const INITIAL_FORM: FormState = {
  title: '',
  zone: 'OCP1-A',
  location: defaultTrainingLocation('OCP1-A'),
  sessionDate: '2026-06-25',
  startTime: '08:00',
  endTime: '12:00',
  total: '20',
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

  const locationOptions = useMemo(
    () => getTrainingLocationsByZone(form.zone),
    [form.zone],
  )

  const handleZoneChange = (zone: TrainingCourseMock['zone']) => {
    const locations = getTrainingLocationsByZone(zone)
    setForm(f => ({
      ...f,
      zone,
      location: locations.includes(f.location)
        ? f.location
        : defaultTrainingLocation(zone),
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSaved(false)
    if (!form.title.trim()) {
      setError('Vui lòng nhập tên khoá học')
      return
    }
    if (!form.location) {
      setError('Vui lòng chọn vị trí')
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
      location: form.location,
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
    <PageLayout scrollable>
      <div className="flex items-center gap-3 shrink-0">
        <Link
          to="/module02"
          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Về giám sát
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-3 shrink-0 items-start">
        <Panel title="Tạo khoá học" fit noPadding className="shrink-0 self-start xl:sticky xl:top-4 w-full">
          <form onSubmit={handleSubmit} className="space-y-3 p-4 max-h-[calc(100dvh-10rem)] overflow-y-auto overscroll-y-contain">
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
                onChange={e => handleZoneChange(e.target.value as TrainingCourseMock['zone'])}
                className="w-full px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
              >
                {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Vị trí <span className="text-red-400">*</span>
              </span>
              <select
                id="course-location"
                required
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
              >
                {locationOptions.length === 0 ? (
                  <option value="">— Chọn khu vực trước —</option>
                ) : (
                  locationOptions.map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))
                )}
              </select>
              <p className="text-[9px] text-muted-foreground/50">
                Phòng / khu đào tạo thuộc {form.zone}
              </p>
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
          fit
          className="min-h-[320px] sm:min-h-[420px]"
        >
          <TrainingCourseList
            courses={allCourses}
            showCustomBadge
            emptyMessage="Không tìm thấy khoá học phù hợp"
          />
        </Panel>
      </div>
    </PageLayout>
  )
}
