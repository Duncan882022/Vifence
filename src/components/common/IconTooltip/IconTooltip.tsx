import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
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
  /** Bật khi nội dung dài (dictionary goal, tên kịch bản) */
  multiline?: boolean
}

export function TagTooltip({
  content,
  children,
  className,
  tooltipClassName,
  multiline = false,
}: TagTooltipProps) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ x: number; y: number; placeBelow: boolean } | null>(null)
  const rootRef = useRef<HTMLSpanElement>(null)

  const updateAnchor = () => {
    const node = rootRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const placeBelow = window.innerWidth < 1024 || rect.top < 72
    setAnchor({
      x: rect.left + rect.width / 2,
      y: placeBelow ? rect.bottom + 8 : rect.top - 8,
      placeBelow,
    })
  }

  useEffect(() => {
    if (!open) return
    updateAnchor()
    const onOutside = (event: MouseEvent | TouchEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    const onReposition = () => updateAnchor()
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('touchstart', onOutside, { passive: true })
    window.addEventListener('scroll', onReposition, true)
    window.addEventListener('resize', onReposition)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('touchstart', onOutside)
      window.removeEventListener('scroll', onReposition, true)
      window.removeEventListener('resize', onReposition)
    }
  }, [open])

  const toggleOpen = (event: React.MouseEvent | React.TouchEvent) => {
    event.stopPropagation()
    setOpen(prev => {
      const next = !prev
      if (next) updateAnchor()
      return next
    })
  }

  const floatingTip = open && anchor ? (
    <span
      className={cn(
        'fixed z-[9999] px-2.5 py-1.5 rounded-lg bg-[#0e1320] border border-[#2a3855] shadow-2xl',
        'text-[10px] font-semibold text-foreground pointer-events-none',
        multiline
          ? 'max-w-[min(260px,85vw)] whitespace-normal text-left leading-snug'
          : 'whitespace-nowrap max-w-[85vw] truncate',
        tooltipClassName,
      )}
      style={{
        left: anchor.x,
        top: anchor.y,
        transform: anchor.placeBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
      }}
      role="tooltip"
    >
      {content}
    </span>
  ) : null

  return (
    <>
      <span
        ref={rootRef}
        className={cn(
          'relative inline-flex group/tag-tip min-w-0',
          'max-lg:cursor-pointer lg:cursor-help',
          className,
        )}
        onClick={toggleOpen}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setOpen(prev => {
              const next = !prev
              if (next) updateAnchor()
              return next
            })
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={content}
        aria-expanded={open}
      >
        {children}

        <span
          className={cn(
            'pointer-events-none absolute z-50 left-1/2 -translate-x-1/2 max-lg:hidden',
            'bottom-full mb-2 px-2.5 py-1.5 rounded-lg bg-[#0e1320] border border-[#2a3855] shadow-2xl',
            'text-[10px] font-semibold text-foreground',
            multiline
              ? 'max-w-[min(260px,85vw)] whitespace-normal text-left leading-snug'
              : 'whitespace-nowrap',
            'opacity-0 scale-90 origin-bottom transition-all duration-200 ease-out',
            'lg:group-hover/tag-tip:opacity-100 lg:group-hover/tag-tip:scale-100',
            tooltipClassName,
          )}
        >
          {content}
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-[5px] border-4 border-transparent border-t-[#0e1320] z-50" />
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-[6px] border-4 border-transparent border-t-[#2a3855] -z-10" />
        </span>
      </span>
      {floatingTip && typeof document !== 'undefined' ? createPortal(floatingTip, document.body) : null}
    </>
  )
}
