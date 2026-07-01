import { Sparkles, AlertTriangle, TrendingUp, DollarSign, CheckCircle2 } from 'lucide-react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { cn } from '@/utils/cn'
import type { AiInsight, AiSeverity } from '../types'

const SEV_CONFIG: Record<AiSeverity, { label: string; cls: string; dot: string }> = {
  Critical: { label: 'Nghiêm trọng', cls: 'bg-red-500/15 text-red-400 border-red-500/30',    dot: 'bg-red-400' },
  High:     { label: 'Cao',          cls: 'bg-orange-500/15 text-orange-400 border-orange-500/30', dot: 'bg-orange-400' },
  Medium:   { label: 'Trung bình',   cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', dot: 'bg-yellow-400' },
}

interface Props {
  insight: AiInsight | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#1e2433] bg-[#0b0f1a]/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{title}</p>
      </div>
      {children}
    </div>
  )
}

export function AiInsightDrawer({ insight, open, onOpenChange }: Props) {
  if (!insight) return null

  const sev = SEV_CONFIG[insight.severity]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="center"
        className="overflow-hidden bg-[#0d1117] border border-[#1e2433] p-0 gap-0 shadow-2xl shadow-black/60"
      >
        <div className="flex flex-col max-h-[min(92vh,900px)]">

          {/* Header */}
          <div className="shrink-0 px-5 pt-5 pb-4 border-b border-[#1e2433]">
            <div className="flex items-center gap-2.5 mb-3 pr-8">
              <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center border shrink-0', sev.cls)}>
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold border', sev.cls)}>
                  {sev.label}
                </span>
                <p className="text-[9px] text-muted-foreground/60 mt-0.5">{insight.machineOrProject}</p>
              </div>
            </div>
            <h2 className="text-[15px] font-bold text-foreground leading-snug">{insight.title}</h2>
            <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">{insight.shortDesc}</p>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">

            {/* Reasoning */}
            <Section title="Tại sao AI phát hiện" icon={<Sparkles className="w-3.5 h-3.5" />}>
              <p className="text-[11px] text-foreground/90 leading-relaxed">{insight.reasoning}</p>
            </Section>

            {/* Comparison data */}
            <Section title="Dữ liệu so sánh" icon={<TrendingUp className="w-3.5 h-3.5" />}>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-[#1e2433] text-muted-foreground/70">
                      <th className="text-left py-1.5 pr-3 font-semibold">Chỉ số</th>
                      <th className="text-left py-1.5 pr-3 font-semibold">Hiện tại</th>
                      <th className="text-left py-1.5 font-semibold">Chuẩn / Mục tiêu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insight.comparisonData.map((row, i) => (
                      <tr key={i} className="border-b border-[#1e2433]/50">
                        <td className="py-2 pr-3 text-foreground/80">{row.label}</td>
                        <td className="py-2 pr-3 font-semibold text-orange-400 tabular-nums">{row.current}</td>
                        <td className="py-2 text-green-400/80 tabular-nums">{row.benchmark}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            {/* Recommendations */}
            <Section title="Khuyến nghị" icon={<CheckCircle2 className="w-3.5 h-3.5" />}>
              <ol className="space-y-2">
                {insight.recommendations.map((step, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[11px] text-foreground/90 leading-relaxed">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-[9px] font-black flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </Section>

            {/* Expected benefit + cost saving */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-1">
                <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-400/70">Lợi ích kỳ vọng</p>
                <p className="text-[11px] text-foreground/90 leading-relaxed">{insight.expectedBenefit}</p>
              </div>
              <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  <DollarSign className="w-3 h-3 text-yellow-400" />
                  <p className="text-[9px] font-bold uppercase tracking-wider text-yellow-400/70">Tiết kiệm chi phí</p>
                </div>
                <p className="text-[13px] font-black text-yellow-400 tabular-nums">{insight.costSavingEstimate}</p>
              </div>
            </div>

          </div>

          {/* Footer */}
          <div className="shrink-0 flex gap-3 px-5 py-4 border-t border-[#1e2433] bg-[#0b0f1a]/80">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 py-2.5 rounded-lg border border-[#1e2433] text-[11px] font-semibold text-foreground hover:bg-[#1a2235] transition-colors"
            >
              Đóng
            </button>
            <button
              type="button"
              className="flex-1 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-[11px] font-bold text-primary-foreground transition-colors"
            >
              Tạo yêu cầu xử lý
            </button>
          </div>

        </div>
      </SheetContent>
    </Sheet>
  )
}
