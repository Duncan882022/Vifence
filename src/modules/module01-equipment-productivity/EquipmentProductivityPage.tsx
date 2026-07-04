import { useMemo, useState } from 'react'
import { Header } from '@/components/common/Header/Header'
import { PageLayout } from '@/components/common/PageLayout/PageLayout'
import { ProductivityKpiTier } from './components/ProductivityKpiTier'
import { MachineProductivityTable } from './components/MachineProductivityTable'
import { OperationAnalyticsPanel } from './components/OperationAnalyticsPanel'
import { ProjectPerformancePanel } from './components/ProjectPerformancePanel'
import { AiOperationInsightsPanel } from './components/AiOperationInsightsPanel'
import {
  MOCK_MACHINES,
  MOCK_PROJECTS,
  TREND_DATA,
  SHIFT_DATA,
  AI_INSIGHTS,
} from './data/mockProductivity'
import type { FleetSummary } from './types'

export function EquipmentProductivityPage() {
  const [search, setSearch] = useState('')
  const fleetSummary = useMemo<FleetSummary>(() => {
    const workingHours = MOCK_MACHINES.reduce((sum, machine) => sum + machine.workingHours, 0)
    const idleHours = MOCK_MACHINES.reduce((sum, machine) => sum + machine.idleHours, 0)
    const downtimeHours = MOCK_MACHINES.reduce((sum, machine) => sum + machine.downtimeHours, 0)
    const totalHours = workingHours + idleHours + downtimeHours

    return {
      workingHours,
      idleHours,
      downtimeHours,
      availabilityPct: totalHours > 0 ? Math.round((workingHours / totalHours) * 1000) / 10 : 0,
      availabilityTrend: 0,
    }
  }, [])

  return (
    <>
      <Header
        title="Năng Suất Vận Hành"
        subtitle="Hiệu quả khai thác và năng suất thiết bị thi công"
      />

      <PageLayout>

        {/* Tier 1 — KPI Cards (shrink-0: always visible, never scrolled away) */}
        <div className="shrink-0">
          <ProductivityKpiTier
            machines={MOCK_MACHINES}
            topInsight={AI_INSIGHTS[0]}
          />
        </div>

        {/* Tier 2 — Machine Table (flex-[5]: takes ~45% of remaining height) */}
        <div className="flex flex-col flex-[5] min-h-0">
          <MachineProductivityTable
            data={MOCK_MACHINES}
            search={search}
            onSearchChange={setSearch}
          />
        </div>

        {/* Tier 3 — Analytics Row (flex-[4]: takes ~36% of remaining height) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 flex-[4] min-h-0">
          <OperationAnalyticsPanel
            fleet={fleetSummary}
            trendData={TREND_DATA}
            shiftData={SHIFT_DATA}
          />
          <ProjectPerformancePanel projects={MOCK_PROJECTS} />
          <AiOperationInsightsPanel insights={AI_INSIGHTS} />
        </div>

      </PageLayout>
    </>
  )
}
