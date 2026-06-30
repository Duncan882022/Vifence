import { Bell, RefreshCw, Calendar, ChevronDown } from 'lucide-react'
import { UserMenu } from '@/components/common/Header/UserMenu'
import { Button } from '@/components/ui/button'

interface EquipmentTopHeaderProps {
  dateRange: { from: string; to: string }
  project: string
  projects: string[]
  onProjectChange: (p: string) => void
  onRefresh: () => void
}

export function EquipmentTopHeader({
  dateRange, project, projects, onProjectChange, onRefresh,
}: EquipmentTopHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 px-4 py-3 border-b border-white/10 bg-[#07111F]/90 backdrop-blur-xl">
      <div className="flex-1 min-w-[200px]">
        <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-sky-400">CEO Dashboard — MMTB</p>
        <h1 className="text-sm md:text-base font-bold text-white tracking-tight">
          Tổng quan điều hành Quản lý Máy móc Thiết bị
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-[11px] text-slate-300">
          <Calendar className="w-3.5 h-3.5 text-slate-500" />
          <span>{dateRange.from} – {dateRange.to}</span>
        </div>

        <div className="relative">
          <select
            value={project}
            onChange={e => onProjectChange(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-white/10 bg-white/5 text-[11px] text-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500/40"
          >
            {projects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
        </div>

        <Button variant="ghost" size="icon" onClick={onRefresh} aria-label="Làm mới">
          <RefreshCw className="w-4 h-4" />
        </Button>

        <button
          type="button"
          className="relative flex items-center justify-center w-9 h-9 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
        >
          <Bell className="w-4 h-4 text-slate-400" />
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center">
            12
          </span>
        </button>

        <div className="hidden md:flex flex-col items-end mr-1">
          <span className="text-[11px] font-semibold text-slate-200">Admin</span>
          <span className="text-[9px] text-slate-500">Super Admin</span>
        </div>
        <UserMenu variant="enterprise" />
      </div>
    </header>
  )
}
