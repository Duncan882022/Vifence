import { useState } from 'react'
import { ChevronRight, Cpu, Package, Mountain, Users, Cloud } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Panel } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import { AiAlertDrawer } from './AiAlertDrawer'
import type { AiAlert, AiSeverity, AiRiskType } from '../types'

const SEV_CONFIG: Record<AiSeverity, { label: string; border: string; dot: string; badge: string }> = {
  critical: { label: 'Nghiêm trọng', border: 'border-l-red-500', dot: 'bg-red-400', badge: 'bg-red-500/15 text-red-400 ring-red-500/25' },
  high:     { label: 'Cao',          border: 'border-l-orange-500', dot: 'bg-orange-400', badge: 'bg-orange-500/15 text-orange-400 ring-orange-500/25' },
  medium:   { label: 'Trung bình',   border: 'border-l-yellow-500', dot: 'bg-yellow-400', badge: 'bg-yellow-500/15 text-yellow-400 ring-yellow-500/25' },
}

const RISK_TYPE_CONFIG: Record<AiRiskType, { label: string; icon: React.ReactNode }> = {
  'machine-breakdown': { label: 'Máy hỏng',       icon: <Cpu className="w-2.5 h-2.5" /> },
  'material-shortage': { label: 'Thiếu vật liệu',  icon: <Package className="w-2.5 h-2.5" /> },
  'geology':           { label: 'Địa chất',         icon: <Mountain className="w-2.5 h-2.5" /> },
  'labor':             { label: 'Nhân công',         icon: <Users className="w-2.5 h-2.5" /> },
  'weather':           { label: 'Thời tiết',         icon: <Cloud className="w-2.5 h-2.5" /> },
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

  function openAlert(alert: AiAlert) {
    setSelected(alert)
    setDrawerOpen(true)
  }

  return (
    <>
      <Panel title="Top 10 nguy cơ sự cố" className="h-full min-h-0" noPadding
        headerRight={undefined}
      >
        <div className="flex flex-col h-full min-h-0 overflow-y-auto divide-y divide-[#1e2433]/50">
          {sorted.map((alert, index) => {
            const cfg = SEV_CONFIG[alert.severity]
            const riskCfg = RISK_TYPE_CONFIG[alert.riskType]
            return (
              <button
                key={alert.id}
                type="button"
                onClick={() => openAlert(alert)}
                className={cn(
                  'w-full flex items-start gap-2.5 px-3 py-3 border-l-[3px] text-left',
                  'hover:bg-[#1a2235]/60 transition-colors',
                  cfg.border,
                  !alert.read && 'bg-[#0d1117]',
                )}
              >
                <div className="shrink-0 flex flex-col items-center gap-1 pt-0.5">
                  <span className="text-[8px] font-black text-muted-foreground/40 tabular-nums w-4 text-center">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className={cn('inline-block w-1.5 h-1.5 rounded-full', cfg.dot)} />
                </div>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={cn('inline-flex px-1.5 py-0.5 rounded-full text-[8px] font-bold ring-1', cfg.badge)}>
                      {cfg.label}
                    </span>
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-medium bg-[#1e2433] text-muted-foreground/70">
                      {riskCfg.icon}
                      {riskCfg.label}
                    </span>
                    {!alert.read && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    )}
                  </div>
                  <p className="text-[10px] font-semibold text-foreground/90 leading-snug line-clamp-2">{alert.title}</p>
                  <div className="flex items-center gap-1">
                    <span className="text-[8px] font-semibold text-sky-400 truncate">{alert.subject}</span>
                    <span className="text-[8px] text-muted-foreground/30">·</span>
                    <span className="text-[8px] text-orange-400/80 font-medium truncate">{alert.impactForecast}</span>
                  </div>
                  <p className="text-[8px] text-muted-foreground/40">{timeAgo(alert.createdAt)}</p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0 mt-1" />
              </button>
            )
          })}
        </div>
      </Panel>

      <AiAlertDrawer alert={selected} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </>
  )
}
