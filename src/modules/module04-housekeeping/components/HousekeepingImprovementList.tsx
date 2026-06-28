import { useMemo, useState } from 'react'
import { AlertCircle, Bell, Search, Wrench } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useTrialLock } from '@/hooks/useTrialLock'
import { TrialLockPopup } from '@/components/common/TrialLock/TrialLockPopup'
import type { HousekeepingCategoryId } from '@/types/housekeeping'
import {
  filterImprovementList,
  getHousekeepingImprovementList,
} from '../services/housekeepingKpi.service'
import { HOUSEKEEPING_CATEGORY_SCORES } from '../data/housekeepingScores'

const SEVERITY_TABS = [
  { key: 'all' as const, label: 'Tất cả' },
  { key: 'high' as const, label: 'Cao' },
  { key: 'medium' as const, label: 'TB' },
]

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

interface HousekeepingImprovementListProps {
  categoryFilter?: HousekeepingCategoryId | null
  zoneFilter?: string | null
  onClearCategory?: () => void
  onClearZone?: () => void
}

export function HousekeepingImprovementList({
  categoryFilter = null,
  zoneFilter = null,
  onClearCategory,
  onClearZone,
}: HousekeepingImprovementListProps) {
  const [search, setSearch] = useState('')
  const [severity, setSeverity] = useState<'all' | 'high' | 'medium'>('all')
  const { visible, show, dismiss } = useTrialLock()

  const allItems = useMemo(() => getHousekeepingImprovementList(), [])

  const filtered = useMemo(
    () => filterImprovementList(allItems, {
      categoryId: categoryFilter,
      zoneId: zoneFilter,
      severity,
      search,
    }),
    [allItems, categoryFilter, zoneFilter, severity, search],
  )

  const categoryLabel = categoryFilter
    ? HOUSEKEEPING_CATEGORY_SCORES.find(c => c.id === categoryFilter)?.label
    : null

  const zoneLabel = zoneFilter
    ? zoneFilter.replace('khu-', 'Khu ').toUpperCase()
    : null

  const tabCounts = useMemo(() => {
    const base = filterImprovementList(allItems, {
      categoryId: categoryFilter,
      zoneId: zoneFilter,
      search,
    })
    return {
      all: base.length,
      high: base.filter(i => i.priority === 'high').length,
      medium: base.filter(i => i.priority === 'medium').length,
    }
  }, [allItems, categoryFilter, zoneFilter, search])

  return (
    <>
      <div className="flex flex-col h-full min-h-0">
        {(categoryFilter || zoneFilter) && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5 shrink-0">
            {categoryLabel && (
              <button
                type="button"
                onClick={onClearCategory}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/30 hover:bg-sky-500/20"
              >
                {categoryLabel} ×
              </button>
            )}
            {zoneLabel && (
              <button
                type="button"
                onClick={onClearZone}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/30 hover:bg-orange-500/20"
              >
                {zoneLabel} ×
              </button>
            )}
          </div>
        )}

        <div className="flex border-b border-[#1e2433] shrink-0 mb-2">
          {SEVERITY_TABS.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSeverity(tab.key)}
              className={cn(
                'flex-1 px-2 py-1.5 text-[9px] font-medium transition-colors border-b-2 -mb-px',
                severity === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
              {tabCounts[tab.key] > 0 && (
                <span className={cn(
                  'ml-1 px-1 py-0.5 rounded-full text-[8px] font-bold',
                  severity === tab.key ? 'bg-primary/20 text-primary' : 'bg-[#1a2235] text-muted-foreground',
                )}>
                  {tabCounts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="relative shrink-0 mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm vị trí, loại vấn đề..."
            className="w-full pl-7 pr-2 py-1.5 text-[10px] bg-[#0b0f1a] border border-[#1e2433] rounded-md text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
          />
        </div>

        <div className="flex flex-col gap-2 flex-1 min-h-0 max-h-[240px] lg:max-h-[220px] overflow-y-auto pr-1">
          {filtered.length === 0 && (
            <p className="text-[10px] text-muted-foreground text-center py-6">
              Không có vị trí phù hợp bộ lọc
            </p>
          )}
          {filtered.map(item => (
            <div
              key={item.id}
              className="flex items-start gap-2.5 p-2 rounded-lg border border-[#1e2433] bg-[#0b0f1a] hover:border-[#2a3855]/80 transition-colors"
            >
              <img
                src={item.thumbnailUrl}
                alt={item.issueType}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded object-cover shrink-0 border border-[#1e2433]"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[8px] font-bold text-orange-400 uppercase">
                    {item.zoneLabel}
                  </span>
                  {item.floorLabel && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="text-[8px] font-semibold text-orange-300/80 uppercase">
                        {item.floorLabel}
                      </span>
                    </>
                  )}
                </div>
                <p className="text-[10px] text-foreground font-medium mt-0.5 truncate">{item.issueType}</p>
                <p className="text-[8px] text-muted-foreground tabular-nums mt-0.5">
                  Phát hiện: {formatTime(item.detectedAt)}
                </p>
                <div className="flex items-center gap-1 mt-1.5">
                  <button
                    type="button"
                    onClick={show}
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-semibold text-sky-400 bg-sky-500/10 border border-sky-500/25 hover:bg-sky-500/20"
                  >
                    <Wrench className="w-2.5 h-2.5" />
                    Xử lý
                  </button>
                  <button
                    type="button"
                    onClick={show}
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-semibold text-muted-foreground bg-[#1a2235] border border-[#1e2433] hover:text-foreground"
                  >
                    <Bell className="w-2.5 h-2.5" />
                    Thông báo
                  </button>
                </div>
              </div>
              <AlertCircle
                className={cn(
                  'w-4 h-4 shrink-0 mt-0.5',
                  item.priority === 'high' ? 'text-red-400' : 'text-orange-400',
                )}
              />
            </div>
          ))}
        </div>
      </div>

      <TrialLockPopup visible={visible} onDismiss={dismiss} />
    </>
  )
}
