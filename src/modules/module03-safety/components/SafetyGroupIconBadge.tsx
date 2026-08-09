import type { LucideIcon } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { SafetyGroupId } from '../types/safety.types'
import { SAFETY_GROUP_MAP, getGroupDictionaryTooltip } from '../data/safetyGroups'
import { GROUP_BADGE, GROUP_COLORS, GROUP_ICONS } from '../utils/safetyDashboardUi'

type BadgeSize = 'xs' | 'sm' | 'md'

const ICON_SIZE: Record<BadgeSize, string> = {
  xs: 'w-2.5 h-2.5',
  sm: 'w-3 h-3',
  md: 'w-4 h-4',
}

const PAD_SIZE: Record<BadgeSize, string> = {
  xs: 'p-0.5',
  sm: 'p-0.5',
  md: 'p-1',
}

interface SafetyGroupIconBadgeProps {
  groupId: SafetyGroupId
  size?: BadgeSize
  className?: string
  badgeClassName?: string
  iconClassName?: string
  /** Ghi đè icon mặc định (vd Cpu cho DEMO ở modal camera). */
  icon?: LucideIcon
}

/** Badge nhóm ATLĐ — chỉ icon, tooltip/aria-label đủ ngữ nghĩa. */
export function SafetyGroupIconBadge({
  groupId,
  size = 'sm',
  className,
  badgeClassName,
  iconClassName,
  icon,
}: SafetyGroupIconBadgeProps) {
  const Icon = icon ?? GROUP_ICONS[groupId]
  const groupName = SAFETY_GROUP_MAP.get(groupId)?.name ?? groupId
  const tip = getGroupDictionaryTooltip(groupId)

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded border shrink-0',
        PAD_SIZE[size],
        badgeClassName ?? GROUP_BADGE[groupId],
        className,
      )}
      title={tip}
      aria-label={`${groupId} · ${groupName}`}
    >
      <Icon className={cn(ICON_SIZE[size], GROUP_COLORS[groupId], iconClassName)} aria-hidden />
    </span>
  )
}
