import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { EquipmentSidebar } from './components/EquipmentSidebar'
import { EquipmentTopHeader } from './components/EquipmentTopHeader'
import { KpiTier } from './components/KpiTier'
import { MmtbDataTable } from './components/MmtbDataTable'
import { VietnamRegionMap } from './components/VietnamRegionMap'
import { TopUsersPanel } from './components/TopUsersPanel'
import { AiRecommendationsPanel } from './components/AiRecommendationsPanel'
import { EquipmentDetailDrawer } from './components/EquipmentDetailDrawer'
import { AiRecommendationDrawer } from './components/AiRecommendationDrawer'
import { useCeoDashboardData } from './hooks/useCeoDashboardData'
import type { AiRecommendationRow, MmtbRow } from './types'

export function CeoDashboardPage() {
  const {
    data, filters, setFilters, dateRange, filteredMachines,
    getMachinesByRegion,
  } = useCeoDashboardData()

  const [selectedMachine, setSelectedMachine] = useState<MmtbRow | null>(null)
  const [machineDrawerOpen, setMachineDrawerOpen] = useState(false)
  const [selectedAi, setSelectedAi] = useState<AiRecommendationRow | null>(null)
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const regions = ['Tất cả vùng', ...data.regions.map(r => r.name)]

  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1)
  }, [])

  return (
    <div className="flex min-h-screen bg-[#07111F] text-slate-200 pb-16 lg:pb-0">
      <EquipmentSidebar
        filters={filters}
        onFilterChange={patch => setFilters(f => ({ ...f, ...patch }))}
        projects={data.projects}
        regions={regions}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <EquipmentTopHeader
          dateRange={dateRange}
          project={filters.project}
          projects={data.projects}
          onProjectChange={p => setFilters(f => ({ ...f, project: p }))}
          onRefresh={handleRefresh}
        />

        <motion.main
          key={refreshKey}
          initial={{ opacity: 0.6 }}
          animate={{ opacity: 1 }}
          className="flex-1 overflow-y-auto p-3 md:p-4 space-y-4"
        >
          {/* Tier 1 */}
          <KpiTier
            fleet={data.fleet}
            pm={data.pm}
            reliability={data.reliability}
            asset={data.asset}
          />

          {/* Tier 2 — MMTB table full width */}
          <MmtbDataTable
            data={filteredMachines}
            search={filters.search}
            onSearchChange={v => setFilters(f => ({ ...f, search: v }))}
            onRowClick={row => {
              setSelectedMachine(row)
              setMachineDrawerOpen(true)
            }}
          />

          {/* Tier 3 — 25% | 25% | 50% on xl; stack on mobile */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="md:col-span-1 xl:col-span-1">
              <VietnamRegionMap regions={data.regions} getMachinesByRegion={getMachinesByRegion} />
            </div>
            <div className="md:col-span-1 xl:col-span-1">
              <TopUsersPanel units={data.usageUnits} />
            </div>
            <div className="md:col-span-2 xl:col-span-2">
              <AiRecommendationsPanel
                items={data.aiRecommendations}
                onSelect={item => {
                  setSelectedAi(item)
                  setAiDrawerOpen(true)
                }}
              />
            </div>
          </div>
        </motion.main>
      </div>

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
    </div>
  )
}
