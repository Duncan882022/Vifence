import { useState } from 'react'
import { Search } from 'lucide-react'
import { Header } from '@/components/common/Header/Header'
import { PageLayout, Tier1, Tier2, Panel } from '@/components/common/PageLayout/PageLayout'
import { KPICard } from '@/components/common/KPICard/KPICard'
import { CameraGrid } from '@/components/common/CameraGrid/CameraGrid'
import { StatusBadge } from '@/components/common/StatusBadge/StatusBadge'
import { mockCameras } from '@/services/mock-data'
import type { Camera } from '@/types/camera'
import type { KPIData } from '@/types/api'
import { formatDateTime } from '@/utils/format'

const assetsKPIs: KPIData[] = [
  { label: 'Thiết bị hoạt động', value: 24, unit: 'thiết bị', change: 2, changeType: 'increase' },
  { label: 'Thiết bị dừng', value: 3, unit: 'thiết bị', change: -1, changeType: 'decrease' },
  { label: 'Thiết bị sai vị trí', value: 1, unit: 'thiết bị', change: 1, changeType: 'increase' },
  { label: 'Xuất/nhập hôm nay', value: 12, unit: 'lượt', change: 3, changeType: 'increase' },
]

const assets = [
  { id: 'a-01', name: 'Máy Trộn Bê Tông #1', code: 'TB001', type: 'equipment', status: 'active', location: 'Khu A', lastSeen: '2026-06-24T11:00:00' },
  { id: 'a-02', name: 'Xe Cẩu #1', code: 'XC001', type: 'vehicle', status: 'active', location: 'Khu B', lastSeen: '2026-06-24T10:30:00' },
  { id: 'a-03', name: 'Máy Khoan #3', code: 'MK003', type: 'equipment', status: 'inactive', location: 'Kho', lastSeen: '2026-06-24T08:00:00' },
  { id: 'a-04', name: 'Giàn Giáo Bộ A', code: 'GG001', type: 'material', status: 'misplaced', location: 'Khu D', lastSeen: '2026-06-24T09:15:00' },
  { id: 'a-05', name: 'Máy Hàn #2', code: 'MH002', type: 'equipment', status: 'active', location: 'Khu C', lastSeen: '2026-06-24T11:30:00' },
]

const statusVariantMap: Record<string, 'success' | 'neutral' | 'danger' | 'warning'> = {
  active: 'success',
  inactive: 'neutral',
  misplaced: 'danger',
  maintenance: 'warning',
}

const statusLabelMap: Record<string, string> = {
  active: 'Hoạt động',
  inactive: 'Dừng',
  misplaced: 'Sai vị trí',
  maintenance: 'Bảo trì',
}

export function Module06Page() {
  const [search, setSearch] = useState('')
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null)

  const filtered = assets.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.code.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <>
      <Header
        title="Vật Tư Thiết Bị"
        subtitle="Quản lý và theo dõi thiết bị công trường"
      />
      <PageLayout>
        <Tier1>
          {assetsKPIs.map((kpi, i) => (
            <KPICard key={i} data={kpi} />
          ))}
        </Tier1>

        <Tier2>
          <Panel title="Camera Giám Sát Thiết Bị" className="h-[400px]">
            <CameraGrid
              cameras={mockCameras}
              selectedCameraId={selectedCamera?.id}
              onSelectCamera={setSelectedCamera}
            />
          </Panel>
          <Panel
            title="Danh Sách Thiết Bị"
            className="h-[400px]"
            headerRight={
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Tìm kiếm..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-muted border border-border rounded px-6 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground"
                />
              </div>
            }
          >
            <div className="space-y-2 overflow-y-auto h-full">
              {filtered.map((asset) => (
                <div key={asset.id} className="p-3 rounded-md bg-muted/50 border border-border">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{asset.name}</p>
                      <p className="text-xs text-muted-foreground">{asset.code} · {asset.location}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Cập nhật: {formatDateTime(asset.lastSeen)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge
                        variant={statusVariantMap[asset.status]}
                        label={statusLabelMap[asset.status]}
                      />
                      <button className="text-[10px] text-primary hover:underline">Xem playback</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </Tier2>
      </PageLayout>
    </>
  )
}
