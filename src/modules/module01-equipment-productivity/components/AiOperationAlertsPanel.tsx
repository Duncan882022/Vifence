import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Panel } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import { AiAlertDrawer } from './AiAlertDrawer'
import type { AiAlert, AiSeverity } from '../types'

const SEV_CONFIG: Record<AiSeverity, { color: string; ariaLabel: string }> = {
  critical: { color: '#f87171', ariaLabel: 'Nghiêm trọng' },
  high: { color: '#fb923c', ariaLabel: 'Cao' },
  medium: { color: '#fbbf24', ariaLabel: 'Trung bình' },
}

const SEV_ORDER: Record<AiSeverity, number> = { critical: 0, high: 1, medium: 2 }

interface Props {
  alerts: AiAlert[]
}

function timeAgo(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: vi })
  } catch {
    return ''
  }
}

export function AiOperationAlertsPanel({ alerts }: Props) {
  const [selected, setSelected] = useState<AiAlert | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const sorted = [...alerts].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])
  const unread = sorted.filter(a => !a.read).length

  function openAlert(alert: AiAlert) {
    setSelected(alert)
    setDrawerOpen(true)
  }

  return (
    <>
      <Panel
        title="Top 10 nguy cơ"
        className="h-full min-h-0"
        noPadding
        headerRight={unread > 0 ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-primary/12 text-primary ring-1 ring-primary/25">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            {unread} mới
          </span>
        ) : undefined}
      >
        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto px-2 pb-2 pt-1 space-y-1">
          {sorted.map((alert, idx) => {
            const cfg = SEV_CONFIG[alert.severity]

            return (
              <motion.button
                key={alert.id}
                type="button"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.035, duration: 0.25 }}
                onClick={() => openAlert(alert)}
                aria-label={`${cfg.ariaLabel}: ${alert.title}`}
                className={cn(
                  'w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl border text-left transition-all',
                  'bg-[#060b14] border-[#1e2433] hover:bg-[#0c121c] hover:border-[#2a3855]',
                  !alert.read && 'ring-1 ring-primary/15',
                )}
              >
                <span
                  className="text-[10px] font-black tabular-nums w-5 shrink-0 text-center"
                  style={{ color: cfg.color }}
                >
                  {String(idx + 1).padStart(2, '0')}
                </span>

                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-foreground/95 leading-snug line-clamp-2 flex items-start gap-1.5">
                    {!alert.read && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1" aria-hidden />}
                    <span>{alert.title}</span>
                  </p>
                  <p className="text-[9px] text-muted-foreground/50 mt-1 truncate">
                    {alert.subject} · {timeAgo(alert.createdAt)}
                  </p>
                </div>

                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/35 shrink-0 group-hover:text-muted-foreground/60" />
              </motion.button>
            )
          })}
        </div>
      </Panel>

      <AiAlertDrawer alert={selected} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </>
  )
}
