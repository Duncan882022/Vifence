import { useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Sparkles,
  Truck,
} from 'lucide-react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { cn } from '@/utils/cn'
import type { AiRecommendationRow } from '../types'
import {
  AI_SEV,
  aiRiskColor,
  buildMetricDetails,
  formatEngineHours,
  getMachineForRecommendation,
  getRegionName,
  severityLabel,
} from '../utils/aiRecommendationUi'

const TABS = [
  'Tổng quan',
  'Rule Dictionary',
  'Logic kích hoạt',
  'Diễn giải',
  'Khuyến nghị',
  'Lịch sử',
] as const

type TabId = (typeof TABS)[number]

interface AiRecommendationDrawerProps {
  item: AiRecommendationRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AiRecommendationDrawer({ item, open, onOpenChange }: AiRecommendationDrawerProps) {
  const [tab, setTab] = useState<TabId>('Tổng quan')

  if (!item) return null

  const machine = getMachineForRecommendation(item.machineCode)
  const metrics = buildMetricDetails(item)
  const { cls } = AI_SEV[item.severity]

  const statusBadgeCls = machine?.status === 'Working'
    ? 'bg-green-500/15 text-green-400 border-green-500/30'
    : machine?.status === 'Breakdown'
      ? 'bg-red-500/15 text-red-400 border-red-500/30'
      : 'bg-amber-500/15 text-amber-400 border-amber-500/30'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="center"
        className="overflow-hidden bg-[#0d1117] border border-[#1e2433] p-0 gap-0 shadow-2xl shadow-black/60"
      >
        <div className="flex flex-col max-h-[min(92vh,900px)]">
          {/* Header */}
          <div className="shrink-0 px-5 pt-5 pb-4 border-b border-[#1e2433]">
            <div className="flex items-center gap-2 mb-4 pr-8">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">
                CHI TIẾT AI RECOMMENDATION
              </h2>
            </div>

            <div className="flex gap-4">
              <div className="w-[88px] h-[88px] rounded-lg border border-[#1e2433] bg-gradient-to-br from-[#1a2a4a] to-[#0b0f1a] shrink-0 overflow-hidden flex items-center justify-center">
                <Truck className="w-10 h-10 text-primary/40" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-xl font-bold text-foreground">{item.machineCode}</span>
                  {machine && (
                    <span className={cn(
                      'text-[9px] font-semibold px-2 py-0.5 rounded border uppercase',
                      statusBadgeCls,
                    )}>
                      {machine.status}
                    </span>
                  )}
                </div>
                {machine && (
                  <p className="text-[12px] text-muted-foreground mb-1.5">{machine.equipmentType}</p>
                )}
                <p className="text-[13px] font-semibold text-foreground">
                  {item.ruleId} - {item.recommendation}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-4">
              <KpiBox label="Risk Score" value={`${item.riskScorePct}%`} valueClass={aiRiskColor(item.riskScorePct)} />
              <KpiBox label="Confidence" value={`${item.confidencePct}%`} valueClass="text-green-400" />
              <KpiBox
                label="Severity"
                value={severityLabel(item.severity)}
                valueClass={cls}
              />
            </div>
          </div>

          {/* Tabs */}
          <div className="shrink-0 flex gap-0 overflow-x-auto border-b border-[#1e2433] px-5">
            {TABS.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  'px-3 py-2.5 text-[10px] font-semibold whitespace-nowrap border-b-2 transition-colors -mb-px',
                  tab === t
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
            {tab === 'Tổng quan' && (
              <div className="space-y-4">
                <Section title="THÔNG TIN TỔNG QUAN">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                    <InfoRow label="Máy" value={item.machineCode} />
                    <InfoRow
                      label="Health Score"
                      value={machine ? `${machine.healthScore} / 100` : '—'}
                      valueClass={machine && machine.healthScore < 50 ? 'text-red-400' : undefined}
                    />
                    <InfoRow label="Dự án / Vị trí" value={machine?.projectLocation ?? item.context.split('·')[0]?.trim() ?? '—'} />
                    <InfoRow label="Giờ máy" value={machine ? formatEngineHours(machine.engineHours) : '—'} />
                    <InfoRow label="Khu vực" value={machine ? getRegionName(machine.regionId) : '—'} />
                    <InfoRow label="Năm sản xuất" value={String(item.manufactureYear ?? '—')} />
                    <InfoRow label="Trạng thái" value={machine?.status ?? '—'} />
                    <InfoRow
                      label="Kết nối"
                      value={(
                        <span className={cn(
                          'text-[9px] font-semibold px-2 py-0.5 rounded border uppercase',
                          (item.connectionStatus ?? 'Online') === 'Online'
                            ? 'bg-green-500/15 text-green-400 border-green-500/30'
                            : 'bg-red-500/15 text-red-400 border-red-500/30',
                        )}>
                          {item.connectionStatus ?? 'Online'}
                        </span>
                      )}
                    />
                  </div>
                </Section>

                <Section title="THÔNG TIN CẢNH BÁO">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                    <InfoRow label="Rule ID" value={item.ruleId} />
                    <InfoRow label="First Occurrence" value={item.firstOccurrence ?? '—'} />
                    <InfoRow label="Type" value={item.ruleType ?? 'COMBINE_METRIC'} />
                    <InfoRow label="Last Occurrence" value={item.lastOccurrence ?? '—'} />
                    <InfoRow
                      label="Severity"
                      value={severityLabel(item.severity)}
                      valueClass={cls}
                    />
                    <InfoRow label="Số lần xảy ra" value={String(item.occurrenceCount ?? '—')} />
                  </div>
                </Section>

                <Section title="METRIC BẤT THƯỜNG">
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b border-[#1e2433] text-muted-foreground">
                          <th className="text-left py-2 pr-3 font-semibold">Metric</th>
                          <th className="text-left py-2 pr-3 font-semibold">Giá trị hiện tại</th>
                          <th className="text-left py-2 pr-3 font-semibold">Ngưỡng</th>
                          <th className="text-left py-2 font-semibold">Độ lệch</th>
                        </tr>
                      </thead>
                      <tbody>
                        {metrics.map(row => (
                          <tr key={row.metric} className="border-b border-[#1e2433]/60">
                            <td className="py-2.5 pr-3 text-foreground font-medium">{row.metric}</td>
                            <td className="py-2.5 pr-3 text-foreground tabular-nums">{row.current}</td>
                            <td className="py-2.5 pr-3 text-muted-foreground tabular-nums">{row.threshold}</td>
                            <td className="py-2.5">
                              <span className={cn(
                                'inline-flex items-center gap-1 font-semibold tabular-nums',
                                row.direction === 'up' ? 'text-red-400' : 'text-red-400',
                              )}>
                                {row.deviation}
                                {row.direction === 'up'
                                  ? <ArrowUp className="w-3 h-3" />
                                  : <ArrowDown className="w-3 h-3" />}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Section>
              </div>
            )}

            {(tab === 'Rule Dictionary' || tab === 'Logic kích hoạt') && (
              <Section title={tab === 'Rule Dictionary' ? 'RULE DICTIONARY' : 'LOGIC KÍCH HOẠT'}>
                <p className="text-[11px] text-foreground font-mono leading-relaxed">{item.ruleLogic}</p>
                <p className="text-[10px] text-muted-foreground mt-3">
                  Time window: {item.timeWindow}
                </p>
              </Section>
            )}

            {tab === 'Diễn giải' && (
              <Section title="DIỄN GIẢI">
                <p className="text-[11px] text-foreground leading-relaxed">{item.explanation}</p>
                <p className="text-[10px] text-muted-foreground mt-3">{item.context}</p>
              </Section>
            )}

            {tab === 'Khuyến nghị' && (
              <Section title="KHUYẾN NGHỊ">
                <p className="text-[10px] uppercase tracking-wider text-primary font-bold mb-3 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Các bước khuyến nghị
                </p>
                <ol className="list-decimal list-inside space-y-2 text-[11px] text-foreground">
                  {item.recommendationSteps.map((step, i) => (
                    <li key={i} className="leading-relaxed">{step}</li>
                  ))}
                </ol>
              </Section>
            )}

            {tab === 'Lịch sử' && (
              <Section title="LỊCH SỬ KÍCH HOẠT">
                <p className="text-[11px] text-muted-foreground">
                  Rule {item.ruleId} đã kích hoạt {item.occurrenceCount ?? 0} lần trong {item.timeWindow}.
                </p>
                {item.firstOccurrence && item.lastOccurrence && (
                  <div className="mt-3 space-y-2 text-[11px]">
                    <InfoRow label="Lần đầu" value={item.firstOccurrence} />
                    <InfoRow label="Lần cuối" value={item.lastOccurrence} />
                  </div>
                )}
              </Section>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 flex items-center gap-3 px-5 py-4 border-t border-[#1e2433] bg-[#0b0f1a]/80">
            <button
              type="button"
              onClick={() => setTab('Lịch sử')}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-[#1e2433] text-[11px] font-semibold text-foreground hover:bg-[#1a2235] transition-colors"
            >
              Xem lịch sử chi tiết
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="flex-1 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-[11px] font-bold text-white transition-colors"
            >
              Tạo yêu cầu bảo dưỡng
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function KpiBox({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-[#1e2433] bg-[#0b0f1a] px-4 py-3 text-center">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className={cn('text-xl font-bold tabular-nums', valueClass ?? 'text-foreground')}>{value}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[#1e2433] bg-[#0b0f1a]/60 p-4">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">{title}</p>
      {children}
    </div>
  )
}

function InfoRow({
  label,
  value,
  valueClass,
}: {
  label: string
  value: ReactNode
  valueClass?: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className={cn('text-[11px] font-medium text-foreground', valueClass)}>{value}</span>
    </div>
  )
}
