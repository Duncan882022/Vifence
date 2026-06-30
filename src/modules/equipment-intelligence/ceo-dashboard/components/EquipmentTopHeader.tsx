import { Bell, RefreshCw, Calendar, ChevronDown } from 'lucide-react'

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
    <header className="ecc-header-bar sticky top-0 z-30 flex flex-wrap items-center gap-3 px-4 sm:px-5 py-3">
      {/* Title — same sizing pattern as global Header */}
      <div className="flex-1 min-w-[180px]">
        <h1 className="text-xs sm:text-sm font-bold text-foreground uppercase tracking-wide leading-tight">
          CEO Dashboard · MMTB
        </h1>
        <p className="hidden md:block text-[11px] text-muted-foreground mt-0.5 leading-tight">
          Tổng quan điều hành Quản lý Máy móc Thiết bị
        </p>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        {/* Date range */}
        <div className="ecc-control hidden sm:flex items-center gap-2 px-3 py-2">
          <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" strokeWidth={1.75} />
          <span className="tabular-nums text-[11px] text-slate-300 whitespace-nowrap">
            {dateRange.from} – {dateRange.to}
          </span>
        </div>

        {/* Project dropdown */}
        <div className="relative ecc-control">
          <select
            value={project}
            onChange={e => onProjectChange(e.target.value)}
            className="appearance-none bg-transparent pl-3 pr-8 py-2 text-[11px] text-slate-300 focus:outline-none cursor-pointer min-w-[130px]"
          >
            {projects.map(p => <option key={p} value={p} className="bg-[#0c1829]">{p}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" strokeWidth={1.75} />
        </div>

        {/* Refresh */}
        <button
          type="button"
          onClick={onRefresh}
          className="ecc-control p-2 hover:bg-white/5 transition-colors"
          aria-label="Làm mới"
        >
          <RefreshCw className="w-4 h-4 text-slate-400" strokeWidth={1.75} />
        </button>

        {/* Bell */}
        <button
          type="button"
          className="ecc-control relative p-2 hover:bg-white/5 transition-colors"
          aria-label="Thông báo"
        >
          <Bell className="w-4 h-4 text-slate-400" strokeWidth={1.75} />
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-[8px] font-bold text-white flex items-center justify-center ring-2 ring-[#07111f]">
            11
          </span>
        </button>

        {/* Avatar + name */}
        <div className="hidden md:flex items-center gap-2.5 pl-3 border-l border-white/[0.08]">
          {/* "AD" initials */}
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-900/40 shrink-0">
            <span className="text-[13px] font-extrabold text-white tracking-tight">AD</span>
          </div>
          <div className="leading-tight">
            <p className="text-[13px] font-semibold text-slate-100">Admin</p>
            <p className="text-[10px] text-slate-500">Super Admin</p>
          </div>
        </div>
      </div>
    </header>
  )
}
