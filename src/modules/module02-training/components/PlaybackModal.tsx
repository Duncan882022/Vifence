import { useEffect } from 'react'
import { X } from 'lucide-react'
import { TrainingPlayback } from './TrainingPlayback'
import type { TrainingEvent } from './TrainingEventTable'

interface PlaybackModalProps {
  open: boolean
  event?: TrainingEvent | null
  onClose: () => void
}

export function PlaybackModal({ open, event, onClose }: PlaybackModalProps) {
  /* Close on Escape */
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Modal panel */}
      <div
        className="relative bg-[#0d1117] border border-[#1e2433] rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: '88vw', height: '78vh', maxWidth: 1200 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1e2433] shrink-0">
          <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
            Xem lại · Playback
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-[#1a2235] text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <TrainingPlayback event={event ?? null} />
        </div>
      </div>
    </div>
  )
}
