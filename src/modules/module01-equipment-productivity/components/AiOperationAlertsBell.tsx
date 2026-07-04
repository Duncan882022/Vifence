import { useState, useRef, useEffect } from 'react'
import { Bell, ChevronRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import { cn } from '@/utils/cn'
import { AiAlertDrawer } from './AiAlertDrawer'
import { AI_ALERTS } from '../data/mockProductivity'
import type { AiAlert, AiSeverity } from '../types'

const SEV_DOT: Record<AiSeverity, string> = {
  critical: 'bg-red-400',
  high:     'bg-orange-400',
  medium:   'bg-yellow-400',
}

const SEV_LABEL: Record<AiSeverity, string> = {
  critical: 'Nghiêm trọng',
  high:     'Cao',
  medium:   'Trung bình',
}

const SEV_ORDER: Record<AiSeverity, number> = { critical: 0, high: 1, medium: 2 }

function timeAgo(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: vi })
  } catch {
    return ''
  }
}

export function AiOperationAlertsBell() {
  const [open, setOpen] = useState(false)
  const [selectedAlert, setSelectedAlert] = useState<AiAlert | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const unread = AI_ALERTS.filter(a => !a.read).length
  const top5 = [...AI_ALERTS]
    .sort((a, b) => {
      if (a.read !== b.read) return a.read ? 1 : -1
      return SEV_ORDER[a.severity] - SEV_ORDER[b.severity]
    })
    .slice(0, 5)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  function openAlert(alert: AiAlert) {
    setOpen(false)
    setSelectedAlert(alert)
    setDrawerOpen(true)
  }

  return (
    <>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-label="Cảnh báo AI"
          className="relative flex items-center justify-center w-10 h-10 rounded-lg hover:bg-[#1a2235] transition-colors shrink-0"
        >
          <Bell className="w-[18px] h-[18px] text-muted-foreground" />
          {unread > 0 && (
            <span className={cn(
              'absolute top-1.5 right-1.5 min-w-[16px] h-4 rounded-full text-[9px] font-bold leading-none flex items-center justify-center px-1',
              'bg-red-500 text-white ring-2 ring-[#0d1117]',
            )}>
              {unread}
            </span>
          )}
        </button>

        {open && (
          <div className={cn(
            'absolute right-0 top-full mt-2 w-[340px] z-50',
            'bg-[#0d1117] border border-[#1e2433] rounded-xl shadow-2xl shadow-black/60 overflow-hidden',
          )}>
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#1e2433]">
              <p className="text-[11px] font-bold text-foreground">Cảnh báo AI</p>
              <span className="text-[8px] text-muted-foreground/60">{unread} chưa đọc</span>
            </div>

            <div className="divide-y divide-[#1e2433]/50">
              {top5.map(alert => (
                <button
                  key={alert.id}
                  type="button"
                  onClick={() => openAlert(alert)}
                  className="w-full flex items-start gap-2 px-3 py-2.5 hover:bg-[#1a2235]/60 transition-colors text-left"
                >
                  <span className={cn('w-1.5 h-1.5 rounded-full shrink-0 mt-1.5', SEV_DOT[alert.severity])} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-[8px] font-bold text-muted-foreground/70">{SEV_LABEL[alert.severity]}</span>
                      {' · '}
                      <span className="text-[8px] text-sky-400">{alert.subject}</span>
                      {!alert.read && <span className="w-1 h-1 rounded-full bg-primary shrink-0" />}
                    </div>
                    <p className="text-[10px] font-semibold text-foreground/90 leading-snug truncate">{alert.title}</p>
                    <p className="text-[8px] text-muted-foreground/50 leading-tight line-clamp-1">{alert.summary}</p>
                    <p className="text-[8px] text-muted-foreground/40">{timeAgo(alert.createdAt)}</p>
                  </div>
                  <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0 mt-1" />
                </button>
              ))}
            </div>

            <div className="border-t border-[#1e2433] px-3 py-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[10px] text-primary hover:text-primary/80 font-semibold transition-colors"
              >
                Xem tất cả cảnh báo →
              </button>
            </div>
          </div>
        )}
      </div>

      <AiAlertDrawer alert={selectedAlert} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </>
  )
}
