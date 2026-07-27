import type { ViolationType } from '@/types/safety'

export interface SafetyMonitoringCategory {
  id: ViolationType
  order: number
  title: string
  shortTitle: string
  goal: string
  scenarios: string[]
  monitoringMethods: string[]
  devices: string[]
  aiTechnologies: string[]
  alerts: string[]
}

/** SAFETY GROUP DICTIONARY — nguồn sự thật cho phân loại vi phạm ATLD (19 kịch bản) */
export const SAFETY_MONITORING_DICTIONARY: SafetyMonitoringCategory[] = [
  {
    id: 'ppe',
    order: 1,
    title: 'PPE (Bảo hộ lao động)',
    shortTitle: 'Bảo hộ lao động',
    goal: 'Giám sát việc tuân thủ sử dụng đầy đủ bảo hộ lao động của người lao động.',
    scenarios: [
      'Không đội mũ bảo hộ',
      'Không mặc áo bảo hộ',
      'Không mang giày bảo hộ',
    ],
    monitoringMethods: ['Giám sát liên tục (Continuous Monitoring)'],
    devices: ['Camera AI cố định', 'PTZ (khu vực rộng)', 'Body Camera (xác minh)'],
    aiTechnologies: [
      'Person Detection',
      'PPE Detection',
      'Multi Object Tracking',
      'ROI Detection',
      'Rule Engine',
    ],
    alerts: ['Dashboard', 'Mobile App', 'Loa IP', 'Phạt nguội'],
  },
  {
    id: 'work-at-height',
    order: 2,
    title: 'WAH (Làm việc trên cao)',
    shortTitle: 'Làm việc trên cao',
    goal: 'Giám sát các hành vi của người lao động khi làm việc trên cao nhằm phòng ngừa nguy cơ ngã cao và vật rơi.',
    scenarios: [
      'Không sử dụng dây an toàn tại mép biên',
      'Quăng, ném vật liệu từ trên cao',
      'Không đeo hoặc không móc dây an toàn khi làm việc trên cao',
    ],
    monitoringMethods: [
      'Kiểm tra trước thi công (Pre-work Inspection)',
      'Giám sát trong quá trình thi công (Continuous)',
      'Theo sự kiện (Event-based)',
    ],
    devices: ['Camera PTZ', 'Camera AI cố định', 'Body Camera'],
    aiTechnologies: [
      'Person Detection',
      'Pose Estimation',
      'Harness Detection',
      'Tracking',
      'Edge Zone Detection',
      'Falling Object Detection',
    ],
    alerts: ['Dashboard', 'Mobile App', 'Loa IP', 'Dừng công việc', 'Phạt nguội'],
  },
  {
    id: 'danger-zone',
    order: 3,
    title: 'DZ (Khu vực nguy hiểm)',
    shortTitle: 'Khu vực nguy hiểm',
    goal: 'Giám sát các khu vực nguy hiểm nhằm phát hiện điều kiện mất an toàn và ngăn ngừa người hoặc phương tiện tiếp cận vùng rủi ro.',
    scenarios: [
      'Đất đào hoặc vật tư cách mép hố < 0,5 m',
      'Không bố trí biển báo hoặc cờ cảnh báo hố sâu',
    ],
    monitoringMethods: [
      'Tuần tra định kỳ (Scheduled Patrol)',
      'Phát hiện thay đổi hiện trường (Change Detection)',
    ],
    devices: ['Flycam', 'Camera AI', 'Body Camera'],
    aiTechnologies: [
      'Excavation Detection',
      'Material Detection',
      'Segmentation',
      'Distance Estimation',
      'Zone Detection',
      'GIS Mapping',
    ],
    alerts: ['Dashboard', 'Mobile App', 'Giao HSE xác minh', 'Phiếu khắc phục'],
  },
  {
    id: 'traffic-safety',
    order: 4,
    title: 'ATGT (An toàn giao thông)',
    shortTitle: 'An toàn giao thông',
    goal: 'Giám sát việc tổ chức giao thông và hoạt động của phương tiện trong công trường.',
    scenarios: [
      'Không bố trí người điều hướng giao thông',
      'Phương tiện vượt tốc độ quy định',
      'Không bố trí đèn đỏ, biển báo hoặc cảnh báo giao thông',
      'Không tổ chức phân làn, phân luồng giao thông',
    ],
    monitoringMethods: ['Giám sát liên tục', 'Theo sự kiện'],
    devices: ['Camera AI', 'PTZ', 'GPS', 'Blackbox', 'Radar (tùy chọn)'],
    aiTechnologies: [
      'Vehicle Detection',
      'Vehicle Tracking',
      'Speed Estimation',
      'Lane Detection',
      'Traffic Flow Analysis',
    ],
    alerts: ['Dashboard', 'Mobile App', 'Loa IP', 'Phạt nguội'],
  },
  {
    id: 'method-statement',
    order: 5,
    title: 'BPTC (Biện pháp thi công)',
    shortTitle: 'Biện pháp thi công',
    goal: 'Giám sát việc triển khai hiện trường theo đúng biện pháp thi công đã được phê duyệt.',
    scenarios: [
      'Giáo hoặc lưới bao che không đúng quy định',
      'Cẩu vật tư trực tiếp lên ban công, không có sàn tiếp nhận',
      'Sàn tiếp liệu trên cao ≥ 6 m không đúng biện pháp',
      'Hàn, cắt không có che chắn',
      'Thi công kết cấu thép, lợp mái không có lưới chống rơi',
      'Thi công trên cao không có dây cứu sinh, lan can hoặc sàn thao tác',
    ],
    monitoringMethods: [
      'Kiểm tra trước thi công',
      'Tuần tra định kỳ',
      'Theo sự kiện',
    ],
    devices: ['Flycam', 'Camera PTZ', 'Body Camera'],
    aiTechnologies: [
      'Scene Classification',
      'Segmentation',
      'Structure Detection',
      'Scaffold Detection',
      'Barrier Detection',
      'Platform Detection',
      'Comparison Detection',
    ],
    alerts: ['Dashboard', 'Mobile App', 'HSE', 'Phiếu khắc phục', 'Dừng thi công'],
  },
  {
    id: 'fire-hot-work',
    order: 6,
    title: 'PCCC (Phòng cháy chữa cháy)',
    shortTitle: 'Phòng cháy chữa cháy',
    goal: 'Giám sát các hành vi có nguy cơ gây cháy nổ và đảm bảo tuân thủ quy định phòng cháy chữa cháy.',
    scenarios: [
      'Hút thuốc không đúng nơi quy định',
    ],
    monitoringMethods: ['Giám sát liên tục', 'Theo Permit Hot Work'],
    devices: ['Camera AI', 'Body Camera'],
    aiTechnologies: [
      'Smoke Detection',
      'Fire Detection',
      'Spark Detection',
      'Smoking Detection',
      'PPE Detection',
    ],
    alerts: ['Dashboard', 'Mobile App', 'Loa IP', 'HSE', 'Khẩn cấp'],
  },
]

