/**
 * PatrolDensityHeatmap — Module 05 UI per
 * specs/module05/REALTIME_WORKFORCE_HEATMAP_SPECIFICATION.md
 */
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

import { cn } from '@/utils/cn'
import { DEFAULT_PATROL_CAMERA_IDS } from '../data/patrolCameras'
import { isPatrolDroneCameraId, PATROL_DRONE_IDS } from '../data/patrolDrones'
import {
  DETECTION_DOT_OPACITY_IN_VIEW,
  DETECTION_DOT_OPACITY_OUT_OF_VIEW,
} from '../data/patrolDetectionData'
import {
  buildPatrolHeatmapStatsForZone,
  buildPatrolSiteHeatmapStats,
} from '../utils/patrolZoneHeatmapStats'
import { PATROL_GPS_ZONES, PATROL_HELMET_01_FALLBACK, PATROL_HELMET_02_FALLBACK, PATROL_MAP_ACTIVE_HELMET_PINS, PATROL_MAP_ACTIVE_DRONE_PINS, PATROL_DRONE_03_FALLBACK, PATROL_SITE_NAME } from '../data/patrolSiteMap'
import { enforcePatrolHelmetPinSeparation, resolvePatrolHelmetMapPosition } from '../utils/patrolHeatmapGps'
import { usePatrolHelmetGpsLive } from '../hooks/usePatrolHelmetGpsLive'
import { usePatrolLiveMapState } from '../hooks/usePatrolLiveMapState'
import { usePatrolHeatmapViewport } from '../hooks/usePatrolHeatmapViewport'
import type { PatrolDayPresence, PatrolDayStats } from '../services/patrolDayEvents.service'
import type { PatrolFlightMode } from '../utils/patrolFlightMode'
import { buildPatrolLiveZonesFromWorkforce } from '../utils/patrolLiveZones'
import type { TrainingCamera } from '@/modules/module02-training/data/trainingCameras'
import { PatrolGeoHeatmap } from './PatrolGeoHeatmap'
import { PatrolHeatmapSectionControls } from './PatrolHeatmapSectionControls'
import { WorkforceObjectSheet } from './WorkforceObjectSheet'
import {
  subscribePatrolManualIdentity,
} from '../services/patrolManualIdentity.service'
import type { PatrolEvent } from '../data/patrolTypes'
import { buildHelmetDetectCountsFromPresences } from '../utils/patrolHelmetDetectCounts'
import {
  buildPatrolPersEntityLookup,
  buildPatrolPresenceHeatmapDots,
  filterPatrolHeatmapDotsByDevice,
} from '../utils/patrolDayHeatmapDots'
import { PATROL_FLYMAP_DOT_HEX, PATROL_HEATMAP_DOT_HEX } from '../utils/patrolDetectionDotUi'
import {
  filterPatrolHeatmapDotsExcludeAerialFlycam,
  filterPatrolPresencesForHeatmap,
} from '../utils/patrolFlycamEventFilter'
import { clearPatrolHeatmapLiveTracks } from '../utils/patrolHeatmapLiveSync'
import type { PatrolTier } from '../utils/patrolTierTokens'
import type { ObjectState, WorkforceSnapshot } from '../types/workforceHeatmap'

/**
 * Mọi camera đóng góp chấm lên bản đồ — hai mũ và một drone.
 *
 * Trước đây bản đồ chỉ đọc registry của HC-02: người do HC-01 và drone phát
 * hiện vẫn được ghi vào registry nhưng không bao giờ được vẽ.
 */
const PATROL_MAP_CAMERA_IDS: readonly string[] = [
  ...DEFAULT_PATROL_CAMERA_IDS,
  ...PATROL_DRONE_IDS,
]

