import { Bell, User, ChevronDown } from 'lucide-react'
import { useAppStore } from '@/store/app.store'
import { cn } from '@/utils/cn'
import { TrialLockPopup } from '@/components/common/TrialLock/TrialLockPopup'
import { useTrialLock } from '@/hooks/useTrialLock'

interface HeaderProps {
  title: string
  subtitle?: string
}

export function Header({ title, subtitle }: HeaderProps) {
  const { user, notifications, sidebarCollapsed } = useAppStore()
  const sidebarWidth = sidebarCollapsed ? 56 : 200
  const { visible: trialVisible, show: showTrial, dismiss: dismissTrial } = useTrialLock()

  return (
    <>
    <header
      className="fixed top-0 right-0 h-header bg-[#0d1117] border-b border-[#1e2433] flex items-center z-40 transition-all duration-200"
      style={{ left: sidebarWidth }}
    >
      <div className="flex items-center flex-1 px-5 gap-4 min-w-0">
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-foreground uppercase tracking-wide leading-tight">{title}</h1>
          {subtitle && <p className="text-[11px] text-muted-foreground leading-tight">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-3 px-5 shrink-0">
        {/* Notification — locked in trial */}
        <button
          type="button"
          onClick={showTrial}
          aria-label="Thông báo"
          className="relative flex items-center justify-center w-10 h-10 rounded-lg hover:bg-[#1a2235] transition-colors shrink-0"
        >
          <Bell className="w-[18px] h-[18px] text-muted-foreground" />
          {notifications > 0 && (
            <span className={cn(
              'absolute top-1.5 right-1.5 min-w-[16px] h-4 rounded-full text-[9px] font-bold leading-none flex items-center justify-center px-1',
              'bg-status-danger text-white ring-2 ring-[#0d1117]',
            )}>
              {notifications}
            </span>
          )}
        </button>

        <div className="w-px h-6 bg-[#1e2433] shrink-0" aria-hidden />

        <div className="flex items-center gap-2 h-10 pl-1 pr-2 rounded-lg hover:bg-[#1a2235] transition-colors cursor-pointer shrink-0">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <User className="w-4 h-4 text-primary" />
          </div>
          <div className="hidden sm:block min-w-0">
            <p className="text-xs font-semibold text-foreground leading-tight truncate">{user?.name}</p>
            <p className="text-[10px] text-muted-foreground leading-tight truncate">
              {user?.role === 'admin' ? 'Quản trị hệ thống' : user?.role}
            </p>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        </div>
      </div>
    </header>

    <TrialLockPopup visible={trialVisible} onDismiss={dismissTrial} />
    </>
  )
}
