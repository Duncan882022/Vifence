import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useShellLayout } from '@/hooks/useShellLayout'

interface LayoutProps {
  children: React.ReactNode
  className?: string
  /** Extra classes on the inner content wrapper */
  contentClassName?: string
  /** Cho phép scroll dọc trên desktop — dùng cho trang form/báo cáo */
  scrollable?: boolean
}

/** Root wrapper — fills viewport below the header */
export function PageLayout({ children, className, contentClassName, scrollable = false }: LayoutProps) {
  const { sidebarInset } = useShellLayout()

  return (
    <main
      className={cn('pt-header bg-[#060b14] transition-all duration-200', className)}
      style={{ paddingLeft: sidebarInset }}
    >
      <div
        className={cn(
          'flex flex-col gap-3 p-3 sm:p-4',
          'min-h-[calc(100vh-64px)] overflow-y-auto',
          scrollable
            ? 'lg:min-h-[calc(100vh-64px)] lg:overflow-y-auto'
            : 'lg:h-[calc(100vh-64px)] lg:overflow-hidden',
          contentClassName,
        )}
      >
        {children}
      </div>
    </main>
  )
}

/** Row 1: KPI cards */
export function KPIRow({ children, className }: LayoutProps) {
  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 shrink-0', className)}>
      {children}
    </div>
  )
}

/**
 * Row 2 & Row 3 — stack on mobile/tablet, side-by-side on desktop.
 */
export function CameraEventRow({ children, className }: LayoutProps) {
  return (
    <div className={cn(
      'grid grid-cols-1 lg:grid-cols-[58fr_42fr] lg:grid-rows-[1fr] gap-3 flex-[2] min-h-0',
      className,
    )}>
      {children}
    </div>
  )
}

export function PlaybackRow({ children, className }: LayoutProps) {
  return (
    <div className={cn(
      'grid grid-cols-1 lg:grid-cols-[58fr_42fr] lg:grid-rows-[1fr] gap-3 flex-1 min-h-[200px] lg:min-h-0',
      className,
    )}>
      {children}
    </div>
  )
}

/* ── Panel ──────────────────────────────────────────────────────────── */
interface PanelProps {
  title: string
  children: React.ReactNode
  className?: string
  headerRight?: React.ReactNode
  /** Skip default p-3 on the body area */
  noPadding?: boolean
  /**
   * fit=true → panel auto-sizes to content height (use inside shrink-0 row).
   * fit=false (default) → panel is h-full, fills its grid cell.
   */
  fit?: boolean
  /** Show Maximize2 icon that opens the panel in a full-screen portal */
  expandable?: boolean
  /** Nội dung riêng khi phóng to — mặc định dùng children */
  expandedContent?: React.ReactNode
}

export function Panel({
  title, children, className, headerRight, noPadding, fit = false, expandable = false,
  expandedContent,
}: PanelProps) {
  const [expanded, setExpanded] = useState(false)

  /* Close on Escape */
  useEffect(() => {
    if (!expanded) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [expanded])

  const headerContent = (onToggle: () => void, isExpanded: boolean) => (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1e2433] shrink-0">
      <h2 className="text-xs font-bold text-foreground uppercase tracking-wide">{title}</h2>
      <div className="flex items-center gap-2">
        {headerRight}
        {expandable && (
          <button
            onClick={onToggle}
            className="p-1 rounded hover:bg-[#1a2235] text-muted-foreground hover:text-foreground transition-colors"
            title={isExpanded ? 'Thu nhỏ' : 'Phóng to'}
          >
            {isExpanded
              ? <Minimize2 className="w-3.5 h-3.5" />
              : <Maximize2 className="w-3.5 h-3.5" />
            }
          </button>
        )}
      </div>
    </div>
  )

  const bodyClass = cn(
    'flex flex-col overflow-hidden',
    fit ? '' : 'flex-1 min-h-0',
    !noPadding && 'p-3',
  )

  /* ── Normal panel ── */
  const normalPanel = (
    <div className={cn(
      'bg-[#0d1117] border border-[#1e2433] rounded-lg flex flex-col overflow-hidden',
      fit ? '' : 'h-full',
      className,
    )}>
      {headerContent(() => setExpanded(true), false)}
      <div className={bodyClass}>{children}</div>
    </div>
  )

  if (!expanded) return normalPanel

  /* ── Expanded: placeholder in layout + portal fullscreen ── */
  return (
    <>
      {/* Keep the layout slot occupied */}
      <div className={cn(
        'bg-[#0d1117]/40 border border-[#1e2433]/40 rounded-lg',
        fit ? '' : 'h-full',
        className,
      )} />

      {createPortal(
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setExpanded(false)}
          />
          {/* Expanded panel */}
          <div className="absolute inset-4 bg-[#0d1117] border border-[#1e2433] rounded-xl flex flex-col overflow-hidden shadow-2xl">
            {headerContent(() => setExpanded(false), true)}
            <div className={cn(
              'flex-1 min-h-0 flex flex-col overflow-hidden',
              !noPadding && 'p-3',
            )}>
              {expandedContent ?? children}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

/* ── Legacy aliases ── */
export function Tier1({ children, className }: LayoutProps) {
  return <KPIRow className={className}>{children}</KPIRow>
}
export function Tier2({ children, className }: LayoutProps) {
  return <CameraEventRow className={className}>{children}</CameraEventRow>
}
export function Tier3({ children, className }: LayoutProps) {
  return <PlaybackRow className={className}>{children}</PlaybackRow>
}