function HeatmapSiteStatsOverlay({
  title,
  objectCount,
  personCount,
  identityCount,
  compactChrome,
}: {
  title: string
  objectCount: number
  personCount: number
  identityCount: number
  compactChrome?: boolean
}) {
  const rows: Array<{ value: number; label: string; tier: PatrolTier }> = [
    { value: objectCount, label: 'Đối tượng', tier: 'object' },
    { value: personCount, label: 'Người', tier: 'person' },
    { value: identityCount, label: 'Định danh', tier: 'identity' },
  ]

  return (
    <div
      className={cn(
        'absolute z-30 pointer-events-none',
        'right-2 max-sm:right-1.5',
        compactChrome ? 'bottom-2 max-sm:bottom-1.5' : 'bottom-14 max-sm:bottom-12',
        'pr-[env(safe-area-inset-right,0px)] pb-[env(safe-area-inset-bottom,0px)]',
      )}
    >
      <div className="overflow-hidden rounded border border-[#334155] bg-[#111827] shadow-sm min-w-[108px]">
        <div
          className={cn(
            'px-2.5 py-1 border-b border-[#334155] text-[#94a3b8] font-medium truncate',
            compactChrome ? 'text-[8px]' : 'text-[9px]',
          )}
        >
          {title}
        </div>
        {rows.map((row, index) => (
          <div
            key={row.label}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 text-[#e2e8f0] text-left leading-tight whitespace-nowrap',
              compactChrome ? 'text-[9px]' : 'text-[10px]',
              index < rows.length - 1 && 'border-b border-[#334155]',
            )}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: PATROL_HEATMAP_DOT_HEX[row.tier] }}
              aria-hidden
            />
            <span>{row.label}:</span>
            {' '}
            <span className="tabular-nums font-semibold">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function HeatmapLayerControls({
  layers,
  onToggle,
  compactChrome,
  flymapMode = false,
}: {
  layers: { polygon: boolean; density: boolean; helmet: boolean; flycam: boolean }
  onToggle: (key: 'polygon' | 'density' | 'helmet' | 'flycam') => void
  compactChrome?: boolean
  flymapMode?: boolean
}) {
  const items = flymapMode
    ? [
        { key: 'polygon' as const, label: 'Khu vực' },
        { key: 'density' as const, label: 'Mật độ' },
        { key: 'flycam' as const, label: 'Drone' },
      ]
    : [
        { key: 'polygon' as const, label: 'Khu vực' },
        { key: 'density' as const, label: 'Mật độ' },
        { key: 'helmet' as const, label: 'Mũ' },
        { key: 'flycam' as const, label: 'Flycam' },
      ]

  return (
    <div
      className={cn(
        'absolute z-30 top-2 max-sm:top-1.5',
        compactChrome ? 'right-2 max-sm:right-1.5' : 'left-2 max-sm:left-1.5',
        compactChrome
          ? 'pr-[env(safe-area-inset-right,0px)] pt-[env(safe-area-inset-top,0px)]'
          : 'pl-[env(safe-area-inset-left,0px)] pt-[env(safe-area-inset-top,0px)]',
      )}
    >
      <div className="flex items-stretch overflow-hidden rounded border border-[#334155] bg-[#111827]/95 shadow-sm pointer-events-auto">
        {items.map((item, index) => {
          const active = layers[item.key]
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onToggle(item.key)}
              className={cn(
                'inline-flex items-center px-1.5 py-0.5 text-[8px] leading-none font-medium transition-colors',
                index > 0 && 'border-l border-[#334155]',
                active ? 'text-[#e2e8f0]' : 'text-[#64748b] hover:text-[#94a3b8]',
              )}
            >
              {item.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function FlymapStatsOverlay({
  detectionCount,
  compactChrome,
}: {
  detectionCount: number
  compactChrome?: boolean
}) {
  return (
    <div
      className={cn(
        'absolute z-30 pointer-events-none',
        'right-2 max-sm:right-1.5',
        compactChrome ? 'bottom-2 max-sm:bottom-1.5' : 'bottom-14 max-sm:bottom-12',
        'pr-[env(safe-area-inset-right,0px)] pb-[env(safe-area-inset-bottom,0px)]',
      )}
    >
      <div className="overflow-hidden rounded border border-[#334155] bg-[#111827] shadow-sm min-w-[108px] px-2.5 py-1.5 text-[#e2e8f0] text-left leading-tight whitespace-nowrap">
        <div className={cn('flex items-center gap-1.5', compactChrome ? 'text-[9px]' : 'text-[10px]')}>
          <span
            className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: PATROL_FLYMAP_DOT_HEX }}
            aria-hidden
          />
          <span>Phát hiện:</span>
          {' '}
          <span className="tabular-nums font-semibold">{detectionCount}</span>
        </div>
      </div>
    </div>
  )
}

export function PatrolDensityHeatmap({
  expanded = false,
  onCloseExpand,
  showFlymap = false,
  onFlymapToggle,
  droneCamera,
  patrolEvents = [],
  patrolEventsAll,
  viewDate: _viewDate,
  presences,
  dayStats,
  workforce,
  flycamFlightModes,
  helmetOnlineById,
  visitedByZoneId,
}: {
  /** Phóng to tại chỗ — giữ nguyên map instance, ROI và layer state. */
  expanded?: boolean
  onCloseExpand?: () => void
  /** Thay heatmap site bằng flymap — bản đồ Cầu Sông Hốt clone, chỉ drone, chấm một màu. */
  showFlymap?: boolean
  onFlymapToggle?: () => void
  droneCamera?: TrainingCamera | null
  /** Feed sự kiện deduped — tooltip mũ + KPI detect (tránh fetch thêm). */
  patrolEvents?: PatrolEvent[]
  patrolEventsAll?: PatrolEvent[]
  /** Ngày lịch VN đồng bộ với tab Sự kiện / playback. */
  viewDate?: string
  presences: PatrolDayPresence[]
  dayStats: PatrolDayStats
  workforce: WorkforceSnapshot
  flycamFlightModes: Record<string, PatrolFlightMode>
  helmetOnlineById: Record<string, boolean>
  /** KPI phủ khu — ưu tiên hơn observed_count workforce. */
  visitedByZoneId?: Record<string, boolean>
}) {
  const viewport = usePatrolHeatmapViewport()
  const [layers, setLayers] = useState({
    polygon: true,
    density: true,
    helmet: true,
    flycam: true,
  })
  const [selectedObject, setSelectedObject] = useState<ObjectState | null>(null)
  const [identityRevision, setIdentityRevision] = useState(0)
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)

  const hc02Helmet = workforce.helmets['HC-02']

  const liveObjects = useMemo(
    () => Object.values(workforce.objects).filter(o => o.status !== 'EXPIRED'),
    [workforce.objects],
  )

  const liveZones = useMemo(
    () => buildPatrolLiveZonesFromWorkforce(workforce, visitedByZoneId),
    [workforce, visitedByZoneId],
  )

  const { cameraPositions, routeHistory } = usePatrolLiveMapState()
  const hc02Gps = usePatrolHelmetGpsLive('HC-02')

  const helmetDetectCountsById = useMemo(
    () => buildHelmetDetectCountsFromPresences(presences, PATROL_MAP_CAMERA_IDS),
    [presences],
  )

  // Kể cả drone: nó cũng phát hiện người và đóng góp chấm lên bản đồ.

  useEffect(() => {
    return subscribePatrolManualIdentity(() => setIdentityRevision(t => t + 1))
  }, [])

  const hc01Online = Boolean(helmetOnlineById['HC-01'])
  const hc02Online = Boolean(helmetOnlineById['HC-02'])
  const droneOnline = PATROL_DRONE_IDS.some(id => Boolean(helmetOnlineById[id]))
  const anyCameraOnline = hc01Online || hc02Online || droneOnline

  const mergedCameraPositions = useMemo(() => {
    const next = { ...cameraPositions }
    const hc01Pin = PATROL_MAP_ACTIVE_HELMET_PINS.find(p => p.id === 'HC-01')
    const hc01Default = hc01Pin?.position ?? PATROL_HELMET_01_FALLBACK
    const hc01Wf = workforce.helmets['HC-01']
    if (helmetOnlineById['HC-01'] && hc01Wf?.lat != null && hc01Wf?.lon != null) {
      next['HC-01'] = resolvePatrolHelmetMapPosition(hc01Wf.lat, hc01Wf.lon, hc01Default)
    } else {
      next['HC-01'] = hc01Default
    }
    const hc02Pin = PATROL_MAP_ACTIVE_HELMET_PINS.find(p => p.id === 'HC-02')
    const hc02Default = hc02Pin?.position ?? PATROL_HELMET_02_FALLBACK
    if (hc02Online) {
      const hc02Wf = workforce.helmets['HC-02']
      const hc02Lat = hc02Wf?.lat ?? hc02Gps.lat
      const hc02Lng = hc02Wf?.lon ?? hc02Gps.lng
      next['HC-02'] = resolvePatrolHelmetMapPosition(hc02Lat, hc02Lng, hc02Default)
    } else {
      next['HC-02'] = hc02Default
    }
    for (const dronePin of PATROL_MAP_ACTIVE_DRONE_PINS) {
      const droneWf = workforce.helmets[dronePin.id]
      if (helmetOnlineById[dronePin.id] && droneWf?.lat != null && droneWf?.lon != null) {
        next[dronePin.id] = resolvePatrolHelmetMapPosition(
          droneWf.lat,
          droneWf.lon,
          dronePin.position,
        )
      } else {
        next[dronePin.id] = dronePin.position ?? PATROL_DRONE_03_FALLBACK
      }
    }
    return enforcePatrolHelmetPinSeparation(next)
  }, [
    cameraPositions,
    helmetOnlineById,
    hc02Online,
    workforce.helmets,
    hc02Gps.lat,
    hc02Gps.lng,
  ])

  const mergedRouteHistory = useMemo(() => {
    const appendPos = (
      base: typeof routeHistory,
      deviceId: string,
      pos: [number, number],
    ) => {
      const hist = base[deviceId] ?? []
      const filtered = hist.filter(([la, ln]) => {
        const dLat = (la - pos[0]) * 111_320
        const dLng = (ln - pos[1]) * 111_320 * Math.cos((pos[0] * Math.PI) / 180)
        return Math.hypot(dLat, dLng) < 80
      })
      const last = filtered[filtered.length - 1]
      if (last && last[0] === pos[0] && last[1] === pos[1]) {
        return { ...base, [deviceId]: filtered }
      }
      return { ...base, [deviceId]: [...filtered, pos].slice(-150) }
    }

    let next: typeof routeHistory = { ...routeHistory }

    if (hc02Online && hc02Gps.lat != null && hc02Gps.lng != null) {
      const pos = resolvePatrolHelmetMapPosition(hc02Gps.lat, hc02Gps.lng, PATROL_HELMET_02_FALLBACK)
      next = appendPos(next, 'HC-02', pos)
    } else {
      const { 'HC-02': _drop, ...rest } = next
      next = rest
    }

    for (const dronePin of PATROL_MAP_ACTIVE_DRONE_PINS) {
      const droneWf = workforce.helmets[dronePin.id]
      if (!helmetOnlineById[dronePin.id] || droneWf?.lat == null || droneWf?.lon == null) {
        const { [dronePin.id]: _drop, ...rest } = next
        next = rest
        continue
      }
      const pos = resolvePatrolHelmetMapPosition(
        droneWf.lat,
        droneWf.lon,
        dronePin.position ?? PATROL_DRONE_03_FALLBACK,
      )
      next = appendPos(next, dronePin.id, pos)
    }

    if (showFlymap) {
      const flyRoutes: typeof routeHistory = {}
      for (const id of PATROL_DRONE_IDS) {
        if (next[id]?.length) flyRoutes[id] = next[id]
      }
      return flyRoutes
    }

    const helmetRoutes: typeof routeHistory = {}
    for (const pin of PATROL_MAP_ACTIVE_HELMET_PINS) {
      if (next[pin.id]?.length) helmetRoutes[pin.id] = next[pin.id]
    }
    return helmetRoutes
  }, [
    routeHistory,
    hc02Gps.lat,
    hc02Gps.lng,
    hc02Online,
    workforce.helmets,
    helmetOnlineById,
    showFlymap,
  ])

  useEffect(() => {
    if (hc01Online) return
    clearPatrolHeatmapLiveTracks('HC-01')
  }, [hc01Online])

  useEffect(() => {
    if (hc02Online) return
    clearPatrolHeatmapLiveTracks('HC-02')
  }, [hc02Online])

  useEffect(() => {
    if (droneOnline) return
    for (const id of PATROL_DRONE_IDS) {
      clearPatrolHeatmapLiveTracks(id)
    }
  }, [droneOnline])

  const toggleLayer = (k: keyof typeof layers) =>
    setLayers(prev => ({ ...prev, [k]: !prev[k] }))

  useEffect(() => {
    if (!layers.polygon) setSelectedZoneId(null)
  }, [layers.polygon])

  const heatmapStats = useMemo(
    () => buildPatrolSiteHeatmapStats(dayStats),
    [dayStats],
  )

  const statsPresences = useMemo(
    () => filterPatrolPresencesForHeatmap(presences, flycamFlightModes),
    [presences, flycamFlightModes],
  )

  const displayStats = useMemo(
    () => (selectedZoneId
      ? buildPatrolHeatmapStatsForZone(statsPresences, selectedZoneId)
      : heatmapStats),
    [selectedZoneId, statsPresences, heatmapStats],
  )

  const statsTitle = useMemo(() => {
    if (!selectedZoneId) return PATROL_SITE_NAME
    return PATROL_GPS_ZONES.find(z => z.zone_id === selectedZoneId)?.name ?? PATROL_SITE_NAME
  }, [selectedZoneId])

  const headingDeg = hc02Helmet?.heading

  const helmetHeadingById = useMemo(() => {
    const map: Record<string, number | null | undefined> = {}
    for (const [id, h] of Object.entries(workforce.helmets)) {
      map[id] = h.heading
    }
    if (headingDeg != null) map['HC-02'] = headingDeg
    return map
  }, [workforce.helmets, headingDeg])

  const filteredDots = useMemo(() => {
    if (!layers.density) return []

    void identityRevision

    const eventCatalog = patrolEventsAll ?? patrolEvents
    const persEntityLookup = buildPatrolPersEntityLookup(eventCatalog)
    const scopedPresences = showFlymap
      ? presences.filter(p => isPatrolDroneCameraId(p.cameraId || p.sourceCameras[0] || ''))
      : filterPatrolPresencesForHeatmap(presences, flycamFlightModes)
    const liveOnlyOnline = showFlymap ? droneOnline : anyCameraOnline

    const presenceOpts = {
      cameraOnlineById: helmetOnlineById,
      includeUnassigned: true,
      helmetPositionsById: mergedCameraPositions,
      helmetHeadingsById: helmetHeadingById,
      flightModeByCamera: flycamFlightModes,
      persEntityLookup,
    } as const

    let merged = buildPatrolPresenceHeatmapDots(scopedPresences, {
      ...presenceOpts,
      liveOnly: liveOnlyOnline,
    })
    if (liveOnlyOnline && merged.length === 0) {
      merged = buildPatrolPresenceHeatmapDots(scopedPresences, {
        ...presenceOpts,
        liveOnly: false,
      })
    }

    if (!showFlymap) {
      merged = filterPatrolHeatmapDotsExcludeAerialFlycam(merged, flycamFlightModes)
    }

    const byDevice = filterPatrolHeatmapDotsByDevice(merged, {
      helmet: showFlymap ? false : layers.helmet,
      flycam: showFlymap ? true : layers.flycam,
    })

    return byDevice.map(dot => ({
      ...dot,
      ...(showFlymap
        ? { tier: 'person' as const, verified: false, label: undefined, objectId: undefined }
        : null),
      opacity: dot.inCameraView
        ? DETECTION_DOT_OPACITY_IN_VIEW
        : DETECTION_DOT_OPACITY_OUT_OF_VIEW,
    }))
  }, [
    layers.density,
    presences,
    patrolEvents,
    patrolEventsAll,
    showFlymap,
    anyCameraOnline,
    droneOnline,
    helmetOnlineById,
    identityRevision,
    mergedCameraPositions,
    helmetHeadingById,
    layers.helmet,
    layers.flycam,
    flycamFlightModes,
  ])

  const onDetectionClick = (dot: { objectId?: string; id: string }) => {
    const oid = dot.objectId || (dot.id.startsWith('OBJ-') ? dot.id : null)
    if (!oid) return
    const obj = workforce.objects[oid] || liveObjects.find(o => o.object_id === oid)
    if (obj) setSelectedObject(obj)
  }

  const personCount = displayStats.personCount
  const identifiedCount = displayStats.identityCount
  const objectEncounterCount = displayStats.objectCount

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseExpand?.() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [expanded, onCloseExpand])

  const primaryDroneId = droneCamera?.id ?? PATROL_DRONE_IDS[0]
  const primaryDroneOnline = Boolean(primaryDroneId && helmetOnlineById[primaryDroneId])
  const primaryDroneWf = workforce.helmets[primaryDroneId]
  const droneHasLiveGps = primaryDroneWf?.lat != null && primaryDroneWf?.lon != null

  const mapBody = (
    <>
      <div className={cn(
        'min-w-0 relative',
        expanded ? viewport.modalMapClass : viewport.embeddedMapClass,
      )}>
        <PatrolGeoHeatmap
          zones={liveZones}
          cameraPositions={mergedCameraPositions}
          routeHistory={mergedRouteHistory}
          layer="combined"
          displayMode="count"
          countMode="current"
          showSiteBoundary={false}
          showZoneDividers={false}
          showZonePolygons={layers.polygon}
          interactiveZones={layers.polygon}
          selectedZoneId={selectedZoneId}
          onZoneSelect={setSelectedZoneId}
          showDetections={layers.density}
          liveDetectionDots={filteredDots}
          followLiveGps={showFlymap
            ? (primaryDroneOnline && droneHasLiveGps)
            : (hc02Online && hc02Gps.hasLiveGps)}
          liveGpsLat={showFlymap ? (primaryDroneWf?.lat ?? null) : (hc02Online ? hc02Gps.lat : null)}
          liveGpsLng={showFlymap ? (primaryDroneWf?.lon ?? null) : (hc02Online ? hc02Gps.lng : null)}
          showDensity={false}
          showZoneStatLabels={false}
          showRoute={showFlymap ? layers.flycam : layers.helmet}
          showHelmetMarkers={!showFlymap && layers.helmet}
          showDroneMarkers={showFlymap ? layers.flycam : layers.flycam}
          showCameras={false}
          helmetOnlineById={helmetOnlineById}
          helmetHeadingById={helmetHeadingById}
          helmetDetectCountsById={helmetDetectCountsById}
          onDetectionClick={showFlymap ? undefined : onDetectionClick}
          requireLiveGpsForHc02={false}
          hasHc02LiveGps={hc02Gps.hasMapPosition}
          mapZoom={viewport.mapZoom}
          compactControls={viewport.compactChrome}
          uniformDotColor={showFlymap ? PATROL_FLYMAP_DOT_HEX : undefined}
          simpleDotTooltip={showFlymap}
          routeDeviceIds={showFlymap ? [...PATROL_DRONE_IDS] : undefined}
          flightModeByCamera={flycamFlightModes}
        />
        <HeatmapLayerControls
          layers={layers}
          onToggle={toggleLayer}
          compactChrome={viewport.compactChrome}
          flymapMode={showFlymap}
        />
        {showFlymap ? (
          <FlymapStatsOverlay
            detectionCount={filteredDots.length}
            compactChrome={viewport.compactChrome}
          />
        ) : (
          <HeatmapSiteStatsOverlay
            title={statsTitle}
            objectCount={objectEncounterCount}
            personCount={personCount}
            identityCount={identifiedCount}
            compactChrome={viewport.compactChrome}
          />
        )}
        {!showFlymap && (
          <WorkforceObjectSheet object={selectedObject} onClose={() => setSelectedObject(null)} />
        )}
      </div>
    </>
  )

  const sectionTitle = showFlymap ? 'Flymap' : 'Heatmap'

  return (
    <>
      {expanded && createPortal(
        <div
          className="fixed inset-0 z-[110] bg-black/80 sm:bg-black/75 backdrop-blur-[2px]"
          onClick={() => onCloseExpand?.()}
          role="presentation"
          aria-hidden
        />,
        document.body,
      )}
      <div
        className={cn(
          'flex flex-col overflow-hidden h-full min-h-0 flex-1',
          expanded && [
            'fixed inset-0 z-[120] bg-[#0a0e17] shadow-2xl shadow-black/60',
            'pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]',
            'sm:inset-4 sm:rounded-xl sm:border sm:border-[#2a3855]',
          ],
        )}
        onClick={expanded ? e => e.stopPropagation() : undefined}
        role={expanded ? 'dialog' : undefined}
        aria-modal={expanded || undefined}
        aria-label={expanded ? 'Heatmap tuần tra' : undefined}
      >
        {expanded && (
          <div className="flex items-center justify-between px-3 sm:px-4 py-2 border-b border-[#1e2433] shrink-0">
            <span className="text-[11px] font-bold tracking-widest text-foreground uppercase">{sectionTitle}</span>
            {onFlymapToggle ? (
              <PatrolHeatmapSectionControls
                flymapActive={showFlymap}
                onFlymapToggle={onFlymapToggle}
                expanded
                onCloseExpand={onCloseExpand}
              />
            ) : (
              <button
                type="button"
                onClick={() => onCloseExpand?.()}
                className="p-2 sm:p-1.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
                aria-label="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
        {mapBody}
      </div>
    </>
  )
}
