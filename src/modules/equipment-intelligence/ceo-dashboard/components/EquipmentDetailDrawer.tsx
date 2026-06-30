import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { BarChart3, ExternalLink, History, Wrench } from 'lucide-react'
import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { TrialLockPopup } from '@/components/common/TrialLock/TrialLockPopup'
import { useTrialLock } from '@/hooks/useTrialLock'
import { cn } from '@/utils/cn'
import type { EquipmentStatus, MmtbRow } from '../types'
import {
  aiSeverityLabel,
  RELIABILITY_SPARKLINE,
  resolveEquipmentDetail,
} from '../utils/equipmentDetailUi'

const TABS = ['Tổng quan', 'Vận hành', 'Bảo dưỡng', 'Sự cố', 'Cảnh báo'] as const
type TabId = (typeof TABS)[number]

const STATUS_BADGE: Record<EquipmentStatus, string> = {
  Working: 'bg-green-500/15 text-green-400 ring-1 ring-green-500/25',
  Standby: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/25',
  Breakdown: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/25',
  Stored: 'bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/25',
}

interface EquipmentDetailDrawerProps {
  machine: MmtbRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EquipmentDetailDrawer({ machine, open, onOpenChange }: EquipmentDetailDrawerProps) {
  const [tab, setTab] = useState<TabId>('Tổng quan')
  const { visible: trialVisible, show: showTrial, dismiss: dismissTrial } = useTrialLock()

  const detail = useMemo(
    () => (machine ? resolveEquipmentDetail(machine) : null),
    [machine],
  )

  if (!machine || !detail) return null

  const ai = detail.aiRecommendation
  const pmDueLabel = detail.pmDaysUntilDue < 0
    ? `Quá hạn ${Math.abs(detail.pmDaysUntilDue)} ngày`
    : detail.pmDaysUntilDue === 0
      ? 'Đến hạn hôm nay'
      : `Còn ${detail.pmDaysUntilDue} ngày đến hạn`

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="center"
          className="overflow-hidden bg-[#0d1117] border border-[#1e2433] p-0 gap-0 w-[min(960px,calc(100vw-1.5rem))] max-h-[min(92vh,880px)]"
        >
          <div className="flex flex-col h-full max-h-[min(92vh,880px)] overflow-hidden">
            {/* Header */}
            <SheetHeader className="px-5 pt-5 pb-4 border-b border-[#1e2433] shrink-0 space-y-0">
              <SheetTitle className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Chi tiết thiết bị
              </SheetTitle>

              <div className="flex items-start gap-4 mt-3 pr-6">
                <div className="w-[72px] h-[72px] rounded-lg overflow-hidden shrink-0 bg-gradient-to-br from-sky-900/80 to-[#0b1628] ring-1 ring-[#2a3855] flex items-center justify-center">
                  {machine.imageUrl ? (
                    <img src={machine.imageUrl} alt={machine.machineCode} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNzIiIGhlaWdodD0iNzIiIHZpZXdCb3g9IjAgMCA3MiA3MiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNzIiIGhlaWdodD0iNzIiIGZpbGw9IiMxYTI0MzUiLz48cGF0aCBkPSJNMTggNDBIMzZWMjRINDBWMjBIMzZWMThIMjBWMjRIMThWNDBaTTI4IDQ0SDQ0VjQ4SDI4VjQ0Wk0zMiAzMkgzNlYzNkgzMlYzMloiIGZpbGw9IiMzYjgyZjYiLz48L3N2Zz4=')] bg-cover bg-center" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold text-foreground">{machine.machineCode}</h2>
                    <span className={cn('inline-flex px-2.5 py-0.5 rounded-md text-[10px] font-bold', STATUS_BADGE[machine.status])}>
                      {machine.status}
                    </span>
                  </div>
                  <p className="text-[12px] text-foreground/90 mt-0.5">{machine.equipmentType}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{machine.projectLocation}</p>
                  <p className="text-[10px] text-muted-foreground">Khu vực: {detail.regionName}</p>
                </div>
              </div>
            </SheetHeader>

            {/* KPI row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-5 py-3 border-b border-[#1e2433] shrink-0 bg-[#0b0f1a]/50">
              <KpiBox label="Health Score">
                <div className="flex items-center gap-2">
                  <HealthGauge score={machine.healthScore} />
                  <span className={cn(
                    'text-lg font-bold tabular-nums',
                    machine.healthScore < 40 ? 'text-red-400' : machine.healthScore < 70 ? 'text-amber-400' : 'text-green-400',
                  )}>
                    {machine.healthScore}
                    <span className="text-[11px] text-muted-foreground font-normal"> /100</span>
                  </span>
                </div>
              </KpiBox>
              <KpiBox label="Utilization">
                <p className="text-lg font-bold tabular-nums text-green-400">{machine.utilizationPct}%</p>
              </KpiBox>
              <KpiBox label="Giờ máy">
                <p className="text-lg font-bold tabular-nums text-foreground">
                  {machine.engineHours.toLocaleString('vi-VN')}
                  <span className="text-[11px] text-muted-foreground font-normal"> h</span>
                </p>
              </KpiBox>
              <KpiBox label="Năm sản xuất">
                <p className="text-lg font-bold tabular-nums text-foreground">{detail.productionYear}</p>
              </KpiBox>
            </div>

            {/* Tabs */}
            <div className="flex gap-0 overflow-x-auto border-b border-[#1e2433] shrink-0 px-5">
              {TABS.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    'px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap border-b-2 transition-colors',
                    tab === t
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
              {tab === 'Tổng quan' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <InfoCard title="Thông tin cơ bản">
                    <InfoRow label="Mã máy" value={machine.machineCode} />
                    <InfoRow label="Loại thiết bị" value={machine.equipmentType} />
                    <InfoRow label="Số seri" value={detail.serialNumber} />
                    <InfoRow label="Dự án / Vị trí" value={machine.projectLocation} />
                    <InfoRow label="Ngày đưa vào sử dụng" value={detail.commissionDate} />
                    <InfoRow label="Bảo hành đến" value={detail.warrantyUntil} />
                  </InfoCard>

                  <InfoCard title="Chỉ số độ tin cậy">
                    <InfoRow label="MTBF" value={`${machine.mtbfHours} h`} />
                    <InfoRow label="MTTR" value={`${machine.mttrHours.toLocaleString('vi-VN')} h`} />
                    <InfoRow label="MTTF" value={`${machine.mttfHours.toLocaleString('vi-VN')} h`} />
                    <div className="mt-3 h-[72px] -mx-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={[...RELIABILITY_SPARKLINE]} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                          <YAxis domain={['dataMin - 5', 'dataMax + 5']} hide />
                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke="#ef4444"
                            strokeWidth={2}
                            dot={{ r: 2, fill: '#ef4444', strokeWidth: 0 }}
                            activeDot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                      <div className="flex justify-between text-[8px] text-muted-foreground px-1 -mt-1">
                        <span>01/06</span>
                        <span>30/06</span>
                      </div>
                    </div>
                  </InfoCard>

                  <InfoCard title="PM Status">
                    <p className={cn(
                      'text-[12px] font-bold mb-2',
                      detail.pmDaysUntilDue <= 0 ? 'text-red-400' : detail.pmDaysUntilDue <= 3 ? 'text-amber-400' : 'text-green-400',
                    )}>
                      {pmDueLabel}
                    </p>
                    <p className="text-[11px] text-muted-foreground mb-3">
                      Hạng mục PM tiếp theo: <span className="text-foreground font-medium">{detail.pmNextItem}</span>
                    </p>
                    <div className="h-2 rounded-full bg-[#1e2433] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400"
                        style={{ width: `${detail.pmProgressPct}%` }}
                      />
                    </div>
                    <p className="text-[9px] text-muted-foreground text-right mt-1 tabular-nums">{detail.pmProgressPct}%</p>
                  </InfoCard>

                  <InfoCard title="AI Risk">
                    {ai ? (
                      <div className="relative">
                        <p className="text-[13px] font-bold text-red-400 mb-1">{ai.ruleId}</p>
                        <p className="text-[11px] text-foreground leading-relaxed pr-8">{ai.recommendation}</p>
                        <p className="text-[11px] mt-2">
                          <span className="text-muted-foreground">Độ rủi ro: </span>
                          <span className={cn(
                            'font-bold',
                            ai.severity === 'critical' || ai.severity === 'high' ? 'text-red-400' : 'text-amber-400',
                          )}>
                            {aiSeverityLabel(ai.severity)}
                          </span>
                        </p>
                        <BarChart3 className="absolute bottom-0 right-0 w-4 h-4 text-red-400/60" />
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">Không có cảnh báo AI.</p>
                    )}
                  </InfoCard>
                </div>
              )}

              {tab !== 'Tổng quan' && (
                <div className="flex items-center justify-center min-h-[200px] rounded-xl border border-[#1e2433] bg-[#0b0f1a]">
                  <p className="text-[11px] text-muted-foreground">Nội dung đang phát triển</p>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-t border-[#1e2433] shrink-0 bg-[#0b0f1a]/50">
              <button
                type="button"
                onClick={showTrial}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#2a3855] bg-transparent text-[11px] font-semibold text-foreground hover:bg-[#1a2235] transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Xem chi tiết
              </button>
              <button
                type="button"
                onClick={showTrial}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#2a3855] bg-transparent text-[11px] font-semibold text-foreground hover:bg-[#1a2235] transition-colors"
              >
                <History className="w-3.5 h-3.5" />
                Lịch sử thiết bị
              </button>
              <button
                type="button"
                onClick={showTrial}
                className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90 shadow-[0_2px_12px_rgba(34,197,94,0.25)] transition-colors"
              >
                <Wrench className="w-3.5 h-3.5" />
                Tạo yêu cầu bảo dưỡng
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <TrialLockPopup visible={trialVisible} onDismiss={dismissTrial} />
    </>
  )
}

function KpiBox({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="p-3 rounded-xl border border-[#1e2433] bg-gradient-to-br from-[#0b0f1a] to-[#060b14]">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5 font-bold">{label}</p>
      {children}
    </div>
  )
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="p-4 rounded-xl border border-[#1e2433] bg-[#0b0f1a]">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-3">{title}</p>
      {children}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-[11px] border-b border-[#1e2433]/60 last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-semibold text-foreground text-right">{value}</span>
    </div>
  )
}

function HealthGauge({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score)) / 100
  const radius = 22
  const stroke = 5
  const circumference = Math.PI * radius
  const offset = circumference * (1 - pct)
  const color = score < 40 ? '#ef4444' : score < 70 ? '#f59e0b' : '#22c55e'

  return (
    <svg width="52" height="32" viewBox="0 0 52 32" className="shrink-0">
      <path
        d="M 6 28 A 22 22 0 0 1 46 28"
        fill="none"
        stroke="#1e2433"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      <path
        d="M 6 28 A 22 22 0 0 1 46 28"
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
    </svg>
  )
}
