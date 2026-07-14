import type { CeoDashboardData, MmtbRow } from '../types'
import type { Machine } from '../../../module01-equipment-productivity/types'
import { MACHINES } from '../../../module01-equipment-productivity/data/mockProductivity'

const EXAMPLE_MACHINES: MmtbRow[] = [
  {
    id: 'm-014',
    machineCode: 'SANY-014',
    equipmentType: 'Cọc nhồi SR285R',
    projectLocation: 'Hạ Long Xanh',
    regionId: 'quang-ninh',
    status: 'Working',
    healthScore: 72,              // fixed: 42 was too low for Working (range 60–95)
    engineHours: 8450,
    utilizationPct: 85,
    mtbfHours: 191,               // linked to healthScore: round(60 + (72/99)*180) = 191
    mttrHours: 3.8,
    mttfHours: 8200,
    pmStatus: 'upcoming',         // 8450 % 250 = 200 → pmIdx 1 (upcoming, 50h remaining)
    pmStatusLabel: 'Sắp tới hạn 50h',
    usageUnit: 'FECON',
    latestAiRecommendation: 'Nhiệt độ nước làm mát cao bất thường',
    serialNumber: '285R-2022-01456',
    commissionDate: '12/03/2022',
    warrantyUntil: '12/03/2027',
    productionYear: 2022,
    pmDaysUntilDue: 6,            // 50h remaining / 8h/day ≈ 6 days
    pmNextItem: 'Thay lọc dầu thủy lực',
    pmProgressPct: 80,
    availabilityPct: Math.round(191 / (191 + 3.8) * 1000) / 10,
  },
  {
    id: 'm-021',
    machineCode: 'SANY-021',
    equipmentType: 'Cọc nhồi SR235',
    projectLocation: 'Cần Giờ',
    regionId: 'can-gio',
    status: 'Standby',
    healthScore: 65,
    engineHours: 6120,
    utilizationPct: 62,
    mtbfHours: 180,
    mttrHours: 2.4,
    mttfHours: 9100,
    pmStatus: 'upcoming',
    pmStatusLabel: 'Sắp tới hạn 35h',
    usageUnit: 'SGC',
    latestAiRecommendation: 'PM sắp tới hạn trong 20 giờ',
    serialNumber: 'SR235-2021-00892',
    commissionDate: '05/08/2021',
    warrantyUntil: '05/08/2026',
    productionYear: 2021,
    pmDaysUntilDue: 3,
    pmNextItem: 'Thay lọc dầu thủy lực + kiểm tra van an toàn',
    pmProgressPct: 72,
    availabilityPct: Math.round(180 / (180 + 2.4) * 1000) / 10,
  },
  {
    id: 'm-007',
    machineCode: 'XCMG-007',
    equipmentType: 'Cọc nhồi XG500E',
    projectLocation: 'Hải Vân Bay',
    regionId: 'da-nang',
    status: 'Breakdown',
    healthScore: 25,
    engineHours: 3210,
    utilizationPct: 0,
    mtbfHours: 85,
    mttrHours: 6.2,
    mttfHours: 4200,
    pmStatus: 'overdue',
    pmStatusLabel: 'Quá hạn 10h',
    usageUnit: 'Bauer Vietnam',
    latestAiRecommendation: 'Thiết bị mất kết nối >24h',
    serialNumber: 'XG500E-2023-00341',
    commissionDate: '18/01/2023',
    warrantyUntil: '18/01/2028',
    productionYear: 2023,
    pmDaysUntilDue: -10,
    pmNextItem: 'Bảo dưỡng tổng hợp PM250h',
    pmProgressPct: 100,
    availabilityPct: Math.round(85 / (85 + 6.2) * 1000) / 10,
  },
]

/**
 * Fleet composition (100 total — mirrors Module 1):
 *   Drilling (SANY SR285R/SR235C, BAUER BG28, XCMG XR280D):  40
 *   Excavator (Komatsu PC300, Hitachi ZX350, CAT 336):        20
 *   Pile driver (Sunward SWDM22, Junttan PM26):               15
 *   Concrete pump (Schwing S34SX, Putzmeister BSF36):         15
 *   Roller / compactor (Bomag BW213, Dynapac CA250):          10
 */
const MODELS = [
  { type: 'Cọc nhồi SANY SR285R',            prefix: 'SANY',  priceBillionVnd: 18 },
  { type: 'Cọc nhồi SANY SR235C',            prefix: 'SANY',  priceBillionVnd: 15 },
  { type: 'Cọc nhồi BAUER BG28',             prefix: 'BAUER', priceBillionVnd: 22 },
  { type: 'Cọc nhồi XCMG XR280D',            prefix: 'XCMG',  priceBillionVnd: 17 },
  { type: 'Máy đào Komatsu PC300',            prefix: 'PC3',   priceBillionVnd: 8  },
  { type: 'Máy đào Hitachi ZX350',            prefix: 'ZX3',   priceBillionVnd: 9  },
  { type: 'Máy đào CAT 336',                 prefix: 'C336',  priceBillionVnd: 10 },
  { type: 'Máy ép cọc Sunward SWDM22',       prefix: 'SWDM',  priceBillionVnd: 12 },
  { type: 'Máy ép cọc Junttan PM26',         prefix: 'PM26',  priceBillionVnd: 14 },
  { type: 'Máy bơm bê tông Schwing S34SX',   prefix: 'S34S',  priceBillionVnd: 6  },
  { type: 'Máy bơm bê tông Putzmeister BSF36', prefix: 'BSF3', priceBillionVnd: 7 },
  { type: 'Máy lu Bomag BW213',               prefix: 'BW21',  priceBillionVnd: 5  },
  { type: 'Máy đầm Dynapac CA250',            prefix: 'CA25',  priceBillionVnd: 4  },
]

const PROJECTS = ['Hạ Long Xanh', 'Cần Giờ', 'Hải Vân Bay', 'Vũng Áng', 'Làng Olympic', 'OCP1']
const UNITS = [
  'FECON', 'SGC', 'Bauer Vietnam', 'Coteccons Foundation', 'Delta Foundation',
  'Hòa Bình Foundation', 'Ricons Foundation', 'Central Foundation', 'Vietur Foundation', 'Sơn Hải Foundation',
]
const REGIONS = [
  { id: 'quang-ninh', name: 'Quảng Ninh', project: 'Hạ Long Xanh' },
  { id: 'ha-noi',     name: 'Hà Nội',     project: 'OCP1' },
  { id: 'vung-ang',   name: 'Hà Tĩnh / Vũng Áng', project: 'Vũng Áng' },
  { id: 'da-nang',    name: 'Đà Nẵng / Hải Vân Bay', project: 'Hải Vân Bay' },
  { id: 'can-gio',    name: 'Cần Giờ', project: 'Cần Giờ' },
  { id: 'long-an',    name: 'Long An',    project: 'Làng Olympic' },
]

/**
 * Status distribution: 60% Working / 20% Standby / 10% Breakdown / 10% Stored
 * Cycle of 10 ensures exact distribution across the fleet.
 */
function assignStatus(i: number): MmtbRow['status'] {
  const r = i % 10
  if (r < 6) return 'Working'    // 6/10 = 60%
  if (r < 8) return 'Standby'    // 2/10 = 20%
  if (r < 9) return 'Breakdown'  // 1/10 = 10%
  return 'Stored'                 // 1/10 = 10%
}

function getMtbfOffset(prefix: string): number {
  // Simpler machines (rollers, pumps) have higher baseline MTBF than complex drilling rigs
  if (prefix === 'BW21' || prefix === 'CA25') return 40   // rollers: simpler mechanics
  if (prefix === 'S34S' || prefix === 'BSF3') return 20   // pumps: moderate complexity
  return 0  // drilling / excavators / pile drivers: standard range
}

function getMttrBase(prefix: string, i: number): number {
  // Simpler machines repair faster
  if (prefix === 'BW21' || prefix === 'CA25') return 1.2 + (i % 30) / 20   // 1.2–2.7h
  if (prefix === 'S34S' || prefix === 'BSF3') return 1.4 + (i % 40) / 15   // 1.4–4.1h
  return 1.5 + (i % 50) / 12  // 1.5–5.7h (drilling / excavators)
}

// ── Adapter: Machine (module01) → MmtbRow (equipment-intelligence) ───────────

const PROJECT_LOCATION_MAP: Record<string, string> = {
  ocp1: 'OCP1',
  hnx:  'Hạ Long Xanh',
  cg:   'Cần Giờ',
  hvb:  'Hải Vân Bay',
  va:   'Vũng Áng',
  olp:  'Làng Olympic',
}

const PROJECT_REGION_MAP: Record<string, string> = {
  ocp1: 'ha-noi',
  hnx:  'quang-ninh',
  cg:   'can-gio',
  hvb:  'da-nang',
  va:   'vung-ang',
  olp:  'long-an',
}

const MACHINE_STATUS_MAP: Record<string, MmtbRow['status']> = {
  working:   'Working',
  idle:      'Standby',
  breakdown: 'Breakdown',
  stored:    'Stored',
}

