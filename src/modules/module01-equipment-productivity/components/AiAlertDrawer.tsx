import { AlertTriangle, CheckCircle2, Sparkles, TrendingUp } from 'lucide-react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { cn } from '@/utils/cn'
import type { AiAlert, AiSeverity } from '../types'

const SEV_CONFIG: Record<AiSeverity, { label: string; cls: string; dot: string }> = {
  critical: { label: 'Nghiêm trọng', cls: 'bg-red-500/15 text-red-400 border-red-500/30', dot: 'bg-red-400' },
  high:     { label: 'Cao',          cls: 'bg-orange-500/15 text-orange-400 border-orange-500/30', dot: 'bg-orange-400' },
  medium:   { label: 'Trung bình',   cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', dot: 'bg-yellow-400' },
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

interface Props {
  alert: AiAlert | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AiAlertDrawer({ alert, open, onOpenChange }: Props) {
  if (!alert) return null
  const sev = SEV_CONFIG[alert.severity]

  return (
    <>
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
                  <p className="text-[9px] text-muted-foreground/60 mt-0.5">{alert.subject}</p>
                </div>
              </div>
              <h2 className="text-[15px] font-bold text-foreground leading-snug">{alert.title}</h2>
              <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">{alert.summary}</p>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
              <Section title="Phân tích AI" icon={<Sparkles className="w-3.5 h-3.5" />}>
                <p className="text-[11px] text-foreground/90 leading-relaxed">{alert.reasoning}</p>
              </Section>

              <Section title="Bằng chứng dữ liệu" icon={<TrendingUp className="w-3.5 h-3.5" />}>
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="border-b border-[#1e2433] text-muted-foreground/70">
                        <th className="text-left py-1.5 pr-3 font-semibold">Chỉ số</th>
                        <th className="text-left py-1.5 pr-3 font-semibold">Thực tế</th>
                        <th className="text-left py-1.5 font-semibold">Kỳ vọng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alert.evidence.map((row, i) => (
                        <tr key={i} className="border-b border-[#1e2433]/50">
                          <td className="py-2 pr-3 text-foreground/80">{row.label}</td>
                          <td className="py-2 pr-3 font-semibold text-orange-400 tabular-nums">{row.actual}</td>
                          <td className="py-2 text-green-400/80 tabular-nums">{row.expected}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>

              <Section title="Khuyến nghị" icon={<CheckCircle2 className="w-3.5 h-3.5" />}>
                <ol className="space-y-2">
                  {alert.recommendations.map((step, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-[11px] text-foreground/90 leading-relaxed">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-[9px] font-black flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </Section>

            </div>

          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
