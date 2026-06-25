import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, ChevronDown, BookOpen, FileBarChart } from 'lucide-react'
import { useAppStore } from '@/store/app.store'
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

export function UserMenu() {
  const { user } = useAppStore()
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
          <p className="text-xs font-semibold text-foreground leading-tight truncate">{user?.name}</p>
          <p className="text-[10px] text-muted-foreground leading-tight truncate">
            {user?.role === 'admin' ? 'Quản trị hệ thống' : user?.role}
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
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[min(240px,calc(100vw-1.5rem))] py-1.5 rounded-lg border border-[#1e2433] bg-[#0d1117] shadow-xl shadow-black/40"
        >
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
      )}
    </div>
  )
}
