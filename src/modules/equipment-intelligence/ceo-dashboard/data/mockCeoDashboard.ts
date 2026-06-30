import type { CeoDashboardData, MmtbRow } from '../types'

const EXAMPLE_MACHINES: MmtbRow[] = [
  {
    id: 'm-014',
    machineCode: 'SANY-014',
    equipmentType: 'Cọc nhồi SR285R',
    projectLocation: 'Hạ Long Xanh',
    regionId: 'quang-ninh',
    status: 'Working',
    healthScore: 42,
    engineHours: 8450,
    utilizationPct: 85,
    mtbfHours: 120,
    mttrHours: 3.8,
    mttfHours: 8200,
    pmStatus: 'upcoming',
    pmStatusLabel: 'Sắp tới hạn 20h',
    usageUnit: 'FECON',
    latestAiRecommendation: 'Nguy cơ nghẹt lọc nhiên liệu',
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
  },
]

const MODELS = [
  { type: 'Cọc nhồi SR360', prefix: 'SANY' },
  { type: 'Cọc nhồi SR285R', prefix: 'SANY' },
  { type: 'Cọc nhồi SR235', prefix: 'SANY' },
  { type: 'Cọc nhồi XG500E', prefix: 'XCMG' },
  { type: 'Cọc nhồi SY650HB', prefix: 'SANY' },
]

const PROJECTS = ['Hạ Long Xanh', 'Cần Giờ', 'Hải Vân Bay', 'Vũng Áng', 'Làng Olympic', 'OCP1']
const UNITS = [
  'FECON', 'SGC', 'Bauer Vietnam', 'Coteccons Foundation', 'Delta Foundation',
  'Hòa Bình Foundation', 'Ricons Foundation', 'Central Foundation', 'Vietur Foundation', 'Sơn Hải Foundation',
]
const REGIONS = [
  { id: 'quang-ninh', name: 'Quảng Ninh', project: 'Hạ Long Xanh' },
  { id: 'ha-noi', name: 'Hà Nội', project: 'OCP1' },
  { id: 'vung-ang', name: 'Hà Tĩnh / Vũng Áng', project: 'Vũng Áng' },
  { id: 'da-nang', name: 'Đà Nẵng / Hải Vân Bay', project: 'Hải Vân Bay' },
  { id: 'can-gio', name: 'Cần Giờ', project: 'Cần Giờ' },
  { id: 'long-an', name: 'Long An', project: 'Làng Olympic' },
]

const STATUSES: MmtbRow['status'][] = ['Working', 'Standby', 'Breakdown', 'Stored']

function generateMachines(count: number): MmtbRow[] {
  const rows: MmtbRow[] = [...EXAMPLE_MACHINES]
  for (let i = rows.length; i < count; i += 1) {
    const model = MODELS[i % MODELS.length]
    const region = REGIONS[i % REGIONS.length]
    const status = STATUSES[i % STATUSES.length]
    const health = status === 'Breakdown' ? 20 + (i % 25)
      : status === 'Standby' ? 45 + (i % 30)
        : status === 'Stored' ? 55 + (i % 20)
          : 55 + (i % 45)
    const util = status === 'Breakdown' ? 0 : status === 'Stored' ? 15 + (i % 20) : 50 + (i % 45)
    const pmIdx = i % 3
    rows.push({
      id: `m-gen-${i}`,
      machineCode: `${model.prefix}-${String(100 + i).padStart(3, '0')}`,
      equipmentType: model.type,
      projectLocation: region.project,
      regionId: region.id,
      status,
      healthScore: health,
      engineHours: 2000 + (i * 137) % 9000,
      utilizationPct: util,
      mtbfHours: 80 + (i * 11) % 200,
      mttrHours: Math.round((1.8 + (i % 50) / 10) * 10) / 10,
      mttfHours: 4000 + (i * 211) % 6000,
      pmStatus: pmIdx === 0 ? 'on_time' : pmIdx === 1 ? 'upcoming' : 'overdue',
      pmStatusLabel: pmIdx === 0 ? 'Đúng hạn' : pmIdx === 1 ? `Sắp tới hạn ${10 + (i % 40)}h` : `Quá hạn ${5 + (i % 15)}h`,
      usageUnit: UNITS[i % UNITS.length],
    })
  }
  return rows
}

