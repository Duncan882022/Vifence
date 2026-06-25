import { useState, useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, LayoutDashboard,
  DoorOpen, GraduationCap, ShieldAlert, Sparkles,
  TrendingUp, Package, ClipboardCheck, BarChart3,
  Lock,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAppStore } from '@/store/app.store'

interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  /** false = locked in trial build */
  available: boolean
}

const navItems: NavItem[] = [
  { path: '/module01', label: 'Kiểm soát vào ra',    icon: DoorOpen,       available: false },
  { path: '/module02', label: 'Đào tạo & Tuân thủ',  icon: GraduationCap,  available: true  },
  { path: '/module03', label: 'Giám sát an toàn',     icon: ShieldAlert,    available: false },
  { path: '/module04', label: 'Vệ sinh công trường',  icon: Sparkles,       available: false },
  { path: '/module05', label: 'Hiệu quả công việc',   icon: TrendingUp,     available: false },
  { path: '/module06', label: 'Vật tư thiết bị',      icon: Package,        available: false },
  { path: '/module07', label: 'Nghiệm thu',            icon: ClipboardCheck, available: false },
  { path: '/module08', label: 'Báo cáo điều hành',    icon: BarChart3,      available: false },
]

export function Sidebar() {
  const location = useLocation()
  const { sidebarCollapsed, toggleSidebar } = useAppStore()
  const [trialVisible, setTrialVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showTrialToast() {
    setTrialVisible(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setTrialVisible(false), 2800)
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return (
    <>
      <aside
        className={cn(
          'fixed left-0 top-0 h-full bg-[#0d1117] border-r border-[#1e2433] flex flex-col z-50 transition-all duration-200',
          sidebarCollapsed ? 'w-[56px]' : 'w-[200px]',
        )}
      >
        {/* Logo */}
        <div className="h-header flex items-center px-3 border-b border-[#1e2433] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <LayoutDashboard className="w-4 h-4 text-primary-foreground" />
            </div>
            {!sidebarCollapsed && (
              <span className="text-sm font-bold text-foreground">Vifence</span>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2">
          <ul className="space-y-0.5 px-1.5">
            {navItems.map((item) => {
              const isActive = location.pathname.startsWith(item.path)
              const Icon = item.icon

              if (!item.available) {
                return (
                  <li key={item.path}>
                    <button
                      title={sidebarCollapsed ? item.label : undefined}
                      onClick={showTrialToast}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-md transition-colors group',
                        'text-[#8b9cb8]/50 hover:bg-[#1a2235]/60 hover:text-foreground/60',
                      )}
                    >
                      <Icon className="w-4 h-4 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground/60" />
                      {!sidebarCollapsed && (
                        <span className="text-xs font-medium leading-snug whitespace-normal flex-1 text-left">
                          {item.label}
                        </span>
                      )}
                      {!sidebarCollapsed && (
                        <Lock className="w-2.5 h-2.5 shrink-0 text-muted-foreground/30" />
                      )}
                    </button>
                  </li>
                )
              }

              return (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={cn(
                      'flex items-center gap-2.5 px-2.5 py-2.5 rounded-md transition-colors group',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-[#8b9cb8] hover:bg-[#1a2235] hover:text-foreground',
                    )}
                  >
                    <Icon
                      className={cn(
                        'w-4 h-4 shrink-0',
                        isActive
                          ? 'text-primary-foreground'
                          : 'text-muted-foreground group-hover:text-foreground',
                      )}
                    />
                    {!sidebarCollapsed && (
                      <span className="text-xs font-medium leading-snug whitespace-normal">
                        {item.label}
                      </span>
                    )}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={toggleSidebar}
          className="flex items-center gap-2 px-4 py-3 border-t border-[#1e2433] text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          {sidebarCollapsed
            ? <ChevronRight className="w-3.5 h-3.5" />
            : <ChevronLeft className="w-3.5 h-3.5" />
          }
          {!sidebarCollapsed && <span>Thu gọn</span>}
        </button>
      </aside>

      {/* Trial popup — centered overlay */}
      <div
        className={cn(
          'fixed inset-0 z-[200] flex items-center justify-center transition-all duration-300',
          trialVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        onClick={() => setTrialVisible(false)}
      >
        <div
          className={cn(
            'flex flex-col items-center gap-3 bg-[#1a2235] border border-[#2a3855] rounded-2xl px-8 py-6 shadow-2xl shadow-black/60 transition-transform duration-300',
            trialVisible ? 'scale-100' : 'scale-95',
          )}
          onClick={e => e.stopPropagation()}
        >
          <div className="w-10 h-10 rounded-full bg-yellow-500/15 flex items-center justify-center">
            <Lock className="w-5 h-5 text-yellow-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-foreground">Tính năng này không khả dụng</p>
            <p className="text-xs text-muted-foreground mt-0.5">ở bản dùng thử</p>
          </div>
        </div>
      </div>
    </>
  )
}
