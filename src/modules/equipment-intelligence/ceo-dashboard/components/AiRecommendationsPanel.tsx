import { useState } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, AlertTriangle, Info, ChevronRight, Sparkles } from 'lucide-react'
import { Panel } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import type { AiRecommendationRow, AiSeverity } from '../types'

const SEV: Record<AiSeverity, { Icon: typeof AlertCircle; cls: string; bg: string; border: string; label: string }> = {
  critical: { Icon: AlertCircle,   cls: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/25',    label: 'Nghiêm trọng' },
  high:     { Icon: AlertTriangle, cls: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/25', label: 'Cao' },
  medium:   { Icon: AlertTriangle, cls: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/25',  label: 'Trung bình' },
  info:     { Icon: Info,          cls: 'text-sky-400',    bg: 'bg-sky-500/10',    border: 'border-sky-500/25',    label: 'Thông tin' },
}

function riskColor(score: number): string {
  if (score >= 75) return 'text-red-400'
  if (score >= 60) return 'text-amber-400'
  return 'text-muted-foreground'
}

interface AiRecommendationsPanelProps {
  items: AiRecommendationRow[]
  onSelect: (item: AiRecommendationRow) => void
}

const PAGE_SIZE = 6

export function AiRecommendationsPanel({ items, onSelect }: AiRecommendationsPanelProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const displayed = items.slice(0, visibleCount)
  const hasMore = visibleCount < items.length

  return (
    <Panel
      title="Khuyến nghị AI"
      noPadding
      expandable
      className="h-full min-h-0"
    >
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center gap-2 px-3 py-2 bg-[#0b0f1a] border-b border-[#1e2433] shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider flex-1">
            Phân tích & đề xuất
          </span>
          <span className="text-[9px] text-muted-foreground tabular-nums">{items.length} mục</span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {displayed.map((item, i) => {
            const { Icon, cls, bg, border } = SEV[item.severity]
            return (
              <motion.button
                key={item.id}
                type="button"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                onClick={() => onSelect(item)}
                className="w-full flex items-start gap-3 px-3 py-3 text-left border-b border-[#1e2433]/60 hover:bg-[#1a2235]/50 transition-colors group"
              >
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border',
                  bg, border,
                )}>
                  <Icon className={cn('w-4 h-4', cls)} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-bold text-primary">{item.machineCode}</span>
                    <span className={cn(
                      'text-[8px] font-semibold px-1.5 py-0.5 rounded border',
                      bg, border, cls,
                    )}>
                      {SEV[item.severity].label}
                    </span>
                  </div>
                  <p className="text-[10px] font-medium text-foreground leading-snug line-clamp-1">
                    {item.recommendation}
                  </p>
                  {item.detail && (
                    <p className="text-[9px] text-muted-foreground leading-snug mt-0.5 line-clamp-1">
                      {item.detail}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0 pt-0.5">
                  <span className={cn('text-[13px] font-bold tabular-nums', riskColor(item.riskScorePct))}>
                    {item.riskScorePct}%
                  </span>
                  <span className="text-[8px] text-muted-foreground">Rủi ro</span>
                </div>

                <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0 mt-1" />
              </motion.button>
            )
          })}
        </div>

        <div className="px-3 pt-2 pb-2.5 border-t border-[#1e2433] shrink-0 bg-[#0b0f1a]/50 flex flex-col gap-2">
          {hasMore && (
            <button
              type="button"
              onClick={() => setVisibleCount(c => Math.min(c + PAGE_SIZE, items.length))}
              className="w-full py-1.5 text-[10px] font-semibold text-primary/70 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors border border-dashed border-primary/20 hover:border-primary/40"
            >
              Xem thêm ({items.length - visibleCount} còn lại)
            </button>
          )}
          {!hasMore && items.length > PAGE_SIZE && (
            <button
              type="button"
              onClick={() => setVisibleCount(PAGE_SIZE)}
              className="w-full py-1.5 text-[10px] font-semibold text-muted-foreground/50 hover:text-muted-foreground hover:bg-[#1a2030] rounded-lg transition-colors"
            >
              Thu gọn
            </button>
          )}
          <p className="text-[10px] text-muted-foreground">
            Hiển thị {displayed.length} / {items.length} đề xuất
          </p>
        </div>
      </div>
    </Panel>
  )
}
