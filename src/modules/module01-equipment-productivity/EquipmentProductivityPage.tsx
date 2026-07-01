import { useState } from 'react'
import { Header } from '@/components/common/Header/Header'
import { PageLayout } from '@/components/common/PageLayout/PageLayout'
import { ProductivityKpiTier } from './components/ProductivityKpiTier'
import { MachineProductivityTable } from './components/MachineProductivityTable'
import { OperationAnalyticsPanel } from './components/OperationAnalyticsPanel'
import { ProjectPerformancePanel } from './components/ProjectPerformancePanel'
import { AiOperationInsightsPanel } from './components/AiOperationInsightsPanel'
import {
  FLEET_SUMMARY,
  UTILIZATION_KPI,
  OUTPUT_KPI,
  FUEL_KPI,
  MOCK_MACHINES,
  MOCK_PROJECTS,
  TREND_DATA,
  SHIFT_DATA,
  AI_INSIGHTS,
} from './data/mockProductivity'

export function EquipmentProductivityPage() {
  const [search, setSearch] = useState('')

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
            fleet={FLEET_SUMMARY}
            utilization={UTILIZATION_KPI}
            output={OUTPUT_KPI}
            fuel={FUEL_KPI}
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
            fleet={FLEET_SUMMARY}
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
