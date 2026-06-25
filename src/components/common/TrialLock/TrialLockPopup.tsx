import { Lock } from 'lucide-react'
import { cn } from '@/utils/cn'

export const TRIAL_LOCK_MESSAGE = 'Tính năng này không khả dụng ở bản dùng thử !!!'

interface TrialLockPopupProps {
  visible: boolean
  onDismiss?: () => void
}

export function TrialLockPopup({ visible, onDismiss }: TrialLockPopupProps) {
  return (
    <div
      className={cn(
        'fixed inset-0 z-[200] flex items-center justify-center transition-all duration-300',
        visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
      )}
      onClick={onDismiss}
    >
      <div
        className={cn(
          'flex flex-col items-center gap-3 bg-[#1a2235] border border-[#2a3855] rounded-2xl px-8 py-6 shadow-2xl shadow-black/60 transition-transform duration-300',
          visible ? 'scale-100' : 'scale-95',
        )}
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-10 rounded-full bg-yellow-500/15 flex items-center justify-center">
          <Lock className="w-5 h-5 text-yellow-400" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">{TRIAL_LOCK_MESSAGE}</p>
        </div>
      </div>
    </div>
  )
}
