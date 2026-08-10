import { cn } from '@/utils/cn'
import type { CameraAiModelId } from '@/modules/module02-training/types/cameraAi.types'
import { modelBoxStyle } from '@/modules/module02-training/data/cameraAiModelTokens'

/** Khung ROI — vi phạm ATLĐ (solid) hoặc thông tin (dashed). */
export type RoiBoxRole = 'violation' | 'info'

const VIOLATION_BEHAVIORS = new Set([
  'smoking',
  'fire',
  'no_harness',
  'crane_proximity',
  'speeding',
  'no_soft_median',
  'mud',
  'water',
  'object',
  'mesh_missing',
  'mesh_torn',
  'mesh_dirty',
])

/** Detect dạng information — nét đứt (person, máy, PPE đạt chuẩn, làn…). */
const INFO_BEHAVIORS = new Set([
  'person',
  'vehicle',
  'soft_median',
  'hard_hat',
  'safety_vest',
  'safety_shoes',
  'safety_harness',
  'crane',
  'tower_crane',
  'crane_green',
  'sany_drill',
  'road_roller',
  'dump_truck',
  'forklift',
  'machinery',
  'excavator_orange',
  'unknown',
])

export function resolveBehaviorForRoiRole(behavior: string, machineKind?: string | null): string {
  if (behavior === 'crane' && machineKind) return machineKind
  return behavior
}

/** Behavior thuộc lỗi ATLĐ cần ghi sự kiện / khung solid. */
export function isAtldViolationBehavior(behavior: string): boolean {
  if (behavior.startsWith('no_')) return true
  return VIOLATION_BEHAVIORS.has(behavior)
}

export function isInfoDetectionBehavior(behavior: string, machineKind?: string | null): boolean {
  const key = resolveBehaviorForRoiRole(behavior, machineKind)
  if (isAtldViolationBehavior(key)) return false
  return INFO_BEHAVIORS.has(key)
}

export function resolveRoiBoxRole(behavior: string, machineKind?: string | null): RoiBoxRole {
  const key = resolveBehaviorForRoiRole(behavior, machineKind)
  return isAtldViolationBehavior(key) ? 'violation' : 'info'
}

export interface OverlayBoxStyle {
  border: string
  fill: string
  label: string
  bg: string
  role: RoiBoxRole
}

/** Màu + kiểu viền overlay camera — đồng bộ snapshot backend. */
export function getOverlayBoxStyle(
  modelId: CameraAiModelId,
  behavior: string,
  machineKind?: string | null,
): OverlayBoxStyle {
  const key = resolveBehaviorForRoiRole(behavior, machineKind)
  const role = resolveRoiBoxRole(key)
  const tokens = modelBoxStyle(modelId, role === 'violation' ? 'violation' : 'info')
  const border = role === 'violation'
    ? cn(tokens.border, 'border-2 border-solid')
    : cn(tokens.border, 'border border-dashed opacity-85')
  return {
    ...tokens,
    border,
    role,
  }
}
