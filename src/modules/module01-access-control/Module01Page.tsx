import { useState } from 'react'
import { Users, LogIn, LogOut, UserCheck } from 'lucide-react'
import { Header } from '@/components/common/Header/Header'
import { PageLayout, Tier1, Tier2, Tier3, Panel } from '@/components/common/PageLayout/PageLayout'
import { KPICard } from '@/components/common/KPICard/KPICard'
import { CameraGrid } from '@/components/common/CameraGrid/CameraGrid'
import { EventList } from '@/components/common/EventList/EventList'
import { PlaybackPanel } from '@/components/common/PlaybackPanel/PlaybackPanel'
import { StatusBadge } from '@/components/common/StatusBadge/StatusBadge'
import {
  mockAccessControlKPIs,
  mockCameras,
  mockEvents,
  mockContractors,
} from '@/services/mock-data'
import type { Event } from '@/types/event'
import type { Camera } from '@/types/camera'
import { formatNumber } from '@/utils/format'

const accessControlEvents = mockEvents.filter(e => e.module === 'access-control' || true)

export function Module01Page() {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null)

  return (
    <>
      <Header
        title="Kiểm Soát Vào Ra"
        subtitle="Quản lý hiện diện nhân sự công trường"
      />
      <PageLayout>
        {(() => {
          const icons = [
            { icon: Users, iconColor: 'text-blue-400', iconBg: 'bg-blue-500/10' },
            { icon: LogIn, iconColor: 'text-green-400', iconBg: 'bg-green-500/10' },
            { icon: LogOut, iconColor: 'text-orange-400', iconBg: 'bg-orange-500/10' },
            { icon: UserCheck, iconColor: 'text-purple-400', iconBg: 'bg-purple-500/10' },
          ]
          return (
            <Tier1>
              {mockAccessControlKPIs.map((kpi, i) => (
                <KPICard key={i} data={kpi} {...icons[i]} />
              ))}
            </Tier1>
          )
        })()}

        <Tier2>
          <Panel title="Camera Giám Sát">
            <CameraGrid
              cameras={mockCameras}
              selectedCameraId={selectedCamera?.id}
              onSelectCamera={setSelectedCamera}
            />
          </Panel>
          <Panel title="Sự Kiện">
            <EventList
              events={accessControlEvents}
              selectedEventId={selectedEvent?.id}
              onSelectEvent={setSelectedEvent}
            />
          </Panel>
        </Tier2>

        <Tier3>
          <PlaybackPanel event={selectedEvent} />
          <Panel title="Nhà Thầu Hiện Diện">
            <div className="space-y-2 overflow-y-auto flex-1 min-h-0">
              {mockContractors.map((c) => {
                const pct = Math.round((c.presentWorkers / c.totalWorkers) * 100)
                return (
                  <div key={c.id} className="p-3 rounded-md bg-muted/50 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                      <StatusBadge
                        variant={pct >= 80 ? 'success' : pct >= 60 ? 'warning' : 'danger'}
                        label={`${pct}%`}
                      />
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Hiện diện: <strong className="text-foreground">{c.presentWorkers}</strong></span>
                      <span>Tổng: <strong className="text-foreground">{c.totalWorkers}</strong></span>
                    </div>
                    <div className="mt-2 w-full bg-muted rounded-full h-1.5">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}

              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Tổng Quan</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-muted/50 rounded-md p-3 text-center">
                    <p className="text-2xl font-bold text-foreground">
                      {formatNumber(mockContractors.reduce((s, c) => s + c.presentWorkers, 0))}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">Tổng hiện diện</p>
                  </div>
                  <div className="bg-muted/50 rounded-md p-3 text-center">
                    <p className="text-2xl font-bold text-foreground">
                      {mockContractors.length}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">Nhà thầu</p>
                  </div>
                </div>
              </div>
            </div>
          </Panel>
        </Tier3>
      </PageLayout>
    </>
  )
}
