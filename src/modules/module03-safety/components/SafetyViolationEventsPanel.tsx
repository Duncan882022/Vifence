import { Download, Film, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { SafetyPlayback } from './SafetyPlayback'
import { useTrialLock } from '@/hooks/useTrialLock'
import { useShellLayout } from '@/hooks/useShellLayout'
import { SafetyViolationTable, violationToEvent } from './SafetyViolationTable'
import type { SafetyViolation } from '@/types/safety'
import type { Event } from '@/types/event'
import {
  getViolationSeverity,
  VIOLATION_SEVERITY_COLORS,
  VIOLATION_SEVERITY_LABELS,
  VIOLATION_TYPE_LABELS,
} from '../data/safetyViolations'
import { cn } from '@/utils/cn'
import { formatDateTime } from '@/utils/format'

interface SafetyViolationEventsPanelProps {
  selectedId?: string
  selectedViolation: SafetyViolation | null
  zoneFilter?: string | null
  onSelectViolation: (v: SafetyViolation) => void
  onPlayback: (event: Event) => void
}

export function SafetyViolationEventsPanel({
  selectedId,
  selectedViolation,
  zoneFilter,
  onSelectViolation,
  onPlayback,
}: SafetyViolationEventsPanelProps) {
  const { isDesktop } = useShellLayout()
  const [playbackExpanded, setPlaybackExpanded] = useState(true)
  const { show: showTrial } = useTrialLock()

  useEffect(() => {
    setPlaybackExpanded(isDesktop)
  }, [isDesktop])

  useEffect(() => {
    if (selectedViolation) setPlaybackExpanded(true)
  }, [selectedViolation?.id])

  const playbackEvent = selectedViolation ? violationToEvent(selectedViolation) : null
  const hasPlayback = Boolean(selectedViolation && playbackEvent)

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full max-lg:min-h-[280px] max-lg:landscape:min-h-[240px]">
      <div className={cn(
        'flex-1 min-h-0 flex flex-col',
        hasPlayback && playbackExpanded && !isDesktop && 'max-lg:max-h-[42vh] max-lg:landscape:max-h-[36vh]',
      )}>
        <SafetyViolationTable
          selectedId={selectedId}
          onSelectViolation={onSelectViolation}
          onPlayback={onPlayback}
          zoneFilter={zoneFilter}
          compact={hasPlayback && playbackExpanded && !isDesktop}
        />
      </div>

      {hasPlayback && (
        <div className="shrink-0 border-t border-[#1e2433] bg-[#0b0f1a] max-lg:landscape:max-h-[52vh]">
          <button
            type="button"
            onClick={() => setPlaybackExpanded(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-[#1a2235]/50 transition-colors"
          >
            <span className="truncate pr-2">
              Playback · {selectedViolation!.workerName ?? 'Vi phạm'}
            </span>
            {playbackExpanded
              ? <ChevronDown className="w-3.5 h-3.5 shrink-0" />
              : <ChevronUp className="w-3.5 h-3.5 shrink-0" />
            }
          </button>

          {playbackExpanded && (
            <div className="flex flex-col max-lg:landscape:flex-row min-h-0 border-t border-[#1e2433]/60">
              <div className={cn(
                'min-w-0',
                'max-lg:min-h-[160px] max-lg:max-h-[220px]',
                'max-lg:landscape:flex-1 max-lg:landscape:max-h-none max-lg:landscape:min-h-[140px]',
                'lg:min-h-[200px] lg:max-h-[260px]',
              )}>
                <SafetyPlayback
                  event={playbackEvent}
                  className="h-full border-0 rounded-none"
                />
              </div>

              <div className={cn(
                'shrink-0 border-t max-lg:landscape:border-t-0 max-lg:landscape:border-l border-[#1e2433]/60',
                'p-3 space-y-2',
                'max-lg:landscape:w-[180px] lg:w-[200px] xl:w-[220px]',
              )}>
                {(() => {
                  const severity = getViolationSeverity(selectedViolation!.type)
                  const sevCfg = VIOLATION_SEVERITY_COLORS[severity]
                  return (
                    <>
                      <div className="flex flex-wrap gap-1">
                        <span className={cn('text-[8px] font-bold px-1.5 py-0.5 rounded', sevCfg.color, sevCfg.bg)}>
                          {VIOLATION_SEVERITY_LABELS[severity]}
                        </span>
                        <span className={cn(
                          'text-[8px] font-bold px-1.5 py-0.5 rounded',
                          selectedViolation!.status === 'pending'
                            ? 'bg-red-500/15 text-red-400'
                            : 'bg-green-500/15 text-green-400',
                        )}>
                          {selectedViolation!.status === 'pending' ? 'Chưa xử lý' : 'Đã xử lý'}
                        </span>
                      </div>
                      <p className="text-[10px] sm:text-[11px] font-semibold text-foreground leading-snug">
                        {VIOLATION_TYPE_LABELS[selectedViolation!.type]}
                      </p>
                      <p className="text-[9px] text-muted-foreground tabular-nums">
                        {formatDateTime(selectedViolation!.timestamp)}
                      </p>
                      <p className="text-[9px] text-muted-foreground line-clamp-2">{selectedViolation!.location}</p>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => onPlayback(playbackEvent!)}
                          className="inline-flex items-center gap-1 px-2 py-1.5 text-[9px] font-semibold rounded bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
                        >
                          <Film className="w-3 h-3" />
                          Phóng to
                        </button>
                        <button
                          type="button"
                          onClick={showTrial}
                          className="inline-flex items-center gap-1 px-2 py-1.5 text-[9px] font-semibold rounded bg-[#1a2235] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Download className="w-3 h-3" />
                          Tải
                        </button>
                        {selectedViolation!.status === 'pending' && (
                          <button
                            type="button"
                            onClick={showTrial}
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-[9px] font-semibold rounded bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors"
                          >
                            <CheckCircle className="w-3 h-3" />
                            Xử lý
                          </button>
                        )}
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
