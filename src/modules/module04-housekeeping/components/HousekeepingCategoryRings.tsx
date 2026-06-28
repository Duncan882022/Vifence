import { AlertCircle } from 'lucide-react'
import { cn } from '@/utils/cn'
import { getHousekeepingCategoryScores } from '../services/housekeepingKpi.service'
import { SCORE_TIER_LABELS } from '../data/housekeepingScores'
import type { HousekeepingCategoryId, ScoreTier } from '@/types/housekeeping'

const TIER_RING_COLORS: Record<ScoreTier, string> = {
  good: '#38bdf8',
  average: '#f97316',
  poor: '#ef4444',
}

const TIER_TEXT_COLORS: Record<ScoreTier, string> = {
  good: 'text-sky-400',
  average: 'text-orange-400',
  poor: 'text-red-400',
}

const PRIORITY_COLORS = {
  high: 'text-red-400',
  medium: 'text-orange-400',
} as const

interface CategoryRingProps {
  id: HousekeepingCategoryId
  label: string
  score: number
  tier: ScoreTier
  violationCount: number
  selected: boolean
  onSelect: (id: HousekeepingCategoryId) => void
}

function CategoryRing({
  id, label, score, tier, violationCount, selected, onSelect,
}: CategoryRingProps) {
  const pct = score
  const circumference = 2 * Math.PI * 28
  const offset = circumference - (pct / 100) * circumference
  const priorityColor = violationCount >= 4 ? PRIORITY_COLORS.high : PRIORITY_COLORS.medium

  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={cn(
        'flex flex-col items-center gap-2 min-w-0 flex-1 rounded-lg p-1.5 transition-colors',
        'hover:bg-[#1a2235]/50 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-500/50',
        selected && 'bg-sky-500/10 ring-1 ring-sky-500/40',
      )}
      title={`Lọc danh sách theo ${label}`}
    >
      <div className="relative w-16 h-16 sm:w-[72px] sm:h-[72px]">
        <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
          <circle cx="32" cy="32" r="28" fill="none" stroke="#1e2433" strokeWidth="5" />
          <circle
            cx="32"
            cy="32"
            r="28"
            fill="none"
            stroke={TIER_RING_COLORS[tier]}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn('text-xs sm:text-sm font-bold tabular-nums', TIER_TEXT_COLORS[tier])}>
            {score}
          </span>
        </div>
      </div>

      <div className="text-center min-w-0 w-full px-1">
        <p className="text-[8px] sm:text-[9px] font-bold text-foreground uppercase truncate">{label}</p>
        <p className={cn('text-[8px] font-semibold', TIER_TEXT_COLORS[tier])}>
          {SCORE_TIER_LABELS[tier]}
        </p>
        <div className={cn('inline-flex items-center gap-0.5 mt-0.5', priorityColor)}>
          <AlertCircle className="w-2.5 h-2.5" />
          <span className="text-[7px] sm:text-[8px] font-medium tabular-nums">
            {violationCount} VP
          </span>
        </div>
      </div>
    </button>
  )
}

interface HousekeepingCategoryRingsProps {
  selectedCategoryId?: HousekeepingCategoryId | null
  onSelectCategory?: (id: HousekeepingCategoryId | null) => void
}

export function HousekeepingCategoryRings({
  selectedCategoryId = null,
  onSelectCategory,
}: HousekeepingCategoryRingsProps) {
  const categories = getHousekeepingCategoryScores()

  const handleSelect = (id: HousekeepingCategoryId) => {
    onSelectCategory?.(selectedCategoryId === id ? null : id)
  }

  return (
    <div className="flex flex-wrap sm:flex-nowrap items-start justify-between gap-3 sm:gap-2 py-1">
      {categories.map(cat => (
        <CategoryRing
          key={cat.id}
          id={cat.id}
          label={cat.label}
          score={cat.score}
          tier={cat.tier}
          violationCount={cat.violationCount}
          selected={selectedCategoryId === cat.id}
          onSelect={handleSelect}
        />
      ))}
    </div>
  )
}
