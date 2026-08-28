import { useEffect, useMemo, useState } from 'react'
import {
  Users, MapPin, Footprints, ScanFace, UserX,
} from 'lucide-react'
import { Header } from '@/components/common/Header/Header'
import { PageLayout, Tier1, Panel } from '@/components/common/PageLayout/PageLayout'
import { KPICard } from '@/components/common/KPICard/KPICard'
import {
  CameraModeToggle,
  type CameraPanelMode,
} from '@/components/common/CameraModeToggle/CameraModeToggle'
import { TierCollapseButton } from '@/modules/module02-training/components/TierCollapseButton'
import { PatrolCameraPanel } from './components/PatrolCameraPanel'
import { CameraPlaybackPanel } from '@/components/common/CameraPlayback'
import type { TrainingCamera } from '@/modules/module02-training/data/trainingCameras'
import { isHandheldDevice } from '@/modules/module02-training/services/deviceCamera.service'
import { cn } from '@/utils/cn'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useTabletLandscape } from '@/hooks/useTabletLandscape'
import { useAppStore } from '@/store/app.store'
import {
  getPatrolMobileLiveSnapshot,
  subscribePatrolMobileLiveSnapshot,
} from '@/services/patrolMobileMetricsBridge'
import {
  getPatrolCameraFramesLiveMap,
  subscribePatrolCameraFramesLive,
} from '@/services/patrolCameraFrameBridge'
import {
  type PatrolEvent,
} from './data/patrolTypes'
import {
  DEFAULT_PATROL_CAMERA_IDS,
  DEFAULT_PATROL_GRID_CAMERA_IDS,
  PATROL_CAMERAS,
  PATROL_CAMERA_FILTER_TABS,
  applyPatrolCameraStreamStatus,
  filterPatrolCameras,
  groupPatrolCamerasForSidebar,
  type PatrolCameraFilterTab,
} from './data/patrolCameras'
import { PATROL_DRONE_IDS } from './data/patrolDrones'
import { PATROL_GPS_ZONES } from './data/patrolSiteMap'
import {
  mergePatrolCamerasWithVisionLive,
  applyPatrolHelmetEnvLive,
  applyPatrolHelmetMobileLive,
  applyPatrolUnifiedLiveRouting,
} from './data/patrolHelmetStreams'
import { useCameras } from '@/modules/dao-tao-tuan-thu/hooks/useCameras'
import { usePatrolDayBundle } from './hooks/usePatrolDayBundle'
import {
  fetchPatrolPlaybackRecords,
  fetchPatrolPlaybackDetections,
  getPatrolDefaultPlaybackDate,
} from './services/patrolPlayback.service'
import { PatrolDensityHeatmap } from './components/PatrolDensityHeatmap'
import { PatrolDevicePermissionGate } from './components/PatrolDevicePermissionGate'
import { hasLegacyMobileHelmet, legacyMobileHelmetIds } from './data/helmetIngest'
import { PatrolEventsPanel } from './components/PatrolEventsPanel'
import { PatrolEventDetailModal } from './components/PatrolEventDetailModal'
import { usePatrolHelmetLiveMetrics, type PatrolHelmetLiveMetrics } from './hooks/usePatrolHelmetLiveMetrics'
import { usePatrolFlycamFlightModes } from './hooks/usePatrolFlycamFlightModes'
import { filterPatrolEventsByFlycamAltitude } from './utils/patrolFlycamEventFilter'
import { patrolFlightModeLabel } from './utils/patrolFlightMode'
import { useWorkforceRealtimeState } from './hooks/useWorkforceRealtimeState'
import type { PatrolDayStats } from './services/patrolDayEvents.service'
import { syncPatrolIdentityBindingsFromBackend } from './services/patrolManualIdentity.service'
import { ensurePatrolAuth } from '@/services/patrolApiClient'
import type { WorkforceSnapshot } from './types/workforceHeatmap'
import { PATROL_PERSON_STAGE_META } from './utils/patrolWorkforceEventLabels'

function PatrolWorkersKpiDetail({
  personCount,
  identityCount,
}: {
  personCount: number
  identityCount: number
}) {
  const IdentityIcon = PATROL_PERSON_STAGE_META.profile.icon

  return (
    <span className="inline-flex items-center gap-x-2 gap-y-0.5 flex-wrap text-[10px]">
      {personCount > 0 && (
        <span className="inline-flex items-center gap-0.5 tabular-nums text-sky-400">
          <UserX className="w-3 h-3 shrink-0" aria-hidden />
          <span className="font-semibold">{personCount}</span>
        </span>
      )}
      {identityCount > 0 && (
        <span className={cn(
          'inline-flex items-center gap-0.5 tabular-nums',
          PATROL_PERSON_STAGE_META.profile.color,
        )}>
          <IdentityIcon className="w-3 h-3 shrink-0" aria-hidden />
          <span className="font-semibold">{identityCount}</span>
        </span>
      )}
    </span>
  )
}

