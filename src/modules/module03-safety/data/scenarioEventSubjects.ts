import type { EventSubjectType } from '../types/safety.types'

/** Gán eventSubjectType cho từng kịch bản — quan hệ scenario ↔ đối tượng */
export const SCENARIO_EVENT_SUBJECT: Record<string, EventSubjectType> = {
  'PPE-001': 'PERSON',
  'PPE-002': 'PERSON',
  'PPE-003': 'PERSON',
  'WAH-001': 'PERSON',
  'WAH-002': 'PERSON',
  'WAH-003': 'PERSON',
  'DZ-001': 'SITE_CONDITION',
  'DZ-002': 'SITE_CONDITION',
  'ATGT-001': 'MANAGEMENT',
  'ATGT-002': 'VEHICLE',
  'ATGT-003': 'SITE_CONDITION',
  'ATGT-004': 'MANAGEMENT',
  'BPTC-001': 'SITE_CONDITION',
  'BPTC-002': 'CONSTRUCTION_ACTIVITY',
  'BPTC-003': 'SITE_CONDITION',
  'BPTC-004': 'CONSTRUCTION_ACTIVITY',
  'BPTC-005': 'SITE_CONDITION',
  'BPTC-006': 'SITE_CONDITION',
  'PCCC-001': 'PERSON',
  'PCCC-002': 'PERSON',
}
