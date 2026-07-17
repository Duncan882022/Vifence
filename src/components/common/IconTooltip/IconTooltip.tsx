import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/utils/cn'

interface IconTooltipProps {
  icon: LucideIcon
  /** Shown in tooltip and as aria-label */
  label: string
  /** Optional longer description; defaults to label */
  tip?: string
  iconClassName?: string
  className?: string
  size?: 'xs' | 'sm' | 'md'
}

const SIZE_CLASS = {
  xs: 'w-3 h-3',
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
} as const

export function IconTooltip({
  icon: Icon,
  label,
  tip,
  iconClassName,
  className,
  size = 'md',
}: IconTooltipProps) {
  const text = tip ?? label

  return (
    <span
      className={cn('relative inline-flex shrink-0 group/icon-tip cursor-help', className)}
      title={text}
      aria-label={text}
      role="img"
    >
      <Icon className={cn(SIZE_CLASS[size], iconClassName)} aria-hidden />
      <span
        className={cn(
          'pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-30',
          'px-2 py-1 rounded-md bg-[#1a2235] border border-[#2a3855] shadow-lg',
          'text-[10px] font-medium text-foreground whitespace-nowrap',
          'opacity-0 scale-95 transition-all duration-150',
          'group-hover/icon-tip:opacity-100 group-hover/icon-tip:scale-100',
          'group-focus-visible/icon-tip:opacity-100 group-focus-visible/icon-tip:scale-100',
        )}
      >
        {text}
      </span>
    </span>
  )
}

interface IconTooltipBadgeProps {
  icon: LucideIcon
  label: string
  tip?: string
  value: ReactNode
  className?: string
  iconClassName?: string
  pulse?: boolean
}

export function IconTooltipBadge({
  icon: Icon,
  label,
  tip,
  value,
  className,
  iconClassName,
  pulse,
}: IconTooltipBadgeProps) {
  const text = tip ?? label

  return (
    <span
      className={cn(
        'relative inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-semibold tabular-nums',
        'group/icon-badge cursor-help',
        className,
      )}
      title={text}
      aria-label={`${label}: ${value}`}
    >
      {pulse && (
        <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-current shrink-0" />
      )}
      <Icon className={cn('w-3 h-3 shrink-0 opacity-90', iconClassName)} aria-hidden />
      <span>{value}</span>
      <span
        className={cn(
          'pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-30',
          'px-2 py-1 rounded-md bg-[#1a2235] border border-[#2a3855] shadow-lg',
          'text-[10px] font-medium text-foreground whitespace-nowrap',
          'opacity-0 group-hover/icon-badge:opacity-100 transition-opacity',
        )}
      >
        {text}
      </span>
    </span>
  )
}

interface TagTooltipProps {
  content: string
  children: ReactNode
  className?: string
  tooltipClassName?: string
}

export function TagTooltip({
  content,
  children,
  className,
  tooltipClassName,
}: TagTooltipProps) {
  return (
    <span className={cn('relative inline-flex group/tag-tip cursor-default', className)}>
      {children}
      
      {/* Tooltip box */}
      <span
        className={cn(
          'pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50',
          'px-2.5 py-1.5 rounded-lg bg-[#0e1320] border border-[#2a3855] shadow-2xl',
          'text-[10px] font-semibold text-foreground whitespace-nowrap',
          'opacity-0 scale-90 origin-bottom transition-all duration-200 ease-out',
          'group-hover/tag-tip:opacity-100 group-hover/tag-tip:scale-100',
          tooltipClassName
        )}
      >
        {content}
        {/* Little arrow at the bottom center */}
        <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-[5px] border-4 border-transparent border-t-[#0e1320] z-50" />
        <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-[6px] border-4 border-transparent border-t-[#2a3855] -z-10" />
      </span>
    </span>
  )
}
