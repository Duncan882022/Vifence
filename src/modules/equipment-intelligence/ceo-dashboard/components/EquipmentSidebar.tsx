import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Cpu, MapPin, Wrench, FileBarChart, Sparkles,
  Building2, Map, Settings, Download,
} from 'lucide-react'
import { cn } from '@/utils/cn'

const NAV = [
  { to: '/equipment', label: 'Tổng quan', icon: LayoutDashboard, end: true },
  { to: '/equipment', label: 'Thiết bị', icon: Cpu, end: false },
  { to: '/equipment', label: 'Dự án / Vị trí', icon: MapPin, end: false },
  { to: '/equipment', label: 'Bảo dưỡng', icon: Wrench, end: false },
  { to: '/equipment', label: 'Báo cáo', icon: FileBarChart, end: false },
  { to: '/equipment', label: 'AI Insights', icon: Sparkles, end: false },
  { to: '/equipment', label: 'Đơn vị sử dụng', icon: Building2, end: false },
  { to: '/equipment', label: 'Bản đồ', icon: Map, end: false },
  { to: '/equipment', label: 'Cài đặt', icon: Settings, end: false },
] as const

export function EquipmentSidebar() {
  return (
    <>
      <aside className="ecc-sidebar hidden lg:flex w-[200px] shrink-0 flex-col">
        {/* Logo — mirrors the main Sidebar header */}
        <div className="h-[64px] flex items-center px-3 border-b border-[#1e2433] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <LayoutDashboard className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white leading-none">MMTB</p>
              <p className="text-[10px] text-emerald-500/60 mt-0.5 leading-none">Equipment Intel</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-1.5 space-y-0.5">
          {NAV.map(item => {
            const Icon = item.icon
            const isOverview = item.label === 'Tổng quan'
            if (isOverview) {
              return (
                <NavLink
                  key={item.label}
                  to={item.to}
                  end
                  className={({ isActive }) => cn(
                    'ecc-nav-item flex items-center gap-2.5 px-2.5 py-2.5 rounded-md text-xs font-medium',
                    isActive && 'ecc-nav-active',
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                  {item.label}
                </NavLink>
              )
            }
            return (
              <button
                key={item.label}
                type="button"
                className="ecc-nav-item w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-md text-xs font-medium text-left"
              >
                <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="px-2 py-3 border-t border-[#1e2433]">
          <button
            type="button"
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/15 transition-all"
          >
            <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
            Báo cáo nhanh
          </button>
          <p className="text-[10px] text-slate-600 text-center mt-2">© 2025 VIFENCE · v1.0.0</p>
        </div>
      </aside>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex border-t border-white/10 bg-[#060e1a]/98 backdrop-blur-xl">
        {NAV.slice(0, 5).map(item => {
          const Icon = item.icon
          const isOverview = item.label === 'Tổng quan'
          const cls = cn(
            'flex flex-col items-center justify-center gap-0.5 flex-1 py-2.5 text-[9px] font-medium min-w-0',
            isOverview ? 'text-emerald-400' : 'text-slate-500',
          )
          if (isOverview) {
            return (
              <NavLink key={item.label} to={item.to} end className={cls}>
                <Icon className="w-4 h-4" strokeWidth={1.75} />
                <span className="truncate max-w-full px-1">{item.label.split(' ')[0]}</span>
              </NavLink>
            )
          }
          return (
            <button key={item.label} type="button" className={cls}>
              <Icon className="w-4 h-4" strokeWidth={1.75} />
              <span className="truncate max-w-full px-1">{item.label.split(' ')[0]}</span>
            </button>
          )
        })}
      </nav>
    </>
  )
}
