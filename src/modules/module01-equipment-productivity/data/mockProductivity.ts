import type {
  ProductivityMachine, FleetSummary, UtilizationKpi,
  OutputKpi, FuelKpi, ProjectPerformance, TrendPoint, ShiftData, AiInsight,
} from '../types'

export const FLEET_SUMMARY: FleetSummary = {
  workingHours: 3860,
  idleHours: 1240,
  downtimeHours: 760,
  availabilityPct: 82.6,
  availabilityTrend: 4,
}

export const UTILIZATION_KPI: UtilizationKpi = {
  fleetUtilizationPct: 78.4,
  fleetUtilizationTrend: 5,
  mobilizationRatePct: 86.2,
  mobilizationTrend: 6,
  dispatchCompletionPct: 68.7,
  onTimeDispatchPct: 72.3,
}

export const OUTPUT_KPI: OutputKpi = {
  outputPerHour: 25.6,
  outputPerHourTrend: 12,
  outputPerShift: 192,
  outputPerShiftTrend: 10,
  outputPerDay: 4352,
  outputPerDayTrend: 11,
  outputPerMonth: 112650,
  outputPerMonthTrend: 9,
}

export const FUEL_KPI: FuelKpi = {
  fuelPerHour: 18.6,
  fuelPerHourTrend: -6,
  fuelCostPerHour: 482000,
  fuelCostPerHourTrend: 4,
  fuelVariancePct: 8.5,
  fuelVarianceTrend: 3,
  fuelLossRatePct: 2.1,
  fuelLossRateTrend: -0.4,
}

const PROJECTS = [
  'Hạ Long Xanh',
  'Cần Giờ',
  'Hải Vân Bay',
  'Điện gió Vũng Áng',
  'Làng Olympic',
]

type MachineStatus = 'Working' | 'Standby' | 'Breakdown'
type DispatchStatus = 'On-time' | 'Delayed' | 'Pending'

function rand(min: number, max: number, decimals = 0): number {
  const v = Math.random() * (max - min) + min
  return decimals > 0 ? Math.round(v * 10 ** decimals) / 10 ** decimals : Math.round(v)
}

function pickFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

const SANY_CODES = Array.from({ length: 15 }, (_, i) => `SANY-${String(i + 1).padStart(3, '0')}`)
const XCMG_CODES = Array.from({ length: 12 }, (_, i) => `XCMG-${String(i + 1).padStart(3, '0')}`)
const CRANE_CODES = Array.from({ length: 8 }, (_, i) => `CCX-${String(i + 1).padStart(3, '0')}`)
const EXCAV_CODES = Array.from({ length: 8 }, (_, i) => `PC3-${String(i + 1).padStart(3, '0')}`)
const DOZER_CODES = Array.from({ length: 4 }, (_, i) => `D9T-${String(i + 1).padStart(3, '0')}`)
const TRUCK_CODES = Array.from({ length: 3 }, (_, i) => `TRK-${String(i + 1).padStart(3, '0')}`)

const ALL_CODES = [
  ...SANY_CODES, ...XCMG_CODES, ...CRANE_CODES,
  ...EXCAV_CODES, ...DOZER_CODES, ...TRUCK_CODES,
]

const TYPE_MAP: Record<string, string> = {
  'SANY': 'Máy ép cọc SANY',
  'XCMG': 'Máy ép cọc XCMG',
  'CCX':  'Cần trục bánh xích',
  'PC3':  'Máy đào PC300',
  'D9T':  'Máy ủi D9T',
  'TRK':  'Xe tải 20T',
}

const STATUS_WEIGHTS: MachineStatus[] = [
  'Working', 'Working', 'Working', 'Working', 'Working', 'Working', 'Working',
  'Standby', 'Standby', 'Standby',
  'Breakdown',
]

const DISPATCH_WEIGHTS: DispatchStatus[] = [
  'On-time', 'On-time', 'On-time', 'On-time',
  'Delayed', 'Delayed',
  'Pending',
]

