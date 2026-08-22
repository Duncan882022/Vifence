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

/** ATGT-004 — thiếu phân làn/luồng (cam, đồng bộ token VIOLATION). */
const ATGT_BEHAVIOR_BOX_STYLES: Record<string, Omit<OverlayBoxStyle, 'role'>> = {
  no_soft_median: {
    border: 'border-orange-400/95 border border-solid',
    fill: 'bg-orange-500/16',
    label: 'text-orange-200',
    bg: 'bg-orange-600/40',
  },
}

/** BPTC-001 — thiếu/rách (xanh) vs bẩn (nâu #92400e), title catalog gộp "thiếu/bẩn". */
const MESH_BEHAVIOR_BOX_STYLES: Record<string, Omit<OverlayBoxStyle, 'role'>> = {
  mesh_missing: {
    border: 'border-green-400/95 border border-solid',
    fill: 'bg-green-500/16',
    label: 'text-green-200',
    bg: 'bg-green-600/40',
  },
  mesh_torn: {
    border: 'border-green-400/95 border border-solid',
    fill: 'bg-green-500/16',
    label: 'text-green-200',
    bg: 'bg-green-600/40',
  },
  mesh_dirty: {
    border: 'border-[#92400e]/95 border border-solid',
    fill: 'bg-[#78350f]/26',
    label: 'text-amber-50',
    bg: 'bg-[#92400e]/58',
  },
}

export function playbackViolationRoiClass(scenarioId?: string | null): string {
  if (scenarioId === 'ATGT-004') {
    return 'border border-solid border-orange-400/95 shadow-[0_0_8px_rgba(251,146,60,0.28)]'
  }
  return 'border-2 border-red-400/95 shadow-[0_0_10px_rgba(248,113,113,0.35)]'
}

export function overlayBorderClass(role: RoiBoxRole): string {
  return role === 'violation' ? 'border-2 border-solid' : 'border border-dashed'
}

/** Person trên cam — xanh nét liền (không dashed info). */
const PERSON_LIVE_BOX_STYLE: OverlayBoxStyle = {
  border: 'border-2 border-solid border-green-400/95',
  fill: 'bg-green-500/14',
  label: 'text-green-100',
  bg: 'bg-green-700/55',
  role: 'info',
}

/** Màu + kiểu viền overlay camera — đồng bộ snapshot backend. */
export function getOverlayBoxStyle(
  modelId: CameraAiModelId,
  behavior: string,
  machineKind?: string | null,
): OverlayBoxStyle {
  const key = resolveBehaviorForRoiRole(behavior, machineKind)
  if (key === 'person' || key === 'unknown') {
    return PERSON_LIVE_BOX_STYLE
  }
  const role = resolveRoiBoxRole(key)
  const atgtStyle = ATGT_BEHAVIOR_BOX_STYLES[key]
  if (atgtStyle) {
    return { ...atgtStyle, role }
  }
  const meshStyle = MESH_BEHAVIOR_BOX_STYLES[key]
  if (meshStyle) {
    return { ...meshStyle, role }
  }
  const tokens = modelBoxStyle(modelId, role === 'violation' ? 'violation' : 'info')
  const thinRoadViolation =
    modelId === 'road_material' && (key === 'mud' || key === 'water' || key === 'object')
  const border = thinRoadViolation
    ? cn(tokens.border, 'border border-solid')
    : cn(tokens.border, overlayBorderClass(role), role === 'info' && 'opacity-85')
  return {
    ...tokens,
    border,
    role,
  }
}