function PatrolKPIs({
  live,
  workforce,
  stats,
}: {
  live: PatrolHelmetLiveMetrics
  workforce: WorkforceSnapshot
  stats: PatrolDayStats
}) {
  const zoneEntries = Object.values(workforce.zonePopulation)
  const visitedZones = zoneEntries.filter(
    z => z.observed_count > 0 || z.kpi.peak > 0,
  ).length
  const totalZones = zoneEntries.length > 0 ? zoneEntries.length : PATROL_GPS_ZONES.length
  const coveragePercent = totalZones > 0
    ? Math.round((visitedZones / totalZones) * 100)
    : 0

  const anyCameraOnline = live.perCamera.some(row => row.stream_online)

  const workersDetailContent = stats.workersStandard > 0
    ? (
      <PatrolWorkersKpiDetail
        personCount={stats.personCount}
        identityCount={stats.identityCount}
      />
    )
    : undefined

  const workersDetailFallback = stats.workersStandard > 0
    ? undefined
    : anyCameraOnline
      ? live.backendReachable || live.streamOnline
        ? 'Đang tuần tra — chờ phát hiện'
        : 'Chưa có luồng live'
      : 'Chưa có dữ liệu hôm nay'

  const encountersDetail = stats.encountersStandard > 0
    ? `${stats.encountersStandard} lượt gặp qualified`
    : 'Chưa ghi nhận lượt gặp'

  const unassignedDetail = stats.unassignedObservations > 0
    ? 'Chưa gán pers/iden — không tính vào chuẩn'
    : 'Không có quan sát chưa gán'

  const kpis = [
    {
      label: 'Khu vực tuần tra',
      value: `${visitedZones}/${totalZones}`,
      unit: 'khu vực',
      detail: visitedZones > 0
        ? `${coveragePercent}% diện tích đã phủ · mật độ tuần tra`
        : 'Chưa có dữ liệu tuần tra',
      change: 0,
      changeType: 'neutral' as const,
      icon: MapPin,
      iconBg: 'bg-green-400/10',
      iconColor: 'text-green-400',
    },
    {
      label: 'Công nhân',
      value: stats.workersStandard,
      detail: workersDetailFallback,
      detailContent: workersDetailContent,
      change: 0,
      changeType: 'neutral' as const,
      icon: Users,
      iconBg: 'bg-sky-400/10',
      iconColor: 'text-sky-400',
    },
    {
      label: 'Lượt gặp',
      value: stats.encountersStandard,
      unit: 'lượt',
      detail: encountersDetail,
      change: 0,
      changeType: 'neutral' as const,
      icon: Footprints,
      iconBg: 'bg-emerald-400/10',
      iconColor: 'text-emerald-400',
    },
    {
      label: 'Quan sát chưa gán',
      value: stats.unassignedObservations,
      unit: 'lượt',
      detail: unassignedDetail,
      change: 0,
      changeType: 'neutral' as const,
      icon: ScanFace,
      iconBg: 'bg-slate-400/10',
      iconColor: 'text-slate-400',
    },
  ]

  return (
    <>
      {kpis.map(k => {
        const { icon: Icon, iconBg, iconColor, detailContent, ...kpiData } = k
        return (
          <KPICard
            key={k.label}
            data={kpiData}
            icon={Icon}
            iconBg={iconBg}
            iconColor={iconColor}
            detailContent={detailContent}
          />
        )
      })}
    </>
  )
}