export const SAFETY_MONITORING_BY_TYPE: Record<ViolationType, SafetyMonitoringCategory> =
  SAFETY_MONITORING_DICTIONARY.reduce(
    (acc, cat) => {
      acc[cat.id] = cat
      return acc
    },
    {} as Record<ViolationType, SafetyMonitoringCategory>,
  )

export function getMonitoringCategory(type: ViolationType): SafetyMonitoringCategory {
  return SAFETY_MONITORING_BY_TYPE[type]
}

/** Tên kịch bản theo thứ tự trong dictionary (0-based) */
export function getDictionaryScenarioName(
  violationType: ViolationType,
  index: number,
): string | undefined {
  return SAFETY_MONITORING_BY_TYPE[violationType]?.scenarios[index]
}

/** Nhãn hiển thị: `{shortTitle} — {kịch bản}` */
export function formatMonitoringScenarioLabel(
  violationType: ViolationType,
  scenarioIndex: number,
): string {
  const cat = getMonitoringCategory(violationType)
  const scenario = getDictionaryScenarioName(violationType, scenarioIndex) ?? cat.shortTitle
  return `${cat.shortTitle} — ${scenario}`
}

/** Tooltip nhóm: `{title} — {goal}` */
export function formatMonitoringGroupTooltip(violationType: ViolationType): string {
  const cat = getMonitoringCategory(violationType)
  return `${cat.title} — ${cat.goal}`
}
