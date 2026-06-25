import { cn } from '@/utils/cn'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

interface StatusBadgeProps {
  variant: BadgeVariant
  label: string
  dot?: boolean
  className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-green-500/10 text-green-400 border-green-500/20',
  warning: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  danger: 'bg-red-500/10 text-red-400 border-red-500/20',
  info: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  neutral: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
}

const dotClasses: Record<BadgeVariant, string> = {
  success: 'bg-green-400',
  warning: 'bg-yellow-400',
  danger: 'bg-red-400',
  info: 'bg-blue-400',
  neutral: 'bg-gray-400',
}

export function StatusBadge({ variant, label, dot = true, className }: StatusBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border',
      variantClasses[variant],
      className,
    )}>
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', dotClasses[variant])} />}
      {label}
    </span>
  )
}

export function getEventStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'processed': return 'success'
    case 'pending': return 'warning'
    case 'dismissed': return 'neutral'
    default: return 'neutral'
  }
}

export function getEventSeverityVariant(severity: string): BadgeVariant {
  switch (severity) {
    case 'critical': return 'danger'
    case 'warning': return 'warning'
    case 'info': return 'info'
    default: return 'neutral'
  }
}

export function getCameraStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'online': return 'success'
    case 'offline': return 'neutral'
    case 'error': return 'danger'
    default: return 'neutral'
  }
}
