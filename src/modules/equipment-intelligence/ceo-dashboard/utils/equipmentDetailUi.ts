import { CEO_DASHBOARD_MOCK } from '../data/mockCeoDashboard'
import type { AiRecommendationRow, MmtbRow } from '../types'

export interface EquipmentDetailView {
  regionName: string
  serialNumber: string
  commissionDate: string
  warrantyUntil: string
  productionYear: number
  pmDaysUntilDue: number
  pmNextItem: string
  pmProgressPct: number
  aiRecommendation: AiRecommendationRow | undefined
}

export function resolveEquipmentDetail(machine: MmtbRow): EquipmentDetailView {
  const region = CEO_DASHBOARD_MOCK.regions.find(r => r.id === machine.regionId)
  const ai = CEO_DASHBOARD_MOCK.aiRecommendations.find(r => r.machineCode === machine.machineCode)

  const suffix = machine.machineCode.split('-')[1] ?? '000'
  const typeToken = machine.equipmentType.replace(/\s+/g, '').slice(-6).toUpperCase() || 'EQ'

  return {
    regionName: region?.name ?? '—',
    serialNumber: machine.serialNumber ?? `${typeToken}-2022-${suffix.padStart(5, '0')}`,
    commissionDate: machine.commissionDate ?? '01/01/2022',
    warrantyUntil: machine.warrantyUntil ?? '01/01/2027',
    productionYear: machine.productionYear ?? ai?.manufactureYear ?? 2021,
    pmDaysUntilDue: machine.pmDaysUntilDue
      ?? (machine.pmStatus === 'overdue' ? -2 : machine.pmStatus === 'upcoming' ? 5 : 30),
    pmNextItem: machine.pmNextItem ?? 'Bảo dưỡng định kỳ',
    pmProgressPct: machine.pmProgressPct
      ?? (machine.pmStatus === 'overdue' ? 100 : machine.pmStatus === 'upcoming' ? 80 : 45),
    aiRecommendation: ai,
  }
}

export const RELIABILITY_SPARKLINE = [
  { day: '01/06', value: 118 },
  { day: '06/06', value: 122 },
  { day: '12/06', value: 115 },
  { day: '18/06', value: 128 },
  { day: '24/06', value: 119 },
  { day: '30/06', value: 120 },
] as const

export function aiSeverityLabel(severity: AiRecommendationRow['severity']): string {
  const map = { critical: 'Critical', high: 'High', medium: 'Medium', info: 'Info' } as const
  return map[severity]
}
