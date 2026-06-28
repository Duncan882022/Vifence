import { cn } from '@/utils/cn'

interface MetricPercentRingProps {
  percent: number
  /** Hex stroke color */
  color?: string
  /** Suffix inside ring — default % */
  suffix?: string
  /** Override center text (e.g. "6/7") */
  centerLabel?: string
  size?: number
  className?: string
  title?: string
}

export function MetricPercentRing({
  percent,
  color = '#4ade80',
  suffix = '%',
  centerLabel,
  size = 44,
  className,
  title,
}: MetricPercentRingProps) {
  const clamped = Math.max(0, Math.min(100, percent))
  const r = 28
  const circumference = 2 * Math.PI * r
  const offset = circumference - (clamped / 100) * circumference
  const display = Number.isInteger(clamped) ? String(clamped) : clamped.toFixed(1)

  return (
    <div
      className={cn('relative shrink-0', className)}
      style={{ width: size, height: size }}
      title={title ?? (centerLabel ?? `${display}${suffix}`)}
    >
      <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" stroke="#1e2433" strokeWidth="5" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center px-0.5">
        <span
          className={cn(
            'font-bold tabular-nums leading-none text-center',
            centerLabel ? 'text-[8px]' : 'text-[9px]',
          )}
          style={{ color }}
        >
          {centerLabel ?? (
            <>
              {display}
              {suffix && suffix.length <= 2 && (
                <span className="text-[7px] font-semibold opacity-80">{suffix}</span>
              )}
            </>
          )}
        </span>
      </div>
    </div>
  )
}
