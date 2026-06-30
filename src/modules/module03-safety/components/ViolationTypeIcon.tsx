import { cn } from '@/utils/cn'
import type { ViolationType } from '@/types/safety'
import { getViolationTypeIconConfig } from '../utils/safetyUiHelpers'

interface ViolationTypeIconProps {
  type: ViolationType
  size?: 'xs' | 'sm' | 'md'
  className?: string
  bare?: boolean
}

const SIZE = {
  xs: { box: 'w-5 h-5', icon: 'w-2.5 h-2.5' },
  sm: { box: 'w-6 h-6', icon: 'w-3 h-3' },
  md: { box: 'w-8 h-8', icon: 'w-4 h-4' },
} as const

export function ViolationTypeIcon({ type, size = 'sm', className, bare }: ViolationTypeIconProps) {
  const { icon: Icon, color, bg } = getViolationTypeIconConfig(type)
  const s = SIZE[size]

  if (bare) {
    return <Icon className={cn(s.icon, color, 'shrink-0', className)} />
  }

  return (
    <div className={cn(s.box, 'rounded-lg flex items-center justify-center shrink-0', bg, className)}>
      <Icon className={cn(s.icon, color)} />
    </div>
  )
}
