import { Download, Film, CheckCircle, ChevronDown, ChevronUp, X } from 'lucide-react'
import { useEffect, useState, type MouseEvent } from 'react'
import { SafetyPlayback } from './SafetyPlayback'
import { useTrialLock } from '@/hooks/useTrialLock'
import { useShellLayout } from '@/hooks/useShellLayout'
import { SafetyViolationTable, violationToEvent } from './SafetyViolationTable'
import { ViolationTypeIcon } from './ViolationTypeIcon'
import { Avatar } from '@/components/common/Avatar/Avatar'
import { getPersonAvatarColor, getPersonAvatarUrl } from '@/data/personAvatars'
import type { SafetyViolation } from '@/types/safety'
import type { Event } from '@/types/event'
import {
  getViolationSeverity,
  VIOLATION_SEVERITY_COLORS,
  VIOLATION_SEVERITY_LABELS,
  VIOLATION_TYPE_LABELS,
} from '../data/safetyViolations'
import { resolveWorkerClickTarget } from '../services/safetyEntity.service'
import { cn } from '@/utils/cn'
import { formatDateTime } from '@/utils/format'

interface SafetyViolationEventsPanelProps {
  selectedId?: string
  selectedViolation: SafetyViolation | null
  zoneFilter?: string | null
  onSelectViolation: (v: SafetyViolation) => void
  onPlayback: (event: Event) => void
  onDismissViolation?: () => void
  onSelectWorker?: (workerIdOrName: string) => void
  onSelectContractor?: (contractorName: string) => void
}

export function SafetyViolationEventsPanel({
  selectedId,
  selectedViolation,
  zoneFilter,
  onSelectViolation,
  onPlayback,
  onDismissViolation,
  onSelectWorker,
  onSelectContractor,
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
          onSelectWorker={onSelectWorker}
          onSelectContractor={onSelectContractor}
          zoneFilter={zoneFilter}
          compact={hasPlayback && playbackExpanded && !isDesktop}
        />
      </div>

      {hasPlayback && (
        <div className="shrink-0 border-t border-[#1e2433] bg-[#0b0f1a] max-lg:landscape:max-h-[52vh]">
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setPlaybackExpanded(v => !v)}
              className="flex-1 flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-[#1a2235]/50 transition-colors min-w-0"
            >
              <span className="truncate pr-2">
                Playback · {selectedViolation!.workerName ?? 'Vi phạm'}
              </span>
              {playbackExpanded
                ? <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                : <ChevronUp className="w-3.5 h-3.5 shrink-0" />
              }
            </button>
            {onDismissViolation && (
              <button
                type="button"
                onClick={onDismissViolation}
                className="shrink-0 p-2 text-muted-foreground hover:text-foreground hover:bg-[#1a2235]/50 transition-colors"
                title="Đóng playback"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {playbackExpanded && (
            <div className="flex flex-col max-lg:landscape:flex-row min-h-0 max-h-[min(420px,50vh)] lg:max-h-[360px] border-t border-[#1e2433]/60 overflow-hidden">
              <div className={cn(
                'min-w-0 overflow-hidden',
                'max-lg:min-h-[160px] max-lg:max-h-[220px]',
                'max-lg:landscape:flex-1 max-lg:landscape:max-h-none max-lg:landscape:min-h-[140px]',
                'lg:min-h-[180px] lg:flex-1',
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
                      <div className="flex items-start gap-2">
                        {(() => {
                          const workerTarget = resolveWorkerClickTarget(selectedViolation!)
                          const workerName = selectedViolation!.workerName
                          if (workerTarget && workerName && onSelectWorker) {
                            return (
                              <button
                                type="button"
                                onClick={(e: MouseEvent) => {
                                  e.stopPropagation()
                                  onSelectWorker(workerTarget)
                                }}
                                className="rounded-full cursor-pointer hover:ring-2 hover:ring-primary/40 transition-shadow shrink-0"
                                title={`Xem hồ sơ ${workerName}`}
                              >
                                <Avatar
                                  name={workerName}
                                  color={getPersonAvatarColor(workerName)}
                                  src={getPersonAvatarUrl(workerTarget, workerName)}
                                  size="sm"
                                />
                              </button>
                            )
                          }
                          return <ViolationTypeIcon type={selectedViolation!.type} size="sm" />
                        })()}
                        <div className="flex-1 min-w-0 space-y-1">
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
                        </div>
                      </div>
                      <p className="text-[9px] text-muted-foreground tabular-nums">
                        {formatDateTime(selectedViolation!.timestamp)}
                      </p>
                      <p className="text-[9px] text-muted-foreground line-clamp-2">{selectedViolation!.location}</p>
                      {selectedViolation!.contractorName && onSelectContractor && (
                        <button
                          type="button"
                          onClick={() => onSelectContractor(selectedViolation!.contractorName!)}
                          className="text-[9px] text-primary/80 hover:text-primary hover:underline underline-offset-2 decoration-dotted transition-colors truncate block max-w-full text-left"
                        >
                          {selectedViolation!.contractorName}
                        </button>
                      )}
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
                          Tải xuống
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
