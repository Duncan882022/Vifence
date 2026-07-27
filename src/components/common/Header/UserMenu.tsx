import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, ChevronDown, BookOpen, FileBarChart, Users, Building2, Camera, UserCog, Shield, Check, Lock } from 'lucide-react'
import { useAppStore } from '@/store/app.store'
import { TENANTS } from '@/data/tenants'
import { useActiveTenant } from '@/hooks/useTenantTrainingScope'
import { useTenantStore } from '@/store/tenant.store'
import { IS_DEMO_AUTH } from '@/modules/dao-tao-tuan-thu/services/ghpagesDemo.service'
import { cn } from '@/utils/cn'

const MENU_ITEMS = [
  {
    label: 'Quản lý nhân sự',
    to: '/dttt/quan-ly-nhan-su',
    icon: Users,
  },
  {
    label: 'Quản lý khoá học',
    to: '/dttt/quan-ly-khoa-hoc',
    icon: BookOpen,
  },
  {
    label: 'Quản lý nhà thầu',
    to: '/dttt/quan-ly-nha-thau',
    icon: Building2,
  },
  {
    label: 'Quản lý camera',
    to: '/dttt/quan-ly-camera',
    icon: Camera,
  },
  {
    label: 'Quản lý tài khoản',
    to: '/dttt/quan-ly-tai-khoan',
    icon: UserCog,
  },
  {
    label: 'Quản lý vai trò',
    to: '/dttt/quan-ly-vai-tro',
    icon: Shield,
  },
  {
    label: 'Báo cáo điều hành',
    to: '/dttt/bao-cao-dieu-hanh',
    icon: FileBarChart,
  },
] as const

export function UserMenu() {
  const { user } = useAppStore()
  const { activeTenantId, tenantName } = useActiveTenant()
  const setActiveTenant = useTenantStore(s => s.setActiveTenant)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

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

  return (
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
          <p className="text-xs font-semibold text-foreground leading-tight truncate">{user?.name || 'Nguyễn Quản Lý'}</p>
          <p className="text-[10px] text-muted-foreground leading-tight truncate">
            {tenantName}
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
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[240px] py-2 rounded-lg border border-[#1e2433] bg-[#0d1117] shadow-xl shadow-black/40"
        >
          {/* TÀI KHOẢN SECTION */}
          <div className="px-3 py-1 text-[9px] font-bold text-white/40 uppercase tracking-wider">
            Tài khoản
          </div>
          <div className="space-y-0.5 mt-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                navigate('/profile')
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-[11px] font-medium text-foreground hover:bg-[#1a2235] transition-colors"
            >
              <User className="w-3.5 h-3.5 text-primary shrink-0" />
              Trang cá nhân
            </button>
          </div>

          <div className="h-px bg-[#1e2433] my-2" />

          {/* CÔNG TRƯỜNG SECTION */}
          <div className="px-3 py-1 text-[9px] font-bold text-white/40 uppercase tracking-wider">
            Công trường
          </div>
          <div className="space-y-0.5 mt-1">
            {TENANTS.map(site => {
              const enabled = site.hasDemoData
              const selected = site.id === activeTenantId

              return (
              <button
                key={site.id}
                type="button"
                disabled={!enabled}
                onClick={() => {
                  if (!enabled) return
                  setActiveTenant(site.id)
                  setOpen(false)
                }}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 text-left text-[11px] font-medium transition-colors',
                  enabled
                    ? selected
                      ? 'text-foreground bg-[#1a2235]/60'
                      : 'text-foreground hover:bg-[#1a2235]'
                    : 'text-muted-foreground/35 cursor-not-allowed',
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="truncate">{site.name}</span>
                </div>
                {selected ? (
                  <Check className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                ) : enabled ? null : (
                  <Lock className="w-3 h-3 text-muted-foreground/20 shrink-0" />
                )}
              </button>
              )
            })}
          </div>

          <div className="h-px bg-[#1e2433] my-2" />

          {/* QUẢN TRỊ SECTION */}
          <div className="px-3 py-1 text-[9px] font-bold text-white/40 uppercase tracking-wider">
            Quản trị
          </div>
          <div className="space-y-0.5 mt-1">
            {MENU_ITEMS.map(item => (
              <button
                key={item.to}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  navigate(item.to)
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-[11px] font-medium text-foreground hover:bg-[#1a2235] transition-colors"
              >
                <item.icon className="w-3.5 h-3.5 text-primary shrink-0" />
                {item.label}
              </button>
            ))}
          </div>
          
          {!IS_DEMO_AUTH && (
            <>
              <div className="h-px bg-[#1e2433] my-2" />
              <button
                type="button"
                role="menuitem"
                onClick={async () => {
                  setOpen(false)
                  try {
                    const axiosInstance = (await import('@/utils/axios')).default
                    await axiosInstance.post('/auth/signout')
                  } catch (e) {
                    console.error('Signout failed, clearing session locally', e)
                  } finally {
                    localStorage.removeItem('vifence_access_token')
                    localStorage.removeItem('vifence_refresh_token')
                    const { useAppStore } = await import('@/store/app.store')
                    useAppStore.getState().setUser(null)
                    navigate('/signin')
                  }
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-[11px] font-medium text-status-danger hover:bg-[#1a2235] transition-colors"
              >
                <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-log-out"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
                </span>
                Đăng xuất
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
