import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Header } from '@/components/common/Header/Header'
import { PageLayout, Tier1, Tier2, Tier3, Panel } from '@/components/common/PageLayout/PageLayout'
import { KPICard } from '@/components/common/KPICard/KPICard'
import { CameraGrid } from '@/components/common/CameraGrid/CameraGrid'
import { EventList } from '@/components/common/EventList/EventList'
import { PlaybackPanel } from '@/components/common/PlaybackPanel/PlaybackPanel'
import {
  mockProductivityKPIs,
  mockCameras,
  mockEvents,
  mockContractors,
} from '@/services/mock-data'
import type { Event } from '@/types/event'
import type { Camera } from '@/types/camera'

const productivityData = [
  { hour: '07:00', workers: 45 },
  { hour: '08:00', workers: 62 },
  { hour: '09:00', workers: 67 },
  { hour: '10:00', workers: 65 },
  { hour: '11:00', workers: 60 },
  { hour: '13:00', workers: 58 },
  { hour: '14:00', workers: 64 },
  { hour: '15:00', workers: 66 },
]

export function Module05Page() {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null)

  return (
    <>
      <Header
        title="Hiệu Quả Công Việc"
        subtitle="Đánh giá hiệu suất và mật độ lao động"
      />
      <PageLayout>
        <Tier1>
          {mockProductivityKPIs.map((kpi, i) => (
            <KPICard key={i} data={kpi} />
          ))}
        </Tier1>

        <Tier2>
          <Panel title="Camera Giám Sát" className="h-[360px]">
            <CameraGrid
              cameras={mockCameras}
              selectedCameraId={selectedCamera?.id}
              onSelectCamera={setSelectedCamera}
            />
          </Panel>
          <Panel title="Sự Kiện" className="h-[360px]">
            <EventList
              events={mockEvents}
              selectedEventId={selectedEvent?.id}
              onSelectEvent={setSelectedEvent}
            />
          </Panel>
        </Tier2>

        <Tier3>
          <PlaybackPanel event={selectedEvent} className="h-[480px]" />
          <Panel title="Mật Độ Lao Động Theo Giờ" className="h-[480px]">
            <div className="space-y-4 h-full overflow-y-auto">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={productivityData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
                    <XAxis dataKey="hour" tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(222 84% 8%)', border: '1px solid hsl(217 33% 17%)', borderRadius: '6px', fontSize: '12px' }}
                      labelStyle={{ color: 'hsl(210 40% 98%)' }}
                    />
                    <Bar dataKey="workers" fill="hsl(212 100% 47%)" radius={[2, 2, 0, 0]} name="Lao động" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Theo Nhà Thầu</p>
                <div className="space-y-2">
                  {mockContractors.map((c) => {
                    const activeHours = (7 + Math.random()).toFixed(1)
                    return (
                      <div key={c.id} className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-foreground truncate">{c.name}</span>
                            <span className="text-muted-foreground shrink-0">{activeHours}h / ngày</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-1.5">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${(Number(activeHours) / 9) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </Panel>
        </Tier3>
      </PageLayout>
    </>
  )
}
