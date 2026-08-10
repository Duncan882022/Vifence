import type { LucideIcon } from 'lucide-react'
import { TagTooltip } from '@/components/common/IconTooltip/IconTooltip'
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

const LABEL_PAD: Record<BadgeSize, string> = {
  xs: 'px-1 py-0.5 gap-0.5',
  sm: 'px-1.5 py-0.5 gap-1',
  md: 'px-2 py-1 gap-1',
}

const LABEL_TEXT: Record<BadgeSize, string> = {
  xs: 'text-[8px]',
  sm: 'text-[9px]',
  md: 'text-[10px]',
}

interface SafetyGroupIconBadgeProps {
  groupId: SafetyGroupId
  size?: BadgeSize
  /** Icon + mã nhóm (PPE, DZ, WAH…) — mặc định bật trên sự kiện. */
  showLabel?: boolean
  className?: string
  badgeClassName?: string
  iconClassName?: string
  /** Ghi đè icon mặc định (vd Cpu cho DEMO ở modal camera). */
  icon?: LucideIcon
}

/** Badge nhóm ATLĐ — icon (+ nhãn PPE/DZ/WAH khi showLabel). */
export function SafetyGroupIconBadge({
  groupId,
  size = 'sm',
  showLabel = true,
  className,
  badgeClassName,
  iconClassName,
  icon,
}: SafetyGroupIconBadgeProps) {
  const Icon = icon ?? GROUP_ICONS[groupId]
  const groupName = SAFETY_GROUP_MAP.get(groupId)?.name ?? groupId
  const tip = getGroupDictionaryTooltip(groupId)

  const badge = (
    <span
      className={cn(
        'inline-flex items-center rounded border shrink-0 font-semibold',
        showLabel ? LABEL_PAD[size] : cn('justify-center', PAD_SIZE[size]),
        showLabel && LABEL_TEXT[size],
        badgeClassName ?? GROUP_BADGE[groupId],
        className,
      )}
      aria-label={`${groupId} · ${groupName}`}
    >
      <Icon className={cn(ICON_SIZE[size], GROUP_COLORS[groupId], iconClassName)} aria-hidden />
      {showLabel && groupId}
    </span>
  )

  if (showLabel) {
    return (
      <TagTooltip content={`${groupId} · ${groupName}`} className="shrink-0">
        {badge}
      </TagTooltip>
    )
  }

  return (
    <span title={tip} className="shrink-0">
      {badge}
    </span>
  )
}
