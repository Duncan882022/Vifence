import { useState } from 'react'
import { PageLayout, Panel } from '@/components/common/PageLayout/PageLayout'
import { HousekeepingStatusPills } from '../components/HousekeepingStatusPills'
import { HousekeepingDetectionGrid } from '../components/HousekeepingDetectionGrid'
import { HousekeepingScorePanel } from '../components/HousekeepingScorePanel'
import { HousekeepingCategoryRings } from '../components/HousekeepingCategoryRings'
import { HousekeepingZoneHeatmap } from '../components/HousekeepingZoneHeatmap'
import { HousekeepingImprovementList } from '../components/HousekeepingImprovementList'
import { HousekeepingFooterRow } from '../components/HousekeepingFooterRow'

export function HousekeepingDashboardPage() {
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)

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
            <HousekeepingCategoryRings />
          </div>
        </Panel>

        <Panel title="Bản Đồ Vệ Sinh Theo Khu Vực" fit noPadding>
          <HousekeepingZoneHeatmap
            selectedZoneId={selectedZoneId}
            onSelectZone={setSelectedZoneId}
            compact
          />
        </Panel>

        <Panel title="Danh Sách Vị Trí Cần Cải Thiện" fit noPadding>
          <div className="p-3 sm:p-4">
            <HousekeepingImprovementList />
          </div>
        </Panel>
      </div>

      <HousekeepingFooterRow />
    </PageLayout>
  )
}
