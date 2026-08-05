import type { MonitoringProfile } from '../types/safety.types'

/** Profile giám sát — chỉ gắn kịch bản đã có pipeline AI */
export const MONITORING_PROFILES: MonitoringProfile[] = [
  {
    id: 'PROFILE-CAM-A04-SAFETY',
    name: 'Cam A-04 · PPE + WAH + DZ + PCCC',
    groups: ['PPE', 'WAH', 'DZ', 'PCCC'],
    scenarios: [
      'PPE-001', 'PPE-002', 'PPE-003',
      'WAH-001',
      'DZ-003',
      'PCCC-001', 'PCCC-002',
    ],
  },
  {
    id: 'PROFILE-CAM-A03-ROAD-ATGT',
    name: 'Cam A-03 · ATGT + lòng đường',
    groups: ['ATGT', 'BPTC'],
    scenarios: ['ATGT-002', 'ATGT-004', 'BPTC-007', 'BPTC-008', 'BPTC-009'],
  },
]

export const MONITORING_PROFILE_MAP = new Map(MONITORING_PROFILES.map(p => [p.id, p]))
