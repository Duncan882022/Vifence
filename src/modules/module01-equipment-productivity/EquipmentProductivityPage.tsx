import { useCallback, useState } from 'react'
import { motion } from 'framer-motion'
import { Calendar, RefreshCw } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Header } from '@/components/common/Header/Header'
import { PageLayout, Panel } from '@/components/common/PageLayout/PageLayout'
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

const TIER_EASE = [0.22, 1, 0.36, 1] as const

const TIER_VARIANTS = {
  hidden: { opacity: 0, y: 18 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.1 + i * 0.08, duration: 0.5, ease: TIER_EASE },
  }),
}

const DATE_RANGE = { from: '18/08/2026', to: '18/08/2026' }

export function EquipmentProductivityPage() {
  const [, setRefreshKey] = useState(0)

  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1)
  }, [])

  return (
    <>
      <Header
        title="Hiệu Quả Vận Hành"
        subtitle="Giám sát năng suất, tiến độ và nhiên liệu đội máy thi công cọc"
      />

      {/* Desktop: 3 tier vừa 1 viewport · Mobile: scroll trang */}
      <PageLayout className="gap-3">
        {/* Tier 1 — KPI (auto height) */}
        <motion.section
          custom={0}
          variants={TIER_VARIANTS}
          initial="hidden"
          animate="visible"
          className="shrink-0"
        >
          <Panel
            title="Tổng quan"
            fit
            noPadding
            headerRight={(
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#060b14] border border-[#1e2433] text-[10px] text-muted-foreground tabular-nums">
                  <Calendar className="w-3.5 h-3.5 shrink-0 text-primary/70" />
                  <span>{DATE_RANGE.from} – {DATE_RANGE.to}</span>
                </div>
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="flex items-center justify-center w-8 h-8 rounded-lg border border-[#1e2433] bg-[#060b14] text-muted-foreground hover:text-foreground hover:bg-[#1a2235] hover:border-[#2a3855] transition-colors"
                  aria-label="Làm mới"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          >
            <div className="p-3 sm:p-4">
              <ProductivityKpiTier
                machines={MACHINES}
                worksites={WORKSITES}
                projects={PROJECTS}
              />
            </div>
          </Panel>
        </motion.section>

        {/* Tier 2 + 3 — chia phần còn lại viewport (lg+) */}
        <div className="flex flex-col flex-1 min-h-0 gap-3">
          {/* Tier 2 — chiều cao cố định desktop */}
          <motion.section
            custom={1}
            variants={TIER_VARIANTS}
            initial="hidden"
            animate="visible"
            className={cn(
              'grid grid-cols-1 lg:grid-cols-[2fr_1fr_1.5fr] gap-3 shrink-0',
              'max-lg:min-h-0',
              'lg:h-[min(280px,32vh)] lg:min-h-[220px] lg:max-h-[300px]',
            )}
          >
            <ProjectDelayRiskPanel
              projects={PROJECTS}
              worksites={WORKSITES}
              piles={PILE_ASSIGNMENTS}
            />
            <AiOperationAlertsPanel alerts={AI_ALERTS} />
            <FuelEfficiencyPanel machines={MACHINES} />
          </motion.section>

          {/* Tier 3 — bảng chiếm phần còn lại */}
          <motion.section
            custom={2}
            variants={TIER_VARIANTS}
            initial="hidden"
            animate="visible"
            className="flex flex-col flex-1 min-h-0 overflow-hidden max-lg:min-h-[420px]"
          >
            <MachineProductivityTable
              machines={MACHINES}
              projects={PROJECTS}
              worksites={WORKSITES}
              piles={PILE_ASSIGNMENTS}
            />
          </motion.section>
        </div>
      </PageLayout>
    </>
  )
}
