import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  User, ChevronDown, BookOpen, FileBarChart, Building2, Lock, Check,
} from 'lucide-react'
import { useAppStore } from '@/store/app.store'
import { useTenantStore } from '@/store/tenant.store'
import { TENANTS, tenantHasDemoData } from '@/data/tenants'
import { useActiveTenant } from '@/hooks/useTenantTrainingScope'
import { TrialLockPopup } from '@/components/common/TrialLock/TrialLockPopup'
import { useTrialLock } from '@/hooks/useTrialLock'
import { cn } from '@/utils/cn'

const MENU_ITEMS = [
  {
    label: 'Quản lý khoá học',
    to: '/module02/quan-ly-khoa-hoc',
    icon: BookOpen,
  },
  {
    label: 'Báo cáo điều hành',
    to: '/module02/bao-cao-dieu-hanh',
    icon: FileBarChart,
  },
] as const

interface UserMenuProps {
  /** site = theo công trường (module đào tạo); enterprise = tổng thể, không chọn OCP */
  variant?: 'site' | 'enterprise'
}

export function UserMenu({ variant = 'site' }: UserMenuProps) {
  const isEnterprise = variant === 'enterprise'
  const { user } = useAppStore()
  const activeTenantId = useTenantStore(s => s.activeTenantId)
  const setActiveTenant = useTenantStore(s => s.setActiveTenant)
  const { tenantName } = useActiveTenant()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { visible: trialVisible, show: showTrial, dismiss: dismissTrial } = useTrialLock()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleTenantSelect = (id: typeof TENANTS[number]['id']) => {
    if (tenantHasDemoData(id)) {
      setActiveTenant(id)
      return
    }
    showTrial()
  }

  return (
    <>
      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          className={cn(
            'flex items-center gap-2 h-10 pl-1 pr-2 rounded-lg transition-colors shrink-0',
            open ? 'bg-[#1a2235]' : 'hover:bg-[#1a2235]',
          )}
        >
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <User className="w-4 h-4 text-primary" />
          </div>
          <div className="hidden sm:block min-w-0 text-left">
            <p className="text-xs font-semibold text-foreground leading-tight truncate">{user?.name}</p>
            <p className="text-[10px] text-muted-foreground leading-tight truncate">
              {isEnterprise ? 'Toàn công ty' : tenantName}
            </p>
          </div>
          <ChevronDown className={cn(
            'hidden sm:block w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform',
            open && 'rotate-180',
          )} />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+6px)] z-50 w-[min(260px,calc(100vw-1.5rem))] py-1.5 rounded-lg border border-[#1e2433] bg-[#0d1117] shadow-xl shadow-black/40"
          >
            {!isEnterprise && (
              <>
                <p className="px-3 pt-1 pb-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                  Công trường
                </p>
                {TENANTS.map(tenant => {
                  const isActive = tenant.id === activeTenantId
                  const locked = !tenant.hasDemoData
                  return (
                    <button
                      key={tenant.id}
                      type="button"
                      role="menuitem"
                      onClick={() => handleTenantSelect(tenant.id)}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-2 text-left text-[11px] font-medium transition-colors',
                        isActive
                          ? 'text-foreground bg-[#1a2235]/80'
                          : locked
                            ? 'text-muted-foreground/50 hover:bg-[#1a2235]/40 hover:text-muted-foreground/70'
                            : 'text-foreground hover:bg-[#1a2235]',
                      )}
                    >
                      <Building2 className={cn(
                        'w-3.5 h-3.5 shrink-0',
                        isActive ? 'text-primary' : 'text-muted-foreground/60',
                      )} />
                      <span className="flex-1 truncate">{tenant.name}</span>
                      {isActive && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                      {locked && !isActive && (
                        <Lock className="w-2.5 h-2.5 text-muted-foreground/30 shrink-0" />
                      )}
                    </button>
                  )
                })}

                <div className="my-1.5 border-t border-[#1e2433]" aria-hidden />
              </>
            )}

            <p className="px-3 pt-1 pb-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70">
              Quản trị
            </p>
            {MENU_ITEMS.map(item => (
              <button
                key={item.to}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  navigate(item.to)
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[11px] font-medium text-foreground hover:bg-[#1a2235] transition-colors"
              >
                <item.icon className="w-3.5 h-3.5 text-primary shrink-0" />
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <TrialLockPopup visible={trialVisible} onDismiss={dismissTrial} />
    </>
  )
}
