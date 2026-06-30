import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Cpu, MapPin, Wrench, FileBarChart, Sparkles,
  Building2, Map, Settings, Download, ChevronDown,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import type { DashboardFilters } from '../types'

const NAV = [
  { to: '/equipment', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/equipment', label: 'Thiết bị', icon: Cpu, end: false },
  { to: '/equipment', label: 'Dự án / Vị trí', icon: MapPin, end: false },
  { to: '/equipment', label: 'Bảo dưỡng', icon: Wrench, end: false },
  { to: '/equipment', label: 'Báo cáo', icon: FileBarChart, end: false },
  { to: '/equipment', label: 'AI Insights', icon: Sparkles, end: false },
  { to: '/equipment', label: 'Đơn vị sử dụng', icon: Building2, end: false },
  { to: '/equipment', label: 'Bản đồ', icon: Map, end: false },
  { to: '/equipment', label: 'Cài đặt', icon: Settings, end: false },
] as const

interface EquipmentSidebarProps {
  filters: DashboardFilters
  onFilterChange: (patch: Partial<DashboardFilters>) => void
  projects: string[]
  regions: string[]
}

export function EquipmentSidebar({ filters, onFilterChange, projects, regions }: EquipmentSidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-[260px] shrink-0 flex-col border-r border-white/10 bg-[#05101c]/90 backdrop-blur-xl">
        <div className="px-5 py-5 border-b border-white/10">
          <p className="text-lg font-bold tracking-tight text-white">VIFENCE</p>
          <p className="text-[10px] text-sky-400/80 tracking-wide">Beyond the limit</p>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV.map(item => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.end}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[12px] font-medium transition-colors',
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {item.label}
              </NavLink>
            )
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Quick Filters</p>
          <FilterSelect
            label="Dự án"
            value={filters.project}
            options={projects}
            onChange={v => onFilterChange({ project: v })}
          />
          <FilterSelect
            label="Vùng"
            value={filters.region}
            options={regions}
            onChange={v => onFilterChange({ region: v })}
          />
          <FilterSelect
            label="Trạng thái"
            value={filters.status}
            options={['Tất cả trạng thái', 'Working', 'Standby', 'Breakdown', 'Stored']}
            onChange={v => onFilterChange({ status: v })}
          />
          <button
            type="button"
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-500/15 border border-sky-500/25 text-sky-300 text-[11px] font-semibold hover:bg-sky-500/25 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Báo cáo nhanh
          </button>
          <p className="text-[9px] text-slate-600 text-center">v1.0.0</p>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex border-t border-white/10 bg-[#05101c]/95 backdrop-blur-xl overflow-x-auto">
        {NAV.slice(0, 5).map(item => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cn(
                'flex flex-col items-center gap-0.5 px-3 py-2 min-w-[64px] text-[9px] font-medium',
                isActive ? 'text-emerald-400' : 'text-slate-500',
              )}
            >
              <Icon className="w-4 h-4" />
              {item.label.split(' ')[0]}
            </NavLink>
          )
        })}
      </nav>
    </>
  )
}

function FilterSelect({
  label, value, options, onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="text-[9px] text-slate-500 mb-1 block">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full appearance-none rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-[11px] text-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500/40"
        >
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
      </div>
    </label>
  )
}
