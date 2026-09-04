import { useEffect, useMemo, useState } from 'react'
import {
  Users, MapPin, Footprints, UserX, Plane,
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
import { PatrolPlaybackPanel } from './components/PatrolPlaybackPanel'
import type { TrainingCamera } from '@/modules/module02-training/data/trainingCameras'
import { isHandheldDevice } from '@/modules/module02-training/services/deviceCamera.service'
import { cn } from '@/utils/cn'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useTabletLandscape } from '@/hooks/useTabletLandscape'
import { useAppStore } from '@/store/app.store'
import {
  getPatrolCameraFramesLiveMap,
  subscribePatrolCameraFramesLive,
} from '@/services/patrolCameraFrameBridge'
import { fetchPatrolRuntimeConfig } from '@/services/patrolRuntimeBridge'
import {
  type PatrolEvent,
} from './data/patrolTypes'
import {
  DEFAULT_PATROL_CAMERA_IDS,
  DEFAULT_PATROL_GRID_CAMERA_IDS,
  PATROL_CAMERA_FILTER_TABS,
  filterPatrolCameras,
  groupPatrolCamerasForSidebar,
  type PatrolCameraFilterTab,
} from './data/patrolCameras'
import { buildPatrolCamerasLive } from './data/buildPatrolCamerasLive'
import { PATROL_DRONE_IDS } from './data/patrolDrones'
import { usePatrolVisionStreams } from './hooks/usePatrolVisionStreams'
import { usePatrolDayBundle } from './hooks/usePatrolDayBundle'
import {
  getPatrolDefaultPlaybackDate,
  getPatrolEventViewDate,
  getPatrolPlaybackMinDate,
} from './services/patrolPlayback.service'
import { PatrolDensityHeatmap } from './components/PatrolDensityHeatmap'
import { PatrolHeatmapSectionControls } from './components/PatrolHeatmapSectionControls'
import { PatrolDevicePermissionGate } from './components/PatrolDevicePermissionGate'
import { hasLegacyMobileHelmet, isHelmetWebrtcAvailable, legacyMobileHelmetIds } from './data/helmetIngest'
import { PatrolEventsPanel } from './components/PatrolEventsPanel'
import { PatrolEventDetailModal } from './components/PatrolEventDetailModal'
import type { PatrolHelmetLiveMetrics } from './hooks/patrolHelmetLiveMetricsState'
import { usePatrolLivePoll } from './hooks/usePatrolLivePoll'
import { setPatrolStreamTelemetryBundle } from '@/services/patrolStreamTelemetryBridge'
import { usePatrolFlycamFlightModes } from './hooks/usePatrolFlycamFlightModes'
import { filterPatrolEventsByFlycamAltitude } from './utils/patrolFlycamEventFilter'
import { patrolFlightModeLabel } from './utils/patrolFlightMode'
import type { PatrolDayStats } from './services/patrolDayEvents.service'
import { syncPatrolIdentityBindingsFromBackend } from './services/patrolManualIdentity.service'
import { ensurePatrolAuth } from '@/services/patrolApiClient'
import { PATROL_PERSON_STAGE_META } from './utils/patrolWorkforceEventLabels'
import { buildPatrolHelmetOnlineById } from './utils/patrolStreamOnline'
import { PATROL_SINGLE_ZONE_MODE } from './data/patrolSiteMap'
import { computePatrolZoneCoverage, type PatrolZoneCoverageResult } from './utils/patrolZoneCoverage'
import { usePatrolFlymapMetrics } from './hooks/usePatrolFlymapMetrics'
import { derivePatrolDisplayStats } from './utils/patrolDisplayStats'

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
  stats,
  zoneCoverage,
  flymapPersonCount,
  flymapLoading,
  dr03Online,
}: {
  live: PatrolHelmetLiveMetrics
  stats: PatrolDayStats
  zoneCoverage: PatrolZoneCoverageResult
  flymapPersonCount: number
  flymapLoading: boolean
  dr03Online: boolean
}) {
  const { visitedZones, totalZones, coveragePercent } = zoneCoverage

  const anyCameraOnline = live.perCamera.some(row => row.stream_online)
  const peakTimeActive = live.perCamera.some(row => row.peak_time_active)
  const headcount = stats.personCount + stats.identityCount
  const objectEncounters = stats.objectEncounterCount ?? stats.unassignedObservations

  const workersDetailContent = headcount > 0
    ? (
      <PatrolWorkersKpiDetail
        personCount={stats.personCount}
        identityCount={stats.identityCount}
      />
    )
    : undefined

  const workersDetailFallback = headcount > 0
    ? undefined
    : anyCameraOnline
      ? live.backendReachable || live.streamOnline
        ? 'Đang tuần tra — chờ phát hiện'
        : 'Chưa có luồng live'
      : 'Chưa có dữ liệu hôm nay'

  const zoneDetail = visitedZones > 0
    ? `${coveragePercent}% khu có thiết bị tuần tra active`
    : anyCameraOnline
      ? 'Thiết bị online — chờ xác nhận phủ khu'
      : 'Chưa có thiết bị tuần tra online'

  // Không phải số người. Một người đi qua ba camera là ba lượt, đi ra rồi quay
  // lại là hai lượt — Đối tượng chưa có định danh nên không gộp được lượt nào
  // với lượt nào. Nhãn phải nói đúng như vậy, nếu không người đọc sẽ trừ nó
  // với Nhân sự để ra "số người chưa nhận diện", mà phép trừ đó vô nghĩa.
  const objectEncounterDetail = peakTimeActive
    ? 'Peak time — mỗi lần vào khung một lượt, không gộp'
    : stats.sightingsStreamOffline > 0
      ? `Mỗi lần vào khung một lượt · ${stats.sightingsStreamOffline} lượt do mất tín hiệu`
      : objectEncounters > 0
        ? 'Mỗi lần vào khung một lượt — không phải số người'
        : 'Chưa ghi nhận lượt gặp Đối tượng'

  const flymapDetail = !dr03Online
    ? 'Flycam chưa online'
    : flymapLoading
      ? 'Đang tải mật độ…'
      : 'YOLO tầm cao — không cộng Nhân sự'

  const kpis = [
    ...(!PATROL_SINGLE_ZONE_MODE
      ? [{
          label: 'Khu vực tuần tra',
          value: `${visitedZones}/${totalZones}`,
          unit: 'khu vực',
          detail: zoneDetail,
          change: 0,
          changeType: 'neutral' as const,
          icon: MapPin,
          iconBg: 'bg-green-400/10',
          iconColor: 'text-green-400',
        }]
      : []),
    {
      label: 'Nhân sự',
      value: headcount,
      unit: 'nhân sự',
      detail: workersDetailFallback,
      detailContent: workersDetailContent,
      change: 0,
      changeType: 'neutral' as const,
      icon: Users,
      iconBg: 'bg-sky-400/10',
      iconColor: 'text-sky-400',
    },
    {
      label: 'Lượt gặp · ĐT',
      value: objectEncounters,
      unit: 'lượt',
      detail: objectEncounterDetail,
      change: 0,
      changeType: 'neutral' as const,
      icon: Footprints,
      iconBg: 'bg-slate-400/10',
      iconColor: 'text-slate-400',
    },
    {
      label: 'Mật độ flymap',
      value: dr03Online ? flymapPersonCount : '—',
      unit: dr03Online ? 'người/khung' : '',
      detail: flymapDetail,
      change: 0,
      changeType: 'neutral' as const,
      icon: Plane,
      iconBg: 'bg-orange-400/10',
      iconColor: 'text-orange-400',
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
  const [heatmapExpanded, setHeatmapExpanded] = useState(false)
  const [flymapActive, setFlymapActive] = useState(false)
  const [cameraMode, setCameraMode] = useState<CameraPanelMode>('live')
  const [selectedCamId, setSelectedCamId] = useState<string | undefined>('HC-02')
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [detailEventId, setDetailEventId] = useState<string | null>(null)
  const [activeStreamCount, setActiveStreamCount] = useState(2)
  const patrolToday = getPatrolDefaultPlaybackDate() // ngày lịch VN 0h — không ca/kíp
  const patrolMinDate = getPatrolPlaybackMinDate()
  const [patrolViewDate, setPatrolViewDate] = useState(patrolToday)
  const legacyVision = !isHelmetWebrtcAvailable()
  const visionCameras = usePatrolVisionStreams(legacyVision)
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
  const { liveMetrics, workforceSnap } = usePatrolLivePoll(
    patrolStreamMetricsIds,
    [...DEFAULT_PATROL_CAMERA_IDS],
  )

  useEffect(() => {
    const raw = workforceSnap.server_time?.trim()
    const parsed = raw ? Date.parse(raw) : Number.NaN
    setPatrolStreamTelemetryBundle({
      serverTimeMs: Number.isFinite(parsed) ? parsed : null,
      metricsByCamera: Object.fromEntries(
        liveMetrics.perCamera.map(row => [row.camera_id, row]),
      ),
      helmets: workforceSnap.helmets,
    })
  }, [liveMetrics.perCamera, workforceSnap])

  const [framesLiveTick, setFramesLiveTick] = useState(0)

  useEffect(() => {
    setSidebarCollapsed(true)
  }, [setSidebarCollapsed])

  useEffect(() => {
    void fetchPatrolRuntimeConfig()
  }, [])

  useEffect(() => {
    return subscribePatrolCameraFramesLive(() => {
      setFramesLiveTick(t => t + 1)
    })
  }, [])

  const patrolCamerasLive = useMemo(
    () => buildPatrolCamerasLive(
      visionCameras,
      liveMetrics.perCamera,
      getPatrolCameraFramesLiveMap(),
    ),
    [visionCameras, liveMetrics.perCamera, framesLiveTick],
  )

  const patrolDroneCamera = useMemo(
    () => patrolCamerasLive.find(cam => PATROL_DRONE_IDS.includes(cam.id as typeof PATROL_DRONE_IDS[number])),
    [patrolCamerasLive],
  )

  useEffect(() => {
    void ensurePatrolAuth()
    void syncPatrolIdentityBindingsFromBackend()
  }, [])

  // Thẻ sự kiện đọc thẳng từ SQLite: một người một thẻ mỗi ngày là khoá chính
  // của bảng, và tầng do server chốt — không còn lớp gộp trùng nào ở đây.
  const dayBundle = usePatrolDayBundle(patrolViewDate)
  const flycamFlightModes = usePatrolFlycamFlightModes(PATROL_DRONE_IDS)
  const patrolEventsLive = useMemo(
    () => filterPatrolEventsByFlycamAltitude(dayBundle.events, flycamFlightModes),
    [dayBundle.events, flycamFlightModes],
  )
  const { stats: patrolDisplayStats, tabCounts } = useMemo(
    () => derivePatrolDisplayStats(patrolEventsLive, dayBundle.stats),
    [patrolEventsLive, dayBundle.stats],
  )
  const patrolMapCameraIds = useMemo(
    () => [...DEFAULT_PATROL_CAMERA_IDS, ...PATROL_DRONE_IDS] as const,
    [],
  )

  const helmetOnlineById = useMemo(
    () => buildPatrolHelmetOnlineById(
      patrolMapCameraIds,
      liveMetrics.perCamera,
      { framesLiveById: getPatrolCameraFramesLiveMap() },
    ),
    [patrolMapCameraIds, liveMetrics.perCamera, framesLiveTick],
  )

  const zoneCoverage = useMemo(
    () => computePatrolZoneCoverage({
      cameraOnlineById: helmetOnlineById,
      workforce: workforceSnap,
    }),
    [helmetOnlineById, workforceSnap],
  )

  const primaryDroneId = PATROL_DRONE_IDS[0] ?? 'DR-03'
  const dr03Online = Boolean(helmetOnlineById[primaryDroneId])
  const { personInFrame: flymapPersonCount, loading: flymapLoading } = usePatrolFlymapMetrics(
    primaryDroneId,
    dr03Online,
  )

  const dayPresences = useMemo(
    () => dayBundle.bundle?.presences ?? [],
    [dayBundle.bundle],
  )
  const dayStats = { stats: patrolDisplayStats, loading: dayBundle.loading, reachable: dayBundle.reachable }
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
    setDetailEventId(ev.id)
    setPatrolViewDate(getPatrolEventViewDate(ev))
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
        <PatrolPlaybackPanel
          patrolEvents={patrolEventsLive}
          cameras={patrolCamerasLive}
          selectedCameraId={selectedCamId}
          onSelectCamera={handleSelectCamera}
          defaultDate={patrolViewDate}
          maxDate={patrolToday}
          minDate={patrolMinDate}
          onDateChange={setPatrolViewDate}
          filterTabs={[...PATROL_CAMERA_FILTER_TABS]}
          filterFn={tab => filterPatrolCameras(tab as PatrolCameraFilterTab, patrolCamerasLive)}
          groupFn={cams => groupPatrolCamerasForSidebar(cams)}
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
                <PatrolKPIs
                  live={liveMetrics}
                  stats={dayStats.stats}
                  zoneCoverage={zoneCoverage}
                  flymapPersonCount={flymapPersonCount}
                  flymapLoading={flymapLoading}
                  dr03Online={dr03Online}
                />
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
              title={flymapActive ? 'FLYMAP' : 'HEATMAP'}
              noPadding
              className={cn(
                'flex flex-col overflow-hidden shrink-0 flex-1 lg:flex-[3]',
                isCompactLayout
                  ? 'min-h-[min(42dvh,360px)] h-[min(42dvh,360px)]'
                  : 'min-h-[min(32vh,340px)] h-[min(36vh,400px)]',
              )}
              headerRight={
                <PatrolHeatmapSectionControls
                  flymapActive={flymapActive}
                  onFlymapToggle={() => setFlymapActive(v => !v)}
                  onExpand={() => setHeatmapExpanded(true)}
                />
              }
            >
              <PatrolDensityHeatmap
                patrolEvents={patrolEventsLive}
                patrolEventsAll={dayBundle.events}
                viewDate={patrolViewDate}
                presences={dayPresences}
                dayStats={dayStats.stats}
                workforce={workforceSnap}
                flycamFlightModes={flycamFlightModes}
                helmetOnlineById={helmetOnlineById}
                visitedByZoneId={zoneCoverage.visitedByZoneId}
                expanded={heatmapExpanded}
                onCloseExpand={() => setHeatmapExpanded(false)}
                showFlymap={flymapActive}
                onFlymapToggle={() => setFlymapActive(v => !v)}
                droneCamera={patrolDroneCamera}
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
                presences={dayPresences}
                tabCounts={tabCounts}
                viewDate={patrolViewDate}
                onViewDateChange={setPatrolViewDate}
                maxViewDate={patrolToday}
                minViewDate={patrolMinDate}
                selectedId={selectedEventId}
                onSelect={handleSelectEvent}
                onDetailClick={ev => {
                  setPatrolViewDate(getPatrolEventViewDate(ev))
                  setDetailEventId(ev.id)
                }}
              />
            </Panel>
          </div>
        </div>
      </PageLayout>

      <PatrolEventDetailModal
        event={detailEvent}
        viewDate={patrolViewDate}
        onClose={() => setDetailEventId(null)}
      />

      {/* Chỉ hỏi quyền khi CMS còn phải tự làm camera. Với pipeline mới, việc xin
          quyền thuộc về trang /phat-song trên máy người đeo mũ. */}
      {hasLegacyMobileHelmet() && <PatrolDevicePermissionGate />}
    </>
  )
}
