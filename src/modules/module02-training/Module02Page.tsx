import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Header } from '@/components/common/Header/Header'
import { PageLayout, Panel } from '@/components/common/PageLayout/PageLayout'
import { TrainingCameraPanel } from './components/TrainingCameraPanel'
import { TrainingEventTable, TRAINING_ATTENDEES } from './components/TrainingEventTable'
import { TrainingCourseAccordion, TRAINING_COURSES } from './components/TrainingCourseAccordion'
import { TrainingDailyDashboard } from './components/TrainingDailyDashboard'
import { PlaybackModal } from './components/PlaybackModal'
import { computeTrainingDailySummary } from './services/trainingKpi.service'
import type { TrainingEvent } from './components/TrainingEventTable'

export function Module02Page() {
  const [selectedCamId, setSelectedCamId] = useState<string | undefined>()
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>()
  const [playbackEvent, setPlaybackEvent] = useState<TrainingEvent | null>(null)
  const [coursesOpen, setCoursesOpen] = useState(true)

  const dailySummary = computeTrainingDailySummary(TRAINING_ATTENDEES, TRAINING_COURSES)

  return (
    <>
      <Header
        title="Đào Tạo & Tuân Thủ"
        subtitle="Giám sát đào tạo, huấn luyện an toàn và tuân thủ quy định"
      />
      <PageLayout>
        {/* Row 1 — Daily dashboard */}
        <TrainingDailyDashboard summary={dailySummary} />

        {/* Rows 2 + 3 share remaining height 50 / 50 */}
        <div className="flex-1 min-h-0 flex flex-col gap-3">
          {/* Row 2 — Camera (50%) */}
          <div className="flex-1 min-h-0">
            <Panel title="Camera" expandable noPadding>
              <TrainingCameraPanel
                selectedId={selectedCamId}
                onSelectCamera={cam => setSelectedCamId(cam.id)}
              />
            </Panel>
          </div>

          {/* Row 3 — Events | Courses with split-pane toggle handle */}
          <div className="flex gap-1.5 flex-1 min-h-0 min-h-[200px]">
            {/* Events — takes remaining space */}
            <div className="flex-[58] min-w-0">
              <Panel title="Sự Kiện Đào Tạo" expandable noPadding>
                <TrainingEventTable
                  selectedId={selectedEventId}
                  onSelectEvent={ev => setSelectedEventId(ev.id)}
                  onPlayback={ev => setPlaybackEvent(ev)}
                />
              </Panel>
            </div>

            {/* Split-pane handle — sits in the gap, owns the toggle */}
            <div className="flex items-center justify-center w-3 shrink-0">
              <button
                onClick={() => setCoursesOpen(c => !c)}
                className="h-10 w-3 flex items-center justify-center rounded text-muted-foreground/50 hover:text-foreground hover:bg-[#1a2235] transition-colors border border-[#1e2433]/60"
                title={coursesOpen ? 'Thu gọn Khóa Học' : 'Mở rộng Khóa Học'}
              >
                {coursesOpen
                  ? <ChevronRight className="w-2.5 h-2.5" />
                  : <ChevronLeft className="w-2.5 h-2.5" />
                }
              </button>
            </div>

            {/* Courses — collapsible */}
            {coursesOpen && (
              <div className="flex-[42] min-w-0">
                <Panel title="Khóa Học" expandable noPadding>
                  <TrainingCourseAccordion />
                </Panel>
              </div>
            )}
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
