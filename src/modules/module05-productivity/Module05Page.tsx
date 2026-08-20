import { useMemo, useState } from 'react'
import {
  Users, Truck, MapPin, AlertTriangle, Maximize2, Minimize2,
} from 'lucide-react'
import { Header } from '@/components/common/Header/Header'
import { PageLayout, Tier1, Panel } from '@/components/common/PageLayout/PageLayout'
import { KPICard } from '@/components/common/KPICard/KPICard'
import {
  CameraModeToggle,
  type CameraPanelMode,
} from '@/components/common/CameraModeToggle/CameraModeToggle'
import { TierCollapseButton } from '@/modules/module02-training/components/TierCollapseButton'
import { TrainingCameraPanel } from '@/modules/module02-training/components/TrainingCameraPanel'
import { CameraPlaybackPanel } from '@/components/common/CameraPlayback'
import type { TrainingCamera } from '@/modules/module02-training/data/trainingCameras'
import { cn } from '@/utils/cn'
import {
  MOCK_PATROL_DASHBOARD,
  MOCK_PATROL_EVENTS,
  type PatrolEvent,
} from './data/patrolMockData'
import {
  DEFAULT_PATROL_CAMERA_IDS,
  PATROL_CAMERAS,
  PATROL_CAMERA_FILTER_TABS,
  filterPatrolCameras,
  groupPatrolCamerasForSidebar,
  type PatrolCameraFilterTab,
} from './data/patrolCameras'
import {
  fetchPatrolCameraRecords,
  fetchPatrolRecordDetections,
  getPatrolDefaultPlaybackDate,
} from './services/patrolCameraPlayback.service'
import { PatrolDensityHeatmap } from './components/PatrolDensityHeatmap'
import { PatrolEventsPanel } from './components/PatrolEventsPanel'
import { PatrolEventDetailModal } from './components/PatrolEventDetailModal'

/* ── Tier 1 KPIs ─────────────────────────────────────────────── */
function PatrolKPIs() {
  const d = MOCK_PATROL_DASHBOARD
  const events = MOCK_PATROL_EVENTS
  const totalAlerts = events.length
  const ppeCount = events.filter(e => e.type === 'PPE_VIOLATION').length
  const machineCount = events.filter(e => e.type === 'MACHINE_STOPPED').length

  const kpis = [
    {
      label: 'Khu vực tuần tra',
      value: `${d.visitedZones}/${d.totalZones}`,
      unit: 'khu vực',
      detail: `${d.coveragePercent}% diện tích đã phủ`,
      change: 0,
      changeType: 'neutral' as const,
      icon: MapPin,
      iconBg: 'bg-green-400/10',
      iconColor: 'text-green-400',
    },
    {
      label: 'Công nhân',
      value: d.uniquePeople,
      unit: 'người',
      detail: 'Unique trên công trường hôm nay',
      change: 12,
      changeType: 'increase' as const,
      previousValue: 171,
      icon: Users,
      iconBg: 'bg-sky-400/10',
      iconColor: 'text-sky-400',
    },
    {
      label: 'Máy móc',
      value: d.uniqueVehicles,
      unit: 'máy',
      detail: 'Máy unique đang hoạt động',
      change: 3,
      changeType: 'increase' as const,
      previousValue: 34,
      icon: Truck,
      iconBg: 'bg-amber-400/10',
      iconColor: 'text-amber-400',
    },
    {
      label: 'Cảnh báo',
      value: totalAlerts,
      unit: 'sự kiện',
      detail: `${ppeCount} PPE · ${machineCount} Machine`,
      change: 1,
      changeType: 'increase' as const,
      previousValue: totalAlerts - 1,
      icon: AlertTriangle,
      iconBg: 'bg-red-400/10',
      iconColor: 'text-red-400',
    },
  ]

  return (
    <>
      {kpis.map(k => {
        const { icon: Icon, iconBg, iconColor, ...kpiData } = k
        return (
          <KPICard
            key={k.label}
            data={kpiData}
            icon={Icon}
            iconBg={iconBg}
            iconColor={iconColor}
          />
        )
      })}
    </>
  )
}

