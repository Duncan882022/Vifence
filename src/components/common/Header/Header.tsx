import { Bell, Menu } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useAppStore } from '@/store/app.store'
import { cn } from '@/utils/cn'
import { TrialLockPopup } from '@/components/common/TrialLock/TrialLockPopup'
import { useTrialLock } from '@/hooks/useTrialLock'
import { useShellLayout } from '@/hooks/useShellLayout'
import { EquipmentAiNotificationBell } from '@/modules/equipment-intelligence/components/EquipmentAiNotificationBell'
import { UserMenu } from './UserMenu'

interface HeaderProps {
  title: string
  subtitle?: string
}

export function Header({ title, subtitle }: HeaderProps) {
  const { pathname } = useLocation()
  const isEquipment = pathname.startsWith('/equipment')
  const { notifications } = useAppStore()
  const { sidebarInset, openMobileNav } = useShellLayout()
  const { visible: trialVisible, show: showTrial, dismiss: dismissTrial } = useTrialLock()

  return (
    <>
    <header
      className="fixed top-0 right-0 h-header bg-[#0d1117] border-b border-[#1e2433] flex items-center z-40 transition-all duration-200"
      style={{ left: sidebarInset }}
    >
      <div className="flex items-center flex-1 px-3 sm:px-5 gap-3 min-w-0">
        <button
          type="button"
          onClick={openMobileNav}
          aria-label="Mở menu"
          className="lg:hidden flex items-center justify-center w-10 h-10 -ml-1 rounded-lg hover:bg-[#1a2235] transition-colors shrink-0"
        >
          <Menu className="w-5 h-5 text-muted-foreground" />
        </button>
        <div className="min-w-0">
          <h1 className="text-xs sm:text-sm font-bold text-foreground uppercase tracking-wide leading-tight truncate">{title}</h1>
          {subtitle && (
            <p className="hidden md:block text-[11px] text-muted-foreground leading-tight truncate">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 shrink-0">
        {isEquipment ? (
          <EquipmentAiNotificationBell />
        ) : (
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
        )}

        <div className="w-px h-6 bg-[#1e2433] shrink-0" aria-hidden />

        <UserMenu />
      </div>
    </header>

    <TrialLockPopup visible={trialVisible} onDismiss={dismissTrial} />
    </>
  )
}
