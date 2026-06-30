import { useMemo, useState } from 'react'
import { CEO_DASHBOARD_MOCK } from '../data/mockCeoDashboard'
import type { AiRecommendationRow, DashboardFilters, MmtbRow } from '../types'

const DEFAULT_FILTERS: DashboardFilters = {
  project: 'Tất cả dự án',
  region: 'Tất cả vùng',
  status: 'Tất cả trạng thái',
  search: '',
}

export function useCeoDashboardData() {
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS)
  const [dateRange] = useState({ from: '01/06/2025', to: '30/06/2025' })

  const filteredMachines = useMemo(() => {
    let rows = CEO_DASHBOARD_MOCK.machines
    if (filters.project !== 'Tất cả dự án') {
      rows = rows.filter(r => r.projectLocation === filters.project)
    }
    if (filters.region !== 'Tất cả vùng') {
      rows = rows.filter(r => {
        const region = CEO_DASHBOARD_MOCK.regions.find(x => x.id === r.regionId)
        return region?.name === filters.region
      })
    }
    if (filters.status !== 'Tất cả trạng thái') {
      rows = rows.filter(r => r.status === filters.status)
    }
    const q = filters.search.trim().toLowerCase()
    if (q) {
      rows = rows.filter(r =>
        r.machineCode.toLowerCase().includes(q)
        || r.equipmentType.toLowerCase().includes(q)
        || r.projectLocation.toLowerCase().includes(q),
      )
    }
    return rows
  }, [filters])

  const getMachinesByRegion = (regionId: string): MmtbRow[] =>
    CEO_DASHBOARD_MOCK.machines.filter(m => m.regionId === regionId)

  const getAiById = (id: string): AiRecommendationRow | undefined =>
    CEO_DASHBOARD_MOCK.aiRecommendations.find(r => r.id === id)

  const getMachineById = (id: string): MmtbRow | undefined =>
    CEO_DASHBOARD_MOCK.machines.find(m => m.id === id)

  return {
    data: CEO_DASHBOARD_MOCK,
    filters,
    setFilters,
    dateRange,
    filteredMachines,
    getMachinesByRegion,
    getAiById,
    getMachineById,
  }
}