/* ── Page ─────────────────────────────────────────────────────── */
export function Module05Page() {
  const [tier1Open, setTier1Open] = useState(true)
  const [tier2Open, setTier2Open] = useState(true)
  const [cameraMode, setCameraMode] = useState<CameraPanelMode>('live')
  const [selectedCamId, setSelectedCamId] = useState<string | undefined>('HC-01')
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [detailEventId, setDetailEventId] = useState<string | null>(null)
  const [activeStreamCount, setActiveStreamCount] = useState(2)
  const [tier3Focus, setTier3Focus] = useState<'none' | 'heatmap' | 'events'>('none')

  const playbackDate = getPatrolDefaultPlaybackDate()

  const detailEvent = useMemo(
    () => MOCK_PATROL_EVENTS.find(e => e.id === detailEventId) ?? null,
    [detailEventId],
  )

  const handleSelectCamera = (cam: TrainingCamera) => {
    setSelectedCamId(cam.id)
  }

  const handleSelectEvent = (ev: PatrolEvent) => {
    setSelectedEventId(ev.id)
    setSelectedCamId(ev.cameraId)
    setCameraMode('playback')
    setTier2Open(true)
  }

  return (
    <>
      <Header
        title="Hiệu Quả Công Việc"
        subtitle="Giám sát tuần tra helmet camera & mật độ lao động"
      />
      <PageLayout>
        {/* Tier 1 — KPIs */}
        <Panel
          title="Tổng Quan"
          fit
          expandable={tier1Open}
          noPadding
          className="shrink-0"
          headerRight={
            <TierCollapseButton
              open={tier1Open}
              onToggle={() => setTier1Open(o => !o)}
              label="Tổng Quan"
            />
          }
        >
          {tier1Open && (
            <div className="p-2 sm:p-3">
              <Tier1 className="grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
                <PatrolKPIs />
              </Tier1>
            </div>
          )}
        </Panel>

        {/* Tier 2 + Tier 3 — shared height pool */}
        <div className={cn(
          'flex flex-col gap-3',
          'max-lg:flex-none',
          'lg:flex-1 lg:min-h-0 lg:overflow-hidden',
        )}>
          {/* Tier 2 — Camera */}
          <div className={cn(
            'flex flex-col min-h-0',
            tier2Open
              ? cn(
                'max-lg:flex-none max-lg:min-h-[280px]',
                cameraMode === 'playback' ? 'lg:flex-[12]' : 'lg:flex-[10]',
              )
              : 'shrink-0',
          )}>
            <Panel
              title="Camera"
              expandable={tier2Open}
              fit={!tier2Open}
              noPadding
              className={cn(
                tier2Open && 'lg:flex-1 lg:min-h-[260px]',
                tier2Open && 'max-lg:!h-auto max-lg:min-h-[280px] max-lg:overflow-visible max-lg:[&>div:last-child]:!h-auto',
                tier2Open && 'max-lg:[&>div:last-child]:flex-none max-lg:[&>div:last-child]:overflow-visible max-lg:[&>div:last-child]:min-h-[240px]',
                !tier2Open && 'max-lg:!h-auto max-lg:min-h-0',
              )}
              headerRight={
                <div className="flex items-center gap-2 min-w-0">
                  {tier2Open && (
                    <CameraModeToggle mode={cameraMode} onChange={setCameraMode} />
                  )}
                  {!tier2Open && cameraMode === 'live' && (
                    <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                      <span className="text-primary font-semibold">{activeStreamCount}</span> luồng
                    </span>
                  )}
                  <TierCollapseButton
                    open={tier2Open}
                    onToggle={() => setTier2Open(o => !o)}
                    label="Camera"
                  />
                </div>
              }
            >
              {tier2Open && (
                <div className={cn(
                  'flex flex-col flex-1 min-h-0 h-full w-full max-lg:min-h-[240px]',
                  'max-lg:h-auto max-lg:flex-none',
                )}>
                  {cameraMode === 'live' ? (
                    <TrainingCameraPanel
                      selectedId={selectedCamId}
                      onSelectCamera={handleSelectCamera}
                      onStreamCountChange={setActiveStreamCount}
                      cameras={PATROL_CAMERAS}
                      defaultCameraIds={DEFAULT_PATROL_CAMERA_IDS}
                      filterTabs={[...PATROL_CAMERA_FILTER_TABS]}
                      filterFn={tab => filterPatrolCameras(tab as PatrolCameraFilterTab)}
                      groupFn={cams => groupPatrolCamerasForSidebar(cams)}
                    />
                  ) : (
                    <CameraPlaybackPanel
                      cameras={PATROL_CAMERAS}
                      selectedCameraId={selectedCamId}
                      onSelectCamera={handleSelectCamera}
                      defaultDate={playbackDate}
                      maxDate={playbackDate}
                      selectedRecordId={selectedEventId}
                      filterTabs={[...PATROL_CAMERA_FILTER_TABS]}
                      filterFn={tab => filterPatrolCameras(tab as PatrolCameraFilterTab)}
                      groupFn={cams => groupPatrolCamerasForSidebar(cams)}
                      fetchRecords={fetchPatrolCameraRecords}
                      fetchDetections={fetchPatrolRecordDetections}
                      videoAreaFlex={82}
                    />
                  )}
                </div>
              )}
            </Panel>
          </div>

          {/* Tier 3 — 2 separate panels: [HEATMAP] | [SỰ KIỆN] */}
          <div className={cn(
            'flex min-h-0 gap-2 sm:gap-3',
            'flex-col md:flex-row',
            'max-lg:flex-none',
            tier2Open ? 'lg:flex-[10]' : 'lg:flex-1',
          )}>
            {tier3Focus !== 'events' && (
              <Panel
                title="HEATMAP"
                noPadding
                className={cn(
                  'flex flex-col overflow-hidden',
                  'max-lg:!h-auto',
                  'lg:min-h-0 lg:h-full md:flex-[3]',
                  tier3Focus === 'heatmap' && 'flex-1',
                )}
                headerRight={
                  <button
                    onClick={() => setTier3Focus(f => f === 'heatmap' ? 'none' : 'heatmap')}
                    className="p-1.5 sm:p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                    title={tier3Focus === 'heatmap' ? 'Thu nhỏ' : 'Phóng to'}
                    aria-label={tier3Focus === 'heatmap' ? 'Thu nhỏ heatmap' : 'Phóng to heatmap'}
                  >
                    {tier3Focus === 'heatmap'
                      ? <Minimize2 className="w-3.5 h-3.5" />
                      : <Maximize2 className="w-3.5 h-3.5" />
                    }
                  </button>
                }
              >
                <PatrolDensityHeatmap />
              </Panel>
            )}

            {tier3Focus !== 'heatmap' && (
              <Panel
                title="SỰ KIỆN"
                noPadding
                className={cn(
                  'min-h-0 flex flex-col overflow-hidden',
                  'min-h-[220px] sm:min-h-[260px] md:min-h-0 md:flex-[2]',
                  tier3Focus === 'events' && 'flex-1',
                )}
                headerRight={
                  <button
                    onClick={() => setTier3Focus(f => f === 'events' ? 'none' : 'events')}
                    className="p-1.5 sm:p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                    title={tier3Focus === 'events' ? 'Thu nhỏ' : 'Phóng to'}
                    aria-label={tier3Focus === 'events' ? 'Thu nhỏ sự kiện' : 'Phóng to sự kiện'}
                  >
                    {tier3Focus === 'events'
                      ? <Minimize2 className="w-3.5 h-3.5" />
                      : <Maximize2 className="w-3.5 h-3.5" />
                    }
                  </button>
                }
              >
                <PatrolEventsPanel
                  events={MOCK_PATROL_EVENTS}
                  selectedId={selectedEventId}
                  onSelect={handleSelectEvent}
                  onSnapshotClick={ev => setDetailEventId(ev.id)}
                  onPlayback={handleSelectEvent}
                />
              </Panel>
            )}
          </div>
        </div>
      </PageLayout>

      <PatrolEventDetailModal
        event={detailEvent}
        onClose={() => setDetailEventId(null)}
        onPlayback={handleSelectEvent}
      />
    </>
  )
}
