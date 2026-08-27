import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useShellLayout } from '@/hooks/useShellLayout'

interface LayoutProps {
  children: React.ReactNode
  className?: string
  /** Cho phép scroll dọc trên desktop — dùng cho trang form/báo cáo */
  scrollable?: boolean
}

/** Root wrapper — fills viewport below the header */
export function PageLayout({ children, className, scrollable = false }: LayoutProps) {
  const { sidebarInset } = useShellLayout()

  return (
    <main
      className={cn('pt-header bg-[#060b14] transition-all duration-200', className)}
      style={{ paddingLeft: sidebarInset }}
    >
      <div
        className={cn(
          'flex flex-col gap-3 p-3 sm:p-4',
          scrollable
            ? 'min-h-[calc(100dvh-64px)] overflow-y-auto lg:min-h-[calc(100vh-64px)]'
            : 'h-[calc(100dvh-64px)] overflow-hidden',
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
  /** Tuỳ chọn cho phép nội dung tràn ra ngoài (ví dụ dropdown) */
  overflowVisible?: boolean
}

export function Panel({
  title, children, className, headerRight, noPadding, fit = false, expandable = false,
  expandedContent: _expandedContent, overflowVisible = false,
}: PanelProps) {
  void _expandedContent
  const [expanded, setExpanded] = useState(false)

  /* Close on Escape */
  useEffect(() => {
    if (!expanded) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [expanded])

  const showBody = Boolean(children)

  const headerContent = (onToggle: () => void, isExpanded: boolean) => (
    <div className={cn(
      'flex items-center justify-between gap-2 px-4 py-2.5 max-lg:px-2 max-lg:py-2 shrink-0 min-w-0',
      showBody && 'border-b border-[#1e2433]',
    )}>
      <h2 className="text-xs max-lg:text-[10px] font-bold text-foreground tracking-wide shrink-0">{title}</h2>
      <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-end overflow-x-auto scrollbar-none">
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
    'flex flex-col',
    !overflowVisible && 'overflow-hidden',
    fit ? '' : 'flex-1 min-h-0',
    !noPadding && 'p-3',
  )

  /* ── Normal panel ── */
  const normalPanel = (
    <>
      {expanded && createPortal(
        <div
          className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm"
          onClick={() => setExpanded(false)}
          aria-hidden
        />,
        document.body,
      )}
      <div className={cn(
        'bg-[#0d1117] border border-[#1e2433] rounded-lg flex flex-col',
        !overflowVisible && 'overflow-hidden',
        fit && !expanded ? '' : 'h-full',
        expanded && 'fixed inset-4 z-50 shadow-2xl',
        className,
      )}>
        {headerContent(() => setExpanded(v => !v), expanded)}
        {showBody && <div className={bodyClass}>{children}</div>}
      </div>
    </>
  )

  return normalPanel
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
