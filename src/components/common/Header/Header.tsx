import { useState, useRef, useEffect } from 'react'
import { Bell, User, ChevronDown, Lock } from 'lucide-react'
import { useAppStore } from '@/store/app.store'
import { cn } from '@/utils/cn'

interface HeaderProps {
  title: string
  subtitle?: string
}

export function Header({ title, subtitle }: HeaderProps) {
  const { user, notifications, sidebarCollapsed } = useAppStore()
  const sidebarWidth = sidebarCollapsed ? 56 : 200

  const [trialVisible, setTrialVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showTrial() {
    setTrialVisible(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setTrialVisible(false), 2800)
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

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

      <div className="flex items-center gap-2 px-5 shrink-0">
        {/* Notification — locked in trial */}
        <button
          onClick={showTrial}
          className="relative p-2 rounded-md hover:bg-[#1a2235] transition-colors"
        >
          <Bell style={{ width: 18, height: 18 }} className="text-muted-foreground" />
          {notifications > 0 && (
            <span className={cn(
              'absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center px-1',
              'bg-status-danger text-white',
            )}>
              {notifications}
            </span>
          )}
        </button>

        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-[#1a2235] transition-colors cursor-pointer">
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
            <User className="w-4 h-4 text-primary" />
          </div>
          <div className="hidden sm:block">
            <p className="text-xs font-semibold text-foreground leading-tight">{user?.name}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">
              {user?.role === 'admin' ? 'Quản trị hệ thống' : user?.role}
            </p>
          </div>
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </div>
      </div>
    </header>

    {/* Trial popup */}
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
