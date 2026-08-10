import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { SafetyViolationRecord } from '../types/safety.types'
import { getScenarioName, SAFETY_SCENARIO_MAP } from '../data/safetyScenarios'
import { GROUP_BADGE, GROUP_COLORS, GROUP_ICONS } from '../utils/safetyDashboardUi'
import { getScenarioIcon } from '../data/safetyScenarioIcons'
import { isLiveSafetyRecord } from '../services/safetyAiEvents.service'
import { SafetyEventDetailContent } from './SafetyEventDetailContent'

interface SafetyViolationDetailModalProps {
  record: SafetyViolationRecord | null
  onClose: () => void
}

/** Popup chi tiết sự kiện — snapshot + metadata; đóng bằng X / backdrop / Escape. Video xem ở tier Camera. */
export function SafetyViolationDetailModal({
  record,
  onClose,
}: SafetyViolationDetailModalProps) {
  useEffect(() => {
    if (!record) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [record, onClose])

  if (!record) return null

  const ScenarioIcon = getScenarioIcon(record.scenarioId) ?? GROUP_ICONS[record.groupId]
  const scenarioTitle =
    (isLiveSafetyRecord(record) && record.description?.trim())
      ? record.description.trim()
      : getScenarioName(record.scenarioId)

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-[2px] p-0 sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative flex flex-col overflow-hidden w-full sm:max-w-lg max-h-[92dvh] sm:max-h-[88vh] rounded-t-2xl sm:rounded-xl border border-[#2a3855] bg-[#0a0e17] shadow-2xl shadow-black/60"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="safety-violation-detail-title"
      >
        <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-3 border-b border-[#1e2433] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border',
              GROUP_BADGE[record.groupId],
            )}>
              <ScenarioIcon className={cn('w-3.5 h-3.5', GROUP_COLORS[record.groupId])} aria-hidden />
            </div>
            <div className="min-w-0">
              <p id="safety-violation-detail-title" className="text-[13px] font-semibold text-foreground leading-snug line-clamp-2">
                {scenarioTitle}
              </p>
              <p className="text-[9px] text-muted-foreground font-mono mt-0.5">
                {record.scenarioId}
                {SAFETY_SCENARIO_MAP.get(record.scenarioId)?.name && (
                  <span className="text-muted-foreground/50"> · {record.groupId}</span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#1e2433] text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <SafetyEventDetailContent record={record} variant="modal" />
        </div>
      </div>
    </div>,
    document.body,
  )
}
