import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PageLayout, Panel } from '@/components/common/PageLayout/PageLayout'
import { useShellLayout } from '@/hooks/useShellLayout'
import { TrainingCameraPanel } from '../components/TrainingCameraPanel'
import type { CameraWithWorker } from '../components/TrainingCameraPanel'
import { CameraPlaybackPanel } from '@/components/common/CameraPlayback'
import {
  filterCamerasByLocation,
  getLocationFilterTabs,
  groupCamerasByLocation,
} from '@/utils/cameraPlaybackUi'
import {
  fetchDtttPlaybackDetections,
  fetchDtttPlaybackRecords,
  mapDtttCamerasToTraining,
} from '../services/dtttPlayback.service'
import { CameraModeToggle, type CameraViewMode } from '../components/CameraModeToggle'
import { TrainingEventTable } from '../components/TrainingEventTable'
import { useCourseStore } from '../store/courseStore'
import { TrainingCourseAccordion } from '../components/TrainingCourseAccordion'
import { TrainingDailyDashboard } from '../components/TrainingDailyDashboard'
import { TrainingDailyDetailDashboard } from '../components/TrainingDailyDetailDashboard'
import { TierCollapseButton } from '../components/TierCollapseButton'
import { Tier1CollapsedSummary } from '../components/Tier1CollapsedSummary'
import { CourseWorkerPlaybackModal } from '@/components/common/CourseWorker/CourseWorkerPlaybackModal'
import { computeTrainingDailySummary } from '../services/trainingKpi.service'
import { cn } from '@/utils/cn'
import { useCameras } from '../hooks/useCameras'

import { fetchCourseWorkersAttendance, fetchCourses } from '@/api/course.api'
import { adaptApiCourses } from '../services/courseAdapter'
import {
  IS_GHPAGES,
  getGhpagesDemoAttendees,
  getGhpagesDemoCourses,
} from '../services/ghpagesDemo.service'

