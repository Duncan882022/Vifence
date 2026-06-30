import {
  HardHat,
  Shirt,
  Cable,
  Ban,
  ArrowUpFromLine,
  TrendingDown,
  TrendingUp,
  Minus,
  type LucideIcon,
} from 'lucide-react'
import type { SafetyViolation, ViolationType } from '@/types/safety'

export interface ViolationTypeIconConfig {
  icon: LucideIcon
  color: string
  bg: string
}

/** PPE compliance level thresholds (single source of truth) */
export const PPE_LEVEL_HIGH_MIN = 95
export const PPE_LEVEL_MEDIUM_MIN = 85

export type PpeLevel = 'high' | 'medium' | 'low'

export interface PpeLevelConfig {
  level: PpeLevel
  /** Short label for compact KPI rows, e.g. "Cao" */
  label: string
  /** Full label for tooltips, e.g. "Tuân thủ cao" */
  fullLabel: string
  icon: LucideIcon
  color: string
  bg: string
  ringColor: string
}

/** Single source of truth: PPE score % → level, icon, colors, tooltip copy */
export function getPpeLevel(score: number): PpeLevelConfig {
  if (score >= PPE_LEVEL_HIGH_MIN) {
    return {
      level: 'high',
      label: 'Cao',
      fullLabel: 'Tuân thủ cao',
      icon: TrendingUp,
      color: 'text-green-400',
      bg: 'bg-green-500/15',
      ringColor: '#4ade80',
    }
  }
  if (score >= PPE_LEVEL_MEDIUM_MIN) {
    return {
      level: 'medium',
      label: 'TB',
      fullLabel: 'Tuân thủ TB',
      icon: Minus,
      color: 'text-amber-400',
      bg: 'bg-amber-500/15',
      ringColor: '#fbbf24',
    }
  }
  return {
    level: 'low',
    label: 'Thấp',
    fullLabel: 'Tuân thủ thấp',
    icon: TrendingDown,
    color: 'text-red-400',
    bg: 'bg-red-500/15',
    ringColor: '#ef4444',
  }
}

export function formatPpeScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1)
}

/** Vietnamese tooltip lines explaining PPE score evaluation */
export function buildPpeTooltipLines(score: number): string[] {
  const { fullLabel } = getPpeLevel(score)
  return [
    'Điểm PPE = số lần tuân thủ ÷ tổng số phát hiện × 100',
    'Bao gồm: mũ bảo hộ, áo phản quang, dây an toàn (trọng số đồng đều)',
    `Điểm hiện tại: ${formatPpeScore(score)}% · ${fullLabel}`,
  ]
}

/** Single source of truth: violation type → icon + accent colors */
export const VIOLATION_TYPE_ICON_CONFIG: Record<ViolationType, ViolationTypeIconConfig> = {
  'no-helmet': {
    icon: HardHat,
    color: 'text-amber-400',
    bg: 'bg-amber-500/15',
  },
  'no-vest': {
    icon: Shirt,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/15',
  },
  'no-harness': {
    icon: Cable,
    color: 'text-red-400',
    bg: 'bg-red-500/15',
  },
  'danger-zone': {
    icon: Ban,
    color: 'text-red-400',
    bg: 'bg-red-500/15',
  },
  'work-at-height': {
    icon: ArrowUpFromLine,
    color: 'text-orange-400',
    bg: 'bg-orange-500/15',
  },
  'fall': {
    icon: TrendingDown,
    color: 'text-red-400',
    bg: 'bg-red-500/15',
  },
}

export function getViolationTypeIcon(type: ViolationType): LucideIcon {
  return VIOLATION_TYPE_ICON_CONFIG[type].icon
}

export function getViolationTypeIconConfig(type: ViolationType): ViolationTypeIconConfig {
  return VIOLATION_TYPE_ICON_CONFIG[type]
}

export function countViolationsByType(
  violations: SafetyViolation[],
): Partial<Record<ViolationType, number>> {
  const counts: Partial<Record<ViolationType, number>> = {}
  for (const v of violations) {
    counts[v.type] = (counts[v.type] ?? 0) + 1
  }
  return counts
}
