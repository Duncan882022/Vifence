import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PageLayout, Panel } from '@/components/common/PageLayout/PageLayout'
import { useShellLayout } from '@/hooks/useShellLayout'
import { TrainingCameraPanel } from '@/modules/module02-training/components/TrainingCameraPanel'
import { TierCollapseButton } from '@/modules/module02-training/components/TierCollapseButton'
import { SafetyViolationEventsPanel } from '../components/SafetyViolationEventsPanel'
import { SafetyZoneHeatmap } from '../components/SafetyZoneHeatmap'
import { SafetyDailyDashboard } from '../components/SafetyDailyDashboard'
import { SafetyDailyDetailDashboard } from '../components/SafetyDailyDetailDashboard'
import { SafetyTier1CollapsedSummary } from '../components/SafetyTier1CollapsedSummary'
import { SafetyPlaybackModal } from '../components/SafetyPlaybackModal'
import { computeSafetyDailySummary } from '../services/safetyKpi.service'
import { SAFETY_VIOLATIONS } from '../data/safetyViolations'
import type { SafetyViolation } from '@/types/safety'
import type { Event } from '@/types/event'
import { cn } from '@/utils/cn'

export function SafetyDashboardPage() {
  const [selectedCamId, setSelectedCamId] = useState<string | undefined>()
  const [selectedViolationId, setSelectedViolationId] = useState<string | undefined>()
  const [selectedViolation, setSelectedViolation] = useState<SafetyViolation | null>(null)
  const [playbackEvent, setPlaybackEvent] = useState<Event | null>(null)
  const [heatmapOpen, setHeatmapOpen] = useState(true)
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const [tier1Open, setTier1Open] = useState(true)
  const [tier2Open, setTier2Open] = useState(true)
  const [activeStreamCount, setActiveStreamCount] = useState(2)
  const { isDesktop } = useShellLayout()
  const showHeatmap = heatmapOpen || !isDesktop

  const summary = computeSafetyDailySummary(SAFETY_VIOLATIONS)

  const handleSelectViolation = (v: SafetyViolation) => {
    setSelectedViolationId(v.id)
    setSelectedViolation(v)
  }

  const handlePlayback = (event: Event) => {
    setPlaybackEvent(event)
    const match = SAFETY_VIOLATIONS.find(item => item.id === event.id)
    if (match) {
      setSelectedViolation(match)
      setSelectedViolationId(match.id)
    }
  }

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
            <SafetyDailyDetailDashboard summary={summary} />
          }
          headerRight={
            <div className="flex items-center gap-2 min-w-0">
              {!tier1Open && <SafetyTier1CollapsedSummary summary={summary} />}
              <TierCollapseButton
                open={tier1Open}
                onToggle={() => setTier1Open(open => !open)}
                label="Tổng Quan"
              />
            </div>
          }
        >
          {tier1Open && (
            <div className="p-2 sm:p-3">
              <SafetyDailyDashboard summary={summary} embedded />
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
                <div className="flex flex-col min-h-0 h-full max-lg:h-auto max-lg:flex-none">
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
            <div className="w-full lg:flex-[58] min-w-0 min-h-[320px] max-lg:landscape:min-h-[260px] lg:min-h-0 flex flex-col">
              <Panel title="Sự Kiện Vi Phạm" expandable noPadding className="flex-1 min-h-0 max-lg:portrait:flex-none max-lg:portrait:!h-auto">
                <SafetyViolationEventsPanel
                  selectedId={selectedViolationId}
                  selectedViolation={selectedViolation}
                  zoneFilter={selectedZoneId}
                  onSelectViolation={handleSelectViolation}
                  onPlayback={handlePlayback}
                />
              </Panel>
            </div>

            <div className="hidden lg:flex items-center justify-center w-3 shrink-0">
              <button
                type="button"
                onClick={() => setHeatmapOpen(c => !c)}
                className="h-10 w-3 flex items-center justify-center rounded text-muted-foreground/50 hover:text-foreground hover:bg-[#1a2235] transition-colors border border-[#1e2433]/60"
                title={heatmapOpen ? 'Thu gọn Heatmap' : 'Mở rộng Heatmap'}
              >
                {heatmapOpen
                  ? <ChevronRight className="w-2.5 h-2.5" />
                  : <ChevronLeft className="w-2.5 h-2.5" />
                }
              </button>
            </div>

            {showHeatmap && (
              <div className="w-full lg:flex-[42] min-w-0 min-h-0 max-lg:landscape:min-h-[200px] lg:min-h-0 flex flex-col">
                <Panel title="Heatmap Vi Phạm" expandable noPadding className="flex-1 min-h-0 max-lg:portrait:flex-none max-lg:portrait:!h-auto">
                  <SafetyZoneHeatmap
                    selectedZoneId={selectedZoneId}
                    onSelectZone={setSelectedZoneId}
                  />
                </Panel>
              </div>
            )}
          </div>
        </div>
      </PageLayout>

      <SafetyPlaybackModal
        open={playbackEvent !== null}
        event={playbackEvent}
        onClose={() => setPlaybackEvent(null)}
      />
    </>
  )
}
