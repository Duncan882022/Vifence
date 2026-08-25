import { useEffect, useMemo, useState } from 'react'
import {
  Users, Truck, MapPin, AlertTriangle, Maximize2, Minimize2, Trash2,
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
import { isHandheldDevice } from '@/modules/module02-training/services/deviceCamera.service'
import { cn } from '@/utils/cn'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useAppStore } from '@/store/app.store'
import {
  getPatrolMobileLiveSnapshot,
  subscribePatrolMobileLiveSnapshot,
} from '@/services/patrolMobileMetricsBridge'
import {
  type PatrolEvent,
} from './data/patrolMockData'
import {
  DEFAULT_PATROL_CAMERA_IDS,
  PATROL_CAMERAS,
  PATROL_CAMERA_FILTER_TABS,
  applyPatrolCameraStreamStatus,
  filterPatrolCameras,
  groupPatrolCamerasForSidebar,
  type PatrolCameraFilterTab,
} from './data/patrolCameras'
import { PATROL_GPS_ZONES } from './data/patrolSiteMap'
import { mergePatrolCamerasWithVisionLive, applyPatrolHelmetEnvLive, applyPatrolHelmetMobileLive } from './data/patrolHelmetStreams'
import { useCameras } from '@/modules/dao-tao-tuan-thu/hooks/useCameras'
import {
  fetchPatrolCameraRecords,
  fetchPatrolRecordDetections,
  getPatrolDefaultPlaybackDate,
} from './services/patrolCameraPlayback.service'
import { PatrolDensityHeatmap } from './components/PatrolDensityHeatmap'
import { PatrolDevicePermissionGate } from './components/PatrolDevicePermissionGate'
import { hasLegacyMobileHelmet, legacyMobileHelmetIds } from './data/helmetIngest'
import { PatrolEventsPanel } from './components/PatrolEventsPanel'
import { PatrolEventDetailModal } from './components/PatrolEventDetailModal'
import { usePatrolHelmetLiveMetrics, type PatrolHelmetLiveMetrics } from './hooks/usePatrolHelmetLiveMetrics'
import { usePatrolHelmetLiveEvents } from './hooks/usePatrolHelmetLiveEvents'
import { useWorkforceRealtimeState } from './hooks/useWorkforceRealtimeState'
import { filterPatrolEvidenceEvents, isPatrolPersonLifecycleWithSnapshot, summarizePatrolAlertEvents } from './utils/patrolEventsFeed'
import { countPatrolAlertEntities, summarizePatrolGlobalWorkers } from './utils/patrolPatrolCounts'
import { subscribeHeatmapPersonRegistry } from '@/services/patrolHeatmapPersonRegistry'
import { resetPatrolTestData } from './services/patrolReset.service'
import { applyManualIdentityToPatrolEvents } from './utils/patrolManualIdentityUi'
import { stripPatrolPpeEvents } from './utils/patrolPpeVisibility'
import { mergePatrolAndWorkforceEvents } from './utils/workforceEventsMapper'
import { enrichPatrolEventsWithWorkforceObjects, dedupePatrolEventsByMasterEntity } from './utils/patrolWorkforceEventLabels'
import { subscribePatrolManualIdentity, syncPatrolIdentityBindingsFromBackend } from './services/patrolManualIdentity.service'
import type { WorkforceSnapshot } from './types/workforceHeatmap'

