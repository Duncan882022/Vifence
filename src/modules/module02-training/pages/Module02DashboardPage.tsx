import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PageLayout, Panel } from '@/components/common/PageLayout/PageLayout'
import { useShellLayout } from '@/hooks/useShellLayout'
import { TrainingCameraPanel } from '../components/TrainingCameraPanel'
import { TrainingEventTable } from '../components/TrainingEventTable'
import { TrainingCourseAccordion } from '../components/TrainingCourseAccordion'
import { TrainingDailyDashboard } from '../components/TrainingDailyDashboard'
import { TrainingDailyDetailDashboard } from '../components/TrainingDailyDetailDashboard'
import { TierCollapseButton } from '../components/TierCollapseButton'
import { Tier1CollapsedSummary } from '../components/Tier1CollapsedSummary'
import { PlaybackModal } from '../components/PlaybackModal'
import { computeTrainingDailySummary } from '../services/trainingKpi.service'
import { useTenantTrainingScope } from '@/hooks/useTenantTrainingScope'
import type { TrainingEvent } from '../components/TrainingEventTable'
import { cn } from '@/utils/cn'

export function Module02DashboardPage() {
  const [selectedCamId, setSelectedCamId] = useState<string | undefined>()
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>()
  const [playbackEvent, setPlaybackEvent] = useState<TrainingEvent | null>(null)
  const [coursesOpen, setCoursesOpen] = useState(true)
  const [coursesPanelOpen, setCoursesPanelOpen] = useState(true)
  const [eventsPanelOpen, setEventsPanelOpen] = useState(true)
  const [tier1Open, setTier1Open] = useState(true)
  const [tier2Open, setTier2Open] = useState(true)
  const [activeStreamCount, setActiveStreamCount] = useState(2)
  const { isDesktop } = useShellLayout()
  const showCourses = coursesOpen || !isDesktop

  const { attendees, courses } = useTenantTrainingScope()
  const dailySummary = computeTrainingDailySummary(attendees, courses)

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
            <TrainingDailyDetailDashboard summary={dailySummary} courses={courses} />
          }
          headerRight={
            <div className="flex items-center gap-1 min-w-0 flex-1 justify-end">
              {!tier1Open && (
                <Tier1CollapsedSummary summary={dailySummary} className="flex-1 min-w-0" />
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
              <TrainingDailyDashboard summary={dailySummary} embedded />
            </div>
          )}
        </Panel>

        <div className={cn(
          'flex flex-col gap-2 sm:gap-3 flex-1 min-h-0 overflow-hidden',
        )}>
          <div className={cn(
            'flex flex-col min-h-0',
            tier2Open ? 'flex-[6] lg:flex-[11] min-h-0' : 'shrink-0',
          )}>
            <Panel
              title="Camera"
              expandable={tier2Open}
              fit={!tier2Open}
              noPadding
              className={cn(
                tier2Open && 'flex-1 min-h-0 h-full',
              )}
              headerRight={
                <div className="flex items-center gap-2 min-w-0">
                  {!tier2Open && (
                    <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                      <span className="text-primary font-semibold">{activeStreamCount}</span> luồng
                    </span>
                  )}
                  <TierCollapseButton
                    open={tier2Open}
                    onToggle={() => setTier2Open(open => !open)}
                    label="Camera"
                  />
                </div>
              }
            >
              {tier2Open && (
                <div className="flex flex-col flex-1 min-h-0 h-full w-full overflow-hidden">
                  <TrainingCameraPanel
                    selectedId={selectedCamId}
                    onSelectCamera={cam => setSelectedCamId(cam.id)}
                    onStreamCountChange={setActiveStreamCount}
                  />
                </div>
              )}
            </Panel>
          </div>

          <div className={cn(
            'flex flex-col lg:flex-row gap-2 sm:gap-3 min-h-0 flex-1 overflow-hidden',
            tier2Open ? 'lg:flex-[9]' : 'lg:flex-1',
          )}>
            {showCourses && (
              <div className={cn(
                'w-full lg:flex-[42] min-w-0 min-h-0 flex flex-col gap-2 sm:gap-3 overflow-hidden',
                coursesPanelOpen && 'flex-1',
                !coursesPanelOpen && 'shrink-0',
              )}>
                <Panel
                  title="Danh Sách Khóa Học"
                  fit={!coursesPanelOpen}
                  noPadding
                  className={cn(
                    coursesPanelOpen && 'flex-1 min-h-0 h-full',
                  )}
                  headerRight={
                    <div className="flex items-center gap-2 min-w-0">
                      {!coursesPanelOpen && (
                        <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                          <span className="text-primary font-semibold">{courses.length}</span> khoá
                        </span>
                      )}
                      <TierCollapseButton
                        open={coursesPanelOpen}
                        onToggle={() => setCoursesPanelOpen(open => !open)}
                        label="Danh Sách Khóa Học"
                      />
                    </div>
                  }
                >
                  {coursesPanelOpen && <TrainingCourseAccordion />}
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

            <div className={cn(
              'w-full lg:flex-[58] min-w-0 flex flex-col flex-1 min-h-0 overflow-hidden',
            )}>
              <Panel
                title="Sự Kiện Đào Tạo"
                fit={!eventsPanelOpen}
                noPadding
                className={cn(eventsPanelOpen ? 'flex-1 min-h-0 h-full' : 'shrink-0')}
                headerRight={
                  <div className="flex items-center gap-2 min-w-0">
                    {!eventsPanelOpen && (
                      <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                        <span className="text-primary font-semibold">{attendees.length}</span> học viên
                      </span>
                    )}
                    <TierCollapseButton
                      open={eventsPanelOpen}
                      onToggle={() => setEventsPanelOpen(open => !open)}
                      label="Sự Kiện Đào Tạo"
                    />
                  </div>
                }
              >
                {eventsPanelOpen && (
                  <TrainingEventTable
                    selectedId={selectedEventId}
                    onSelectEvent={ev => setSelectedEventId(ev.id)}
                    onPlayback={ev => setPlaybackEvent(ev)}
                  />
                )}
              </Panel>
            </div>
          </div>
        </div>
      </PageLayout>

      <PlaybackModal
        open={playbackEvent !== null}
        event={playbackEvent}
        onClose={() => setPlaybackEvent(null)}
      />
    </>
  )
}