export function machineToMmtbRow(m: Machine, idx: number): MmtbRow {
  const prefix = m.code.split('-')[0]
  const status = MACHINE_STATUS_MAP[m.status] ?? 'Standby'

  // healthScore: driven by operational status + today's utilisation
  const rawHealth = m.status === 'breakdown' ? 15 + (idx % 30)
    : m.status === 'idle'   ? 48 + (idx % 28)
    : m.status === 'stored' ? 55 + (idx % 20)
    : Math.min(95, 60 + Math.round(m.utilizationPct * 0.35) + (idx % 12))
  const healthCapped = Math.min(99, rawHealth)

  // Cumulative engine hours estimated from today's shift hours
  const engineHours = Math.max(500, m.workingHours * 100 + (idx * 137) % 5000)

  const mtbf = Math.round(60 + getMtbfOffset(prefix) + (healthCapped / 99) * 180)
  const mttr = Math.round(getMttrBase(prefix, idx) * 10) / 10
  const mttf = 4500 + (healthCapped * 55) + (idx * 11) % 3000

  // PM compliance (250h interval)
  const PM_INTERVAL = 250
  const pmCyclePos = engineHours % PM_INTERVAL
  const pmIdx = pmCyclePos < 195 ? 0 : pmCyclePos < 235 ? 1 : 2

  const availabilityPct = m.status === 'breakdown'
    ? Math.round((5  + (idx % 15)) * 10) / 10
    : m.status === 'stored'
      ? Math.round((45 + (idx % 20)) * 10) / 10
      : Math.round(mtbf / (mtbf + mttr) * 1000) / 10

  return {
    id: m.id,
    machineCode: m.code,
    equipmentType: m.type,
    projectLocation: PROJECT_LOCATION_MAP[m.projectId] ?? m.projectId,
    regionId: PROJECT_REGION_MAP[m.projectId] ?? 'ha-noi',
    status,
    healthScore: healthCapped,
    engineHours,
    utilizationPct: m.utilizationPct,
    mtbfHours: mtbf,
    mttrHours: mttr,
    mttfHours: mttf,
    pmStatus:      pmIdx === 0 ? 'on_time' : pmIdx === 1 ? 'upcoming' : 'overdue',
    pmStatusLabel: pmIdx === 0 ? 'Đúng hạn'
      : pmIdx === 1 ? `Sắp tới hạn ${PM_INTERVAL - pmCyclePos}h`
      : `Quá hạn ${pmCyclePos - 235}h`,
    usageUnit: UNITS[idx % UNITS.length],
    availabilityPct,
  }
}

function generateMachines(count: number): MmtbRow[] {
  const rows: MmtbRow[] = [...EXAMPLE_MACHINES]
  const PM_INTERVAL = 250
  for (let i = rows.length; i < count; i += 1) {
    const model  = MODELS[i % MODELS.length]
    const region = REGIONS[i % REGIONS.length]
    const status = assignStatus(i)

    // health drives reliability — linked to MTBF/MTTF below
    const health = status === 'Breakdown' ? 15 + (i % 30)
      : status === 'Standby'   ? 48 + (i % 28)
      : status === 'Stored'    ? 55 + (i % 20)
      :                          60 + (i % 35)
    const healthCapped = Math.min(99, health)

    // MTBF: health-driven + type offset → higher for simpler machines
    const mtbfOffset = getMtbfOffset(model.prefix)
    const mtbf = Math.round(60 + mtbfOffset + (healthCapped / 99) * 180)
    const mttr = Math.round(getMttrBase(model.prefix, i) * 10) / 10

    // MTTF >> MTBF: higher health = longer lifetime before permanent failure
    const mttf = 4500 + (healthCapped * 55) + (i * 11) % 3000

    const util = status === 'Breakdown' ? 0
      : status === 'Stored'   ? 10 + (i % 20)
      : status === 'Standby'  ? 30 + (i % 35)
      :                         55 + (i % 40)

    const engineHours = 1500 + (i * 137) % 9500

    // PM interval: 250h — pmStatus linked to position in current PM cycle
    // Distribution: ~78% on_time | ~16% upcoming | ~6% overdue
    const pmCyclePos = engineHours % PM_INTERVAL
    const pmIdx = pmCyclePos < 195 ? 0
      : pmCyclePos < 235           ? 1
      :                              2

    // availabilityPct = MTBF / (MTBF + MTTR) × 100 — standard formula for all types
    rows.push({
      id: `m-gen-${i}`,
      machineCode: `${model.prefix}-${String(100 + i).padStart(3, '0')}`,
      equipmentType: model.type,
      projectLocation: region.project,
      regionId: region.id,
      status,
      healthScore: healthCapped,
      engineHours,
      utilizationPct: Math.min(98, util),
      mtbfHours: mtbf,
      mttrHours: mttr,
      mttfHours: mttf,
      pmStatus: pmIdx === 0 ? 'on_time' : pmIdx === 1 ? 'upcoming' : 'overdue',
      pmStatusLabel: pmIdx === 0 ? 'Đúng hạn'
        : pmIdx === 1 ? `Sắp tới hạn ${PM_INTERVAL - pmCyclePos}h`
        : `Quá hạn ${pmCyclePos - 235}h`,
      usageUnit: UNITS[i % UNITS.length],
      availabilityPct: status === 'Breakdown'
        ? Math.round((5 + (i % 15)) * 10) / 10   // 5–19% khi đang hỏng
        : status === 'Stored'
          ? Math.round((45 + (i % 20)) * 10) / 10  // 45–64% khi lưu kho
          : Math.round(mtbf / (mtbf + mttr) * 1000) / 10,
    })
  }
  return rows
}

// Tổng số máy — dẫn xuất trực tiếp từ MACHINES (module01)
const TOTAL_MMTB = MACHINES.length

const ALL_MACHINES = MACHINES.map((m, i) => machineToMmtbRow(m, i))

// Tổng giá trị tài sản (tỷ VND) — dẫn xuất từ giá từng dòng máy
const totalAssetValue = Math.round(
  ALL_MACHINES.reduce((sum, _m, i) => sum + MODELS[i % MODELS.length].priceBillionVnd, 0)
)

// Tài sản nhàn rỗi = Standby + Stored
const idleAssetValue = Math.round(
  ALL_MACHINES.reduce((sum, m, i) => {
    if (m.status !== 'Standby' && m.status !== 'Stored') return sum
    return sum + MODELS[i % MODELS.length].priceBillionVnd
  }, 0)
)

// Giờ dịch vụ / tỷ VND đầu tư = tổng engine hours của máy Working / totalAssetValue
const totalWorkingHours = ALL_MACHINES
  .filter(m => m.status === 'Working')
  .reduce((sum, m) => sum + m.engineHours, 0)
const serviceHoursPerBillion = Math.round(totalWorkingHours / totalAssetValue * 10) / 10

