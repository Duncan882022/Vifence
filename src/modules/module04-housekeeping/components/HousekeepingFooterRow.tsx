import { useEffect, useState } from 'react'
import {
  BarChart3, Bell, Camera, Check, ChevronDown, ChevronRight, ChevronUp, Download, Lock, Shield, User,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { useTrialLock } from '@/hooks/useTrialLock'
import { useShellLayout } from '@/hooks/useShellLayout'
import { TrialLockPopup } from '@/components/common/TrialLock/TrialLockPopup'
import {
  HOUSEKEEPING_BENEFITS,
  HOUSEKEEPING_PROCESS_STEPS,
} from '../data/housekeepingScores'

const STEP_ICONS = {
  camera: Camera,
  bell: Bell,
  user: User,
  check: Check,
  chart: BarChart3,
} as const

const REPORT_BUTTONS = [
  { id: 'daily', label: 'Báo cáo theo ngày' },
  { id: 'weekly', label: 'Báo cáo theo tuần' },
  { id: 'monthly', label: 'Báo cáo theo tháng' },
] as const

export function HousekeepingFooterRow() {
  const { isDesktop } = useShellLayout()
  const [expanded, setExpanded] = useState(isDesktop)
  const { visible, show, dismiss } = useTrialLock()

  useEffect(() => {
    setExpanded(isDesktop)
  }, [isDesktop])

  return (
    <>
      {!isDesktop && (
        <button
          type="button"
          onClick={() => setExpanded(open => !open)}
          className={cn(
            'flex items-center justify-between w-full px-3 py-2.5 rounded-lg shrink-0',
            'bg-[#0d1117] border border-[#1e2433] text-left',
          )}
        >
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-sky-400" />
            <span className="text-[10px] font-bold text-foreground uppercase tracking-wide">
              Lợi ích & Quy trình
            </span>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
      )}

      {(isDesktop || expanded) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 shrink-0">
          <div className="bg-[#0d1117] border border-[#1e2433] rounded-lg p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-sky-400" />
              <h3 className="text-[10px] font-bold text-foreground uppercase tracking-wide">Lợi ích</h3>
            </div>
            <ul className="space-y-1.5">
              {HOUSEKEEPING_BENEFITS.map(benefit => (
                <li key={benefit} className="flex items-start gap-2 text-[9px] sm:text-[10px] text-muted-foreground">
                  <span className="text-sky-400 mt-0.5 shrink-0">•</span>
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-[#0d1117] border border-[#1e2433] rounded-lg p-3 sm:p-4">
            <h3 className="text-[10px] font-bold text-foreground uppercase tracking-wide mb-3">
              Quy trình cải thiện
            </h3>
            <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-0">
              {HOUSEKEEPING_PROCESS_STEPS.map((step, i) => {
                const Icon = STEP_ICONS[step.icon]
                return (
                  <div key={step.id} className="flex items-center">
                    <div className="flex flex-col items-center gap-1 px-1 sm:px-2">
                      <div className="w-8 h-8 rounded-full bg-sky-500/10 border border-sky-500/30 flex items-center justify-center">
                        <Icon className="w-3.5 h-3.5 text-sky-400" />
                      </div>
                      <span className="text-[7px] sm:text-[8px] font-bold text-muted-foreground uppercase text-center max-w-[56px] leading-tight">
                        {step.label}
                      </span>
                    </div>
                    {i < HOUSEKEEPING_PROCESS_STEPS.length - 1 && (
                      <ChevronRight className="w-3 h-3 text-muted-foreground/40 hidden sm:block mx-0.5" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-[#0d1117] border border-[#1e2433] rounded-lg p-3 sm:p-4 flex flex-col gap-3">
            <h3 className="text-[10px] font-bold text-foreground uppercase tracking-wide">Báo cáo</h3>
            <div className="flex flex-col gap-1.5">
              {REPORT_BUTTONS.map(btn => (
                <button
                  key={btn.id}
                  type="button"
                  onClick={show}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-left',
                    'text-[9px] sm:text-[10px] font-medium text-muted-foreground',
                    'border border-[#1e2433] hover:border-sky-500/40 hover:text-foreground transition-colors',
                  )}
                >
                  <Lock className="w-3 h-3 shrink-0" />
                  {btn.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={show}
              className={cn(
                'mt-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg',
                'bg-sky-500/10 border border-sky-500/30 text-sky-400',
                'text-[10px] font-bold uppercase tracking-wide',
                'hover:bg-sky-500/20 transition-colors',
              )}
            >
              <Lock className="w-3.5 h-3.5" />
              <Download className="w-3.5 h-3.5" />
              Xuất Excel / PDF
            </button>
          </div>
        </div>
      )}

      <TrialLockPopup visible={visible} onDismiss={dismiss} />
    </>
  )
}
