import { useState } from 'react'
import { Header } from '@/components/common/Header/Header'
import { PageLayout, Tier1, Tier2, Tier3, Panel } from '@/components/common/PageLayout/PageLayout'
import { KPICard } from '@/components/common/KPICard/KPICard'
import { CameraGrid } from '@/components/common/CameraGrid/CameraGrid'
import { EventList } from '@/components/common/EventList/EventList'
import { PlaybackPanel } from '@/components/common/PlaybackPanel/PlaybackPanel'
import { StatusBadge } from '@/components/common/StatusBadge/StatusBadge'
import {
  mockHousekeepingKPIs,
  mockCameras,
  mockEvents,
} from '@/services/mock-data'
import type { Event } from '@/types/event'
import type { Camera } from '@/types/camera'
import { formatDateTime } from '@/utils/format'

const housekeepingEvents = mockEvents.filter(e => e.module === 'housekeeping' || e.severity !== 'critical')

const housekeepingIssues = [
  { id: 'h-01', type: 'Rác tồn đọng', location: 'Tầng 1 Khu A', camera: 'Camera Tầng 1 Khu A', timestamp: '2026-06-24T10:15:00', status: 'pending' as const },
  { id: 'h-02', type: 'Vật liệu sai vị trí', location: 'Tầng 3 Khu B', camera: 'Camera Tầng 3 Khu B', timestamp: '2026-06-24T09:00:00', status: 'processed' as const },
  { id: 'h-03', type: 'Lối đi bị chiếm dụng', location: 'Kho Vật Tư', camera: 'Camera Kho Vật Tư', timestamp: '2026-06-24T08:30:00', status: 'processed' as const },
  { id: 'h-04', type: 'Khu vực mất vệ sinh', location: 'Cổng Phụ', camera: 'Camera Cổng Phụ', timestamp: '2026-06-24T11:00:00', status: 'pending' as const },
]

export function Module04Page() {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null)

  return (
    <>
      <Header
        title="Vệ Sinh Công Trường"
        subtitle="Giám sát và xử lý sự cố vệ sinh"
      />
      <PageLayout>
        <Tier1>
          {mockHousekeepingKPIs.map((kpi, i) => (
            <KPICard key={i} data={kpi} />
          ))}
        </Tier1>

        <Tier2>
          <Panel title="Camera Giám Sát Vệ Sinh" className="h-[360px]">
            <CameraGrid
              cameras={mockCameras}
              selectedCameraId={selectedCamera?.id}
              onSelectCamera={setSelectedCamera}
            />
          </Panel>
          <Panel title="Sự Cố Vệ Sinh" className="h-[360px]">
            <EventList
              events={housekeepingEvents}
              selectedEventId={selectedEvent?.id}
              onSelectEvent={setSelectedEvent}
            />
          </Panel>
        </Tier2>

        <Tier3>
          <PlaybackPanel event={selectedEvent} className="h-[480px]" />
          <Panel title="Danh Sách Sự Cố" className="h-[480px]">
            <div className="space-y-2 overflow-y-auto h-full">
              {housekeepingIssues.map((issue) => (
                <div key={issue.id} className="p-3 rounded-md bg-muted/50 border border-border">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{issue.type}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{issue.location}</p>
                      <p className="text-[11px] text-muted-foreground">{issue.camera} · {formatDateTime(issue.timestamp)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <StatusBadge
                        variant={issue.status === 'pending' ? 'warning' : 'success'}
                        label={issue.status === 'pending' ? 'Chưa xử lý' : 'Đã xử lý'}
                      />
                      {issue.status === 'pending' && (
                        <button className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                          Xử lý
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </Tier3>
      </PageLayout>
    </>
  )
}