function PatrolKPIs({
  live,
  workforce,
  events,
}: {
  live: PatrolHelmetLiveMetrics
  workforce: WorkforceSnapshot
  events: PatrolEvent[]
}) {
  const [pinTick, setPinTick] = useState(0)
  useEffect(() => subscribeHeatmapPersonRegistry(() => {
    setPinTick(t => t + 1)
  }), [])

  const zoneEntries = Object.values(workforce.zonePopulation)
  const visitedZones = zoneEntries.filter(
    z => z.observed_count > 0 || z.kpi.peak > 0,
  ).length
  const totalZones = zoneEntries.length > 0 ? zoneEntries.length : PATROL_GPS_ZONES.length
  const coveragePercent = totalZones > 0
    ? Math.round((visitedZones / totalZones) * 100)
    : 0

  // Công nhân global — Người + Định danh dedupe, mọi mũ HC-* (không YOLO raw count)
  void pinTick
  const anyCameraOnline = live.perCamera.some(row => row.stream_online)
  const workerSummary = summarizePatrolGlobalWorkers(events, { liveOnly: anyCameraOnline })
  const observedCount = workerSummary.total

  // Sự kiện = unique entities tab Người + Định danh (feed có snapshot)
  const alertCount = countPatrolAlertEntities(events)

  const zonePop = Object.values(workforce.zonePopulation)[0]
  const peopleDetail = observedCount > 0
    ? `${observedCount} ${anyCameraOnline ? 'đang quan sát' : 'trong ca'} · ${workerSummary.person} Người · ${workerSummary.identity} Định danh`
    : anyCameraOnline
      ? zonePop?.observed_count
        ? `${zonePop.breakdown.verified_identities} định danh · ${zonePop.breakdown.unknown_objects} chưa xác định`
        : live.backendReachable || live.streamOnline
          ? 'Đang chờ phát hiện'
          : 'Chưa có luồng live'
      : 'Chưa có dữ liệu phiên'

  const kpis = [
    {
      label: 'Khu vực tuần tra',
      value: `${visitedZones}/${totalZones}`,
      unit: 'khu vực',
      detail: visitedZones > 0
        ? `${coveragePercent}% diện tích đã phủ`
        : 'Chưa có dữ liệu tuần tra',
      change: 0,
      changeType: 'neutral' as const,
      icon: MapPin,
      iconBg: 'bg-green-400/10',
      iconColor: 'text-green-400',
    },
    {
      label: 'Công nhân',
      value: observedCount,
      unit: 'người',
      detail: peopleDetail,
      change: 0,
      changeType: 'neutral' as const,
      icon: Users,
      iconBg: 'bg-sky-400/10',
      iconColor: 'text-sky-400',
    },
    {
      label: 'Máy móc',
      value: 0,
      unit: 'máy',
      detail: 'Đang chờ dữ liệu live',
      change: 0,
      changeType: 'neutral' as const,
      icon: Truck,
      iconBg: 'bg-amber-400/10',
      iconColor: 'text-amber-400',
    },
    {
      label: 'Cảnh báo',
      value: alertCount,
      unit: 'sự kiện',
      detail: summarizePatrolAlertEvents(events),
      change: 0,
      changeType: 'neutral' as const,
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
  const isMobileLayout = useMediaQuery('(max-width: 1023px)')
  const setSidebarCollapsed = useAppStore(s => s.setSidebarCollapsed)
  const [tier1Open, setTier1Open] = useState(true)
  const [tier2Open, setTier2Open] = useState(true)
  const cameraCollapsed = !tier2Open
  const [cameraMode, setCameraMode] = useState<CameraPanelMode>('live')
  const [selectedCamId, setSelectedCamId] = useState<string | undefined>('HC-01')
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [detailEventId, setDetailEventId] = useState<string | null>(null)
  const [activeStreamCount, setActiveStreamCount] = useState(2)
  const [tier3Focus, setTier3Focus] = useState<'none' | 'events'>('none')
  const [heatmapExpanded, setHeatmapExpanded] = useState(false)

  const playbackDate = getPatrolDefaultPlaybackDate()
  const { cameras: visionCameras } = useCameras()
  // Luồng thống nhất: mọi thiết bị đều xem đủ hai mũ. Chỉ khi còn mũ chạy luồng
  // cũ (điện thoại vừa là camera vừa là màn hình) mới phải ưu tiên mũ đó.
  const patrolDefaultCameraIds = useMemo(
    () => (hasLegacyMobileHelmet() && isHandheldDevice()
      ? (legacyMobileHelmetIds() as readonly string[])
      : DEFAULT_PATROL_CAMERA_IDS),
    [],
  )
  const liveMetrics = usePatrolHelmetLiveMetrics(DEFAULT_PATROL_CAMERA_IDS)
  const workforceSnap = useWorkforceRealtimeState([...DEFAULT_PATROL_CAMERA_IDS])

  const [hc02MobileOnline, setHc02MobileOnline] = useState(
    () => Boolean(getPatrolMobileLiveSnapshot('HC-02')?.streamOnline),
  )

  useEffect(() => {
    setSidebarCollapsed(true)
  }, [setSidebarCollapsed])

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
      applyPatrolHelmetMobileLive(
        applyPatrolHelmetEnvLive(
          mergePatrolCamerasWithVisionLive(PATROL_CAMERAS, visionCameras),
        ),
      ),
      liveMetrics.perCamera,
      hc02MobileOnline,
    ),
    [visionCameras, liveMetrics.perCamera, hc02MobileOnline],
  )

  const liveHelmetEvents = usePatrolHelmetLiveEvents(DEFAULT_PATROL_CAMERA_IDS)
  const [identityRevision, setIdentityRevision] = useState(0)

  useEffect(() => {
    return subscribePatrolManualIdentity(() => setIdentityRevision(t => t + 1))
  }, [])

  useEffect(() => {
    void syncPatrolIdentityBindingsFromBackend()
  }, [])

  const patrolEventsLive = useMemo(() => {
    void identityRevision
    const merged = mergePatrolAndWorkforceEvents(
      stripPatrolPpeEvents(liveHelmetEvents.events),
      workforceSnap.events,
    )
    const enriched = enrichPatrolEventsWithWorkforceObjects(
      merged,
      Object.values(workforceSnap.objects),
    )
    return dedupePatrolEventsByMasterEntity(
      applyManualIdentityToPatrolEvents(
        filterPatrolEvidenceEvents(enriched).filter(isPatrolPersonLifecycleWithSnapshot),
      ),
    )
  }, [liveHelmetEvents.events, workforceSnap.events, workforceSnap.objects, identityRevision])

  const detailEvent = useMemo(
    () => patrolEventsLive.find(e => e.id === detailEventId) ?? null,
    [detailEventId, patrolEventsLive],
  )

  const [resetting, setResetting] = useState(false)

  async function handleResetTestData() {
    if (!window.confirm('Xóa toàn bộ dữ liệu patrol (events, sgc, heatmap)?\nTrang sẽ tự reload sau khi xong.')) return
    setResetting(true)
    try {
      const result = await resetPatrolTestData()
      const be = result.backend
      const summary = be
        ? `Backend: ${be.events_cleared} events, ${be.sgc_tracks_cleared} sgc, ${be.hc_tracks_cleared} HC tracks`
        : 'Backend không kết nối (FE đã xoá)'
      console.info('[patrolReset] Đã xoá:', summary)
    } finally {
      window.location.reload()
    }
  }

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
        headerRight={
          <button
            type="button"
            onClick={handleResetTestData}
            disabled={resetting}
            className="flex items-center gap-1 px-2 py-1 rounded text-[9px] text-muted-foreground/60 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-40"
            title="Xóa dữ liệu test (events, sgc, heatmap)"
          >
            <Trash2 className="w-3 h-3" />
            {resetting ? 'Đang xóa…' : 'Reset test'}
          </button>
        }
      />
      <PageLayout scrollable={isMobileLayout && !cameraCollapsed}>
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
                <PatrolKPIs live={liveMetrics} workforce={workforceSnap} events={patrolEventsLive} />
              </Tier1>
            </div>
          )}
        </Panel>

        {/* Tier 2 + Tier 3 */}
        <div className={cn(
          'flex flex-col gap-2 sm:gap-3 flex-1 min-h-0',
          isMobileLayout && !cameraCollapsed
            ? 'pb-[env(safe-area-inset-bottom,0px)]'
            : 'overflow-hidden',
        )}>
          {/* Tier 2 — Camera (~64% chiều cao còn lại) */}
          <div className={cn(
            'flex flex-col min-h-0',
            tier2Open && (
              isMobileLayout
                ? 'shrink-0 flex-1 min-h-[min(43dvh,360px)] max-h-[min(52dvh,432px)] max-lg:landscape:min-h-[min(32dvh,270px)] max-lg:landscape:max-h-[min(40dvh,342px)]'
                : 'flex-[8] min-h-[min(40vh,400px)] max-h-[min(55vh,594px)]'
            ),
            !tier2Open && 'shrink-0',
          )}>
            <Panel
              title="Camera"
              expandable={tier2Open}
              fit={!tier2Open}
              noPadding
              className={cn(
                tier2Open && 'h-full min-h-0 overflow-hidden',
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
                <div className="flex flex-col flex-1 min-h-0 w-full overflow-hidden">
                  {cameraMode === 'live' ? (
                    <TrainingCameraPanel
                      selectedId={selectedCamId}
                      onSelectCamera={handleSelectCamera}
                      onStreamCountChange={setActiveStreamCount}
                      cameras={patrolCamerasLive}
                      defaultCameraIds={patrolDefaultCameraIds}
                      defaultSidebarOpen={false}
                      mobileCompactVideo={isMobileLayout}
                      mobileStackedNoScroll={isMobileLayout}
                      compactVideoMaxClass="max-h-[min(41dvh,360px)] sm:max-h-[min(45dvh,396px)] max-lg:landscape:max-h-[min(32dvh,288px)]"
                      filterTabs={[...PATROL_CAMERA_FILTER_TABS]}
                      filterFn={tab => filterPatrolCameras(tab as PatrolCameraFilterTab, patrolCamerasLive)}
                      groupFn={cams => groupPatrolCamerasForSidebar(cams)}
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
                      fetchRecords={fetchPatrolCameraRecords}
                      fetchDetections={fetchPatrolRecordDetections}
                      videoAreaFlex={82}
                    />
                  )}
                </div>
              )}
            </Panel>
          </div>

          {/* Tier 3 — HEATMAP | SỰ KIỆN (~36%) */}
          <div className={cn(
            'flex gap-2 sm:gap-3 flex-col md:flex-row min-h-0 shrink-0',
            isMobileLayout && !cameraCollapsed
              ? 'min-h-[min(28dvh,250px)]'
              : 'flex-[6] overflow-hidden max-h-[min(40vh,440px)]',
          )}>
            <Panel
              title="HEATMAP"
              noPadding
              className={cn(
                'flex flex-col overflow-hidden min-h-0 flex-1 md:flex-[3]',
                cameraCollapsed
                  ? 'h-full'
                  : isMobileLayout
                    ? 'min-h-[112px] h-[min(20dvh,170px)] md:min-h-0 md:h-full'
                    : 'min-h-0 h-full',
              )}
              headerRight={
                <button
                  onClick={() => setHeatmapExpanded(v => !v)}
                  className="p-1.5 sm:p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                  title={heatmapExpanded ? 'Thu nhỏ' : 'Phóng to'}
                  aria-label={heatmapExpanded ? 'Thu nhỏ heatmap' : 'Phóng to heatmap'}
                >
                  {heatmapExpanded
                    ? <Minimize2 className="w-3.5 h-3.5" />
                    : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
              }
            >
              <PatrolDensityHeatmap
                expanded={heatmapExpanded}
                onCloseExpand={() => setHeatmapExpanded(false)}
                patrolEvents={patrolEventsLive}
              />
            </Panel>

            <Panel
              title="SỰ KIỆN"
              noPadding
              className={cn(
                'min-h-0 flex flex-col overflow-hidden flex-1 md:flex-[2]',
                cameraCollapsed
                  ? 'h-full'
                  : isMobileLayout
                    ? 'min-h-[91px] h-[min(17dvh,143px)] md:min-h-0 md:h-full'
                    : 'min-h-0 h-full',
                tier3Focus === 'events' && 'md:flex-[3]',
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
                events={patrolEventsLive}
                selectedId={selectedEventId}
                onSelect={handleSelectEvent}
                onDetailClick={ev => setDetailEventId(ev.id)}
                onPlayback={handleSelectEvent}
              />
            </Panel>
          </div>
        </div>
      </PageLayout>

      <PatrolEventDetailModal
        event={detailEvent}
        onClose={() => setDetailEventId(null)}
        onPlayback={handleSelectEvent}
      />

      {/* Chỉ hỏi quyền khi CMS còn phải tự làm camera. Với pipeline mới, việc xin
          quyền thuộc về trang /phat-song trên máy người đeo mũ. */}
      {hasLegacyMobileHelmet() && <PatrolDevicePermissionGate />}
    </>
  )
}
