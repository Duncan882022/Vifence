import { createPortal } from 'react-dom'
import { Gavel, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { SafetyViolationRecord } from '../types/safety.types'
import { getScenarioName } from '../data/safetyScenarios'
import { getAlertSubjectLabel } from '../utils/eventSubject'

interface SafetyHandleConfirmDialogProps {
  record: SafetyViolationRecord | null
  onClose: () => void
  onConfirm: () => void
}

export function SafetyHandleConfirmDialog({
  record,
  onClose,
  onConfirm,
}: SafetyHandleConfirmDialogProps) {
  if (!record) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-t-xl rounded-b-none sm:rounded-xl border border-[#2a3855] bg-[#0a0e17] shadow-2xl shadow-black/60 pb-[env(safe-area-inset-bottom)]"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="safety-handle-dialog-title"
      >
        <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-2 border-b border-[#1e2433]">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
              <Gavel className="w-4 h-4 text-amber-400" />
            </div>
            <div className="min-w-0">
              <p id="safety-handle-dialog-title" className="text-sm font-semibold text-foreground">
                Xác nhận xử lý
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                {getScenarioName(record.scenarioId)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-[#1e2433] text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 space-y-2">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Xác nhận sự kiện này đã được xử lý?
          </p>
          <p className="text-[10px] text-foreground/90">
            <span className="text-muted-foreground">Đối tượng </span>
            {getAlertSubjectLabel(record)}
          </p>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 px-4 pb-4">
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'w-full sm:w-auto px-3 py-2.5 sm:py-1.5 rounded-lg text-[11px] font-medium border border-[#1e2433]',
              'text-muted-foreground hover:text-foreground hover:border-[#2a3855] transition-colors',
            )}
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              'w-full sm:w-auto px-3 py-2.5 sm:py-1.5 rounded-lg text-[11px] font-semibold',
              'bg-green-500/20 text-green-400 border border-green-500/40 hover:bg-green-500/30 transition-colors',
            )}
          >
            Xác nhận đã xử lý
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
