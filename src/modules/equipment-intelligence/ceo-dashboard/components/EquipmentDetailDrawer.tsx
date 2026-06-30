import { useState } from 'react'
import { Cpu } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/utils/cn'
import type { MmtbRow } from '../types'

const TABS = ['Tổng quan', 'Vận hành', 'Bảo dưỡng', 'Sự cố', 'AI Insights'] as const

interface EquipmentDetailDrawerProps {
  machine: MmtbRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EquipmentDetailDrawer({ machine, open, onOpenChange }: EquipmentDetailDrawerProps) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Tổng quan')

  if (!machine) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{machine.machineCode}</SheetTitle>
          <p className="text-[11px] text-slate-400">{machine.equipmentType} · {machine.projectLocation}</p>
        </SheetHeader>

        <div className="flex items-center gap-4 p-4 rounded-xl border border-white/10 bg-white/[0.03]">
          <div className="w-16 h-16 rounded-xl bg-sky-500/15 flex items-center justify-center shrink-0">
            <Cpu className="w-8 h-8 text-sky-400" />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] flex-1">
            <Metric label="Health Score" value={`${machine.healthScore}/100`} accent={machine.healthScore < 40 ? 'red' : machine.healthScore < 70 ? 'amber' : 'green'} />
            <Metric label="Utilization" value={`${machine.utilizationPct}%`} />
            <Metric label="Engine Hours" value={machine.engineHours.toLocaleString('vi-VN')} />
            <Metric label="PM Status" value={machine.pmStatusLabel} />
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto pb-1">
          {TABS.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-[10px] font-semibold whitespace-nowrap transition-colors',
                tab === t ? 'bg-sky-500/20 text-sky-300' : 'text-slate-500 hover:text-slate-300',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="space-y-3 text-[11px]">
          {tab === 'Tổng quan' && (
            <>
              <Row label="MTBF" value={`${machine.mtbfHours} h`} />
              <Row label="MTTR" value={`${machine.mttrHours} h`} />
              <Row label="MTTF" value={`${machine.mttfHours.toLocaleString('vi-VN')} h`} />
              <Row label="Đơn vị sử dụng" value={machine.usageUnit} />
              <Row label="Trạng thái" value={machine.status} />
            </>
          )}
          {tab === 'Vận hành' && <p className="text-slate-400">Telemetry vận hành 7 ngày — mock placeholder.</p>}
          {tab === 'Bảo dưỡng' && <p className="text-slate-400">Lịch PM và lịch sử bảo dưỡng — mock placeholder.</p>}
          {tab === 'Sự cố' && <p className="text-slate-400">Sự cố High &amp; Critical — mock placeholder.</p>}
          {tab === 'AI Insights' && (
            <div className="p-3 rounded-xl border border-sky-500/20 bg-sky-500/5">
              <p className="text-[10px] uppercase tracking-wider text-sky-400 mb-1">Khuyến nghị mới nhất</p>
              <p className="text-slate-200">{machine.latestAiRecommendation ?? 'Không có khuyến nghị AI.'}</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: 'red' | 'amber' | 'green' }) {
  const color = accent === 'red' ? 'text-red-400' : accent === 'amber' ? 'text-amber-400' : accent === 'green' ? 'text-emerald-400' : 'text-white'
  return (
    <div>
      <p className="text-[9px] text-slate-500 uppercase">{label}</p>
      <p className={cn('font-bold tabular-nums', color)}>{value}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 border-b border-white/5">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-200">{value}</span>
    </div>
  )
}