// Data consistency summary:
// Fleet: 100 máy = 20+25+20+15+12+8 (regions HNX+OCP1+CG+HVB+VA+OLP) ✓
// Status 60%/20%/10%/10% via assignStatus(i%10) cycle → 60/20/10/10
// healthScore ↔ mtbfHours: linked — mtbf = round(60 + offset + (healthCapped/99)*180)
// availabilityPct: MTBF / (MTBF + MTTR) × 100 applied consistently to all machine types
// PM compliance: 86/(86+8) = 91.5% ≈ 91% ✓ | 86+8+6 = 100 ✓
export const CEO_DASHBOARD_MOCK: CeoDashboardData = {
  fleet: {
    // 100 máy: 60% hoạt động, 20% chờ, 10% hỏng, 10% kho
    totalMmtb: TOTAL_MMTB,
    breakdown: {
      working:   ALL_MACHINES.filter(m => m.status === 'Working').length,
      standby:   ALL_MACHINES.filter(m => m.status === 'Standby').length,
      breakdown: ALL_MACHINES.filter(m => m.status === 'Breakdown').length,
      stored:    ALL_MACHINES.filter(m => m.status === 'Stored').length,
    },
    fleetUtilizationPct: 60,        // 60 / 100 = 60%
    fleetUtilizationTrendPct: 3,
  },
  pm: {
    compliancePct: 91,
    trendPct: 4,
    completedOnTime: 86,           // round(0.91 × 94) = 86
    upcomingUnder50h: 6,
    overdue: 8,                    // 94 − 86 = 8 → 86/(86+8) = 91.5% ≈ 91% ✓
    totalPlanned: 100,             // 1 lịch bảo dưỡng / máy — 86+6+8 = 100 ✓
  },
  reliability: {
    mtbfHours: 186,
    mtbfTrendPct: 12,
    mttrHours: 2.6,
    mttrTrendPct: -0.4,
    mttfHours: 8420,
    mttfTrendPct: 9,
  },
  asset: {
    totalAssetValueBillionVnd: totalAssetValue,
    idleAssetValueBillionVnd: idleAssetValue,
    serviceHoursPerBillionVnd: serviceHoursPerBillion,
  },
  regions: [
    // x/y % relative to cropped viewBox -12 -12 405 824 — province centroids
    // Tổng 20+25+12+15+20+8 = 100 máy ✓
    { id: 'quang-ninh', name: 'Quảng Ninh',            machineCount:  20, x: 71.2, y: 15.9 },
    { id: 'ha-noi',     name: 'Hà Nội',                 machineCount:  25, x: 50.8, y: 16.7 },
    { id: 'vung-ang',   name: 'Hà Tĩnh / Vũng Áng',    machineCount:  12, x: 50.1, y: 35.4 },
    { id: 'da-nang',    name: 'Đà Nẵng / Hải Vân Bay',  machineCount:  15, x: 79.3, y: 50.3 },
    { id: 'can-gio',    name: 'Cần Giờ (HCM)',          machineCount:  20, x: 63.4, y: 86.3 },
    { id: 'long-an',    name: 'Long An',                 machineCount:   8, x: 54.1, y: 84.9 },
  ],
  usageUnits: [
    // Tổng totalMmtb = 16+14+12+11+10+9+9+8+6+5 = 100 máy ✓
    { rank:  1, name: 'FECON',                totalMmtb: 16, utilizationPct: 82 },
    { rank:  2, name: 'SGC',                  totalMmtb: 14, utilizationPct: 79 },
    { rank:  3, name: 'Bauer Vietnam',        totalMmtb: 12, utilizationPct: 76 },
    { rank:  4, name: 'Coteccons Foundation', totalMmtb: 11, utilizationPct: 74 },
    { rank:  5, name: 'Delta Foundation',     totalMmtb: 10, utilizationPct: 72 },
    { rank:  6, name: 'Hòa Bình Foundation',  totalMmtb:  9, utilizationPct: 69 },
    { rank:  7, name: 'Ricons Foundation',    totalMmtb:  9, utilizationPct: 70 },
    { rank:  8, name: 'Central Foundation',   totalMmtb:  8, utilizationPct: 68 },
    { rank:  9, name: 'Vietur Foundation',    totalMmtb:  6, utilizationPct: 65 },
    { rank: 10, name: 'Sơn Hải Foundation',   totalMmtb:  5, utilizationPct: 52 },
  ],
  aiRecommendations: [
    {
      id: 'ai-1',
      severity: 'high',
      machineCode: 'SANY-014',
      recommendation: 'Nhiệt độ nước làm mát cao bất thường',
      detail: 'Kiểm tra hệ thống làm mát và mức nước',
      riskScorePct: 82,
      ruleId: 'DIAG-006',
      confidencePct: 91,
      ruleType: 'COMBINE_METRIC',
      ruleLogic: 'P0087 AND Fuel_Rate < Expected_Fuel_Rate * 0.7 AND Engine_Load > 70%',
      timeWindow: '72 giờ gần nhất',
      context: 'Máy đang ép tải cao tại Hạ Long Xanh · Zone B',
      abnormalMetrics: ['Fuel_Rate -28%', 'Rail_Pressure +15%', 'Engine_Load 74%'],
      metricDetails: [
        { metric: 'Fuel Rate', current: '38 L/h', threshold: '> 55 L/h', deviation: '-30%', direction: 'down' },
        { metric: 'Engine Load', current: '78 %', threshold: '> 70 %', deviation: '+8%', direction: 'up' },
        { metric: 'Rail Pressure', current: '420 bar', threshold: '> 500 bar', deviation: '-16%', direction: 'down' },
      ],
      firstOccurrence: '01/06/2025 08:12',
      lastOccurrence: '01/06/2025 10:28',
      occurrenceCount: 5,
      connectionStatus: 'Online',
      manufactureYear: 2022,
      explanation: 'Nghẹt lọc nhiên liệu làm giảm lưu lượng dầu cấp gây lịm máy khi ép tải.',
      recommendationSteps: [
        'Kiểm tra cốc lọc tách nước.',
        'Xả cặn.',
        'Thay lọc tinh + lọc thô.',
        'Bơm tay xả e.',
        'Kiểm tra lại áp suất Rail.',
      ],
    },
    {
      id: 'ai-2',
      severity: 'high',
      machineCode: 'SANY-021',
      recommendation: 'PM sắp tới hạn trong 20 giờ',
      detail: 'PM250 sẽ đến hạn trong 20 giờ nữa',
      riskScorePct: 67,
      ruleId: 'PM-002',
      confidencePct: 91,
      ruleLogic: 'Engine_Hours >= PM_Interval - 20h',
      timeWindow: '24 giờ',
      context: 'Cần Giờ · ca kế tiếp',
      abnormalMetrics: ['PM_Remaining 20h'],
      metricDetails: [
        { metric: 'PM Remaining Hours', current: '20 h', threshold: '≤ 20 h', deviation: '-92%', direction: 'down' as const },
        { metric: 'Engine Hours', current: '6.120 h', threshold: 'PM due: 6.230 h', deviation: '-110 h', direction: 'down' as const },
      ],
      firstOccurrence: '30/05/2025 06:00',
      lastOccurrence: '01/06/2025 06:00',
      occurrenceCount: 3,
      connectionStatus: 'Online' as const,
      manufactureYear: 2021,
      explanation: 'Máy sắp vượt ngưỡng bảo dưỡng định kỳ — rủi ro hỏng hóc tăng.',
      recommendationSteps: ['Lên lịch PM trong ca hiện tại.', 'Chuẩn bị phụ tùng lọc dầu/hydraulic.'],
    },
    {
      id: 'ai-3',
      severity: 'high',
      machineCode: 'XCMG-007',
      recommendation: 'Thiết bị mất kết nối >24h',
      detail: 'Kiểm tra nguồn và thiết bị truyền dữ liệu',
      riskScorePct: 75,
      ruleId: 'CONN-001',
      confidencePct: 95,
      ruleLogic: 'Last_Signal > 24h AND Status != Stored',
      timeWindow: '48 giờ',
      context: 'Hải Vân Bay',
      abnormalMetrics: ['Signal_Gap 26h'],
      metricDetails: [
        { metric: 'Signal Gap', current: '26 h', threshold: '≤ 24 h', deviation: '+8%', direction: 'up' as const },
        { metric: 'Last Heartbeat', current: '26 h trước', threshold: '< 1 h', deviation: '+2500%', direction: 'up' as const },
        { metric: 'Packet Loss Rate', current: '100 %', threshold: '≤ 5 %', deviation: '+1900%', direction: 'up' as const },
      ],
      firstOccurrence: '31/05/2025 08:30',
      lastOccurrence: '01/06/2025 10:00',
      occurrenceCount: 2,
      connectionStatus: 'Offline' as const,
      manufactureYear: 2023,
      explanation: 'Mất telemetry — không giám sát được trạng thái vận hành.',
      recommendationSteps: ['Kiểm tra antena IoT.', 'Xác minh nguồn điện tủ điều khiển.'],
    },
    {
      id: 'ai-4',
      severity: 'medium',
      machineCode: 'SANY-105',
      recommendation: 'Hiệu suất sử dụng thấp',
      detail: 'Đề xuất điều chuyển sang Hải Vân Bay',
      riskScorePct: 60,
      ruleId: 'UTIL-003',
      confidencePct: 78,
      ruleLogic: 'Utilization_7d < 45% AND Idle_Streak > 30min',
      timeWindow: '7 ngày',
      context: 'Làng Olympic · Khu đóng cọc A',
      abnormalMetrics: ['Utilization 38%', 'Idle 52h/tuần'],
      metricDetails: [
        { metric: 'Utilization 7d', current: '38 %', threshold: '≥ 45 %', deviation: '-15.5%', direction: 'down' as const },
        { metric: 'Idle Hours / Week', current: '52 h', threshold: '< 30 h', deviation: '+73%', direction: 'up' as const },
        { metric: 'Penetration Rate', current: '1.4 m/h', threshold: '≥ 2.5 m/h', deviation: '-44%', direction: 'down' as const },
      ],
      firstOccurrence: '25/05/2025 07:00',
      lastOccurrence: '01/06/2025 17:00',
      occurrenceCount: 7,
      connectionStatus: 'Online' as const,
      manufactureYear: 2022,
      explanation: 'Máy idle kéo dài — lãng phí giờ khai thác mục tiêu 20h/ngày.',
      recommendationSteps: ['Điều chuyển sang khu có backlog cao.', 'Đồng bộ lịch cọc với điều phối.'],
    },
    {
      id: 'ai-5',
      severity: 'high',
      machineCode: 'XCMG-103',
      recommendation: 'Áp suất thủy lực bất thường',
      detail: 'Áp suất trung bình cao hơn ngưỡng 15%',
      riskScorePct: 65,
      ruleId: 'HYD-004',
      confidencePct: 82,
      ruleLogic: 'Hyd_Pressure > Normal_Range * 1.15 AND Duration > 2h',
      timeWindow: '24 giờ',
      context: 'Hải Vân Bay · Khu A',
      abnormalMetrics: ['Hyd_Pressure +18%', 'Temperature +6°C'],
      metricDetails: [
        { metric: 'Hyd Pressure', current: '295 bar', threshold: '≤ 250 bar', deviation: '+18%', direction: 'up' as const },
        { metric: 'Oil Temperature', current: '91°C', threshold: '≤ 85°C', deviation: '+7%', direction: 'up' as const },
        { metric: 'Pressure Duration', current: '2.5 h', threshold: '< 2 h', deviation: '+25%', direction: 'up' as const },
      ],
      firstOccurrence: '01/06/2025 07:45',
      lastOccurrence: '01/06/2025 10:15',
      occurrenceCount: 4,
      connectionStatus: 'Online' as const,
      manufactureYear: 2021,
      explanation: 'Áp suất cao kéo dài có thể gây vỡ ống thủy lực.',
      recommendationSteps: ['Kiểm tra van an toàn thủy lực.', 'Giảm tải công tác.', 'Đo nhiệt độ dầu thủy lực.'],
    },
    {
      id: 'ai-6',
      severity: 'info',
      machineCode: 'SANY-104',
      recommendation: 'Thiết bị idle cao bất thường',
      detail: 'Idle 85% thời gian, cần xem xét tối ưu',
      riskScorePct: 58,
      ruleId: 'IDLE-002',
      confidencePct: 74,
      ruleLogic: 'Idle_Pct_7d > 80%',
      timeWindow: '7 ngày',
      context: 'Cần Giờ',
      abnormalMetrics: ['Idle 85%', 'Engine_Hours thấp'],
      metricDetails: [
        { metric: 'Idle Percent 7d', current: '85 %', threshold: '≤ 80 %', deviation: '+6%', direction: 'up' as const },
        { metric: 'Engine Hours 7d', current: '11.2 h', threshold: '≥ 70 h', deviation: '-84%', direction: 'down' as const },
        { metric: 'Penetration Rate', current: '0.3 m/h', threshold: '≥ 2.0 m/h', deviation: '-85%', direction: 'down' as const },
      ],
      firstOccurrence: '26/05/2025 08:00',
      lastOccurrence: '01/06/2025 17:00',
      occurrenceCount: 6,
      connectionStatus: 'Online' as const,
      manufactureYear: 2023,
      explanation: 'Máy chạy không tải 85% thời gian — cần rà soát kế hoạch sản xuất.',
      recommendationSteps: ['Xem xét lại lịch thi công.', 'Cân nhắc điều phối sang công trường khác.'],
    },

    // ── DIAG — Chẩn đoán kỹ thuật ──────────────────────────────────────────────
    {
      id: 'ai-7',
      severity: 'high',
      machineCode: 'SANY-106',
      recommendation: 'Áp suất dầu động cơ thấp dưới ngưỡng',
      detail: 'Kiểm tra bơm dầu và mức dầu động cơ ngay',
      riskScorePct: 78,
      ruleId: 'DIAG-001',
      confidencePct: 88,
      ruleType: 'THRESHOLD',
      ruleLogic: 'Engine_Oil_Pressure < 2.5 bar AND Duration > 30min',
      timeWindow: '6 giờ gần nhất',
      context: 'Vũng Áng · Khu khoan cọc C2',
      abnormalMetrics: ['Oil_Pressure -32%', 'Engine_Temp +4°C'],
      metricDetails: [
        { metric: 'Engine Oil Pressure', current: '2.1 bar', threshold: '≥ 2.5 bar', deviation: '-16%', direction: 'down' as const },
        { metric: 'Engine Temperature', current: '93°C', threshold: '< 90°C', deviation: '+3%', direction: 'up' as const },
      ],
      firstOccurrence: '31/05/2025 14:20',
      lastOccurrence: '01/06/2025 09:45',
      occurrenceCount: 3,
      connectionStatus: 'Online' as const,
      manufactureYear: 2021,
      explanation: 'Áp suất dầu thấp kéo dài có thể gây mài mòn trục khuỷu và ổ bi động cơ.',
      recommendationSteps: [
        'Kiểm tra mức dầu bằng que thăm dầu.',
        'Kiểm tra đồng hồ áp suất dầu — xác nhận sự cố phần cứng.',
        'Kiểm tra bơm dầu và van an toàn áp suất.',
        'Thay dầu nếu độ nhớt không đạt.',
        'Không vận hành cho đến khi áp suất về trên 3 bar.',
      ],
    },
    {
      id: 'ai-8',
      severity: 'critical',
      machineCode: 'SANY-107',
      recommendation: 'Nhiệt độ nước làm mát vượt ngưỡng nguy hiểm',
      detail: 'Dừng máy ngay — nguy cơ hỏng xi lanh do quá nhiệt',
      riskScorePct: 93,
      ruleId: 'DIAG-002',
      confidencePct: 96,
      ruleType: 'THRESHOLD',
      ruleLogic: 'Coolant_Temp > 108°C AND Duration > 10min',
      timeWindow: '2 giờ gần nhất',
      context: 'Cần Giờ · Khu cọc D1 — ca chiều',
      abnormalMetrics: ['Coolant_Temp 112°C (+8°C)', 'Fan_Speed -22%'],
      metricDetails: [
        { metric: 'Coolant Temperature', current: '112°C', threshold: '≤ 108°C', deviation: '+4%', direction: 'up' as const },
        { metric: 'Fan Speed', current: '1.560 rpm', threshold: '≥ 2.000 rpm', deviation: '-22%', direction: 'down' as const },
      ],
      firstOccurrence: '01/06/2025 13:10',
      lastOccurrence: '01/06/2025 14:55',
      occurrenceCount: 2,
      connectionStatus: 'Online' as const,
      manufactureYear: 2020,
      explanation: 'Nhiệt độ nước làm mát 112°C vượt ngưỡng 108°C — nguy cơ nứt nắp máy và cong trục cam.',
      recommendationSteps: [
        'Dừng máy ngay, để nguội tự nhiên tối thiểu 20 phút.',
        'Kiểm tra mức nước két làm mát.',
        'Kiểm tra van hằng nhiệt (thermostat).',
        'Vệ sinh két nước — bụi/đất đá bám làm giảm hiệu suất tản nhiệt.',
        'Kiểm tra quạt làm mát và dây curoa dẫn động.',
        'Không khởi động lại cho đến khi nhiệt độ xuống dưới 85°C.',
      ],
    },
    {
      id: 'ai-9',
      severity: 'high',
      machineCode: 'XCMG-108',
      recommendation: 'Nhiệt độ dầu thủy lực cao bất thường',
      detail: 'Kiểm tra két làm mát dầu thủy lực và van bypass',
      riskScorePct: 74,
      ruleId: 'DIAG-003',
      confidencePct: 85,
      ruleType: 'THRESHOLD',
      ruleLogic: 'Hyd_Oil_Temp > 90°C AND Duration > 45min',
      timeWindow: '4 giờ gần nhất',
      context: 'Hải Vân Bay · Khu A3 — khoan địa tầng đá',
      abnormalMetrics: ['Hyd_Oil_Temp 94°C (+9°C)', 'Hyd_Pressure +12%'],
      metricDetails: [
        { metric: 'Hyd Oil Temperature', current: '94°C', threshold: '≤ 85°C', deviation: '+11%', direction: 'up' as const },
        { metric: 'Hyd Pressure', current: '280 bar', threshold: '≤ 250 bar', deviation: '+12%', direction: 'up' as const },
      ],
      firstOccurrence: '01/06/2025 07:30',
      lastOccurrence: '01/06/2025 11:20',
      occurrenceCount: 4,
      connectionStatus: 'Online' as const,
      manufactureYear: 2022,
      explanation: 'Dầu thủy lực quá nhiệt làm giảm độ nhớt, tăng nguy cơ mài mòn bơm và motor thủy lực.',
      recommendationSteps: [
        'Giảm tải công tác 30% trong 30 phút.',
        'Kiểm tra két làm mát dầu thủy lực — bụi bẩn bám bề mặt.',
        'Xả bớt dầu cũ, bổ sung dầu mới đúng loại ISO VG 46.',
        'Kiểm tra van bypass nhiệt.',
      ],
    },
    {
      id: 'ai-10',
      severity: 'medium',
      machineCode: 'SANY-109',
      recommendation: 'Tiêu hao nhiên liệu tăng bất thường 25%',
      detail: 'Kiểm tra kim phun và lọc nhiên liệu',
      riskScorePct: 55,
      ruleId: 'DIAG-004',
      confidencePct: 80,
      ruleType: 'TREND',
      ruleLogic: 'Fuel_Consumption_7d > Baseline * 1.25 AND Engine_Load STABLE',
      timeWindow: '7 ngày gần nhất',
      context: 'Làng Olympic · Zone B — đất nền cứng',
      abnormalMetrics: ['Fuel_Rate +25%', 'Engine_Load ổn định 65%'],
      metricDetails: [
        { metric: 'Fuel Rate', current: '50 L/h', threshold: '≤ 40 L/h', deviation: '+25%', direction: 'up' as const },
        { metric: 'Engine Load', current: '65 %', threshold: 'Stable baseline', deviation: '±0%', direction: 'up' as const },
        { metric: 'Fuel Consumption Delta 7d', current: '+25 %', threshold: '≤ +10 %', deviation: '+150%', direction: 'up' as const },
      ],
      firstOccurrence: '25/05/2025 08:00',
      lastOccurrence: '01/06/2025 08:00',
      occurrenceCount: 6,
      connectionStatus: 'Online' as const,
      manufactureYear: 2022,
      explanation: 'Tiêu hao nhiên liệu tăng không tương ứng với tải — nghi ngờ kim phun bị rỉ hoặc lọc cặn.',
      recommendationSteps: [
        'Kiểm tra lọc nhiên liệu — thay nếu quá hạn.',
        'Kiểm tra kim phun bằng thiết bị đo lưu lượng.',
        'Kiểm tra đường ống hồi nhiên liệu.',
        'Đo mức tiêu hao sau khi thay lọc để xác nhận cải thiện.',
      ],
    },
    {
      id: 'ai-11',
      severity: 'high',
      machineCode: 'SANY-110',
      recommendation: 'Tốc độ vòng quay động cơ không ổn định',
      detail: 'Kiểm tra bộ điều tốc và cảm biến tốc độ động cơ',
      riskScorePct: 70,
      ruleId: 'DIAG-005',
      confidencePct: 83,
      ruleType: 'ANOMALY',
      ruleLogic: 'RPM_Deviation > ±150 RPM AND Frequency > 3 lần/giờ',
      timeWindow: '12 giờ gần nhất',
      context: 'OCP1 · Khu khoan móng block A',
      abnormalMetrics: ['RPM_Deviation ±200 RPM', 'Hunting_Count 8 lần/ca'],
      metricDetails: [
        { metric: 'RPM Deviation', current: '±200 rpm', threshold: '≤ ±150 rpm', deviation: '+33%', direction: 'up' as const },
        { metric: 'Hunting Count', current: '8 lần/ca', threshold: '≤ 3 lần/ca', deviation: '+167%', direction: 'up' as const },
      ],
      firstOccurrence: '01/06/2025 06:20',
      lastOccurrence: '01/06/2025 16:40',
      occurrenceCount: 8,
      connectionStatus: 'Online' as const,
      manufactureYear: 2021,
      explanation: 'Dao động tốc độ quay (hunting) liên tục có thể do bộ điều tốc điện tử lỗi hoặc cảm biến CKP bẩn.',
      recommendationSteps: [
        'Kiểm tra cảm biến tốc độ trục khuỷu (CKP).',
        'Vệ sinh hoặc thay cảm biến CKP nếu bẩn.',
        'Kiểm tra ECU — reset và đọc mã lỗi active.',
        'Kiểm tra bộ điều tốc điện tử.',
      ],
    },
    {
      id: 'ai-12',
      severity: 'medium',
      machineCode: 'SANY-111',
      recommendation: 'Điện áp ắc quy thấp — 11.4V',
      detail: 'Kiểm tra ắc quy và máy phát điện',
      riskScorePct: 48,
      ruleId: 'DIAG-007',
      confidencePct: 90,
      ruleType: 'THRESHOLD',
      ruleLogic: 'Battery_Voltage < 11.8V AND Engine_Running = FALSE',
      timeWindow: '24 giờ gần nhất',
      context: 'Hạ Long Xanh · Bãi đỗ máy đêm',
      abnormalMetrics: ['Battery_Voltage 11.4V (-0.6V)', 'Charge_Rate thấp'],
      metricDetails: [
        { metric: 'Battery Voltage', current: '11.4 V', threshold: '≥ 11.8 V', deviation: '-3%', direction: 'down' as const },
        { metric: 'Charge Rate Voltage', current: '12.8 V', threshold: '13.8–14.5 V', deviation: '-7%', direction: 'down' as const },
      ],
      firstOccurrence: '30/05/2025 18:00',
      lastOccurrence: '01/06/2025 06:30',
      occurrenceCount: 2,
      connectionStatus: 'Online' as const,
      manufactureYear: 2020,
      explanation: 'Ắc quy yếu có thể dẫn đến máy không nổ được, làm gián đoạn ca khởi đầu buổi sáng.',
      recommendationSteps: [
        'Đo điện áp ắc quy lúc khởi động nguội.',
        'Kiểm tra máy phát điện — đo điện áp sạc (13.8–14.5V).',
        'Thay ắc quy nếu dung lượng < 60% CCA gốc.',
        'Kiểm tra cáp ắc quy — vệ sinh tiếp điểm.',
      ],
    },
    {
      id: 'ai-13',
      severity: 'info',
      machineCode: 'XCMG-113',
      recommendation: 'Lọc khí bị clogged — chênh áp cao',
      detail: 'Thay lọc khí trong PM kế tiếp',
      riskScorePct: 38,
      ruleId: 'DIAG-008',
      confidencePct: 88,
      ruleType: 'THRESHOLD',
      ruleLogic: 'Air_Filter_dP > 6.0 kPa AND Engine_Hours_Since_Last_Replace > 200h',
      timeWindow: '48 giờ gần nhất',
      context: 'Vũng Áng · Môi trường nhiều bụi đất',
      abnormalMetrics: ['Air_Filter_dP 6.8 kPa (+13%)', 'Hours_Since_Replace 215h'],
      metricDetails: [
        { metric: 'Air Filter dP', current: '6.8 kPa', threshold: '≤ 6.0 kPa', deviation: '+13%', direction: 'up' as const },
        { metric: 'Hours Since Replace', current: '215 h', threshold: '≤ 200 h', deviation: '+7.5%', direction: 'up' as const },
      ],
      firstOccurrence: '30/05/2025 10:00',
      lastOccurrence: '01/06/2025 10:00',
      occurrenceCount: 3,
      connectionStatus: 'Online' as const,
      manufactureYear: 2023,
      explanation: 'Lọc khí tắc nghẽn làm giảm lưu lượng khí nạp, tăng tiêu hao nhiên liệu và giảm công suất.',
      recommendationSteps: [
        'Thay lọc khí ngay trong PM lần tới.',
        'Cân nhắc rút ngắn chu kỳ thay lọc xuống 150h nếu môi trường nhiều bụi.',
      ],
    },

    // ── PM — Bảo dưỡng định kỳ ─────────────────────────────────────────────────
    {
      id: 'ai-14',
      severity: 'high',
      machineCode: 'SANY-114',
      recommendation: 'Thay dầu động cơ đến hạn — quá 250h',
      detail: 'Lên lịch thay dầu và lọc dầu trong 24h tới',
      riskScorePct: 72,
      ruleId: 'PM-001',
      confidencePct: 97,
      ruleType: 'SCHEDULE',
      ruleLogic: 'Engine_Hours_Since_Oil_Change >= 250h',
      timeWindow: '24 giờ',
      context: 'Làng Olympic · PM250 đến hạn',
      abnormalMetrics: ['Hours_Since_Oil_Change 258h (+3.2%)'],
      metricDetails: [
        { metric: 'Hours Since Oil Change', current: '258 h', threshold: '≤ 250 h', deviation: '+3.2%', direction: 'up' as const },
        { metric: 'Oil Viscosity Index', current: '82', threshold: '≥ 95', deviation: '-14%', direction: 'down' as const },
      ],
      firstOccurrence: '01/06/2025 07:00',
      lastOccurrence: '01/06/2025 07:00',
      occurrenceCount: 1,
      connectionStatus: 'Online' as const,
      manufactureYear: 2021,
      explanation: 'Dầu động cơ quá hạn thay làm giảm khả năng bôi trơn, tăng nhiệt độ và mài mòn động cơ.',
      recommendationSteps: [
        'Xả dầu cũ khi máy còn ấm.',
        'Thay đồng thời lọc dầu và lọc nhiên liệu.',
        'Nạp dầu mới đúng loại và mức quy định.',
        'Reset đồng hồ đếm giờ bảo dưỡng trên ECU.',
        'Ghi vào hồ sơ PM.',
      ],
    },
    {
      id: 'ai-15',
      severity: 'medium',
      machineCode: 'SANY-115',
      recommendation: 'Thay dầu thủy lực đến hạn — 500h',
      detail: 'Lên lịch thay dầu thủy lực PM500',
      riskScorePct: 52,
      ruleId: 'PM-003',
      confidencePct: 95,
      ruleType: 'SCHEDULE',
      ruleLogic: 'Hyd_Oil_Hours >= 500h',
      timeWindow: '48 giờ',
      context: 'OCP1 · PM500 sắp đến hạn',
      abnormalMetrics: ['Hyd_Oil_Hours 498h', 'Hyd_Oil_Contamination tăng nhẹ'],
      metricDetails: [
        { metric: 'Hyd Oil Hours', current: '498 h', threshold: '< 500 h', deviation: '+0%', direction: 'up' as const },
        { metric: 'Oil Contamination NAS', current: '18 NAS', threshold: '≤ 12 NAS', deviation: '+50%', direction: 'up' as const },
        { metric: 'Oil Acid Number', current: '1.8 mgKOH/g', threshold: '≤ 1.0 mgKOH/g', deviation: '+80%', direction: 'up' as const },
      ],
      firstOccurrence: '01/06/2025 07:00',
      lastOccurrence: '01/06/2025 07:00',
      occurrenceCount: 1,
      connectionStatus: 'Online' as const,
      manufactureYear: 2022,
      explanation: 'Dầu thủy lực lão hóa làm giảm hiệu suất truyền lực, tăng rủi ro hỏng bơm và motor thủy lực.',
      recommendationSteps: [
        'Xả toàn bộ dầu thủy lực cũ.',
        'Vệ sinh bể chứa thủy lực.',
        'Thay lọc thủy lực cùng lúc.',
        'Nạp dầu mới đúng loại ISO VG 46 theo sách hướng dẫn.',
        'Kiểm tra lấy mẫu dầu sau 50h vận hành.',
      ],
    },
    {
      id: 'ai-16',
      severity: 'medium',
      machineCode: 'XCMG-118',
      recommendation: 'Thay lọc khí đến hạn — 250h',
      detail: 'Chuẩn bị lọc khí thay thế trong PM kế tiếp',
      riskScorePct: 43,
      ruleId: 'PM-004',
      confidencePct: 93,
      ruleType: 'SCHEDULE',
      ruleLogic: 'Air_Filter_Hours >= 250h OR Air_Filter_dP > 5.5 kPa',
      timeWindow: '48 giờ',
      context: 'Cần Giờ · PM250 lọc khí',
      abnormalMetrics: ['Air_Filter_Hours 252h', 'Air_Filter_dP 5.7 kPa'],
      metricDetails: [
        { metric: 'Air Filter Hours', current: '252 h', threshold: '≤ 250 h', deviation: '+0.8%', direction: 'up' as const },
        { metric: 'Air Filter dP', current: '5.7 kPa', threshold: '≤ 5.5 kPa', deviation: '+3.6%', direction: 'up' as const },
      ],
      firstOccurrence: '01/06/2025 07:00',
      lastOccurrence: '01/06/2025 07:00',
      occurrenceCount: 1,
      connectionStatus: 'Online' as const,
      manufactureYear: 2023,
      explanation: 'Lọc khí quá hạn theo giờ hoặc chênh áp — đặc biệt quan trọng ở môi trường cát, muối biển.',
      recommendationSteps: [
        'Thay lọc khí chính và lọc an toàn.',
        'Vệ sinh vỏ bầu lọc khí bằng khí nén.',
        'Kiểm tra ron kín — thay nếu hư hỏng.',
      ],
    },
    {
      id: 'ai-17',
      severity: 'info',
      machineCode: 'SANY-120',
      recommendation: 'Kiểm tra dây cáp Kelly bar theo lịch 500h',
      detail: 'Kiểm tra mòn và gãy sợi cáp Kelly bar định kỳ',
      riskScorePct: 35,
      ruleId: 'PM-005',
      confidencePct: 72,
      ruleType: 'SCHEDULE',
      ruleLogic: 'Kelly_Bar_Cable_Hours >= 500h',
      timeWindow: '72 giờ',
      context: 'Hạ Long Xanh · Kelly bar SR360',
      abnormalMetrics: ['Kelly_Cable_Hours 510h'],
      metricDetails: [
        { metric: 'Kelly Cable Hours', current: '510 h', threshold: '≤ 500 h', deviation: '+2%', direction: 'up' as const },
        { metric: 'Wire Breaks Detected', current: '2 sợi', threshold: '0 sợi', deviation: '+200%', direction: 'up' as const },
      ],
      firstOccurrence: '01/06/2025 07:00',
      lastOccurrence: '01/06/2025 07:00',
      occurrenceCount: 1,
      connectionStatus: 'Online' as const,
      manufactureYear: 2021,
      explanation: 'Dây cáp Kelly bar chịu tải trọng xoắn cao — kiểm tra mòn và gãy sợi theo chu kỳ để tránh đứt cáp đột ngột.',
      recommendationSteps: [
        'Kiểm tra toàn bộ chiều dài cáp — đếm sợi gãy theo tiêu chuẩn ISO 4309.',
        'Đo đường kính cáp tại các điểm uốn cong.',
        'Bôi mỡ toàn bộ cáp bằng mỡ bảo vệ dây cáp.',
        'Thay cáp nếu số sợi gãy vượt tiêu chuẩn.',
      ],
    },

    // ── CONN — Kết nối & Telemetry ─────────────────────────────────────────────
    {
      id: 'ai-18',
      severity: 'medium',
      machineCode: 'XCMG-123',
      recommendation: 'Tín hiệu GPS mất liên tục trong 6 giờ',
      detail: 'Kiểm tra antena GPS và module định vị',
      riskScorePct: 45,
      ruleId: 'CONN-002',
      confidencePct: 82,
      ruleType: 'THRESHOLD',
      ruleLogic: 'GPS_Fix_Status = NO_FIX AND Duration > 2h AND Status != Indoor',
      timeWindow: '12 giờ gần nhất',
      context: 'Vũng Áng · Khu cảng công nghiệp',
      abnormalMetrics: ['GPS_Loss_Duration 6.2h', 'GPS_Fix 0/10 lần thử'],
      metricDetails: [
        { metric: 'GPS Loss Duration', current: '6.2 h', threshold: '≤ 2 h', deviation: '+210%', direction: 'up' as const },
        { metric: 'GPS Fix Rate', current: '0/10', threshold: '≥ 8/10', deviation: '-100%', direction: 'down' as const },
      ],
      firstOccurrence: '01/06/2025 04:30',
      lastOccurrence: '01/06/2025 10:45',
      occurrenceCount: 3,
      connectionStatus: 'Online' as const,
      manufactureYear: 2022,
      explanation: 'Mất GPS liên tục dẫn đến không theo dõi được vị trí máy — ảnh hưởng điều phối và an toàn.',
      recommendationSteps: [
        'Kiểm tra cáp antena GPS — đứt, lỏng hay oxy hóa.',
        'Kiểm tra module GPS trên bộ IoT telematics.',
        'Thử reset thiết bị và chờ lock tín hiệu ngoài trời thoáng.',
        'Nếu vẫn lỗi — gửi bộ IoT về trung tâm kiểm tra.',
      ],
    },
    {
      id: 'ai-19',
      severity: 'medium',
      machineCode: 'SANY-106',
      recommendation: 'Kết nối IoT không ổn định — packet loss 22%',
      detail: 'Kiểm tra SIM và chất lượng sóng 4G tại khu vực',
      riskScorePct: 42,
      ruleId: 'CONN-003',
      confidencePct: 76,
      ruleType: 'THRESHOLD',
      ruleLogic: 'Packet_Loss > 15% AND RSSI < -95 dBm AND Duration > 1h',
      timeWindow: '24 giờ gần nhất',
      context: 'Vũng Áng · Vùng lõm sóng 4G',
      abnormalMetrics: ['Packet_Loss 22%', 'RSSI -101 dBm'],
      metricDetails: [
        { metric: 'Packet Loss', current: '22 %', threshold: '≤ 15 %', deviation: '+47%', direction: 'up' as const },
        { metric: 'RSSI', current: '-101 dBm', threshold: '> -95 dBm', deviation: '-6 dBm', direction: 'down' as const },
      ],
      firstOccurrence: '31/05/2025 15:00',
      lastOccurrence: '01/06/2025 11:00',
      occurrenceCount: 5,
      connectionStatus: 'Online' as const,
      manufactureYear: 2021,
      explanation: 'Packet loss cao làm gián đoạn telemetry — dữ liệu vận hành không đầy đủ, khó phát hiện sự cố sớm.',
      recommendationSteps: [
        'Kiểm tra SIM — hạn dùng và gói cước còn đủ.',
        'Cân nhắc lắp antena 4G ngoài để tăng độ nhạy sóng.',
        'Kiểm tra vị trí lắp đặt thiết bị IoT — tránh kim loại che chắn.',
      ],
    },

    // ── UTIL — Hiệu suất sử dụng ───────────────────────────────────────────────
    {
      id: 'ai-20',
      severity: 'medium',
      machineCode: 'SANY-107',
      recommendation: 'Máy idle liên tục >4h trong ca làm việc',
      detail: 'Rà soát kế hoạch thi công và điều phối công việc',
      riskScorePct: 50,
      ruleId: 'UTIL-001',
      confidencePct: 85,
      ruleType: 'THRESHOLD',
      ruleLogic: 'Idle_Duration > 4h AND Engine_Running = TRUE AND Work_Progress = 0',
      timeWindow: '8 giờ (ca hôm nay)',
      context: 'Cần Giờ · Ca sáng — chờ vật liệu bê tông',
      abnormalMetrics: ['Idle_Duration 4.5h', 'Fuel_Wasted ~18L'],
      metricDetails: [
        { metric: 'Idle Duration', current: '4.5 h', threshold: '≤ 4 h', deviation: '+12.5%', direction: 'up' as const },
        { metric: 'Fuel Wasted', current: '~18 L', threshold: '≤ 12 L', deviation: '+50%', direction: 'up' as const },
      ],
      firstOccurrence: '01/06/2025 08:00',
      lastOccurrence: '01/06/2025 12:30',
      occurrenceCount: 1,
      connectionStatus: 'Online' as const,
      manufactureYear: 2020,
      explanation: 'Máy chạy không tải >4h lãng phí nhiên liệu và tích lũy giờ động cơ không sản xuất.',
      recommendationSteps: [
        'Tắt máy nếu chờ >30 phút — tiết kiệm nhiên liệu.',
        'Báo điều phối xem xét phân công công việc khác.',
        'Xem xét điều chuyển máy sang khu có nhu cầu tức thì.',
      ],
    },
    {
      id: 'ai-21',
      severity: 'high',
      machineCode: 'XCMG-108',
      recommendation: 'Hiệu suất dưới mục tiêu 7 ngày liên tiếp',
      detail: 'Rà soát nguyên nhân và điều chỉnh kế hoạch sản xuất',
      riskScorePct: 66,
      ruleId: 'UTIL-002',
      confidencePct: 78,
      ruleType: 'TREND',
      ruleLogic: 'Utilization_7d < Target_Utilization AND Consecutive_Days >= 7',
      timeWindow: '7 ngày liên tiếp',
      context: 'Hải Vân Bay · Mục tiêu 75% — thực tế 52%',
      abnormalMetrics: ['Utilization_Avg 52% (target 75%)', 'Deficit -23%'],
      metricDetails: [
        { metric: 'Utilization 7d Avg', current: '52 %', threshold: '≥ 75 %', deviation: '-31%', direction: 'down' as const },
        { metric: 'Performance Deficit', current: '-23 %', threshold: '0 %', deviation: '-23 pts', direction: 'down' as const },
        { metric: 'Consecutive Below-Target Days', current: '7 ngày', threshold: '≤ 3 ngày', deviation: '+133%', direction: 'up' as const },
      ],
      firstOccurrence: '26/05/2025 07:00',
      lastOccurrence: '01/06/2025 18:00',
      occurrenceCount: 7,
      connectionStatus: 'Online' as const,
      manufactureYear: 2022,
      explanation: 'Hiệu suất thực tế thấp hơn mục tiêu 7 ngày liên tiếp — ảnh hưởng tiến độ dự án.',
      recommendationSteps: [
        'Rà soát nguyên nhân: thiếu nhân công, bê tông, thiết kế chậm?',
        'Họp điều phối với tổ trưởng thi công.',
        'Điều chỉnh lịch làm việc hoặc bổ sung ca.',
      ],
    },
    {
      id: 'ai-22',
      severity: 'info',
      machineCode: 'SANY-109',
      recommendation: 'Máy vận hành >14h/ngày — cảnh báo quá giờ',
      detail: 'Kiểm tra kế hoạch và tuân thủ quy định vận hành',
      riskScorePct: 40,
      ruleId: 'UTIL-004',
      confidencePct: 92,
      ruleType: 'THRESHOLD',
      ruleLogic: 'Daily_Engine_Hours > 14h AND Consecutive_Days >= 2',
      timeWindow: '3 ngày gần nhất',
      context: 'Làng Olympic · Chạy gia tốc tiến độ',
      abnormalMetrics: ['Daily_Hours 15.2h (+8.6%)', 'Consecutive_Overtime 3 ngày'],
      metricDetails: [
        { metric: 'Daily Engine Hours', current: '15.2 h', threshold: '≤ 14 h', deviation: '+8.6%', direction: 'up' as const },
        { metric: 'Consecutive Overtime Days', current: '3 ngày', threshold: '≤ 1 ngày', deviation: '+200%', direction: 'up' as const },
      ],
      firstOccurrence: '30/05/2025 20:10',
      lastOccurrence: '01/06/2025 21:05',
      occurrenceCount: 3,
      connectionStatus: 'Online' as const,
      manufactureYear: 2022,
      explanation: 'Vận hành liên tục >14h/ngày làm tăng mài mòn, giảm tuổi thọ thiết bị và tăng rủi ro hỏng đột ngột.',
      recommendationSteps: [
        'Xác nhận với Ban điều hành về kế hoạch tăng tốc.',
        'Lên lịch bảo dưỡng nhanh sau giai đoạn chạy tăng cường.',
        'Theo dõi sát nhiệt độ, áp suất và tiêu hao nhiên liệu.',
      ],
    },

    // ── HYD — Hệ thống thủy lực ───────────────────────────────────────────────
    {
      id: 'ai-23',
      severity: 'high',
      machineCode: 'SANY-110',
      recommendation: 'Áp suất thủy lực dao động bất thường',
      detail: 'Kiểm tra van điều áp và bơm thủy lực',
      riskScorePct: 68,
      ruleId: 'HYD-001',
      confidencePct: 84,
      ruleType: 'ANOMALY',
      ruleLogic: 'Hyd_Pressure_StdDev > 30 bar AND Sample_Window = 15min',
      timeWindow: '6 giờ gần nhất',
      context: 'OCP1 · Khoan qua lớp đất cứng xen kẽ',
      abnormalMetrics: ['Hyd_Pressure_StdDev 38 bar', 'Peak_Surge +45%'],
      metricDetails: [
        { metric: 'Hyd Pressure StdDev', current: '38 bar', threshold: '≤ 30 bar', deviation: '+27%', direction: 'up' as const },
        { metric: 'Peak Pressure Surge', current: '+45 %', threshold: '≤ +20 %', deviation: '+125%', direction: 'up' as const },
      ],
      firstOccurrence: '01/06/2025 09:00',
      lastOccurrence: '01/06/2025 14:30',
      occurrenceCount: 5,
      connectionStatus: 'Online' as const,
      manufactureYear: 2021,
      explanation: 'Dao động áp suất thủy lực cao bất thường nghi ngờ van điều áp bị mòn hoặc kẹt bi.',
      recommendationSteps: [
        'Kiểm tra van điều áp chính (main relief valve).',
        'Đo dao động áp suất bằng đồng hồ kim để xác nhận.',
        'Kiểm tra và thay van nếu bi mòn.',
        'Kiểm tra bộ lọc thủy lực — cặn bẩn gây kẹt van.',
      ],
    },
    {
      id: 'ai-24',
      severity: 'high',
      machineCode: 'SANY-111',
      recommendation: 'Nghi ngờ rò rỉ dầu thủy lực',
      detail: 'Kiểm tra khớp nối và đường ống thủy lực toàn bộ',
      riskScorePct: 75,
      ruleId: 'HYD-002',
      confidencePct: 79,
      ruleType: 'COMBINE_METRIC',
      ruleLogic: 'Hyd_Level_Drop > 2L/day AND No_External_Drain AND Hyd_Pressure -8%',
      timeWindow: '72 giờ gần nhất',
      context: 'Hạ Long Xanh · Zone A — nền đất mềm',
      abnormalMetrics: ['Hyd_Level -2.3L/ngày', 'Hyd_Pressure -8%', 'Vết dầu mặt đất'],
      metricDetails: [
        { metric: 'Hyd Level Drop', current: '-2.3 L/ngày', threshold: '≤ 0.5 L/ngày', deviation: '+360%', direction: 'up' as const },
        { metric: 'Hyd Pressure Drop', current: '-8 %', threshold: '< -3 %', deviation: '+167%', direction: 'down' as const },
        { metric: 'Ground Oil Trace', current: 'Phát hiện', threshold: 'Không có', deviation: '+100%', direction: 'up' as const },
      ],
      firstOccurrence: '30/05/2025 07:00',
      lastOccurrence: '01/06/2025 07:00',
      occurrenceCount: 3,
      connectionStatus: 'Online' as const,
      manufactureYear: 2020,
      explanation: 'Giảm mức dầu liên tục không rõ nguyên nhân kết hợp vết dầu nền đất — xác nhận rò rỉ.',
      recommendationSteps: [
        'Vệ sinh toàn bộ hệ thống thủy lực và để khô.',
        'Chạy áp suất và quan sát điểm rò rỉ.',
        'Kiểm tra khớp nối cao áp, ống mềm và joint xi lanh.',
        'Thay phớt hoặc ống tại điểm rò.',
        'Bổ sung dầu và kiểm tra mức sau 24h.',
      ],
    },
    {
      id: 'ai-25',
      severity: 'medium',
      machineCode: 'XCMG-113',
      recommendation: 'Mài mòn phớt xi lanh thủy lực phát hiện qua phân tích dầu',
      detail: 'Lấy mẫu dầu thủy lực phân tích và lên lịch thay phớt',
      riskScorePct: 55,
      ruleId: 'HYD-003',
      confidencePct: 73,
      ruleType: 'TREND',
      ruleLogic: 'Hyd_Oil_Metal_Particles > 35 ppm AND Trend_Direction = UP',
      timeWindow: '30 ngày gần nhất',
      context: 'Vũng Áng · Vận hành địa tầng đá cứng',
      abnormalMetrics: ['Metal_Particles 42 ppm (+20%)', 'Seal_Wear_Index 0.78'],
      metricDetails: [
        { metric: 'Metal Particles', current: '42 ppm', threshold: '≤ 35 ppm', deviation: '+20%', direction: 'up' as const },
        { metric: 'Seal Wear Index', current: '0.78', threshold: '≤ 0.5', deviation: '+56%', direction: 'up' as const },
        { metric: 'Oil Analysis Interval', current: '30 ngày', threshold: 'Lấy mẫu định kỳ', deviation: '+0%', direction: 'up' as const },
      ],
      firstOccurrence: '03/05/2025 08:00',
      lastOccurrence: '01/06/2025 08:00',
      occurrenceCount: 4,
      connectionStatus: 'Online' as const,
      manufactureYear: 2023,
      explanation: 'Hàm lượng mạt kim loại trong dầu tăng dần — dấu hiệu phớt xi lanh bắt đầu mài mòn.',
      recommendationSteps: [
        'Lấy mẫu dầu thủy lực gửi phòng lab phân tích.',
        'Nếu xác nhận mạt kim loại cao — lên lịch thay phớt xi lanh boom/arm.',
        'Thay dầu thủy lực sau khi thay phớt.',
        'Kiểm tra lại sau 100h vận hành.',
      ],
    },

    // ── IDLE — Chạy không tải ─────────────────────────────────────────────────
    {
      id: 'ai-26',
      severity: 'info',
      machineCode: 'SANY-114',
      recommendation: 'Động cơ chạy không tải >30 phút liên tục',
      detail: 'Nhắc nhở operator tắt máy khi nghỉ >5 phút',
      riskScorePct: 32,
      ruleId: 'IDLE-001',
      confidencePct: 94,
      ruleType: 'THRESHOLD',
      ruleLogic: 'Idle_Duration > 30min AND No_Work_Input AND Engine_Running = TRUE',
      timeWindow: '2 giờ gần nhất',
      context: 'Làng Olympic · Nghỉ trưa ca 1',
      abnormalMetrics: ['Idle_Duration 45min', 'Fuel_Wasted ~3L'],
      metricDetails: [
        { metric: 'Idle Duration', current: '45 min', threshold: '≤ 30 min', deviation: '+50%', direction: 'up' as const },
        { metric: 'Fuel Wasted', current: '~3 L', threshold: '≤ 2 L', deviation: '+50%', direction: 'up' as const },
      ],
      firstOccurrence: '01/06/2025 11:45',
      lastOccurrence: '01/06/2025 12:30',
      occurrenceCount: 1,
      connectionStatus: 'Online' as const,
      manufactureYear: 2021,
      explanation: 'Chạy không tải >30 phút lãng phí ~3L nhiên liệu, tăng khí thải và tích lũy giờ máy không sinh lời.',
      recommendationSteps: [
        'Nhắc operator: tắt máy khi nghỉ >5 phút.',
        'Cài đặt auto-shutdown sau 15 phút idle nếu firmware hỗ trợ.',
      ],
    },

    // ── OPS — Vận hành & Năng suất ────────────────────────────────────────────
    {
      id: 'ai-27',
      severity: 'medium',
      machineCode: 'SANY-115',
      recommendation: 'Tốc độ khoan giảm bất thường 30%',
      detail: 'Kiểm tra mũi khoan, cần Kelly và áp suất thủy lực',
      riskScorePct: 60,
      ruleId: 'OPS-001',
      confidencePct: 81,
      ruleType: 'TREND',
      ruleLogic: 'Drilling_Rate_7d < Baseline * 0.70 AND Depth_Condition STABLE',
      timeWindow: '7 ngày gần nhất',
      context: 'OCP1 · Khu C — địa chất đồng nhất',
      abnormalMetrics: ['Drilling_Rate -30%', 'Penetration_Rate 2.1m/h (target 3.0m/h)'],
      metricDetails: [
        { metric: 'Drilling Rate Delta 7d', current: '-30 %', threshold: '< -15 %', deviation: '+100%', direction: 'down' as const },
        { metric: 'Penetration Rate', current: '2.1 m/h', threshold: '≥ 3.0 m/h', deviation: '-30%', direction: 'down' as const },
      ],
      firstOccurrence: '26/05/2025 07:00',
      lastOccurrence: '01/06/2025 17:00',
      occurrenceCount: 5,
      connectionStatus: 'Online' as const,
      manufactureYear: 2022,
      explanation: 'Năng suất khoan giảm trên nền địa chất ổn định — nghi ngờ mũi khoan mòn hoặc áp thủy lực yếu.',
      recommendationSteps: [
        'Kiểm tra độ mòn mũi khoan (bucket auger hoặc core barrel).',
        'Đo áp suất thủy lực thực tế khi khoan.',
        'Kiểm tra và siết lại kết nối Kelly bar.',
        'Lên lịch thay mũi khoan nếu mòn vượt giới hạn.',
      ],
    },
    {
      id: 'ai-28',
      severity: 'high',
      machineCode: 'XCMG-118',
      recommendation: 'Mô-men xoắn Kelly bar vượt ngưỡng thiết kế',
      detail: 'Giảm tốc độ khoan và kiểm tra địa chất thực tế',
      riskScorePct: 80,
      ruleId: 'OPS-002',
      confidencePct: 87,
      ruleType: 'THRESHOLD',
      ruleLogic: 'Kelly_Torque > Max_Design_Torque * 0.95 AND Duration > 5min',
      timeWindow: '4 giờ gần nhất',
      context: 'Cần Giờ · Gặp lớp sỏi đá bất ngờ ở -12m',
      abnormalMetrics: ['Kelly_Torque 98% max design', 'Vibration +35%'],
      metricDetails: [
        { metric: 'Kelly Torque % Max', current: '98 % max', threshold: '≤ 95 % max', deviation: '+3%', direction: 'up' as const },
        { metric: 'Vibration Level', current: '+35 %', threshold: '≤ +15 %', deviation: '+133%', direction: 'up' as const },
      ],
      firstOccurrence: '01/06/2025 10:30',
      lastOccurrence: '01/06/2025 14:05',
      occurrenceCount: 4,
      connectionStatus: 'Online' as const,
      manufactureYear: 2023,
      explanation: 'Mô-men xoắn gần giới hạn thiết kế liên tục có thể gây nứt gãy Kelly bar hoặc hỏng hộp số xoay.',
      recommendationSteps: [
        'Giảm tốc độ quay Kelly bar 30%.',
        'Kiểm tra lại địa chất — lấy mẫu đất tại độ sâu sự cố.',
        'Đánh giá cần đổi phương án khoan (đổi mũi, dùng chất phụ trợ).',
        'Kiểm tra hộp số xoay sau ca làm việc hôm nay.',
      ],
    },

    // ── SAF — An toàn ─────────────────────────────────────────────────────────
    {
      id: 'ai-29',
      severity: 'critical',
      machineCode: 'SANY-120',
      recommendation: 'Cảnh báo quá tải mô-men xoắn — nguy cơ gãy cần Kelly',
      detail: 'DỪNG KHOAN NGAY — kiểm tra toàn bộ cơ cấu xoay',
      riskScorePct: 91,
      ruleId: 'SAF-001',
      confidencePct: 93,
      ruleType: 'THRESHOLD',
      ruleLogic: 'Kelly_Torque > Max_Design_Torque * 1.05 AND Duration > 2min',
      timeWindow: '1 giờ gần nhất',
      context: 'Hạ Long Xanh · Khu B — vướng đá tảng tại -8m',
      abnormalMetrics: ['Kelly_Torque 107% max design (+7%)', 'Overload_Count 3 lần'],
      metricDetails: [
        { metric: 'Kelly Torque % Max', current: '107 % max', threshold: '≤ 100 % max', deviation: '+7%', direction: 'up' as const },
        { metric: 'Overload Events', current: '3 lần', threshold: '0 lần', deviation: '+300%', direction: 'up' as const },
      ],
      firstOccurrence: '01/06/2025 15:20',
      lastOccurrence: '01/06/2025 16:05',
      occurrenceCount: 3,
      connectionStatus: 'Online' as const,
      manufactureYear: 2021,
      explanation: 'Vượt quá mô-men thiết kế 7% — nguy cơ gãy cần Kelly bar và hỏng hộp số xoay nghiêm trọng.',
      recommendationSteps: [
        'DỪNG KHOAN NGAY — kéo cần khoan lên.',
        'Kiểm tra toàn bộ cần Kelly bar — vết nứt bề mặt.',
        'Kiểm tra hộp số xoay — tiếng ồn, nhiệt độ bất thường.',
        'Mời kỹ thuật viên đánh giá trước khi khởi động lại.',
        'Lập phương án xử lý đá tảng: búa thủy lực, nổ mìn vi lượng.',
      ],
    },
    {
      id: 'ai-30',
      severity: 'critical',
      machineCode: 'XCMG-123',
      recommendation: 'Cảnh báo máy nghiêng vượt ngưỡng an toàn 5°',
      detail: 'DỪNG NGAY — san phẳng nền trước khi vận hành tiếp',
      riskScorePct: 88,
      ruleId: 'SAF-002',
      confidencePct: 97,
      ruleType: 'THRESHOLD',
      ruleLogic: 'Tilt_Angle > 5° AND Duration > 5min AND Machine_Working = TRUE',
      timeWindow: '30 phút gần nhất',
      context: 'Vũng Áng · Nền đất yếu — sau trận mưa lớn',
      abnormalMetrics: ['Tilt_Angle 6.2° (max 5°)', 'Ground_Settlement cảm biến kích hoạt'],
      metricDetails: [
        { metric: 'Tilt Angle', current: '6.2°', threshold: '≤ 5°', deviation: '+24%', direction: 'up' as const },
        { metric: 'Ground Settlement Sensor', current: 'Kích hoạt', threshold: 'Bình thường', deviation: '+100%', direction: 'up' as const },
      ],
      firstOccurrence: '01/06/2025 09:55',
      lastOccurrence: '01/06/2025 10:25',
      occurrenceCount: 2,
      connectionStatus: 'Online' as const,
      manufactureYear: 2022,
      explanation: 'Góc nghiêng 6.2° vượt ngưỡng an toàn 5°, nền đất bị yếu sau mưa — nguy cơ lật máy cao.',
      recommendationSteps: [
        'DỪNG MÁY NGAY và kéo cần khoan lên vị trí an toàn.',
        'Cấm vận hành cho đến khi có biện pháp gia cố nền.',
        'Kiểm tra nền đất — đặt tấm thép hoặc gia cố bằng đá dăm.',
        'Đo lại góc nghiêng bằng máy kinh vĩ.',
        'Báo cáo ngay cho kỹ sư an toàn công trường.',
      ],
    },
  ],
  machines: ALL_MACHINES,
  projects: ['Tất cả dự án', ...PROJECTS],
}