export const MOCK_MACHINES: ProductivityMachine[] = ALL_CODES.map((code, i) => {
  const prefix = code.split('-')[0]
  const type = TYPE_MAP[prefix] ?? 'Thiết bị thi công'
  const status = pickFrom(STATUS_WEIGHTS)
  const project = PROJECTS[i % PROJECTS.length]
  const working = rand(40, 280)
  const idle = rand(10, 80)
  const downtime = status === 'Breakdown' ? rand(20, 60) : rand(0, 20)
  const total = working + idle + downtime
  const util = Math.round((working / total) * 100)
  const isEps = prefix === 'SANY' || prefix === 'XCMG'
  const output = isEps ? rand(18, 35, 1) : rand(5, 20, 1)
  const fuel = rand(14, 26, 1)
  const cost = Math.round(fuel * rand(22000, 28000))

  return {
    id: `machine-${i}`,
    machineCode: code,
    equipmentType: type,
    projectLocation: project,
    status,
    workingHours: working,
    idleHours: idle,
    downtimeHours: downtime,
    utilizationPct: util,
    outputPerHour: output,
    fuelLitresPerHour: fuel,
    fuelCostVndPerHour: cost,
    dispatchStatus: pickFrom(DISPATCH_WEIGHTS),
  }
})

// Ensure SANY-021 has idle hours > 19 for AI insight
const sany021 = MOCK_MACHINES.find(m => m.machineCode === 'SANY-021')
if (sany021) {
  sany021.status = 'Standby'
  sany021.idleHours = 23
  sany021.workingHours = 8
  sany021.downtimeHours = 0
  sany021.utilizationPct = 26
}

// Ensure XCMG-007 has fuel variance
const xcmg007 = MOCK_MACHINES.find(m => m.machineCode === 'XCMG-007')
if (xcmg007) {
  xcmg007.fuelLitresPerHour = 24.8
  xcmg007.fuelCostVndPerHour = 644800
}

// Ensure SANY-030 has high productivity
const sany030 = MOCK_MACHINES.find(m => m.machineCode === 'SANY-030')
if (sany030) {
  sany030.outputPerHour = 42.3
  sany030.utilizationPct = 94
  sany030.status = 'Working'
}

export const MOCK_PROJECTS: ProjectPerformance[] = [
  {
    id: 'p1',
    name: 'Hải Vân Bay',
    outputMCoc: 31250,
    utilizationPct: 88.4,
    fuelEfficiency: 0.73,
    rank: 1,
  },
  {
    id: 'p2',
    name: 'Hạ Long Xanh',
    outputMCoc: 28640,
    utilizationPct: 84.1,
    fuelEfficiency: 0.76,
    rank: 2,
  },
  {
    id: 'p3',
    name: 'Làng Olympic',
    outputMCoc: 22180,
    utilizationPct: 80.6,
    fuelEfficiency: 0.81,
    rank: 3,
  },
  {
    id: 'p4',
    name: 'Điện gió Vũng Áng',
    outputMCoc: 17920,
    utilizationPct: 74.3,
    fuelEfficiency: 0.88,
    rank: 4,
  },
  {
    id: 'p5',
    name: 'Cần Giờ',
    outputMCoc: 12660,
    utilizationPct: 68.7,
    fuelEfficiency: 0.95,
    rank: 5,
  },
]

export const TREND_DATA: TrendPoint[] = [
  { day: '25/06', utilizationPct: 74 },
  { day: '26/06', utilizationPct: 76 },
  { day: '27/06', utilizationPct: 71 },
  { day: '28/06', utilizationPct: 79 },
  { day: '29/06', utilizationPct: 82 },
  { day: '30/06', utilizationPct: 78 },
  { day: '01/07', utilizationPct: 84 },
]

export const SHIFT_DATA: ShiftData[] = [
  { shift: 'Ca sáng', outputPerHour: 27.4 },
  { shift: 'Ca chiều', outputPerHour: 25.1 },
  { shift: 'Ca đêm', outputPerHour: 18.6 },
]

