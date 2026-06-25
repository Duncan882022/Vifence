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
import { TrialLockPopup } from '@/components/common/TrialLock/TrialLockPopup'
import { useTrialLock } from '@/hooks/useTrialLock'

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
  const { visible: trialVisible, show: showTrialToast, dismiss: dismissTrial } = useTrialLock()

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

      <TrialLockPopup visible={trialVisible} onDismiss={dismissTrial} />
    </>
  )
}
