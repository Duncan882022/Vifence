import { useCallback, useMemo, useState } from 'react'
import { PageLayout, Panel } from '@/components/common/PageLayout/PageLayout'
import { TierCollapseButton } from '@/modules/module02-training/components/TierCollapseButton'
import { HousekeepingStatusPills } from '../components/HousekeepingStatusPills'
import { HousekeepingDetectionGrid } from '../components/HousekeepingDetectionGrid'
import { HousekeepingScorePanel } from '../components/HousekeepingScorePanel'
import { HousekeepingCategoryRings } from '../components/HousekeepingCategoryRings'
import { HousekeepingZoneHeatmap } from '../components/HousekeepingZoneHeatmap'
import { HousekeepingImprovementList } from '../components/HousekeepingImprovementList'
import { HousekeepingFooterRow } from '../components/HousekeepingFooterRow'
import { HousekeepingKpiStrip } from '../components/dashboard/HousekeepingKpiStrip'
import { HousekeepingGroupGrid } from '../components/dashboard/HousekeepingGroupGrid'
import { HousekeepingEventsPanel } from '../components/dashboard/HousekeepingEventsPanel'
import { resolveMainZoneId } from '../services/housekeepingHeatmap.service'
import {
  computeHousekeepingDashboardKpis,
  computeHousekeepingGroupStats,
  filterHousekeepingEvents,
} from '../services/housekeepingDashboard.service'
import { getAllHousekeepingEventRecords } from '../data/housekeepingEventRecords'
import { HOUSEKEEPING_AI_CONFIG, HOUSEKEEPING_ROI_ZONES } from '../data/housekeepingRoiConfig'
import { mergeHousekeepingRecordsWithAi } from '../services/housekeepingAiEvents.service'
import { useHousekeepingAiEvents } from '../hooks/useHousekeepingAiEvents'
import type { HousekeepingCategoryId } from '@/types/housekeeping'
import type { HousekeepingAiGroupId, HousekeepingDashboardFilters } from '../types/housekeepingAi.types'
import { cn } from '@/utils/cn'

const DEFAULT_FILTERS: HousekeepingDashboardFilters = {
  dateRange: 'today',
  groupId: null,
  scenarioId: null,
  status: null,
  roiType: null,
}