export const AI_INSIGHTS: AiInsight[] = [
  {
    id: 'ai-001',
    severity: 'Critical',
    machineOrProject: 'SANY-021',
    title: 'Máy nhàn rỗi 23h liên tục',
    shortDesc: 'Đề xuất chuyển máy sang dự án Hải Vân Bay để tối ưu khai thác',
    reasoning: 'SANY-021 đang ở trạng thái Standby trong 23 giờ liên tục tại dự án Cần Giờ. Dựa trên dữ liệu lịch thi công và khối lượng công việc còn lại, AI nhận định máy này không có kế hoạch sử dụng trong 72 giờ tới. Trong khi đó, dự án Hải Vân Bay đang thiếu 1 máy ép cọc SANY tương đương, ảnh hưởng đến tiến độ giai đoạn 2.',
    comparisonData: [
      { label: 'Giờ nhàn rỗi (24h)', current: '23h', benchmark: '≤ 4h' },
      { label: 'Utilization hiện tại', current: '26%', benchmark: '≥ 75%' },
      { label: 'Nhu cầu Hải Vân Bay', current: '+1 máy', benchmark: 'Thiếu từ 28/06' },
      { label: 'Tiết kiệm nhiên liệu', current: '0 lít', benchmark: '18.6 lít/h nếu hoạt động' },
    ],
    recommendations: [
      'Lên kế hoạch vận chuyển SANY-021 từ Cần Giờ → Hải Vân Bay trong vòng 24h tới.',
      'Phối hợp điều phối viên dự án xác nhận slot cọc tại Hải Vân Bay.',
      'Cập nhật lịch thi công Cần Giờ để tránh thiếu hụt nếu khối lượng tăng đột biến.',
      'Theo dõi utilization của SANY-021 sau khi chuyển, mục tiêu ≥ 80% trong 7 ngày đầu.',
    ],
    expectedBenefit: 'Tăng utilization fleet từ 78.4% → 81.2%. Đẩy nhanh tiến độ Hải Vân Bay giai đoạn 2 khoảng 3–4 ngày.',
    costSavingEstimate: '~42 triệu VND/tháng từ tăng năng suất và giảm chi phí chờ máy.',
  },
  {
    id: 'ai-002',
    severity: 'High',
    machineOrProject: 'XCMG-007',
    title: 'Tiêu hao nhiên liệu vượt ngưỡng 8.5%',
    shortDesc: 'Mức tiêu thụ 24.8 lít/h cao hơn 8.5% so với định mức. Cần kiểm tra rò rỉ hoặc phun dầu',
    reasoning: 'XCMG-007 ghi nhận mức tiêu thụ nhiên liệu 24.8 lít/h trong 7 ngày liên tiếp, vượt định mức 22.8 lít/h. Hệ số tiêu thụ bất thường này không tương quan với tải trọng thi công — AI phát hiện pattern tiêu thụ cao kể cả khi máy chạy không tải. Nguyên nhân khả năng cao là vấn đề phun dầu (injector) hoặc rò rỉ hệ thống dẫn nhiên liệu.',
    comparisonData: [
      { label: 'Tiêu thụ thực tế', current: '24.8 lít/h', benchmark: '22.8 lít/h' },
      { label: 'Fuel Variance', current: '+8.5%', benchmark: '≤ 3%' },
      { label: 'Chi phí nhiên liệu/ngày', current: '4,800,000 VND', benchmark: '4,000,000 VND' },
      { label: 'Thời gian kéo dài', current: '7 ngày', benchmark: '≤ 1 ngày' },
    ],
    recommendations: [
      'Dừng máy để kiểm tra tổng thể hệ thống nhiên liệu trong 4 giờ tới.',
      'Ưu tiên kiểm tra injector, seal cao su dẫn dầu, và bộ lọc nhiên liệu.',
      'Đo lại mức tiêu thụ sau khi sửa chữa để xác nhận hiệu quả.',
      'Ghi nhận vào lịch sử bảo dưỡng để theo dõi xu hướng dài hạn.',
    ],
    expectedBenefit: 'Giảm tiêu hao nhiên liệu về mức chuẩn 22.8 lít/h. Loại bỏ nguy cơ cháy nổ từ rò rỉ dầu.',
    costSavingEstimate: '~28 triệu VND/tháng nếu tiêu thụ về mức định mức.',
  },
  {
    id: 'ai-003',
    severity: 'High',
    machineOrProject: 'SANY-030',
    title: 'Năng suất vượt trội — Mô hình điển hình',
    shortDesc: 'SANY-030 đạt 42.3 m cọc/giờ, vượt 65% so với đội máy. Đề xuất nhân rộng mô hình vận hành',
    reasoning: 'SANY-030 tại Hải Vân Bay đạt năng suất 42.3 m cọc/giờ trong 14 ngày liên tục, utilization 94%. AI phân tích pattern vận hành: ca đêm được tận dụng tối đa, thời gian setup cọc giảm 35% so với TB nhờ quy trình chuẩn hóa của tổ máy. Đây là mô hình có thể nhân rộng sang các đội máy khác.',
    comparisonData: [
      { label: 'Năng suất SANY-030', current: '42.3 m/h', benchmark: '25.6 m/h (TB)' },
      { label: 'Utilization', current: '94%', benchmark: '78.4% (TB fleet)' },
      { label: 'Thời gian setup/cọc', current: '3.2 phút', benchmark: '4.9 phút (TB)' },
      { label: 'Ca đêm được dùng', current: '100%', benchmark: '64%' },
    ],
    recommendations: [
      'Document quy trình vận hành của tổ máy SANY-030 thành SOP chuẩn.',
      'Tổ chức buổi chia sẻ kỹ thuật với các đội máy SANY-001 đến SANY-015.',
      'Thử nghiệm áp dụng quy trình tại 3 máy pilot trong tuần tới.',
      'Theo dõi KPI trong 30 ngày và đánh giá hiệu quả trước khi nhân rộng toàn fleet.',
    ],
    expectedBenefit: 'Nếu nhân rộng ra 10 máy SANY, sản lượng fleet tăng ước tính 18–22%.',
    costSavingEstimate: '~185 triệu VND/tháng từ tăng doanh thu sản lượng cọc.',
  },
  {
    id: 'ai-004',
    severity: 'Medium',
    machineOrProject: 'Cần Giờ',
    title: 'Tỷ lệ huy động thiết bị thấp 68.7%',
    shortDesc: 'Dự án Cần Giờ có mobilization rate thấp nhất fleet. Cần rà soát kế hoạch điều phối',
    reasoning: 'Dự án Cần Giờ ghi nhận mobilization rate 68.7% trong tháng 6, thấp hơn 17.5 điểm phần trăm so với mục tiêu 86.2%. AI phát hiện 3 máy thường xuyên ở trạng thái Standby quá 8h/ngày do thiếu khối lượng công việc trong lịch thi công. Nguyên nhân có thể liên quan đến chậm trễ phê duyệt thiết kế cọc giai đoạn B.',
    comparisonData: [
      { label: 'Mobilization Rate', current: '68.7%', benchmark: '86.2%' },
      { label: 'Máy Standby > 8h/ngày', current: '3 máy', benchmark: '0 máy' },
      { label: 'Dispatch Completion', current: '61.2%', benchmark: '80%+' },
      { label: 'Ngày chậm thiết kế', current: '+12 ngày', benchmark: '0' },
    ],
    recommendations: [
      'Họp khẩn với BQL dự án Cần Giờ để đẩy nhanh phê duyệt thiết kế cọc.',
      'Xem xét tạm thời luân chuyển 1–2 máy Standby sang Hạ Long Xanh hoặc Làng Olympic.',
      'Cập nhật lịch thi công Cần Giờ hàng ngày để AI có thể dự báo chính xác hơn.',
    ],
    expectedBenefit: 'Tăng mobilization rate lên ≥ 80%, giảm thời gian máy chờ trung bình từ 6.2h → 2.5h/ngày.',
    costSavingEstimate: '~55 triệu VND/tháng từ tối ưu hóa điều phối máy.',
  },
  {
    id: 'ai-005',
    severity: 'Medium',
    machineOrProject: 'Điện gió Vũng Áng',
    title: 'Dispatch efficiency giảm 15% so với tháng trước',
    shortDesc: 'On-time dispatch tại Vũng Áng giảm từ 85% xuống 70.2% trong 2 tuần qua',
    reasoning: 'AI phát hiện trend giảm đều của dispatch efficiency tại Điện gió Vũng Áng từ ngày 17/06. Phân tích log điều phối cho thấy thời gian chờ xác nhận từ Site Manager tăng trung bình 2.3h/dispatch, dẫn đến delay dây chuyền. Vào cao điểm gió (ban đêm), các dispatch quan trọng thường bị trì hoãn do thiếu xác nhận real-time.',
    comparisonData: [
      { label: 'On-time Dispatch hiện tại', current: '70.2%', benchmark: '85%' },
      { label: 'Thời gian chờ xác nhận', current: '3.8h', benchmark: '1.5h' },
      { label: 'Dispatch bị hủy/shift', current: '12%', benchmark: '≤ 3%' },
      { label: 'Ảnh hưởng sản lượng', current: '-15%', benchmark: '0' },
    ],
    recommendations: [
      'Cấu hình thông báo tự động cho Site Manager khi có dispatch chờ xác nhận > 30 phút.',
      'Phân quyền xác nhận dispatch khẩn cấp cho Phó quản lý công trường.',
      'Họp review quy trình dispatch với đội Vũng Áng vào cuối tuần.',
    ],
    expectedBenefit: 'Khôi phục on-time dispatch về 85%+. Tăng sản lượng ca đêm 10–12%.',
    costSavingEstimate: '~35 triệu VND/tháng từ loại bỏ tổn thất do dispatch trễ.',
  },
]
