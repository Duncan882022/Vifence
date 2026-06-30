import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/utils/cn'
import type { AiRecommendationRow } from '../types'

const TABS = ['Tổng quan', 'Rule Dictionary', 'Logic kích hoạt', 'Diễn giải', 'Khuyến nghị', 'Lịch sử'] as const

interface AiRecommendationDrawerProps {
  item: AiRecommendationRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AiRecommendationDrawer({ item, open, onOpenChange }: AiRecommendationDrawerProps) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Tổng quan')

  if (!item) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{item.machineCode}</SheetTitle>
          <p className="text-[11px] text-slate-400">{item.recommendation}</p>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-3 text-[11px]">
          <InfoBox label="Rule ID" value={item.ruleId} />
          <InfoBox label="Severity" value={item.severity.toUpperCase()} />
          <InfoBox label="Risk Score" value={`${item.riskScorePct}%`} highlight />
          <InfoBox label="Confidence" value={`${item.confidencePct}%`} />
        </div>

        <div className="flex gap-1 overflow-x-auto pb-1">
          {TABS.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'px-2.5 py-1.5 rounded-lg text-[9px] font-semibold whitespace-nowrap transition-colors',
                tab === t ? 'bg-sky-500/20 text-sky-300' : 'text-slate-500 hover:text-slate-300',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="space-y-3 text-[11px] text-slate-300">
          {tab === 'Tổng quan' && (
            <>
              <Block title="Time Window" content={item.timeWindow} />
              <Block title="Context" content={item.context} />
              <Block title="Abnormal Metrics" content={item.abnormalMetrics.join(' · ')} />
            </>
          )}
          {(tab === 'Rule Dictionary' || tab === 'Logic kích hoạt') && (
            <Block title="Rule Logic" content={item.ruleLogic} mono />
          )}
          {tab === 'Diễn giải' && <Block title="Explanation" content={item.explanation} />}
          {tab === 'Khuyến nghị' && (
            <ol className="list-decimal list-inside space-y-2 text-slate-300">
              {item.recommendationSteps.map((step, i) => <li key={i}>{step}</li>)}
            </ol>
          )}
          {tab === 'Lịch sử' && <p className="text-slate-500">Lịch sử kích hoạt rule — mock placeholder.</p>}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function InfoBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="p-3 rounded-xl border border-white/10 bg-white/[0.03]">
      <p className="text-[9px] uppercase text-slate-500 mb-0.5">{label}</p>
      <p className={cn('font-bold', highlight ? 'text-red-400' : 'text-white')}>{value}</p>
    </div>
  )
}

function Block({ title, content, mono }: { title: string; content: string; mono?: boolean }) {
  return (
    <div className="p-3 rounded-xl border border-white/10 bg-white/[0.03]">
      <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-1.5">{title}</p>
      <p className={cn('text-slate-300 leading-relaxed', mono && 'font-mono text-[10px]')}>{content}</p>
    </div>
  )
}
