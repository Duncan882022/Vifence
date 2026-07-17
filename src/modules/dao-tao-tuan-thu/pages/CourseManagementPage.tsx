import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, Loader2 } from 'lucide-react'
import { PageLayout, Panel } from '@/components/common/PageLayout/PageLayout'
import { useCourses } from '../hooks/useCourses'
import { TrainingCourseList } from '../components/TrainingCourseList'
import { AssignWorkersModal } from '../components/AssignWorkersModal'
import type { TrainingCourseMock } from '../data/trainingMockData'
import { createCourse, deleteCourse } from '@/api/course.api'

import dayjs from 'dayjs'

import { CourseWorkerPlaybackModal } from '@/components/common/CourseWorker/CourseWorkerPlaybackModal'

const ZONES = ['OCP2'] as const
type CourseZone = typeof ZONES[number]

interface FormState {
  title: string
  zone: CourseZone
  sessionDate: string
  startTime: string
  endTime: string
  total: string
}

const INITIAL_FORM = (): FormState => ({
  title: '',
  zone: 'OCP2',
  sessionDate: dayjs().format('YYYY-MM-DD'),
  startTime: '08:00',
  endTime: '12:00',
  total: '20',
})

export function CourseManagementPage() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM())
  const [editId, setEditId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [assignModal, setAssignModal] = useState<{ id: string, title: string } | null>(null)
  const [workerPlaybackOpen, setWorkerPlaybackOpen] = useState(false)
  const [playbackContext, setPlaybackContext] = useState<{
    courseId: string
    workerId: string
    workerName: string
    courseName: string
  } | null>(null)

  const { courses, refetch: refreshCourses } = useCourses()

  useEffect(() => {
    void refreshCourses()
  }, [refreshCourses])

  const handleStartEdit = (course: TrainingCourseMock) => {
    setEditId(course.id)
    setError(null)
    setSaved(false)
    
    // Parse YYYY-MM-DD from course.sessionDate which is in DD/MM/YYYY format
    let dateVal = dayjs().format('YYYY-MM-DD')
    if (course.sessionDate) {
      const parts = course.sessionDate.split('/')
      if (parts.length === 3) {
        dateVal = `${parts[2]}-${parts[1]}-${parts[0]}`
      } else if (course.sessionDate.includes('-')) {
        dateVal = course.sessionDate
      }
    }

    setForm({
      title: course.title,
      zone: (course.zone as CourseZone) || 'OCP2',
      sessionDate: dateVal,
      startTime: course.startTime || '08:00',
      endTime: course.endTime || '12:00',
      total: String(course.total || 20),
    })
  }

  const handleCancelEdit = () => {
    setEditId(null)
    setForm(INITIAL_FORM())
    setError(null)
    setSaved(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaved(false)
    setError(null)

    if (!form.title.trim()) {
      setError('Vui lòng nhập tên khoá học')
      return
    }
    const total = Number(form.total)
    if (!Number.isFinite(total) || total < 1) {
      setError('Số học viên dự kiến phải ≥ 1')
      return
    }

    setIsSubmitting(true)
    try {
      if (editId) {
        // Cập nhật khoá học
        const { updateCourse } = await import('@/api/course.api')
        await updateCourse(editId, {
          name: form.title.trim(),
          zone: form.zone || null,
          startDate: form.sessionDate || null,
          startTime: form.startTime
            ? `${form.sessionDate}T${form.startTime}:00+07:00`
            : null,
          endTime: form.endTime
            ? `${form.sessionDate}T${form.endTime}:00+07:00`
            : null,
          expectedAttendees: Number(form.total) || 0,
        })
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
        setEditId(null)
        setForm(INITIAL_FORM())
      } else {
        // Gọi POST /api/v1/courses
        await createCourse({
          name: form.title.trim(),
          // code tự sinh từ tên: bỏ dấu + viết hoa + replace space bằng -
          code: form.title.trim()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '-')
            .slice(0, 50) + '-' + Date.now().toString().slice(-6),
          status: 'inactive',
          description: null,
          // Combine sessionDate + startTime / endTime thành ISO datetime
          startDate: form.sessionDate || null,
          startTime: form.startTime
            ? `${form.sessionDate}T${form.startTime}:00+07:00`
            : null,
          endTime: form.endTime
            ? `${form.sessionDate}T${form.endTime}:00+07:00`
            : null,
          zone: form.zone || null,
          expectedAttendees: Number(form.total) || 0,
        })
        setForm({ ...INITIAL_FORM(), sessionDate: form.sessionDate })
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      }

      // Refresh danh sách từ API
      await refreshCourses()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi kết nối API'
      setError(`Không thể lưu khóa học: ${msg}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteCourse = async (id: string) => {
    if (!window.confirm('Bạn có chắc muốn xoá khoá học này?')) return
    try {
      await deleteCourse(id)
      if (editId === id) {
        handleCancelEdit()
      }
      await refreshCourses()
    } catch (err) {
      alert('Xoá thất bại')
      console.error(err)
    }
  }

  return (
    <PageLayout scrollable>
      <div className="flex items-center gap-3 shrink-0">
        <Link
          to="/dttt"
          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Về giám sát
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-3 shrink-0 items-start">
        <Panel title={editId ? 'Sửa khoá học' : 'Tạo khoá học'} fit noPadding className="shrink-0 self-start xl:sticky xl:top-4 w-full">
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
                onChange={e => setForm(f => ({ ...f, zone: e.target.value as CourseZone }))}
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
            {saved && <p className="text-[11px] text-green-400">{editId ? 'Đã cập nhật khoá học' : 'Đã tạo khoá học mới'}</p>}

            <div className="flex gap-2">
              {editId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-3 py-2.5 rounded-lg border border-[#1e2433] text-muted-foreground text-sm font-semibold hover:bg-[#1a2235] transition-colors"
                >
                  Huỷ
                </button>
              )}
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:pointer-events-none"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {isSubmitting ? 'Đang lưu...' : editId ? 'Lưu thay đổi' : 'Tạo khoá học'}
              </button>
            </div>
          </form>
        </Panel>

        <Panel
          title="Danh sách khoá học"
          noPadding
          fit
          className="min-h-[320px] sm:min-h-[420px]"
        >
          <TrainingCourseList
            courses={courses}
            showCustomBadge
            emptyMessage="Không tìm thấy khoá học phù hợp"
            onAssignWorkers={(id, title) => setAssignModal({ id, title })}
            onDeleteCourse={handleDeleteCourse}
            onEditCourse={handleStartEdit}
            onPlayback={(courseId, workerId, workerName, courseName) => {
              setPlaybackContext({ courseId, workerId, workerName, courseName })
              setWorkerPlaybackOpen(true)
            }}
          />
        </Panel>
      </div>

      {assignModal && (
        <AssignWorkersModal
          courseId={assignModal.id}
          courseTitle={assignModal.title}
          onClose={() => setAssignModal(null)}
          onSuccess={() => {
            // Optional: refresh courses if attendee count in list needs to update
            void refreshCourses()
          }}
        />
      )}

      {workerPlaybackOpen && playbackContext && (
        <CourseWorkerPlaybackModal
          courseId={playbackContext.courseId}
          workerId={playbackContext.workerId}
          workerName={playbackContext.workerName}
          courseName={playbackContext.courseName}
          onClose={() => {
            setWorkerPlaybackOpen(false)
            setPlaybackContext(null)
          }}
        />
      )}
    </PageLayout>
  )
}
