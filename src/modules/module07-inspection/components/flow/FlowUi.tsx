import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/utils/cn'
import { POC_MOCK_LABEL } from '../../data/workflow/hnqnProject'
import { SOURCE_META } from '../../data/workflow/meta'
import type { SourceKind, SourceRef } from '../../workflow.types'

export function TokenBadge({ token, size = 'normal', pulse, className }: {
  token: { label: string; className: string }
  size?: 'small' | 'normal' | 'large'
  pulse?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border font-bold tracking-wider whitespace-nowrap',
        size === 'small' && 'text-[8px] px-1 py-0.5',
        size === 'normal' && 'text-[9px] px-1.5 py-0.5',
        size === 'large' && 'text-[11px] px-2 py-1',
        token.className,
        className,
      )}
    >
      {pulse && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" aria-hidden />}
      {token.label}
    </span>
  )
}

export function SourceBadge({ source, showRef = false }: { source: SourceRef | SourceKind; showRef?: boolean }) {
  const kind = typeof source === 'string' ? source : source.kind
  const ref = typeof source === 'string' ? undefined : source.ref
  return (
    <span className="inline-flex items-center gap-1 min-w-0" title={kind === 'MOCK' ? POC_MOCK_LABEL : ref}>
      <TokenBadge token={SOURCE_META[kind]} size="small" />
      {showRef && ref && <span className="text-[9px] text-muted-foreground truncate">{ref}</span>}
    </span>
  )
}

export function PocMockBanner({ className }: { className?: string }) {
  return (
    <p className={cn('text-[9px] font-bold tracking-wider text-fuchsia-300/80 border border-dashed border-fuchsia-500/30 rounded px-2 py-1', className)}>
      {POC_MOCK_LABEL} · dữ liệu gắn nhãn MOCK không phải từ IFC/AFC thật
    </p>
  )
}

export interface Crumb {
  label: string
  to?: string
}

export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav className={cn('flex items-center gap-1 text-[11px] text-muted-foreground min-w-0 flex-wrap', className)}>
      {items.map((c, i) => (
        <Fragment key={`${c.label}-${i}`}>
          {i > 0 && <ChevronRight className="w-3 h-3 shrink-0 opacity-50" />}
          {c.to ? (
            <Link to={c.to} className="hover:text-foreground truncate">{c.label}</Link>
          ) : (
            <span className="text-foreground font-semibold truncate">{c.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  )
}

export function Card({ title, icon, right, children, className, bodyClassName }: {
  title?: ReactNode
  icon?: ReactNode
  right?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('rounded-lg border border-[#1e2433] bg-[#0b0f1a] flex flex-col min-h-0', className)}>
      {(title || right) && (
        <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#1e2433] shrink-0">
          <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-foreground/90 min-w-0">
            {icon}
            <span className="truncate">{title}</span>
          </h3>
          {right}
        </header>
      )}
      <div className={cn('p-3 min-h-0', bodyClassName)}>{children}</div>
    </section>
  )
}

export function Meta({ label, value, className, valueClassName }: {
  label: string
  value: ReactNode
  className?: string
  valueClassName?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className={cn('text-[12px] font-semibold text-foreground truncate', valueClassName)}>{value}</div>
    </div>
  )
}

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      {icon && <div className="text-muted-foreground/60">{icon}</div>}
      <p className="text-[12px] font-semibold text-muted-foreground">{title}</p>
      {hint && <p className="text-[10px] text-muted-foreground/60 max-w-sm">{hint}</p>}
    </div>
  )
}

export function formatDateTimeVn(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
