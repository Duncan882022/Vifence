import { BarChart3, Bell, Camera, FileBarChart } from 'lucide-react'
import { cn } from '@/utils/cn'

const PILLS = [
  { icon: Camera, label: 'AI PHÁT HIỆN', sub: 'Tự động 24/7' },
  { icon: BarChart3, label: 'CHẤM ĐIỂM', sub: 'Housekeeping Score' },
  { icon: Bell, label: 'CẢNH BÁO', sub: 'Theo thời gian thực' },
  { icon: FileBarChart, label: 'BÁO CÁO', sub: 'Theo ca / ngày / tuần' },
] as const

export function HousekeepingStatusPills() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 shrink-0">
      {PILLS.map(({ icon: Icon, label, sub }) => (
        <div
          key={label}
          className={cn(
            'flex items-center gap-2 sm:gap-3 px-3 py-2.5 sm:py-3 rounded-lg',
            'bg-[#0d1117] border border-[#1e2433]',
          )}
        >
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-sky-500/10 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-sky-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] sm:text-[10px] font-bold text-foreground uppercase tracking-wide truncate">{label}</p>
            <p className="text-[8px] sm:text-[9px] text-muted-foreground truncate">{sub}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
