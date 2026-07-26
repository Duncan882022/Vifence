import type { MonitoringProfile } from '../types/safety.types'

export const MONITORING_PROFILES: MonitoringProfile[] = [
  {
    id: 'PROFILE-BUILDING-WAH',
    name: 'Giám sát an toàn block thi công',
    groups: ['PPE', 'WAH', 'BPTC'],
    scenarios: [
      'PPE-001', 'PPE-002', 'WAH-001', 'WAH-002', 'WAH-003',
      'BPTC-001', 'BPTC-005', 'BPTC-006',
    ],
  },
  {
    id: 'PROFILE-INTERNAL-ROAD',
    name: 'Giám sát giao thông nội bộ',
    groups: ['ATGT', 'PPE', 'DZ'],
    scenarios: ['ATGT-001', 'ATGT-002', 'ATGT-003', 'DZ-002'],
  },
  {
    id: 'PROFILE-EXCAVATION',
    name: 'Giám sát hố đào và khu nguy hiểm',
    groups: ['DZ', 'BPTC', 'PCCC'],
    scenarios: ['DZ-001', 'BPTC-004', 'PCCC-001'],
  },
]

export const MONITORING_PROFILE_MAP = new Map(MONITORING_PROFILES.map(p => [p.id, p]))
