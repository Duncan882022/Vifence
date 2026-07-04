import { useState } from 'react'
import { Header } from '@/components/common/Header/Header'
import { PageLayout } from '@/components/common/PageLayout/PageLayout'
import { ProductivityKpiTier } from './components/ProductivityKpiTier'
import { MachineProductivityTable } from './components/MachineProductivityTable'
import { ProjectDelayRiskPanel } from './components/ProjectDelayRiskPanel'
import { FuelEfficiencyPanel } from './components/FuelEfficiencyPanel'
import { AiOperationAlertsPanel } from './components/AiOperationAlertsPanel'
import {
  MACHINES,
  PROJECTS,
  WORKSITES,
  PILE_ASSIGNMENTS,
  AI_ALERTS,
} from './data/mockProductivity'
import type { AiAlert } from './types'
import { AiAlertDrawer } from './components/AiAlertDrawer'

export function EquipmentProductivityPage() {
  const [drawerAlert, setDrawerAlert] = useState<AiAlert | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <>
      <Header
        title="Năng Suất Vận Hành"
        subtitle="Quản lý đội máy thi công cọc — theo dự án, công trường và cọc"
      />

      <PageLayout>
        {/* Tier 1 — KPI Cards */}
        <div className="shrink-0">
          <ProductivityKpiTier
            machines={MACHINES}
            worksites={WORKSITES}
            piles={PILE_ASSIGNMENTS}
          />
        </div>

        {/* Tier 2 — Machine Table */}
        <div className="flex flex-col flex-[5] min-h-0">
          <MachineProductivityTable
            machines={MACHINES}
            projects={PROJECTS}
            worksites={WORKSITES}
            piles={PILE_ASSIGNMENTS}
          />
        </div>

        {/* Tier 3 — 3 panels */}
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_3fr_4fr] gap-3 flex-[4] min-h-0">
          <ProjectDelayRiskPanel
            projects={PROJECTS}
            worksites={WORKSITES}
            piles={PILE_ASSIGNMENTS}
          />
          <FuelEfficiencyPanel machines={MACHINES} />
          <AiOperationAlertsPanel alerts={AI_ALERTS} />
        </div>
      </PageLayout>

      <AiAlertDrawer
        alert={drawerAlert}
        open={drawerOpen}
        onOpenChange={open => {
          setDrawerOpen(open)
          if (!open) setDrawerAlert(null)
        }}
      />
    </>
  )
}
