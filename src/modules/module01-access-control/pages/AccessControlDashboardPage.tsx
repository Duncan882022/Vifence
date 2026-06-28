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
import { computeAccessDailySummary } from '../services/accessKpi.service'
import type { AccessEvent } from '@/types/access'
import { cn } from '@/utils/cn'

export function AccessControlDashboardPage() {
  const [tier1Open, setTier1Open] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<AccessEvent | null>(null)
  const summary = computeAccessDailySummary()

  return (
    <PageLayout scrollable>
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
          <TierCollapseButton
            open={tier1Open}
            onToggle={() => setTier1Open(open => !open)}
            label="Tổng Quan"
          />
        }
      >
        {tier1Open && (
          <div className="p-2 sm:p-3">
            <AccessDailyDashboard summary={summary} embedded />
          </div>
        )}
      </Panel>

      <div className={cn(
        'grid grid-cols-1 lg:grid-cols-2 gap-3 min-h-0',
        'lg:flex-[2] lg:min-h-[320px]',
      )}>
        <Panel title="Camera Trực Tiếp" expandable noPadding className="min-h-[280px] lg:min-h-0 lg:h-full flex flex-col">
          <AccessLiveCameraPanel />
        </Panel>
        <Panel title="Sự Kiện Vào / Ra" expandable noPadding className="min-h-[320px] lg:min-h-0 lg:h-full flex flex-col">
          <AccessEventTable
            selectedId={selectedEvent?.id}
            onSelectEvent={setSelectedEvent}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 shrink-0 lg:shrink lg:min-h-[240px] lg:flex-1">
        <Panel title="Playback Video" expandable noPadding className="min-h-[260px] lg:min-h-0 lg:h-full flex flex-col">
          <AccessPlaybackPanel selectedEvent={selectedEvent} />
        </Panel>
        <Panel title="Truy Vết Di Chuyển" expandable noPadding className="min-h-[280px] lg:min-h-0 lg:h-full flex flex-col">
          <AccessMovementTracker />
        </Panel>
        <Panel title="Ngoại Lệ" expandable noPadding className="min-h-[220px] lg:min-h-0 lg:h-full flex flex-col">
          <AccessExceptionsPanel />
        </Panel>
      </div>
    </PageLayout>
  )
}
