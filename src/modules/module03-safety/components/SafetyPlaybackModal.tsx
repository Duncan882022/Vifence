import { useEffect } from 'react'
import { X } from 'lucide-react'
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

export function SafetyPlaybackModal({ open, event, onClose }: SafetyPlaybackModalProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const violationType = resolveViolationType(event)

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
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
          <SafetyPlayback event={event ?? null} className="h-full" />
        </div>
      </div>
    </div>
  )
}
