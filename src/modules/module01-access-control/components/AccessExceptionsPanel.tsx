import { AlertTriangle, Lock } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useTrialLock } from '@/hooks/useTrialLock'
import {
  ACCESS_EXCEPTIONS,
  EXCEPTION_ACTION_LABELS,
  EXCEPTION_TYPE_LABELS,
} from '../data/accessExceptions'
import type { AccessException, AccessExceptionAction } from '@/types/access'

const ACTION_TRIAL: AccessExceptionAction[] = ['register', 'fine']

function ExceptionIcon({ severity }: { severity: AccessException['severity'] }) {
  return (
    <AlertTriangle className={cn(
      'w-3.5 h-3.5 shrink-0',
      severity === 'high' ? 'text-red-400' : 'text-orange-400',
    )} />
  )
}

export function AccessExceptionsPanel() {
  const { show: showTrial } = useTrialLock()

  const handleAction = (action: AccessExceptionAction) => {
    if (ACTION_TRIAL.includes(action)) {
      showTrial()
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className={cn(
        'hidden sm:grid gap-x-2 px-3 py-2 border-b border-[#1e2433] shrink-0 bg-[#0b0f1a]',
        'grid-cols-[20px_minmax(0,1.2fr)_minmax(0,1fr)_48px_minmax(0,0.8fr)_72px]',
      )}>
        {['', 'Loại ngoại lệ', 'Đối tượng', 'Giờ', 'Cổng', 'Hành động'].map(h => (
          <span key={h || 'icon'} className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wide truncate">{h}</span>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-[#1e2433]">
        {ACCESS_EXCEPTIONS.map(ex => (
          <div
            key={ex.id}
            className={cn(
              'grid gap-x-2 gap-y-1 items-center px-3 py-2',
              'grid-cols-[20px_1fr_auto] sm:grid-cols-[20px_minmax(0,1.2fr)_minmax(0,1fr)_48px_minmax(0,0.8fr)_72px]',
            )}
          >
            <ExceptionIcon severity={ex.severity} />
            <span className={cn(
              'text-[10px] font-semibold truncate',
              ex.severity === 'high' ? 'text-red-400' : 'text-orange-400',
            )}>
              {EXCEPTION_TYPE_LABELS[ex.type]}
            </span>
            <span className="text-[10px] text-foreground truncate sm:col-auto">{ex.subject}</span>
            <span className="text-[10px] text-muted-foreground tabular-nums hidden sm:block">{ex.time}</span>
            <span className="text-[10px] text-muted-foreground truncate hidden sm:block">{ex.gate}</span>
            <button
              type="button"
              onClick={() => handleAction(ex.action)}
              className="flex items-center justify-center gap-1 px-2 py-1 text-[9px] font-semibold rounded bg-[#1a2235] border border-[#1e2433] text-primary hover:bg-primary/10 transition-colors col-span-1 sm:col-auto"
            >
              {EXCEPTION_ACTION_LABELS[ex.action]}
              {ACTION_TRIAL.includes(ex.action) && (
                <Lock className="w-2.5 h-2.5 opacity-40" />
              )}
            </button>
            <p className="col-span-3 sm:hidden text-[9px] text-muted-foreground/70">
              {ex.time} · {ex.gate}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
