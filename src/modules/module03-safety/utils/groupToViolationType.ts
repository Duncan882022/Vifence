import type { SafetyGroupId } from '../types/safety.types'
import type { ViolationType } from '@/types/safety'
import { GROUP_TO_VIOLATION_TYPE } from '../data/safetyGroups'

export type SafetyFeedType = ViolationType

export function groupIdToViolationType(groupId: string): ViolationType | null {
  return GROUP_TO_VIOLATION_TYPE[groupId as SafetyGroupId] ?? null
}

export function groupIdToFeedType(groupId: string): SafetyFeedType {
  return GROUP_TO_VIOLATION_TYPE[groupId as SafetyGroupId] ?? 'ppe'
}