export const CEO_DASHBOARD_MOCK: CeoDashboardData = {
  fleet: {
    totalMmtb: 1000,
    breakdown: { working: 620, standby: 180, breakdown: 80, stored: 120 },
    fleetUtilizationPct: 78,
    fleetUtilizationTrendPct: 5,
  },
  pm: {
    compliancePct: 91,
    trendPct: 4,
    completedOnTime: 205,
    upcomingUnder50h: 48,
    overdue: 20,
    totalPlanned: 225,
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
    totalAssetValueBillionVnd: 12.54,
    idleAssetValueBillionVnd: 3.25,
    serviceHoursPerBillionVnd: 12.5,
  },
  regions: [
    { id: 'quang-ninh', name: 'Quảng Ninh', machineCount: 260, x: 72, y: 18 },
    { id: 'ha-noi', name: 'Hà Nội', machineCount: 150, x: 58, y: 28 },
    { id: 'vung-ang', name: 'Hà Tĩnh / Vũng Áng', machineCount: 180, x: 48, y: 42 },
    { id: 'da-nang', name: 'Đà Nẵng / Hải Vân Bay', machineCount: 148, x: 52, y: 58 },
    { id: 'can-gio', name: 'Cần Giờ', machineCount: 80, x: 55, y: 78 },
    { id: 'long-an', name: 'Long An', machineCount: 72, x: 48, y: 82 },
  ],
  usageUnits: UNITS.map((name, i) => ({
    rank: i + 1,
    name,
    totalMmtb: Math.round(180 - i * 12 + (i % 3) * 8),
    utilizationPct: Math.round(88 - i * 4 + (i % 2) * 3),
  })),
  aiRecommendations: [
    {
      id: 'ai-1',
      severity: 'critical',
      machineCode: 'SANY-014',
      recommendation: 'Nguy cơ nghẹt lọc nhiên liệu',
      riskScorePct: 82,
      ruleId: 'DIAG-006',
      confidencePct: 87,
      ruleLogic: 'P0087 AND Fuel_Rate < Expected_Fuel_Rate * 0.7 AND Engine_Load > 70%',
      timeWindow: '72 giờ gần nhất',
      context: 'Máy đang ép tải cao tại Hạ Long Xanh · Zone B',
      abnormalMetrics: ['Fuel_Rate -28%', 'Rail_Pressure +15%', 'Engine_Load 74%'],
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
      riskScorePct: 67,
      ruleId: 'PM-002',
      confidencePct: 91,
      ruleLogic: 'Engine_Hours >= PM_Interval - 20h',
      timeWindow: '24 giờ',
      context: 'Cần Giờ · ca kế tiếp',
      abnormalMetrics: ['PM_Remaining 20h'],
      explanation: 'Máy sắp vượt ngưỡng bảo dưỡng định kỳ — rủi ro hỏng hóc tăng.',
      recommendationSteps: ['Lên lịch PM trong ca hiện tại.', 'Chuẩn bị phụ tùng lọc dầu/hydraulic.'],
    },
    {
      id: 'ai-3',
      severity: 'high',
      machineCode: 'XCMG-007',
      recommendation: 'Thiết bị mất kết nối >24h',
      riskScorePct: 75,
      ruleId: 'CONN-001',
      confidencePct: 95,
      ruleLogic: 'Last_Signal > 24h AND Status != Stored',
      timeWindow: '48 giờ',
      context: 'Hải Vân Bay',
      abnormalMetrics: ['Signal_Gap 26h'],
      explanation: 'Mất telemetry — không giám sát được trạng thái vận hành.',
      recommendationSteps: ['Kiểm tra antena IoT.', 'Xác minh nguồn điện tủ điều khiển.'],
    },
    {
      id: 'ai-4',
      severity: 'medium',
      machineCode: 'SANY-030',
      recommendation: 'Hiệu suất sử dụng thấp',
      riskScorePct: 60,
      ruleId: 'UTIL-003',
      confidencePct: 78,
      ruleLogic: 'Utilization_7d < 45% AND Idle_Streak > 30min',
      timeWindow: '7 ngày',
      context: 'OCP1 · Khu đóng cọc A',
      abnormalMetrics: ['Utilization 38%', 'Idle 52h/tuần'],
      explanation: 'Máy idle kéo dài — lãng phí giờ khai thác mục tiêu 20h/ngày.',
      recommendationSteps: ['Điều chuyển sang khu có backlog cao.', 'Đồng bộ lịch cọc với điều phối.'],
    },
  ],
  machines: generateMachines(120),
  projects: ['Tất cả dự án', ...PROJECTS],
}
