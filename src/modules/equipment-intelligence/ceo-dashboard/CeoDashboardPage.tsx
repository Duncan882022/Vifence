import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, Calendar, ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useMediaQuery } from '@/hooks/useMediaQuery'
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
const WIDE_LAYOUT_QUERY = '(min-width: 1280px)'

const TIER_VARIANTS = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.15 + i * 0.1, duration: 0.5, ease: TIER_EASE },
  }),
}

export function CeoDashboardPage() {
  const isWideLayout = useMediaQuery(WIDE_LAYOUT_QUERY)
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

  const showSidePanels = !isWideLayout || !tableExpanded
  const mapPanelOpen = isWideLayout ? mapOpen : true
  const topPanelOpen = isWideLayout ? topOpen : true
  const aiPanelOpen = isWideLayout ? aiRiskOpen : true

  return (
    <>
      <PageLayout className="gap-3" scrollable>
        {/* Tier 1 — KPI */}
        <motion.div custom={0} variants={TIER_VARIANTS} initial="hidden" animate="visible" className="shrink-0">
          <Panel
            title="Tổng quan"
            fit
            noPadding
            headerRight={(
              <div className="flex flex-wrap items-center justify-end gap-2 max-w-full">
                <div className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#060b14] border border-[#1e2433] text-[10px] sm:text-[11px] text-muted-foreground tabular-nums">
                  <Calendar className="w-3.5 h-3.5 shrink-0 text-primary/70" />
                  <span className="truncate max-w-[140px] sm:max-w-none">{dateRange.from} – {dateRange.to}</span>
                </div>

                <div className="relative">
                  <select
                    value={filters.project}
                    onChange={e => setFilters(f => ({ ...f, project: e.target.value }))}
                    className="appearance-none pl-3 pr-8 py-1.5 rounded-lg bg-[#060b14] border border-[#1e2433] text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer min-w-[110px] sm:min-w-[130px] max-w-[160px]"
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
                  className="flex items-center justify-center w-8 h-8 rounded-lg border border-[#1e2433] bg-[#060b14] text-muted-foreground hover:text-foreground hover:bg-[#1a2235] hover:border-[#2a3855] transition-colors shrink-0"
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

        {/* Tier 2+3 — stack mobile/tablet · grid iPad · flex row desktop */}
        <motion.div
          custom={1}
          variants={TIER_VARIANTS}
          initial="hidden"
          animate="visible"
          className="flex flex-col gap-3 min-h-0 xl:flex-row xl:flex-1 xl:min-h-[420px]"
        >
          {showSidePanels && (
            <motion.div
              layout={isWideLayout}
              transition={{ layout: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
              className={cn(
                'grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0',
                'xl:flex xl:gap-3 xl:min-h-0 xl:overflow-hidden xl:flex-[2]',
              )}
            >
              <div
                className={cn(
                  'flex flex-col min-h-[260px] sm:min-h-[300px] md:col-span-2',
                  'xl:col-span-1 xl:flex-1 xl:min-h-0 xl:min-w-[200px]',
                  isWideLayout && !mapPanelOpen && 'xl:w-11 xl:flex-none xl:min-w-0 xl:min-h-0',
                )}
              >
                <VietnamRegionMap
                  regions={data.regions}
                  getMachinesByRegion={getMachinesByRegion}
                  open={mapPanelOpen}
                  onToggleOpen={isWideLayout ? () => setMapOpen(v => !v) : undefined}
                />
              </div>

              <div className="flex flex-col gap-3 min-h-0 md:col-span-2 xl:flex-1 xl:min-w-[180px]">
                <TopUsersPanel
                  units={data.usageUnits}
                  open={topPanelOpen}
                  onToggle={isWideLayout ? () => setTopOpen(v => !v) : undefined}
                />
                <AiRiskPanel
                  recommendations={data.aiRecommendations}
                  open={aiPanelOpen}
                  onToggle={isWideLayout ? () => setAiRiskOpen(v => !v) : undefined}
                  onRowClick={(item) => { setSelectedAi(item); setAiDrawerOpen(true) }}
                />
              </div>
            </motion.div>
          )}

          <motion.div
            layout={isWideLayout}
            transition={{ layout: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
            className={cn(
              'flex flex-col min-h-[420px] sm:min-h-[460px] overflow-hidden',
              'xl:flex-[3] xl:min-h-0',
              isWideLayout && tableExpanded && 'xl:flex-1',
            )}
          >
            <MmtbDataTable
              data={filteredMachines}
              search={filters.search}
              onSearchChange={v => setFilters(f => ({ ...f, search: v }))}
              onRowClick={row => { setSelectedMachine(row); setMachineDrawerOpen(true) }}
              expanded={isWideLayout && tableExpanded}
              onToggle={isWideLayout ? () => setTableExpanded(v => !v) : undefined}
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
