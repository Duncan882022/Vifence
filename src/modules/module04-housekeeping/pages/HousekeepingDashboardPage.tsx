import { useCallback, useState } from 'react'
import { PageLayout, Panel } from '@/components/common/PageLayout/PageLayout'
import { HousekeepingStatusPills } from '../components/HousekeepingStatusPills'
import { HousekeepingDetectionGrid } from '../components/HousekeepingDetectionGrid'
import { HousekeepingScorePanel } from '../components/HousekeepingScorePanel'
import { HousekeepingCategoryRings } from '../components/HousekeepingCategoryRings'
import { HousekeepingZoneHeatmap } from '../components/HousekeepingZoneHeatmap'
import { HousekeepingImprovementList } from '../components/HousekeepingImprovementList'
import { HousekeepingFooterRow } from '../components/HousekeepingFooterRow'
import { resolveMainZoneId } from '../services/housekeepingHeatmap.service'
import type { HousekeepingCategoryId } from '@/types/housekeeping'

export function HousekeepingDashboardPage() {
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<HousekeepingCategoryId | null>(null)

  const resolvedZoneFilter = selectedZoneId ? resolveMainZoneId(selectedZoneId) : null

  const handleSelectCategory = useCallback((id: HousekeepingCategoryId | null) => {
    setSelectedCategoryId(id)
  }, [])

  return (
    <PageLayout scrollable>
      <HousekeepingStatusPills />

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