export function DTTTDashboardPage() {
  const [selectedCamId, setSelectedCamId] = useState<string | undefined>()
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>()
  const [coursesOpen, setCoursesOpen] = useState(true)
  const [tier1Open, setTier1Open] = useState(true)
  const [tier2Open, setTier2Open] = useState(true)
  const [activeStreamCount, setActiveStreamCount] = useState(2)
  const [cameraMode, setCameraMode] = useState<CameraViewMode>('live')

  // State phục vụ CourseWorkerPlaybackModal
  const [workerPlaybackOpen, setWorkerPlaybackOpen] = useState(false)
  const [playbackContext, setPlaybackContext] = useState<{
    courseId: string
    workerId: string
    workerName: string
    courseName: string
  } | null>(null)
  const { cameras } = useCameras()
  const playbackCameras = useMemo(() => mapDtttCamerasToTraining(cameras), [cameras])
  const playbackFilterTabs = useMemo(() => getLocationFilterTabs(playbackCameras), [playbackCameras])
  const { isDesktop } = useShellLayout()
  const showCourses = coursesOpen || !isDesktop

  // Fetch only today's courses for the main dashboard page
  const { courses, refetch } = useCourseStore()
  const [workers, setWorkers] = useState<any[]>([])

  // State riêng cho dữ liệu ngày hôm qua (phục vụ so sánh delta)
  const [yesterdayCourses, setYesterdayCourses] = useState<any[]>([])
  const [yesterdayWorkers, setYesterdayWorkers] = useState<any[]>([])

  // Helper dùng chung để map API status → frontend status
  const mapAttendanceStatus = (apiStatus: string): string => {
    const s = apiStatus.toLowerCase()
    if (s === 'completed')   return 'completed'
    if (s === 'insufficient') return 'insufficient'
    if (s === 'attending')   return 'attending'
    if (s === 'away')        return 'away'
    if (s === 'late')        return 'late'
    if (s === 'early_leave') return 'left-early'
    if (s === 'skip')        return 'skipped'
    return 'absent'
  }

  // Helper format giờ từ ISO
  const formatTimeOnly = (iso: string | null): string => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  // Helper map danh sách course-workers API → TrainingAttendee[]
  const mapCourseWorkersToAttendees = (items: any[], courseIdSet?: Set<string>): any[] => {
    return items
      .filter((item: any) => !courseIdSet || courseIdSet.has(item.courseId))
      .map((item: any) => {
        const w = item.worker
        const c = item.course
        const statusVal = mapAttendanceStatus(item.attendanceStatus || '')
        const checkInStr = formatTimeOnly(item.firstSeenAt)
        const checkOutStr = formatTimeOnly(item.lastSeenAt)
        const actualTimeStr = checkInStr && checkOutStr ? `${checkInStr}–${checkOutStr}` : '—'
        const historyRecord: any = {
          id: item.courseId,
          courseCode: 'COURSE_CODE',
          courseName: c?.name || 'Khóa học',
          sessionDate: c?.startDate
            ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(c.startDate))
            : '',
          startTime: formatTimeOnly(c?.startTime),
          endTime: formatTimeOnly(c?.endTime),
          zone: c?.zone || 'OCP1-A',
          status: statusVal,
          sessions: item.firstSeenAt ? [{ in: checkInStr, out: checkOutStr || null }] : [],
          flags: !['completed', 'absent', 'attending'].includes(statusVal) ? [statusVal] : [],
        }
        return {
          id: item.id,
          workerId: w?.id || item.workerId,
          employeeCode: (w?.id || item.workerId).substring(0, 8),
          name: w?.name || 'Học viên',
          avatarColor: '#3B82F6',
          avatarUrl: w?.faceFrontUrl || w?.faceLeftUrl || w?.faceRightUrl || undefined,
          company: w?.contractor?.name || 'Chưa gán',
          companyCode: w?.contractor?.code || '—',
          role: w?.phone || 'Chưa rõ',
          currentStatus: statusVal,
          currentCourse: c?.name || 'Khóa học',
          courseDate: c?.startDate
            ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit' }).format(new Date(c.startDate))
            : '',
          courseStart: formatTimeOnly(c?.startTime),
          courseEnd: formatTimeOnly(c?.endTime),
          actualTime: actualTimeStr,
          exceptionMinutes: (item.lateMinutes || 0) + (item.earlyLeaveMinutes || 0),
          courseHistory: [historyRecord],
        }
      })
  }

  // ── Fetch hôm nay ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (IS_GHPAGES) {
      void refetch()
      return
    }
    import('dayjs').then(({ default: dayjs }) => {
      const today = dayjs().format('YYYY-MM-DD')
      const startUtc = dayjs(today).subtract(7, 'hour').toISOString()
      const endUtc = dayjs(today).endOf('day').subtract(7, 'hour').toISOString()
      void refetch({ startDateFrom: startUtc, startDateTo: endUtc })
    })
  }, [refetch])

  useEffect(() => {
    if (IS_GHPAGES) {
      setWorkers(getGhpagesDemoAttendees('24/06'))
      return
    }
    if (!courses || courses.length === 0) { setWorkers([]); return }
    import('dayjs').then(({ default: dayjs }) => {
      const today = dayjs().format('YYYY-MM-DD')
      const startUtc = dayjs(today).subtract(7, 'hour').toISOString()
      const endUtc = dayjs(today).endOf('day').subtract(7, 'hour').toISOString()
      const todayCourseIds = new Set(courses.map((c: any) => c.id))
      fetchCourseWorkersAttendance({ limit: 2000, startDateFrom: startUtc, startDateTo: endUtc })
        .then((res) => {
          if (!res?.items) return
          setWorkers(mapCourseWorkersToAttendees(res.items, todayCourseIds))
        })
        .catch((err) => console.error('Lỗi fetch course-workers today:', err))
    })
  }, [courses])

  // ── Fetch hôm qua (để tính delta so sánh) ──────────────────────────────────
  useEffect(() => {
    if (IS_GHPAGES) {
      const demoCourses = getGhpagesDemoCourses()
      setYesterdayCourses(demoCourses.filter(c => c.sessionDate === '23/06/2026'))
      setYesterdayWorkers(getGhpagesDemoAttendees('23/06'))
      return
    }
    import('dayjs').then(({ default: dayjs }) => {
      const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD')
      const startUtc = dayjs(yesterday).subtract(7, 'hour').toISOString()
      const endUtc = dayjs(yesterday).endOf('day').subtract(7, 'hour').toISOString()

      // Fetch courses hôm qua song song với workers hôm qua
      Promise.all([
        fetchCourses({ limit: 200, startDateFrom: startUtc, startDateTo: endUtc }),
        fetchCourseWorkersAttendance({ limit: 2000, startDateFrom: startUtc, startDateTo: endUtc }),
      ])
        .then(([coursesRes, workersRes]) => {
          const adaptedCourses = adaptApiCourses(coursesRes.items)
          setYesterdayCourses(adaptedCourses)
          const yCourseIds = new Set(adaptedCourses.map((c: any) => c.id))
          setYesterdayWorkers(mapCourseWorkersToAttendees(workersRes.items ?? [], yCourseIds))
        })
        .catch((err) => console.error('Lỗi fetch dữ liệu hôm qua:', err))
    })
  }, [])

  // Tính toán KPIs từ workers đã lọc (chỉ thuộc khóa học hôm nay) + danh sách courses hôm nay
  // Truyền thêm yesterdayCourses + yesterdayWorkers để delta so sánh chính xác từ API thật
  const todayStr = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date())
  const displaySummary = computeTrainingDailySummary(workers, courses, todayStr, yesterdayWorkers, yesterdayCourses)
  const cameraPanelLabel = cameraMode === 'live' ? 'Camera' : 'Playback'

  return (
    <>
      <PageLayout>
        <Panel
          title="Tổng Quan"
          fit
          expandable={tier1Open}
          noPadding
          className="shrink-0"
          expandedContent={
            <TrainingDailyDetailDashboard summary={displaySummary} courses={courses} />
          }
          headerRight={
            <div className="flex items-center gap-1 min-w-0 flex-1 justify-end">
              {!tier1Open && (
                <Tier1CollapsedSummary summary={displaySummary} className="flex-1 min-w-0" />
              )}
              <TierCollapseButton
                open={tier1Open}
                onToggle={() => setTier1Open(open => !open)}
                label="Tổng Quan"
              />
            </div>
          }
        >
          {tier1Open && (
            <div className="p-2 sm:p-3 max-lg:overflow-x-hidden">
              <TrainingDailyDashboard summary={displaySummary} embedded />
            </div>
          )}
        </Panel>

        <div className={cn(
          'flex flex-col gap-3',
          'max-lg:flex-none',
          'lg:flex-1 lg:min-h-0 lg:overflow-hidden',
        )}>
          <div className={cn(
            'flex flex-col min-h-0',
            tier2Open
              ? cn(
                  'lg:flex-[11] max-lg:flex-none',
                  cameraMode === 'playback' && 'lg:flex-[13]',
                )
              : 'shrink-0',
          )}>
            <Panel
              title={cameraPanelLabel}
              expandable={tier2Open}
              fit={!tier2Open}
              noPadding
              className={cn(
                tier2Open && 'lg:flex-1 lg:min-h-0',
                tier2Open && cameraMode === 'live' && 'max-lg:!h-auto max-lg:overflow-visible max-lg:[&>div:last-child]:!h-auto max-lg:[&>div:last-child]:flex-none max-lg:[&>div:last-child]:overflow-visible',
                tier2Open && cameraMode === 'playback' && 'max-lg:!h-auto max-lg:overflow-visible max-lg:[&>div:last-child]:!h-auto max-lg:[&>div:last-child]:flex-none max-lg:[&>div:last-child]:overflow-visible',
                !tier2Open && 'max-lg:!h-auto max-lg:min-h-0',
              )}
              headerRight={
                <div className="flex items-center gap-2 min-w-0">
                  <CameraModeToggle
                    mode={cameraMode}
                    onChange={setCameraMode}
                  />

                  {!tier2Open && (
                    <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                      <span className="text-primary font-semibold">{activeStreamCount}</span> luồng
                    </span>
                  )}
                  <TierCollapseButton
                    open={tier2Open}
                    onToggle={() => setTier2Open(open => !open)}
                    label={cameraPanelLabel}
                  />
                </div>
              }
            >
              {tier2Open && (
                <div className={cn(
                  'flex flex-col flex-1 min-h-0 h-full w-full max-lg:min-h-0',
                  cameraMode === 'live' && 'max-lg:h-auto max-lg:flex-none',
                  cameraMode === 'playback' && 'max-lg:h-auto max-lg:flex-none',
                )}>
                  {cameraMode === 'live' ? (
                    <TrainingCameraPanel
                      selectedId={selectedCamId}
                      onSelectCamera={(cam: CameraWithWorker) => setSelectedCamId(cam.id)}
                      onStreamCountChange={setActiveStreamCount}
                    />
                  ) : (
                    <CameraPlaybackPanel
                      cameras={playbackCameras}
                      selectedCameraId={selectedCamId}
                      onSelectCamera={cam => setSelectedCamId(cam.id)}
                      filterTabs={playbackFilterTabs}
                      filterFn={tab => filterCamerasByLocation(playbackCameras, tab)}
                      groupFn={groupCamerasByLocation}
                      fetchRecords={fetchDtttPlaybackRecords}
                      fetchDetections={fetchDtttPlaybackDetections}
                    />
                  )}
                </div>
              )}
            </Panel>
          </div>

          <div className={cn(
            'flex flex-col lg:flex-row gap-3 min-h-0',
            'max-lg:flex-none',
            tier2Open
              ? cn('lg:flex-[9]', cameraMode === 'playback' && 'lg:flex-[7]')
              : 'lg:flex-1',
          )}>
            {showCourses && (
              <div className="w-full lg:flex-[42] min-w-0 min-h-0 max-lg:landscape:min-h-[240px] lg:min-h-0 flex flex-col gap-3">
                <Panel title="Khóa Học" expandable noPadding className="flex-1 min-h-0 max-lg:portrait:flex-none max-lg:portrait:!h-auto">
                  <TrainingCourseAccordion />
                </Panel>
              </div>
            )}

            <div className="hidden lg:flex items-center justify-center w-3 shrink-0">
              <button
                onClick={() => setCoursesOpen(c => !c)}
                className="h-10 w-3 flex items-center justify-center rounded text-muted-foreground/50 hover:text-foreground hover:bg-[#1a2235] transition-colors border border-[#1e2433]/60"
                title={coursesOpen ? 'Thu gọn Khóa Học' : 'Mở rộng Khóa Học'}
              >
                {coursesOpen
                  ? <ChevronLeft className="w-2.5 h-2.5" />
                  : <ChevronRight className="w-2.5 h-2.5" />
                }
              </button>
            </div>

            <div className="w-full lg:flex-[58] min-w-0 min-h-[320px] lg:min-h-0 flex flex-col">
              <Panel title="Sự Kiện Đào Tạo" expandable noPadding className="flex-1 min-h-0">
                <TrainingEventTable
                  selectedId={selectedEventId}
                  onSelectEvent={ev => setSelectedEventId(ev.id)}
                  onPlayback={(ev) => {
                    const segments = ev.id.split("-");
                    const workerId = ev.workerId || (segments.length >= 10 ? segments.slice(0, 5).join("-") : segments[0]);
                    const courseId = (ev as any).courseId || (segments.length >= 10 ? segments.slice(5).join("-") : segments[1]);
                    setPlaybackContext({
                      courseId,
                      workerId,
                      workerName: ev.workerName,
                      courseName: ev.course
                    })
                    setWorkerPlaybackOpen(true)
                  }}
                />
              </Panel>
            </div>
          </div>
        </div>
      </PageLayout>

      {/* CourseWorker Playback Modal */}
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
    </>
  )
}
