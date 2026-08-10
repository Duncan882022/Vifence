import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { SafetyPlayback } from './SafetyPlayback'
import type { Event } from '@/types/event'

interface SafetyPlaybackModalProps {
  open: boolean
  event?: Event | null
  onClose: () => void
}

/** Popup clip vi phạm — trang con khi chưa có tier Camera. Dashboard dùng CameraPlaybackPanel. */
export function SafetyPlaybackModal({ open, event, onClose }: SafetyPlaybackModalProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open || !event) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-[2px] p-0 sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative flex flex-col overflow-hidden w-full sm:max-w-2xl max-h-[92dvh] rounded-t-2xl sm:rounded-xl border border-[#2a3855] bg-[#0a0e17] shadow-2xl shadow-black/60"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="safety-playback-dialog-title"
      >
        <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-3 border-b border-[#1e2433] shrink-0">
          <p id="safety-playback-dialog-title" className="text-[13px] font-semibold text-foreground truncate">
            {event.scenario ?? event.type}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#1e2433] text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          <SafetyPlayback event={event} variant="embedded" />
        </div>
      </div>
    </div>,
    document.body,
  )
}