export function HousekeepingDashboardPage() {
  const [tier1Open, setTier1Open] = useState(true)
  const [tierAiOpen, setTierAiOpen] = useState(true)
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<HousekeepingCategoryId | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<HousekeepingAiGroupId | null>(null)
  const [filters] = useState(DEFAULT_FILTERS)

  const aiLiveRecords = useHousekeepingAiEvents(5000)

  const allEvents = useMemo(
    () => mergeHousekeepingRecordsWithAi(getAllHousekeepingEventRecords(), aiLiveRecords),
    [aiLiveRecords],
  )
  const scopedEvents = useMemo(
    () => filterHousekeepingEvents(allEvents, filters),
    [allEvents, filters],
  )
  const kpis = useMemo(() => computeHousekeepingDashboardKpis(scopedEvents), [scopedEvents])
  const groupStats = useMemo(() => computeHousekeepingGroupStats(scopedEvents), [scopedEvents])

  const resolvedZoneFilter = selectedZoneId ? resolveMainZoneId(selectedZoneId) : null

  const handleSelectCategory = useCallback((id: HousekeepingCategoryId | null) => {
    setSelectedCategoryId(id)
  }, [])

  return (
    <PageLayout scrollable>
      <HousekeepingStatusPills />

      {/* Tier 1 — KPI Logistics + Housekeeping AI */}
      <Panel
        title="Tổng Quan AI"
        fit
        noPadding
        headerRight={(
          <TierCollapseButton label="Tổng quan" open={tier1Open} onToggle={() => setTier1Open(v => !v)} />
        )}
      >
        {tier1Open && (
          <div className="p-3 sm:p-4">
            <HousekeepingKpiStrip kpis={kpis} embedded />
            <div className="mt-3 flex flex-wrap gap-2 text-[8px] text-muted-foreground">
              <span className="px-1.5 py-0.5 rounded border border-[#1e2433] bg-[#0b0f1a]">
                ROI: {HOUSEKEEPING_ROI_ZONES.length} vùng
              </span>
              <span className="px-1.5 py-0.5 rounded border border-[#1e2433] bg-[#0b0f1a]">
                Chiếm dụng: {HOUSEKEEPING_AI_CONFIG.roadOccupancyMinutes} phút
              </span>
              <span className="px-1.5 py-0.5 rounded border border-[#1e2433] bg-[#0b0f1a]">
                Chu kỳ: {HOUSEKEEPING_AI_CONFIG.checkIntervalSeconds}s
              </span>
              <span className="px-1.5 py-0.5 rounded border border-[#1e2433] bg-[#0b0f1a]">
                {kpis.totalEvents} sự kiện · {kpis.closedCount} đã đóng
              </span>
            </div>
          </div>
        )}
      </Panel>

      {/* Tier 2 — Nhóm kịch bản + Sự kiện */}
      <div className={cn('grid grid-cols-1 xl:grid-cols-2 gap-3', !tierAiOpen && 'hidden')}>
        <Panel
          title="Kịch Bản AI (LOG · HK)"
          fit
          noPadding
          className="min-h-[280px]"
          headerRight={(
            <TierCollapseButton label="Kịch bản" open={tierAiOpen} onToggle={() => setTierAiOpen(v => !v)} />
          )}
        >
          <div className="p-2 sm:p-3 h-full min-h-[240px]">
            <HousekeepingGroupGrid
              stats={groupStats}
              selectedGroupId={selectedGroupId}
              onSelectGroup={setSelectedGroupId}
            />
          </div>
        </Panel>

        <Panel title="Sự Kiện" fit noPadding className="min-h-[280px]">
          <div className="p-2 sm:p-3 h-full min-h-[240px] flex flex-col">
            <HousekeepingEventsPanel
              all={scopedEvents}
              selectedGroupId={selectedGroupId}
            />
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-3">
        <Panel title="AI Phát Hiện Các Vấn Đề Vệ Sinh" fit noPadding className="!overflow-visible">
          <div className="p-3 sm:p-4">
            <HousekeepingDetectionGrid />
          </div>
        </Panel>

        <Panel title="Housekeeping Score & Trends" fit noPadding className="!overflow-visible">
          <div className="p-3 sm:p-4">
            <HousekeepingScorePanel />
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_0.75fr] gap-3">
        <Panel title="Chỉ Số Chi Tiết Theo Hạng Mục" fit noPadding>
          <div className="p-3 sm:p-4">
            <HousekeepingCategoryRings
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={handleSelectCategory}
            />
          </div>
        </Panel>

        <Panel
          title="Bản Đồ Vệ Sinh Theo Khu Vực"
          fit
          noPadding
          headerRight={selectedZoneId ? (
            <button
              type="button"
              onClick={() => setSelectedZoneId(null)}
              className="text-[9px] text-sky-400 hover:text-sky-300 px-1.5 py-0.5 rounded hover:bg-sky-500/10"
            >
              Bỏ lọc
            </button>
          ) : undefined}
        >
          <HousekeepingZoneHeatmap
            selectedZoneId={selectedZoneId}
            onSelectZone={setSelectedZoneId}
            compact
          />
        </Panel>

        <Panel title="Danh Sách Vị Trí Cần Cải Thiện" fit noPadding>
          <div className="p-3 sm:p-4">
            <HousekeepingImprovementList
              categoryFilter={selectedCategoryId}
              zoneFilter={resolvedZoneFilter}
              onClearCategory={() => setSelectedCategoryId(null)}
              onClearZone={() => setSelectedZoneId(null)}
            />
          </div>
        </Panel>
      </div>

      <HousekeepingFooterRow />
    </PageLayout>
  )
}
