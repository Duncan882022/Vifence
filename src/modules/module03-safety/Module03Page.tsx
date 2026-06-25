import { useState } from 'react'
import { Header } from '@/components/common/Header/Header'
import { PageLayout, Tier1, Tier2, Tier3, Panel } from '@/components/common/PageLayout/PageLayout'
import { KPICard } from '@/components/common/KPICard/KPICard'
import { CameraGrid } from '@/components/common/CameraGrid/CameraGrid'
import { EventList } from '@/components/common/EventList/EventList'
import { PlaybackPanel } from '@/components/common/PlaybackPanel/PlaybackPanel'
import { StatusBadge } from '@/components/common/StatusBadge/StatusBadge'
import {
  mockSafetyKPIs,
  mockCameras,
  mockEvents,
  mockSafetyViolations,
} from '@/services/mock-data'
import type { Event } from '@/types/event'
import type { Camera } from '@/types/camera'
import { formatDateTime } from '@/utils/format'

const safetyEvents = mockEvents.filter(e => e.module === 'safety' || e.severity === 'critical')

const violationTypeLabels: Record<string, string> = {
  'no-helmet': 'Không đội mũ',
  'no-vest': 'Không áo phản quang',
  'no-harness': 'Không dây an toàn',
  'danger-zone': 'Vào vùng nguy hiểm',
  'work-at-height': 'Làm việc trên cao',
}

const topViolators = [
  { name: 'Công ty Cơ Điện DEF', count: 5 },
  { name: 'Công ty Xây dựng ABC', count: 3 },
  { name: 'Công ty Hoàn Thiện GHI', count: 1 },
]

export function Module03Page() {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null)

  return (
    <>
      <Header
        title="Giám Sát An Toàn"
        subtitle="Phát hiện và xử lý vi phạm an toàn lao động"
      />
      <PageLayout>
        <Tier1>
          {mockSafetyKPIs.map((kpi, i) => (
            <KPICard key={i} data={kpi} />
          ))}
        </Tier1>

        <Tier2>
          <Panel title="Camera Giám Sát An Toàn" className="h-[360px]">
            <CameraGrid
              cameras={mockCameras}
              selectedCameraId={selectedCamera?.id}
              onSelectCamera={setSelectedCamera}
            />
          </Panel>
          <Panel title="Vi Phạm An Toàn" className="h-[360px]">
            <EventList
              events={safetyEvents}
              selectedEventId={selectedEvent?.id}
              onSelectEvent={setSelectedEvent}
            />
          </Panel>
        </Tier2>

        <Tier3>
          <PlaybackPanel event={selectedEvent} className="h-[480px]" />
          <Panel title="Thống Kê Vi Phạm" className="h-[480px]">
            <div className="space-y-4 overflow-y-auto h-full">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Vi Phạm Gần Đây</p>
                <div className="space-y-2">
                  {mockSafetyViolations.map((v) => (
                    <div key={v.id} className="p-3 rounded-md bg-muted/50 border border-border">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-xs font-medium text-foreground">{violationTypeLabels[v.type]}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{v.workerName} · {v.contractorName}</p>
                          <p className="text-[11px] text-muted-foreground">{v.location} · {formatDateTime(v.timestamp)}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <StatusBadge
                            variant={v.status === 'pending' ? 'danger' : 'success'}
                            label={v.status === 'pending' ? 'Chưa xử lý' : 'Đã xử lý'}
                          />
                          {v.status === 'pending' && (
                            <button className="text-[10px] text-primary hover:underline">Xử lý</button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Top Nhà Thầu Vi Phạm</p>
                <div className="space-y-2">
                  {topViolators.map((v, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-foreground truncate">{v.name}</span>
                          <span className="text-red-400 font-medium shrink-0">{v.count} vi phạm</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1">
                          <div
                            className="h-full rounded-full bg-red-500"
                            style={{ width: `${(v.count / topViolators[0].count) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Panel>
        </Tier3>
      </PageLayout>
    </>
  )
}
