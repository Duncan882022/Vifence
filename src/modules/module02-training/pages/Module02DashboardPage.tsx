import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PageLayout, Panel } from '@/components/common/PageLayout/PageLayout'
import { useShellLayout } from '@/hooks/useShellLayout'
import { TrainingCameraPanel } from '../components/TrainingCameraPanel'
import { TrainingEventTable, TRAINING_ATTENDEES } from '../components/TrainingEventTable'
import { TrainingCourseAccordion, TRAINING_COURSES } from '../components/TrainingCourseAccordion'
import { TrainingDailyDashboard } from '../components/TrainingDailyDashboard'
import { TrainingDailyDetailDashboard } from '../components/TrainingDailyDetailDashboard'
import { TierCollapseButton } from '../components/TierCollapseButton'
import { Tier1CollapsedSummary } from '../components/Tier1CollapsedSummary'
import { PlaybackModal } from '../components/PlaybackModal'
import { computeTrainingDailySummary } from '../services/trainingKpi.service'
import type { TrainingEvent } from '../components/TrainingEventTable'
import { cn } from '@/utils/cn'

export function Module02DashboardPage() {
  const [selectedCamId, setSelectedCamId] = useState<string | undefined>()
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>()
  const [playbackEvent, setPlaybackEvent] = useState<TrainingEvent | null>(null)
  const [coursesOpen, setCoursesOpen] = useState(true)
  const [tier1Open, setTier1Open] = useState(true)
  const [tier2Open, setTier2Open] = useState(true)
  const [activeStreamCount, setActiveStreamCount] = useState(2)
  const { isDesktop } = useShellLayout()
  const showCourses = coursesOpen || !isDesktop

  const dailySummary = computeTrainingDailySummary(TRAINING_ATTENDEES, TRAINING_COURSES)

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
            <TrainingDailyDetailDashboard summary={dailySummary} courses={TRAINING_COURSES} />
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
          'flex flex-col gap-3',
          'max-lg:flex-none',
          'lg:flex-1 lg:min-h-0 lg:overflow-hidden',
        )}>
          <div className={cn(
            'flex flex-col min-h-0',
            tier2Open ? 'lg:flex-[11] max-lg:flex-none' : 'shrink-0',
          )}>
            <Panel
              title="Camera"
              expandable={tier2Open}
              fit={!tier2Open}
              noPadding
              className={cn(
                tier2Open && 'lg:flex-1 lg:min-h-0',
                tier2Open && 'max-lg:!h-auto max-lg:overflow-visible max-lg:[&>div:last-child]:!h-auto',
                tier2Open && 'max-lg:[&>div:last-child]:flex-none max-lg:[&>div:last-child]:overflow-visible',
                !tier2Open && 'max-lg:!h-auto max-lg:min-h-0',
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
                <div className="flex flex-col flex-1 min-h-0 h-full w-full max-lg:min-h-0">
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
            'flex flex-col lg:flex-row gap-3 min-h-0',
            'max-lg:flex-none',
            tier2Open ? 'lg:flex-[9]' : 'lg:flex-1',
          )}>
            {showCourses && (
              <div className="w-full lg:flex-[42] min-w-0 min-h-0 max-lg:landscape:min-h-[240px] lg:min-h-0 flex flex-col">
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
                  onPlayback={ev => setPlaybackEvent(ev)}
                />
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
