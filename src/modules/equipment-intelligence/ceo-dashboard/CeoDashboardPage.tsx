import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, Calendar, ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'
import { PageLayout, Panel } from '@/components/common/PageLayout/PageLayout'
import { KpiTier } from './components/KpiTier'
import { MmtbDataTable } from './components/MmtbDataTable'
import { TopUsersPanel } from './components/TopUsersPanel'
import { AiRiskPanel } from './components/AiRiskPanel'
import { VietnamRegionMap } from './components/VietnamRegionMap'
import { EquipmentDetailDrawer } from './components/EquipmentDetailDrawer'
import { AiRecommendationDrawer } from './components/AiRecommendationDrawer'
import { useCeoDashboardData } from './hooks/useCeoDashboardData'
import type { AiRecommendationRow, MmtbRow } from './types'

const TIER_EASE = [0.22, 1, 0.36, 1] as const

const TIER_VARIANTS = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.15 + i * 0.1, duration: 0.5, ease: TIER_EASE },
  }),
}

export function CeoDashboardPage() {
  const {
    data, filters, setFilters, dateRange, filteredMachines,
    getMachinesByRegion,
  } = useCeoDashboardData()

  const [selectedMachine, setSelectedMachine] = useState<MmtbRow | null>(null)
  const [machineDrawerOpen, setMachineDrawerOpen] = useState(false)
  const [selectedAi, setSelectedAi] = useState<AiRecommendationRow | null>(null)
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false)
  const [mapOpen, setMapOpen] = useState(true)
  const [tableExpanded, setTableExpanded] = useState(false)
  const [topOpen, setTopOpen] = useState(true)
  const [aiRiskOpen, setAiRiskOpen] = useState(true)
  const [, setRefreshKey] = useState(0)

  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1)
  }, [])

  return (
    <>
      <PageLayout className="gap-3">
        {/* Tier 1 — KPI */}
        <motion.div custom={0} variants={TIER_VARIANTS} initial="hidden" animate="visible" className="shrink-0">
          <Panel
            title="Tổng quan"
            fit
            noPadding
            headerRight={(
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#060b14] border border-[#1e2433] text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                  <Calendar className="w-3.5 h-3.5 shrink-0 text-primary/70" />
                  {dateRange.from} – {dateRange.to}
                </div>

                <div className="relative">
                  <select
                    value={filters.project}
                    onChange={e => setFilters(f => ({ ...f, project: e.target.value }))}
                    className="appearance-none pl-3 pr-8 py-1.5 rounded-lg bg-[#060b14] border border-[#1e2433] text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer min-w-[130px]"
                  >
                    {data.projects.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
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
              <KpiTier
                fleet={data.fleet}
                pm={data.pm}
                reliability={data.reliability}
                asset={data.asset}
              />
            </div>
          </Panel>
        </motion.div>

        {/* Tier 2+3 — all panels in one flex row */}
        <motion.div
          custom={1}
          variants={TIER_VARIANTS}
          initial="hidden"
          animate="visible"
          className="flex gap-3 min-h-0 flex-1"
        >
          {/* Left panels wrapper — hidden when table is expanded */}
          <motion.div
            layout
            transition={{ layout: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
            className={cn(
              'flex gap-3 min-h-0 overflow-hidden',
              tableExpanded ? 'w-0 opacity-0 flex-none' : 'flex-[2] opacity-100',
            )}
          >
            {/* Map panel */}
            <motion.div
              layout
              transition={{ layout: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
              className={cn('flex flex-col min-h-0 overflow-hidden', mapOpen ? 'flex-1 min-w-[200px]' : 'w-11 shrink-0')}
            >
              <VietnamRegionMap
                regions={data.regions}
                getMachinesByRegion={getMachinesByRegion}
                open={mapOpen}
                onToggleOpen={() => setMapOpen(v => !v)}
              />
            </motion.div>

            {/* Middle column: Top 10 + AI Risk stacked */}
            <motion.div
              layout
              transition={{ layout: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
              className={cn(
                'flex flex-col gap-3 overflow-hidden min-h-0',
                (topOpen || aiRiskOpen) ? 'flex-1 min-w-[180px]' : 'w-11 shrink-0',
              )}
            >
              {/* Top 10 */}
              <TopUsersPanel
                units={data.usageUnits}
                open={topOpen}
                onToggle={() => setTopOpen(v => !v)}
              />
              {/* AI Risk Top 5 */}
              <AiRiskPanel
                recommendations={data.aiRecommendations}
                open={aiRiskOpen}
                onToggle={() => setAiRiskOpen(v => !v)}
                onRowClick={(item) => { setSelectedAi(item); setAiDrawerOpen(true) }}
              />
            </motion.div>
          </motion.div>

          {/* Machine list panel */}
          <motion.div
            layout
            transition={{ layout: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
            className={cn('flex flex-col min-h-0 overflow-hidden', tableExpanded ? 'flex-1' : 'flex-[3]')}
          >
            <MmtbDataTable
              data={filteredMachines}
              search={filters.search}
              onSearchChange={v => setFilters(f => ({ ...f, search: v }))}
              onRowClick={row => { setSelectedMachine(row); setMachineDrawerOpen(true) }}
              expanded={tableExpanded}
              onToggle={() => setTableExpanded(v => !v)}
            />
          </motion.div>
        </motion.div>
      </PageLayout>

      <EquipmentDetailDrawer
        machine={selectedMachine}
        open={machineDrawerOpen}
        onOpenChange={setMachineDrawerOpen}
      />

      <AiRecommendationDrawer
        item={selectedAi}
        open={aiDrawerOpen}
        onOpenChange={setAiDrawerOpen}
      />
    </>
  )
}
