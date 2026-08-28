/**
 * PatrolDensityHeatmap — Module 05 UI per
 * specs/module05/REALTIME_WORKFORCE_HEATMAP_SPECIFICATION.md
 */
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

import { cn } from '@/utils/cn'
import {
  getPatrolMobileLiveSnapshot,
  subscribePatrolMobileLiveSnapshot,
} from '@/services/patrolMobileMetricsBridge'
import { DEFAULT_PATROL_CAMERA_IDS } from '../data/patrolCameras'
import { PATROL_DRONE_IDS } from '../data/patrolDrones'
import {
  DETECTION_DOT_OPACITY_IN_VIEW,
  DETECTION_DOT_OPACITY_OUT_OF_VIEW,
} from '../data/patrolDetectionData'
import { PATROL_HELMET_01_FALLBACK, PATROL_HELMET_02_FALLBACK, PATROL_MAP_ACTIVE_HELMET_PINS, PATROL_MAP_ACTIVE_DRONE_PINS, PATROL_DRONE_03_FALLBACK } from '../data/patrolSiteMap'
import { enforcePatrolHelmetPinSeparation, resolvePatrolHelmetMapPosition } from '../utils/patrolHeatmapGps'
import { useHc02LiveDetectionDots } from '../hooks/useHc02LiveDetectionDots'
import { usePatrolHelmetLiveMetrics } from '../hooks/usePatrolHelmetLiveMetrics'
import { useWorkforceRealtimeState } from '../hooks/useWorkforceRealtimeState'
import { usePatrolWebSocket } from '../services/usePatrolWebSocket'
import { usePatrolHeatmapViewport } from '../hooks/usePatrolHeatmapViewport'
import { PatrolGeoHeatmap } from './PatrolGeoHeatmap'
import { WorkforceObjectSheet } from './WorkforceObjectSheet'
import {
  subscribePatrolManualIdentity,
} from '../services/patrolManualIdentity.service'
import type { PatrolEvent } from '../data/patrolTypes'
import { buildHelmetDetectCountsById } from '../utils/patrolHelmetDetectCounts'
import {
  buildPatrolDayHeatmapDots,
  buildPatrolPresenceHeatmapDots,
  filterPatrolHeatmapDotsByDevice,
  mergePatrolHeatmapDetectionDots,
} from '../utils/patrolDayHeatmapDots'
import {
  getHeatmapPersonDots,
  subscribeHeatmapPersonRegistry,
} from '@/services/patrolHeatmapPersonRegistry'
import { usePatrolDayPresences } from '../hooks/usePatrolDayPresences'
import { usePatrolFlycamFlightModes } from '../hooks/usePatrolFlycamFlightModes'
import { usePatrolDayStats } from '../hooks/usePatrolDayStats'
import { clearPatrolHeatmapLiveTracks } from '../utils/patrolHeatmapLiveSync'
import type { ObjectState } from '../types/workforceHeatmap'

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
  objectCount,
  personCount,
  identityCount,
  compactChrome,
}: {
  objectCount: number
  personCount: number
  identityCount: number
  compactChrome?: boolean
}) {
  const rows = [
    { value: objectCount, label: 'Đối tượng' },
    { value: personCount, label: 'Người' },
    { value: identityCount, label: 'Định danh' },
  ] as const

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
        {rows.map((row, index) => (
          <div
            key={row.label}
            className={cn(
              'px-2.5 py-1 text-[#e2e8f0] text-left leading-tight whitespace-nowrap',
              compactChrome ? 'text-[9px]' : 'text-[10px]',
              index < rows.length - 1 && 'border-b border-[#334155]',
            )}
          >
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
}: {
  layers: { density: boolean; helmet: boolean; flycam: boolean }
  onToggle: (key: 'density' | 'helmet' | 'flycam') => void
  compactChrome?: boolean
}) {
  const items = [
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

export function PatrolDensityHeatmap({
  expanded = false,
  onCloseExpand,
  patrolEvents = [],
}: {
  /** Phóng to tại chỗ — giữ nguyên map instance, ROI và layer state. */
  expanded?: boolean
  onCloseExpand?: () => void
  /** Feed sự kiện deduped — tooltip mũ + KPI detect (tránh fetch thêm). */
  patrolEvents?: PatrolEvent[]
}) {
  const viewport = usePatrolHeatmapViewport()
  const [layers, setLayers] = useState({
    density: true,
    helmet: true,
    flycam: true,
  })
  const [selectedObject, setSelectedObject] = useState<ObjectState | null>(null)
  const [identityRevision, setIdentityRevision] = useState(0)
  const [registryRevision, setRegistryRevision] = useState(0)
  const [mobileHc02Live, setMobileHc02Live] = useState(
    () => Boolean(getPatrolMobileLiveSnapshot('HC-02')?.streamOnline),
  )

  const workforce = useWorkforceRealtimeState([...DEFAULT_PATROL_CAMERA_IDS])
  const hc02Helmet = workforce.helmets['HC-02']

  const liveObjects = useMemo(
    () => Object.values(workforce.objects).filter(o => o.status !== 'EXPIRED'),
    [workforce.objects],
  )

  const { liveZones, cameraPositions, routeHistory } = usePatrolWebSocket('PATROL_LIVE')
  const hc02Live = useHc02LiveDetectionDots()

  const helmetDetectCountsById = useMemo(
    () => buildHelmetDetectCountsById(patrolEvents, PATROL_MAP_CAMERA_IDS),
    [patrolEvents],
  )

  // Kể cả drone: nó cũng phát hiện người và đóng góp chấm lên bản đồ.
  const metrics = usePatrolHelmetLiveMetrics(PATROL_MAP_CAMERA_IDS)
  const flycamFlightModes = usePatrolFlycamFlightModes(PATROL_DRONE_IDS)

  useEffect(() => {
    return subscribePatrolManualIdentity(() => setIdentityRevision(t => t + 1))
  }, [])

  useEffect(() => subscribeHeatmapPersonRegistry(() => {
    setRegistryRevision(t => t + 1)
  }), [])

  useEffect(() => {
    return subscribePatrolMobileLiveSnapshot(snap => {
      if (!snap || snap.cameraId !== 'HC-02') {
        setMobileHc02Live(false)
        return
      }
      setMobileHc02Live(Boolean(snap.streamOnline))
    })
  }, [])


  const helmetOnlineById = useMemo(() => {
    const map: Record<string, boolean> = Object.fromEntries(
      PATROL_MAP_CAMERA_IDS.map(id => [id, false]),
    )
    for (const row of metrics.perCamera) {
      map[row.camera_id] = Boolean(row.stream_online)
    }
    // HC-02 bodycam: CMS bridge là nguồn sự thật khi tab đã từng mở/tắt cam.
    const mobile = getPatrolMobileLiveSnapshot('HC-02')
    if (mobile) {
      map['HC-02'] = Boolean(mobile.streamOnline)
    }
    return map
  }, [metrics.perCamera, mobileHc02Live])

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
      const hc02Lat = hc02Wf?.lat ?? hc02Live.lat
      const hc02Lng = hc02Wf?.lon ?? hc02Live.lng
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
    hc02Live.lat,
    hc02Live.lng,
  ])

  const mergedRouteHistory = useMemo(() => {
    if (!hc02Online) {
      const { 'HC-02': _drop, ...rest } = routeHistory
      return rest
    }
    if (hc02Live.lat == null || hc02Live.lng == null) {
      const { 'HC-02': _drop, ...rest } = routeHistory
      return rest
    }
    const pos = resolvePatrolHelmetMapPosition(hc02Live.lat, hc02Live.lng, PATROL_HELMET_02_FALLBACK)
    const hist = routeHistory['HC-02'] ?? []
    const filtered = hist.filter(([la, ln]) => {
      const dLat = (la - pos[0]) * 111_320
      const dLng = (ln - pos[1]) * 111_320 * Math.cos((pos[0] * Math.PI) / 180)
      return Math.hypot(dLat, dLng) < 80
    })
    const last = filtered[filtered.length - 1]
    if (last && last[0] === pos[0] && last[1] === pos[1]) {
      return { ...routeHistory, 'HC-02': filtered }
    }
    return { ...routeHistory, 'HC-02': [...filtered, pos].slice(-150) }
  }, [routeHistory, hc02Live.lat, hc02Live.lng, hc02Online])

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

  const { presences } = usePatrolDayPresences()
  const { stats: dayStats } = usePatrolDayStats()

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
    void registryRevision

    const presenceOpts = {
      cameraOnlineById: helmetOnlineById,
      includeUnassigned: true,
      helmetPositionsById: mergedCameraPositions,
      helmetHeadingsById: helmetHeadingById,
      flightModeByCamera: flycamFlightModes,
    } as const

    let presenceDots = buildPatrolPresenceHeatmapDots(presences, {
      ...presenceOpts,
      liveOnly: anyCameraOnline,
    })
    if (anyCameraOnline && presenceDots.length === 0) {
      presenceDots = buildPatrolPresenceHeatmapDots(presences, {
        ...presenceOpts,
        liveOnly: false,
      })
    }

    const registryDots = PATROL_MAP_CAMERA_IDS.flatMap(cameraId => {
      if (!helmetOnlineById[cameraId]) return []
      return getHeatmapPersonDots(cameraId)
    })

    let merged = mergePatrolHeatmapDetectionDots([presenceDots, registryDots])

    if (merged.length === 0 && patrolEvents.length > 0) {
      let eventDots = buildPatrolDayHeatmapDots(patrolEvents, {
        liveOnly: anyCameraOnline,
        cameraOnlineById: helmetOnlineById,
      })
      if (anyCameraOnline && eventDots.length === 0) {
        eventDots = buildPatrolDayHeatmapDots(patrolEvents, {
          liveOnly: false,
          cameraOnlineById: helmetOnlineById,
        })
      }
      merged = eventDots
    }

    const byDevice = filterPatrolHeatmapDotsByDevice(merged, {
      helmet: layers.helmet,
      flycam: layers.flycam,
    })
    return byDevice.map(dot => ({
      ...dot,
      opacity: dot.inCameraView
        ? DETECTION_DOT_OPACITY_IN_VIEW
        : DETECTION_DOT_OPACITY_OUT_OF_VIEW,
    }))
  }, [
    layers.density,
    presences,
    patrolEvents,
    anyCameraOnline,
    helmetOnlineById,
    identityRevision,
    registryRevision,
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

  const workersStandard = dayStats.workersStandard
  const personCount = dayStats.personCount
  const identifiedCount = dayStats.identityCount
  const unassignedCount = dayStats.unassignedObservations

  const siteHeadcount = useMemo(() => ({
    observed: workersStandard,
    identified: identifiedCount,
    objects: unassignedCount,
    persons: personCount,
  }), [workersStandard, identifiedCount, unassignedCount, personCount])

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
          showZonePolygons={false}
          showDetections={layers.density}
          liveDetectionDots={filteredDots}
          followLiveGps={hc02Online && hc02Live.hasLiveGps}
          liveGpsLat={hc02Online ? hc02Live.lat : null}
          liveGpsLng={hc02Online ? hc02Live.lng : null}
          showDensity={false}
          showRoute={layers.helmet}
          showHelmetMarkers={layers.helmet}
          showDroneMarkers={layers.flycam}
          showCameras={false}
          helmetOnlineById={helmetOnlineById}
          helmetHeadingById={helmetHeadingById}
          siteHeadcount={siteHeadcount}
          helmetDetectCountsById={helmetDetectCountsById}
          onDetectionClick={onDetectionClick}
          requireLiveGpsForHc02={false}
          hasHc02LiveGps={hc02Live.hasMapPosition}
          mapZoom={viewport.mapZoom}
          compactControls={viewport.compactChrome}
        />
        <HeatmapLayerControls
          layers={layers}
          onToggle={toggleLayer}
          compactChrome={viewport.compactChrome}
        />
        <HeatmapSiteStatsOverlay
          objectCount={unassignedCount}
          personCount={personCount}
          identityCount={identifiedCount}
          compactChrome={viewport.compactChrome}
        />
        <WorkforceObjectSheet object={selectedObject} onClose={() => setSelectedObject(null)} />
      </div>
    </>
  )

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
            <span className="text-[11px] font-bold tracking-widest text-foreground uppercase">Heatmap</span>
            <button
              type="button"
              onClick={() => onCloseExpand?.()}
              className="p-2 sm:p-1.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
              aria-label="Đóng"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {mapBody}
      </div>
    </>
  )
}
