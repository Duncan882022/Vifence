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
        title="Hiệu Quả Vận Hành"
        subtitle="Giám sát năng suất, tiến độ và nhiên liệu đội máy thi công cọc"
      />

      <PageLayout>
        {/* Tier 1 — KPI Cards */}
        <div className="shrink-0">
          <ProductivityKpiTier
            machines={MACHINES}
            worksites={WORKSITES}
            projects={PROJECTS}
          />
        </div>

        {/* Tier 2 — 3 panels: Năng suất dự án | Top 10 nguy cơ sự cố | Hiệu quả nhiên liệu */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr_1.5fr] gap-3 flex-[4] min-h-0">
          <ProjectDelayRiskPanel
            projects={PROJECTS}
            worksites={WORKSITES}
            piles={PILE_ASSIGNMENTS}
          />
          <AiOperationAlertsPanel alerts={AI_ALERTS} />
          <FuelEfficiencyPanel machines={MACHINES} />
        </div>

        {/* Tier 3 — Danh sách thiết bị (full width) */}
        <div className="flex flex-col flex-[5] min-h-0">
          <MachineProductivityTable
            machines={MACHINES}
            projects={PROJECTS}
            worksites={WORKSITES}
            piles={PILE_ASSIGNMENTS}
          />
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
