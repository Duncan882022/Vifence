import { useEffect, useRef } from 'react'
import { Bell, Sparkles, ArrowRight } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useEquipmentAiNotifications } from '../store/equipmentAiNotifications.store'
import { AiRecommendationListItem } from './AiRecommendationListItem'

const DROPDOWN_PREVIEW = 5

export function EquipmentAiNotificationBell() {
  const rootRef = useRef<HTMLDivElement>(null)
  const {
    items,
    unreadIds,
    dropdownOpen,
    setDropdownOpen,
    openDrawer,
    unreadCount,
  } = useEquipmentAiNotifications()

  const count = unreadCount()
  const preview = items.slice(0, DROPDOWN_PREVIEW)

  useEffect(() => {
    if (!dropdownOpen) return
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setDropdownOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [dropdownOpen, setDropdownOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDropdownOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setDropdownOpen])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        aria-expanded={dropdownOpen}
        aria-haspopup="menu"
        aria-label="Thông báo AI"
        className={cn(
          'relative flex items-center justify-center w-10 h-10 rounded-lg transition-colors shrink-0',
          dropdownOpen ? 'bg-[#1a2235]' : 'hover:bg-[#1a2235]',
        )}
      >
        <Bell className="w-[18px] h-[18px] text-muted-foreground" />
        {count > 0 && (
          <span className={cn(
            'absolute top-1.5 right-1.5 min-w-[16px] h-4 rounded-full text-[9px] font-bold leading-none flex items-center justify-center px-1',
            'bg-status-danger text-white ring-2 ring-[#0d1117]',
          )}>
            {count}
          </span>
        )}
      </button>

      {dropdownOpen && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[min(360px,calc(100vw-1.5rem))] rounded-lg border border-[#1e2433] bg-[#0d1117] shadow-xl shadow-black/40 overflow-hidden"
        >
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#1e2433] bg-[#0b0f1a]">
            <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-[10px] font-bold text-foreground uppercase tracking-wider flex-1">
              Khuyến nghị AI
            </span>
            <span className="text-[9px] text-muted-foreground tabular-nums">
              {items.length} mục
            </span>
          </div>

          <div className="max-h-[min(420px,60vh)] overflow-y-auto">
            {preview.length === 0 ? (
              <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
                Không có khuyến nghị mới
              </p>
            ) : (
              preview.map(item => (
                <AiRecommendationListItem
                  key={item.id}
                  item={item}
                  unread={unreadIds.includes(item.id)}
                  compact
                  onClick={() => openDrawer(item)}
                />
              ))
            )}
          </div>

          {items.length > 0 && (
            <div className="px-3 py-2 border-t border-[#1e2433] bg-[#0b0f1a]/80">
              <button
                type="button"
                onClick={() => items[0] && openDrawer(items[0])}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-semibold text-primary hover:text-primary/80 hover:bg-primary/10 transition-colors"
              >
                Xem tất cả
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
