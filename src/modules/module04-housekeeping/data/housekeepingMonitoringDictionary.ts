export interface HousekeepingMonitoringCategory {
  id: string
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

export const HOUSEKEEPING_MONITORING_DICTIONARY: HousekeepingMonitoringCategory[] = [
  {
    id: 'logistics-road',
    order: 1,
    title: 'LOG (Logistics — Lưu thông nội bộ)',
    shortTitle: 'Logistics',
    goal: 'Đảm bảo tuyến đường nội bộ luôn thông thoáng, phát hiện vật tư chiếm dụng lòng đường vượt thời gian quy định.',
    scenarios: ['Vật tư chiếm dụng lòng đường'],
    monitoringMethods: ['Giám sát liên tục', 'Object tracking', 'ROI lòng đường'],
    devices: ['Camera AI cố định', 'Camera PTZ', 'Drone'],
    aiTechnologies: [
      'Object Detection',
      'Object Tracking',
      'ROI Detection',
      'Dwell Time Analysis',
    ],
    alerts: ['Dashboard', 'Mobile App', 'HSE', 'Thông báo nhà thầu'],
  },
  {
    id: 'housekeeping-road',
    order: 2,
    title: 'HK (Housekeeping — Vệ sinh công trường)',
    shortTitle: 'Housekeeping',
    goal: 'Phát hiện bùn đất, nước đọng, rác thải và vật liệu rơi vãi ảnh hưởng vệ sinh và giao thông nội bộ.',
    scenarios: [
      'Đường nội bộ bùn bẩn',
      'Nước đọng trên đường',
      'Vật liệu rơi vãi trên đường',
      'Rác tồn lưu trên đường',
    ],
    monitoringMethods: ['Giám sát liên tục', 'Phân tích diện tích', 'ROI lòng đường'],
    devices: ['Camera AI', 'Camera hành lang'],
    aiTechnologies: [
      'Segmentation',
      'Material Detection',
      'Trash Detection',
      'Water/Mud Detection',
      'ROI Detection',
    ],
    alerts: ['Dashboard', 'Mobile App', 'Housekeeping', 'HSE'],
  },
]

export function getHousekeepingDictionaryCategory(id: string): HousekeepingMonitoringCategory | undefined {
  return HOUSEKEEPING_MONITORING_DICTIONARY.find(c => c.id === id)
}

export function formatHousekeepingGroupTooltip(categoryId: string): string {
  const cat = getHousekeepingDictionaryCategory(categoryId)
  if (!cat) return ''
  return `${cat.title}\n${cat.goal}`
}