/* ── Page ─────────────────────────────────────────────────────── */
export function Module05Page() {
  const isMobileLayout = useMediaQuery('(max-width: 1023px)')
  const isTabletLandscape = useTabletLandscape()
  /** Phone/tablet dọc + iPad ngang (height hẹp dù width ≥1024). */
  const isCompactLayout = isMobileLayout || isTabletLandscape
  const setSidebarCollapsed = useAppStore(s => s.setSidebarCollapsed)
  const [tier1Open, setTier1Open] = useState(true)
  const [tier2Open, setTier2Open] = useState(true)
  const [cameraMode, setCameraMode] = useState<CameraPanelMode>('live')
  const [selectedCamId, setSelectedCamId] = useState<string | undefined>('HC-02')
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [detailEventId, setDetailEventId] = useState<string | null>(null)
  const [activeStreamCount, setActiveStreamCount] = useState(2)
  const playbackDate = getPatrolDefaultPlaybackDate()
  const { cameras: visionCameras } = useCameras()
  // Luồng thống nhất: mọi thiết bị đều xem đủ hai mũ và flycam. Chỉ khi còn mũ
  // chạy luồng cũ (điện thoại vừa là camera vừa là màn hình) mới ưu tiên mũ đó.
  const patrolDefaultCameraIds = useMemo(
    () => (hasLegacyMobileHelmet() && isHandheldDevice()
      ? (legacyMobileHelmetIds() as readonly string[])
      : DEFAULT_PATROL_GRID_CAMERA_IDS),
    [],
  )
  const patrolStreamMetricsIds = useMemo(
    () => [...DEFAULT_PATROL_CAMERA_IDS, ...PATROL_DRONE_IDS] as const,
    [],
  )
  const liveMetrics = usePatrolHelmetLiveMetrics(patrolStreamMetricsIds)
  const workforceSnap = useWorkforceRealtimeState([...DEFAULT_PATROL_CAMERA_IDS])

  const [hc02MobileOnline, setHc02MobileOnline] = useState(
    () => Boolean(getPatrolMobileLiveSnapshot('HC-02')?.streamOnline),
  )
  const [framesLiveTick, setFramesLiveTick] = useState(0)

  useEffect(() => {
    setSidebarCollapsed(true)
  }, [setSidebarCollapsed])

  useEffect(() => {
    return subscribePatrolCameraFramesLive(() => {
      setFramesLiveTick(t => t + 1)
    })
  }, [])

  useEffect(() => {
    return subscribePatrolMobileLiveSnapshot(snap => {
      if (!snap || snap.cameraId !== 'HC-02') {
        setHc02MobileOnline(false)
        return
      }
      setHc02MobileOnline(Boolean(snap.streamOnline))
    })
  }, [])

  const patrolCamerasLive = useMemo(
    () => applyPatrolCameraStreamStatus(
      applyPatrolUnifiedLiveRouting(
        applyPatrolHelmetMobileLive(
          applyPatrolHelmetEnvLive(
            mergePatrolCamerasWithVisionLive(PATROL_CAMERAS, visionCameras),
          ),
        ),
      ),
      liveMetrics.perCamera,
      hc02MobileOnline,
      getPatrolCameraFramesLiveMap(),
    ),
    [visionCameras, liveMetrics.perCamera, hc02MobileOnline, framesLiveTick],
  )

  useEffect(() => {
    void ensurePatrolAuth()
    void syncPatrolIdentityBindingsFromBackend()
  }, [])

  // Thẻ sự kiện đọc thẳng từ SQLite: một người một thẻ mỗi ngày là khoá chính
  // của bảng, và tầng do server chốt — không còn lớp gộp trùng nào ở đây.
  const dayBundle = usePatrolDayBundle()
  const flycamFlightModes = usePatrolFlycamFlightModes(PATROL_DRONE_IDS)
  const patrolEventsLive = useMemo(
    () => filterPatrolEventsByFlycamAltitude(dayBundle.events, flycamFlightModes),
    [dayBundle.events, flycamFlightModes],
  )
  const dayStats = { stats: dayBundle.stats, loading: dayBundle.loading, reachable: dayBundle.reachable }
  const dr03FlightLabel = patrolFlightModeLabel(flycamFlightModes['DR-03'] ?? 'aerial')

  const detailEvent = useMemo(
    () => patrolEventsLive.find(e => e.id === detailEventId) ?? null,
    [detailEventId, patrolEventsLive],
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

  const renderCameraTierBody = (expanded: boolean) => (
    <div className={cn(
      'flex flex-col w-full',
      expanded
        ? 'flex-1 min-h-0 h-full overflow-hidden'
        : isCompactLayout ? 'h-auto overflow-visible' : 'h-auto overflow-hidden',
    )}>
      {cameraMode === 'live' ? (
        <PatrolCameraPanel
          selectedId={selectedCamId}
          onSelectCamera={handleSelectCamera}
          onStreamCountChange={setActiveStreamCount}
          cameras={patrolCamerasLive}
          defaultCameraIds={patrolDefaultCameraIds}
          isCompactLayout={isCompactLayout}
          isTabletLandscape={isTabletLandscape}
          filterTabs={[...PATROL_CAMERA_FILTER_TABS]}
          filterFn={tab => filterPatrolCameras(tab as PatrolCameraFilterTab, patrolCamerasLive)}
          groupFn={cams => groupPatrolCamerasForSidebar(cams)}
          desktopMaxVisibleRows={expanded ? null : undefined}
        />
      ) : (
        <CameraPlaybackPanel
          cameras={patrolCamerasLive}
          selectedCameraId={selectedCamId}
          onSelectCamera={handleSelectCamera}
          defaultDate={playbackDate}
          maxDate={playbackDate}
          selectedRecordId={selectedEventId}
          filterTabs={[...PATROL_CAMERA_FILTER_TABS]}
          filterFn={tab => filterPatrolCameras(tab as PatrolCameraFilterTab, patrolCamerasLive)}
          groupFn={cams => groupPatrolCamerasForSidebar(cams)}
          fetchRecords={fetchPatrolPlaybackRecords}
          fetchDetections={fetchPatrolPlaybackDetections}
          videoAreaFlex={82}
        />
      )}
    </div>
  )

  return (
    <>
      <Header
        title="Hiệu Quả Công Việc"
        subtitle="Giám sát tuần tra helmet camera & mật độ lao động"
      />
      <PageLayout scrollable>
        {/* Tier 1 — KPIs */}
        <Panel
          title="Tổng Quan"
          fit
          expandable={tier1Open}
          noPadding
          className="shrink-0 h-auto"
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
                <PatrolKPIs live={liveMetrics} workforce={workforceSnap} stats={dayStats.stats} />
              </Tier1>
            </div>
          )}
        </Panel>

        {/* Tier 2 + Tier 3 — scroll trang: stack dọc mobile, không ép max-h viewport */}
        <div className={cn(
          'flex flex-col gap-2 sm:gap-3 shrink-0',
          isCompactLayout && 'pb-[env(safe-area-inset-bottom,0px)]',
        )}>
          {/* Tier 2 — Camera */}
          <div className={cn(
            'flex flex-col shrink-0',
            tier2Open && !isCompactLayout && 'min-h-0',
          )}>
            <Panel
              title="Camera"
              expandable={tier2Open}
              fit={!tier2Open}
              noPadding
              overflowVisible={tier2Open && isCompactLayout}
              expandedContent={tier2Open ? renderCameraTierBody(true) : undefined}
              className={cn(
                tier2Open && (isCompactLayout ? 'h-auto overflow-visible' : 'min-h-0 overflow-hidden'),
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
              {tier2Open && renderCameraTierBody(false)}
            </Panel>
          </div>

          {/* Tier 3 — HEATMAP | SỰ KIỆN */}
          <div className={cn(
            'flex gap-2 sm:gap-3 flex-col lg:flex-row shrink-0',
            !isCompactLayout && 'min-h-[min(36vh,400px)]',
          )}>
            <Panel
              title="HEATMAP"
              noPadding
              className={cn(
                'flex flex-col overflow-hidden shrink-0 flex-1 lg:flex-[3]',
                isCompactLayout
                  ? 'min-h-[min(42dvh,360px)] h-[min(42dvh,360px)]'
                  : 'min-h-[min(32vh,340px)] h-[min(36vh,400px)]',
              )}
            >
              <PatrolDensityHeatmap
                patrolEvents={patrolEventsLive}
              />
            </Panel>

            <Panel
              title="SỰ KIỆN"
              noPadding
              className={cn(
                'flex flex-col overflow-hidden shrink-0 flex-1 lg:flex-[2]',
                isCompactLayout
                  ? 'min-h-[min(42dvh,360px)] h-[min(42dvh,360px)]'
                  : 'min-h-[min(32vh,340px)] h-[min(36vh,400px)]',
              )}
              headerRight={
                PATROL_DRONE_IDS.length > 0 ? (
                  <span className="hidden sm:inline text-[9px] text-muted-foreground/80 tabular-nums">
                    {dr03FlightLabel}
                  </span>
                ) : undefined
              }
            >
              <PatrolEventsPanel
                events={patrolEventsLive}
                selectedId={selectedEventId}
                onSelect={handleSelectEvent}
                onDetailClick={ev => setDetailEventId(ev.id)}
              />
            </Panel>
          </div>
        </div>
      </PageLayout>

      <PatrolEventDetailModal
        event={detailEvent}
        onClose={() => setDetailEventId(null)}
      />

      {/* Chỉ hỏi quyền khi CMS còn phải tự làm camera. Với pipeline mới, việc xin
          quyền thuộc về trang /phat-song trên máy người đeo mũ. */}
      {hasLegacyMobileHelmet() && <PatrolDevicePermissionGate />}
    </>
  )
}
