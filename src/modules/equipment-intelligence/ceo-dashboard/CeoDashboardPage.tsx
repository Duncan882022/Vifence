import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, Calendar, ChevronDown } from 'lucide-react'
import { PageLayout, Panel } from '@/components/common/PageLayout/PageLayout'
import { KpiTier } from './components/KpiTier'
import { MmtbDataTable } from './components/MmtbDataTable'
import { VietnamRegionMap } from './components/VietnamRegionMap'
import { TopUsersPanel } from './components/TopUsersPanel'
import { EquipmentDetailDrawer } from './components/EquipmentDetailDrawer'
import { useCeoDashboardData } from './hooks/useCeoDashboardData'
import type { MmtbRow } from './types'

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
            title="Tổng Quan"
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

        {/* Tier 2 — Map | Top 10 */}
        <motion.div
          custom={1}
          variants={TIER_VARIANTS}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch shrink-0"
        >
          <div className="lg:col-span-7 h-[420px]">
            <VietnamRegionMap
              regions={data.regions}
              getMachinesByRegion={getMachinesByRegion}
            />
          </div>
          <div className="lg:col-span-5 h-[420px]">
            <TopUsersPanel units={data.usageUnits} />
          </div>
        </motion.div>

        {/* Tier 3 — MMTB table full width */}
        <motion.div custom={2} variants={TIER_VARIANTS} initial="hidden" animate="visible" className="flex-1 min-h-[280px]">
          <MmtbDataTable
            data={filteredMachines}
            search={filters.search}
            onSearchChange={v => setFilters(f => ({ ...f, search: v }))}
            onRowClick={row => {
              setSelectedMachine(row)
              setMachineDrawerOpen(true)
            }}
          />
        </motion.div>
      </PageLayout>

      <EquipmentDetailDrawer
        machine={selectedMachine}
        open={machineDrawerOpen}
        onOpenChange={setMachineDrawerOpen}
      />
    </>
  )
}
