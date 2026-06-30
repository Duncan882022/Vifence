import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { SafetyPlayback } from './SafetyPlayback'
import { SAFETY_VIOLATIONS, VIOLATION_TYPE_LABELS } from '../data/safetyViolations'
import { ViolationTypeIcon } from './ViolationTypeIcon'
import type { Event } from '@/types/event'
import type { ViolationType } from '@/types/safety'

interface SafetyPlaybackModalProps {
  open: boolean
  event?: Event | null
  onClose: () => void
}

function resolveViolationType(event: Event | null | undefined): ViolationType | null {
  if (!event) return null
  const match = SAFETY_VIOLATIONS.find(v => v.id === event.id)
  if (match) return match.type
  const entry = Object.entries(VIOLATION_TYPE_LABELS).find(([, label]) => label === event.type)
  return entry ? entry[0] as ViolationType : null
}

const FADE_MS = 150

export function SafetyPlaybackModal({ open, event, onClose }: SafetyPlaybackModalProps) {
  // `mounted` lags behind `open` by FADE_MS so the overlay can fade out before unmounting.
  // This prevents the backdrop-blur-sm from disappearing in a single frame (repaint flash).
  const [mounted, setMounted] = useState(open)

  useEffect(() => {
    if (open) {
      setMounted(true)
      // Lock body scroll while modal is open
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
      const timer = setTimeout(() => setMounted(false), FADE_MS)
      return () => clearTimeout(timer)
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!mounted) return null

  const violationType = resolveViolationType(event)

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4',
        'transition-opacity duration-150',
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
      )}
      onClick={open ? onClose : undefined}
    >
      <div
        className="relative bg-[#0d1117] border-0 sm:border border-[#1e2433] rounded-none sm:rounded-xl shadow-2xl flex flex-col overflow-hidden w-full h-full sm:w-[88vw] sm:h-[78vh] sm:max-w-[1200px]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1e2433] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {violationType && <ViolationTypeIcon type={violationType} size="sm" />}
            <div className="min-w-0">
              <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Playback Vi Phạm
              </h2>
              {violationType && (
                <p className="text-[10px] text-foreground truncate">{VIOLATION_TYPE_LABELS[violationType]}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-[#1a2235] text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <SafetyPlayback event={open ? (event ?? null) : null} className="h-full" />
        </div>
      </div>
    </div>
  )
}
