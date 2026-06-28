import { useState } from 'react'
import { PageLayout, Panel } from '@/components/common/PageLayout/PageLayout'
import { TierCollapseButton } from '@/modules/module02-training/components/TierCollapseButton'
import { AccessDailyDashboard } from '../components/AccessDailyDashboard'
import { AccessLiveCameraPanel } from '../components/AccessLiveCameraPanel'
import { AccessEventTable } from '../components/AccessEventTable'
import { AccessPlaybackPanel } from '../components/AccessPlaybackPanel'
import { AccessMovementTracker } from '../components/AccessMovementTracker'
import { AccessExceptionsPanel } from '../components/AccessExceptionsPanel'
import { AccessGlobalSearch } from '../components/AccessGlobalSearch'
import { AccessTier1CollapsedSummary } from '../components/AccessTier1CollapsedSummary'
import { computeAccessDailySummary } from '../services/accessKpi.service'
import type { AccessEvent } from '@/types/access'
import { cn } from '@/utils/cn'

type Tier3Tab = 'playback' | 'movement' | 'exceptions'

const TIER3_TABS: { key: Tier3Tab; label: string }[] = [
  { key: 'playback', label: 'Playback' },
  { key: 'movement', label: 'Truy vết' },
  { key: 'exceptions', label: 'Ngoại lệ' },
]

export function AccessControlDashboardPage() {
  const [tier1Open, setTier1Open] = useState(true)
  const [tier2Open, setTier2Open] = useState(true)
  const [tier3Open, setTier3Open] = useState(false)
  const [tier3Tab, setTier3Tab] = useState<Tier3Tab>('playback')
  const [selectedEvent, setSelectedEvent] = useState<AccessEvent | null>(null)
  const summary = computeAccessDailySummary()

  const handleSelectEvent = (event: AccessEvent) => {
    setSelectedEvent(event)
    setTier3Open(true)
    setTier3Tab('playback')
  }

  const activeTabLabel = TIER3_TABS.find(t => t.key === tier3Tab)?.label ?? 'Playback'

  return (
    <PageLayout>
      <div className="flex justify-center lg:justify-start shrink-0">
        <AccessGlobalSearch />
      </div>

      <Panel
        title="Tổng Quan"
        fit
        expandable={tier1Open}
        noPadding
        className="shrink-0"
        headerRight={
          <div className="flex items-center gap-2 min-w-0">
            {!tier1Open && <AccessTier1CollapsedSummary summary={summary} />}
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
            <AccessDailyDashboard summary={summary} embedded />
          </div>
        )}
      </Panel>

      <div className={cn(
        'flex flex-col gap-3',
        'max-lg:flex-none',
        'lg:flex-1 lg:min-h-0 lg:overflow-hidden',
      )}>
        <div className={cn(
          'flex flex-col lg:flex-row gap-3 min-h-0',
          'max-lg:flex-none',
          tier3Open ? 'lg:flex-[11]' : 'lg:flex-[13]',
        )}>
          <div className={cn(
            'w-full lg:flex-[58] min-w-0 flex flex-col',
            tier2Open ? 'min-h-[240px] lg:min-h-0' : 'shrink-0',
          )}>
            <Panel
              title="Camera Trực Tiếp"
              expandable={tier2Open}
              fit={!tier2Open}
              noPadding
              className={cn(
                tier2Open && 'flex-1 min-h-0',
                tier2Open && 'max-lg:!h-auto max-lg:overflow-visible max-lg:[&>div:last-child]:!h-auto',
                tier2Open && 'max-lg:[&>div:last-child]:flex-none max-lg:[&>div:last-child]:overflow-visible',
                !tier2Open && 'max-lg:!h-auto max-lg:min-h-0',
              )}
              headerRight={
                <div className="flex items-center gap-2 min-w-0">
                  {!tier2Open && (
                    <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                      <span className="text-primary font-semibold">4</span> cổng
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
                  <AccessLiveCameraPanel />
                </div>
              )}
            </Panel>
          </div>

          <div className="w-full lg:flex-[42] min-w-0 min-h-[280px] max-lg:landscape:min-h-[240px] lg:min-h-0 flex flex-col">
            <Panel title="Sự Kiện Vào / Ra" expandable noPadding className="flex-1 min-h-0 max-lg:portrait:flex-none max-lg:portrait:!h-auto">
              <AccessEventTable
                selectedId={selectedEvent?.id}
                onSelectEvent={handleSelectEvent}
              />
            </Panel>
          </div>
        </div>

        <div className={cn(
          'flex flex-col min-h-0',
          tier3Open ? 'lg:flex-[9] max-lg:flex-none' : 'shrink-0',
        )}>
          <Panel
            title={tier3Open ? activeTabLabel : 'Phân Tích & Xử Lý'}
            expandable={tier3Open}
            fit={!tier3Open}
            noPadding
            className={cn(
              tier3Open && 'flex-1 min-h-0',
              tier3Open && 'max-lg:!h-auto max-lg:overflow-visible max-lg:[&>div:last-child]:!h-auto',
              tier3Open && 'max-lg:[&>div:last-child]:flex-none max-lg:[&>div:last-child]:overflow-visible',
              !tier3Open && 'max-lg:!h-auto max-lg:min-h-0',
            )}
            headerRight={
              <div className="flex items-center gap-2 min-w-0">
                {tier3Open && (
                  <div className="hidden sm:flex items-center gap-0.5 mr-1">
                    {TIER3_TABS.map(tab => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setTier3Tab(tab.key)}
                        className={cn(
                          'px-2 py-0.5 text-[9px] font-semibold rounded transition-colors whitespace-nowrap',
                          tier3Tab === tab.key
                            ? 'bg-primary/20 text-primary'
                            : 'text-muted-foreground hover:text-foreground hover:bg-[#1a2235]',
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                )}
                {!tier3Open && selectedEvent && (
                  <span className="text-[10px] text-muted-foreground truncate max-w-[120px] hidden sm:block">
                    {selectedEvent.name}
                  </span>
                )}
                <TierCollapseButton
                  open={tier3Open}
                  onToggle={() => setTier3Open(open => !open)}
                  label="Phân Tích"
                />
              </div>
            }
          >
            {tier3Open && (
              <div className="flex flex-col min-h-0 h-full max-lg:h-auto max-lg:flex-none">
                <div className="flex sm:hidden items-center gap-0.5 px-3 py-2 border-b border-[#1e2433] shrink-0 overflow-x-auto scrollbar-none">
                  {TIER3_TABS.map(tab => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setTier3Tab(tab.key)}
                      className={cn(
                        'px-2.5 py-1 text-[9px] font-semibold rounded transition-colors whitespace-nowrap shrink-0',
                        tier3Tab === tab.key
                          ? 'bg-primary/20 text-primary'
                          : 'text-muted-foreground hover:text-foreground hover:bg-[#1a2235]',
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="flex-1 min-h-0">
                  {tier3Tab === 'playback' && (
                    <AccessPlaybackPanel selectedEvent={selectedEvent} />
                  )}
                  {tier3Tab === 'movement' && (
                    <AccessMovementTracker selectedEvent={selectedEvent} />
                  )}
                  {tier3Tab === 'exceptions' && (
                    <AccessExceptionsPanel />
                  )}
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </PageLayout>
  )
}
