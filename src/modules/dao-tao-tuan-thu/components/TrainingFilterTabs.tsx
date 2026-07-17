import { cn } from '@/utils/cn'
import { TRAINING_TAB_BAR } from './trainingListStates'

export interface TrainingFilterTab {
  key: string
  label: string
  count: number
}

interface TrainingFilterTabsProps {
  tabs: TrainingFilterTab[]
  activeKey: string
  onChange: (key: string) => void
}

function tabButtonClass(active: boolean) {
  return cn(
    'px-2.5 py-2 text-[10px] font-medium whitespace-nowrap shrink-0 transition-colors border-b-2 -mb-px',
    active
      ? 'border-primary text-primary'
      : 'border-transparent text-muted-foreground hover:text-foreground',
  )
}

function tabCountClass(active: boolean) {
  return cn(
    'ml-1 px-1 py-0.5 rounded-full text-[8px] font-bold tabular-nums',
    active ? 'bg-primary/20 text-primary' : 'bg-[#1a2235] text-muted-foreground',
  )
}

export function TrainingFilterTabs({ tabs, activeKey, onChange }: TrainingFilterTabsProps) {
  return (
    <div className={TRAINING_TAB_BAR}>
      {tabs.map(t => {
        const active = activeKey === t.key
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={tabButtonClass(active)}
          >
            {t.label}
            <span className={tabCountClass(active)}>{t.count}</span>
          </button>
        )
      })}
    </div>
  )
}
