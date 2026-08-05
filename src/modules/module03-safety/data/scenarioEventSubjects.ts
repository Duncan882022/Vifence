import type { EventSubjectType } from '../types/safety.types'

/** Gán eventSubjectType — chỉ kịch bản đã triển khai AI */
export const SCENARIO_EVENT_SUBJECT: Record<string, EventSubjectType> = {
  'PPE-001': 'PERSON',
  'PPE-002': 'PERSON',
  'PPE-003': 'PERSON',
  'WAH-001': 'PERSON',
  'DZ-003': 'PERSON',
  'ATGT-002': 'VEHICLE',
  'ATGT-004': 'SITE_CONDITION',
  'BPTC-007': 'SITE_CONDITION',
  'BPTC-008': 'SITE_CONDITION',
  'BPTC-009': 'CONSTRUCTION_ACTIVITY',
  'PCCC-001': 'PERSON',
  'PCCC-002': 'SITE_CONDITION',
}
