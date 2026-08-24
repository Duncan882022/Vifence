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
import { DEFAULT_PATROL_CAMERA_IDS, PATROL_BODYCAM_LABELS } from '../data/patrolCameras'
import {
  DETECTION_DOT_OPACITY_IN_VIEW,
  DETECTION_DOT_OPACITY_OUT_OF_VIEW,
  type DetectionDot,
} from '../data/patrolDetectionData'
import { PATROL_SITE_CENTER, PATROL_HELMET_02_FALLBACK, PATROL_MAP_ACTIVE_HELMET_PINS } from '../data/patrolSiteMap'
import { resolvePatrolHelmetMapPosition } from '../utils/patrolHeatmapGps'
import { useHc02LiveDetectionDots } from '../hooks/useHc02LiveDetectionDots'
import { usePatrolHelmetLiveMetrics } from '../hooks/usePatrolHelmetLiveMetrics'
import { useWorkforceRealtimeState } from '../hooks/useWorkforceRealtimeState'
import { usePatrolWebSocket } from '../services/usePatrolWebSocket'
import { usePatrolHeatmapViewport } from '../hooks/usePatrolHeatmapViewport'
import { PatrolGeoHeatmap } from './PatrolGeoHeatmap'
import { WorkforceObjectSheet } from './WorkforceObjectSheet'
import {
  isVerifiedWorkerLabel,
} from '../utils/workforceHeatmapUi'
import {
  isPatrolManuallyIdentified,
  resolvePatrolObjectLabel,
  resolvePatrolWorkerId,
  subscribePatrolManualIdentity,
} from '../services/patrolManualIdentity.service'
import type { PatrolEvent } from '../data/patrolMockData'
import { buildHelmetDetectCountsById } from '../utils/patrolHelmetDetectCounts'
import { subscribeHeatmapPersonRegistry, syncHeatmapFramePresence, clearHeatmapPersonRegistry } from '@/services/patrolHeatmapPersonRegistry'
import { countPatrolGlobalWorkers, isPatrolHeatmapEligibleId } from '../utils/patrolPatrolCounts'
import { isPatrolGalleryWorkerId } from '../utils/patrolIdentityEntity'
import { isPatrolSgcWorkerId } from '../utils/patrolWorkforceEventLabels'
import { clearPatrolHeatmapLiveTracks } from '../utils/patrolHeatmapLiveSync'
import type { ObjectState } from '../types/workforceHeatmap'

function LayerToggle({
  active,
  color,
  onClick,
  children,
  compact,
}: {
  active: boolean
  color: string
  onClick: () => void
  children: React.ReactNode
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded font-medium transition-all border shrink-0',
        compact ? 'px-2.5 py-1 text-[10px] min-h-[28px]' : 'px-2 py-0.5 text-[9px]',
        active
          ? 'text-white border-transparent'
          : 'bg-transparent text-[#475569] border-[#334155] hover:border-[#475569]',
      )}
      style={active ? { background: color, borderColor: color } : {}}
    >
      <span
        className={cn('w-1.5 h-1.5 rounded-full shrink-0 transition-all', active ? 'opacity-100' : 'opacity-30')}
        style={{ background: active ? '#fff' : color }}
      />
      {children}
    </button>
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
    polygon: true,
    detection: true,
    route: true,
  })
  const [selectedObject, setSelectedObject] = useState<ObjectState | null>(null)
  const [identityRevision, setIdentityRevision] = useState(0)
  const [pinTick, setPinTick] = useState(0)
  const [mobileHc02Live, setMobileHc02Live] = useState(
    () => Boolean(getPatrolMobileLiveSnapshot('HC-02')?.streamOnline),
  )

  const workforce = useWorkforceRealtimeState([...DEFAULT_PATROL_CAMERA_IDS])
  const hc02Helmet = workforce.helmets['HC-02']

  const zonePop = useMemo(() => {
    const zones = Object.values(workforce.zonePopulation)
    if (hc02Helmet?.zone_id) {
      return workforce.zonePopulation[hc02Helmet.zone_id] ?? zones[0] ?? null
    }
    return zones[0] ?? null
  }, [workforce.zonePopulation, hc02Helmet?.zone_id])

  const liveObjects = useMemo(
    () => Object.values(workforce.objects).filter(o => o.status !== 'EXPIRED'),
    [workforce.objects],
  )

  const { liveZones, cameraPositions, routeHistory } = usePatrolWebSocket('PATROL_LIVE')
  const hc02Live = useHc02LiveDetectionDots()

  const helmetDetectCountsById = useMemo(
    () => buildHelmetDetectCountsById(patrolEvents, DEFAULT_PATROL_CAMERA_IDS),
    [patrolEvents],
  )

  const metrics = usePatrolHelmetLiveMetrics(DEFAULT_PATROL_CAMERA_IDS)

  useEffect(() => {
    return subscribePatrolManualIdentity(() => setIdentityRevision(t => t + 1))
  }, [])

  useEffect(() => subscribeHeatmapPersonRegistry(() => {
    setPinTick(t => t + 1)
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
    const map: Record<string, boolean> = { 'HC-01': false, 'HC-02': false }
    for (const row of metrics.perCamera) {
      map[row.camera_id] = Boolean(row.stream_online)
    }
    const mobile = getPatrolMobileLiveSnapshot('HC-02')
    if (
      mobile
      && mobile.streamOnline
      && Date.now() - mobile.updatedAt <= 45_000
    ) {
      map['HC-02'] = true
    }
    return map
  }, [metrics.perCamera, mobileHc02Live])

  const hc01Online = Boolean(helmetOnlineById['HC-01'])
  const hc02Online = Boolean(helmetOnlineById['HC-02'])
  const anyCameraOnline = hc01Online || hc02Online

  const mergedCameraPositions = useMemo(() => {
    const next = { ...cameraPositions }
    const hc01Pin = PATROL_MAP_ACTIVE_HELMET_PINS.find(p => p.id === 'HC-01')
    const hc01Default = hc01Pin?.position ?? PATROL_SITE_CENTER
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
    return next
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
    syncHeatmapFramePresence('HC-01', [])
    clearPatrolHeatmapLiveTracks('HC-01')
    clearHeatmapPersonRegistry('HC-01')
  }, [hc01Online])

  useEffect(() => {
    if (hc02Online) return
    syncHeatmapFramePresence('HC-02', [])
    clearPatrolHeatmapLiveTracks('HC-02')
    clearHeatmapPersonRegistry('HC-02')
  }, [hc02Online])

  useEffect(() => {
    if (anyCameraOnline) return
    clearHeatmapPersonRegistry()
  }, [anyCameraOnline])

  const toggleLayer = (k: keyof typeof layers) =>
    setLayers(prev => ({ ...prev, [k]: !prev[k] }))

  const filteredDots = useMemo(() => {
    if (!anyCameraOnline) return []
    void identityRevision
    const activeObjectIds = new Set(
      liveObjects.filter(o => o.status === 'ACTIVE').map(o => o.object_id),
    )

    const markInView = (dot: DetectionDot): DetectionDot => {
      const inCameraView = dot.inCameraView ?? Boolean(
        dot.objectId && activeObjectIds.has(dot.objectId),
      )
      return {
        ...dot,
        inCameraView,
        opacity: inCameraView ? DETECTION_DOT_OPACITY_IN_VIEW : DETECTION_DOT_OPACITY_OUT_OF_VIEW,
      }
    }

    const objectDots = liveObjects
      .filter(o => o.lat != null && o.lon != null)
      .filter(o => {
        const wid = o.worker_id?.trim() ?? ''
        const manual = isPatrolManuallyIdentified(o.object_id)
        return manual
          || isPatrolSgcWorkerId(wid)
          || isPatrolGalleryWorkerId(wid)
          || isPatrolHeatmapEligibleId(o.object_id)
      })
      .map(o => {
        const fallback = o.worker_name || o.object_id
        const manual = isPatrolManuallyIdentified(o.object_id)
        return markInView({
          id: o.object_id,
          type: 'person' as const,
          position: [o.lat!, o.lon!] as [number, number],
          zoneId: o.zone_id,
          cameraId: o.helmet_id,
          confidence: o.position_confidence,
          label: resolvePatrolObjectLabel(o.object_id, fallback),
          lastSeenAt: Date.parse(o.last_seen) || Date.now(),
          objectId: resolvePatrolWorkerId(o.object_id, o.worker_id) ?? o.object_id,
          verified: o.identity_status === 'VERIFIED' || manual,
          inCameraView: o.status === 'ACTIVE',
        })
      })

    const registryDots = hc02Online
      ? hc02Live.dots.map(d => markInView(d))
      : []

    if (objectDots.length === 0) {
      return registryDots
    }

    // Chỉ registry (quanh mũ GPS) — workforce lat/lon hay snap mép ROI.
    if (registryDots.length > 0) {
      return registryDots
    }
    return objectDots
  }, [anyCameraOnline, hc02Live.dots, hc02Online, liveObjects, identityRevision])

  const headingDeg = hc02Helmet?.heading

  const helmetHeadingById = useMemo(() => {
    const map: Record<string, number | null | undefined> = {}
    for (const [id, h] of Object.entries(workforce.helmets)) {
      map[id] = h.heading
    }
    if (headingDeg != null) map['HC-02'] = headingDeg
    return map
  }, [workforce.helmets, headingDeg])

  const onDetectionClick = (dot: { objectId?: string; id: string }) => {
    const oid = dot.objectId || (dot.id.startsWith('OBJ-') ? dot.id : null)
    if (!oid) return
    const obj = workforce.objects[oid] || liveObjects.find(o => o.object_id === oid)
    if (obj) setSelectedObject(obj)
  }

  const observedCount = useMemo(() => {
    void pinTick
    if (!anyCameraOnline) return 0
    const global = countPatrolGlobalWorkers(patrolEvents, { liveOnly: true })
    if (global > 0) return global
    if (zonePop?.observed_count) return zonePop.observed_count
    return hc02Live.historicalDotCount
  }, [anyCameraOnline, patrolEvents, pinTick, zonePop, hc02Live.historicalDotCount])

  const identifiedCount = useMemo(() => {
    if (!anyCameraOnline) return 0
    if (zonePop) return zonePop.breakdown.verified_identities
    void identityRevision
    const fromObjects = liveObjects.filter(
      o => o.identity_status === 'VERIFIED' || isPatrolManuallyIdentified(o.object_id),
    ).length
    if (fromObjects > 0) return fromObjects
    return filteredDots.filter(d => d.verified || isVerifiedWorkerLabel(d.label)).length
  }, [anyCameraOnline, zonePop, liveObjects, filteredDots, identityRevision])

  const siteHeadcount = useMemo(() => {
    if (!anyCameraOnline) {
      return { observed: 0, identified: 0, objects: 0, persons: 0 }
    }
    void identityRevision
    let objects = 0
    let persons = 0
    let identified = 0
    for (const o of liveObjects) {
      const wid = o.worker_id?.trim() ?? ''
      const manual = isPatrolManuallyIdentified(o.object_id)
      const verified = o.identity_status === 'VERIFIED' || manual
      if (verified) {
        identified += 1
      } else if (/^sgc-/i.test(wid)) {
        persons += 1
      } else {
        objects += 1
      }
    }
    const observed = zonePop?.observed_count
      ?? Math.max(objects + persons + identified, filteredDots.length)
    if (identified === 0 && identifiedCount > 0) identified = identifiedCount
    return {
      observed,
      identified: Math.max(identified, identifiedCount),
      objects: zonePop?.breakdown.unknown_objects ?? objects,
      persons: Math.max(0, observed - identifiedCount - (zonePop?.breakdown.unknown_objects ?? objects)),
    }
  }, [anyCameraOnline, zonePop, liveObjects, filteredDots, identifiedCount, identityRevision])

  const bodycamOnlineById = useMemo(() => ({
    'HC-01': Boolean(helmetOnlineById['HC-01']),
    'HC-02': hc02Online,
  }), [helmetOnlineById, hc02Online])

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
      <div className="shrink-0 border-b border-[#1e2433] bg-[#0d1117] px-2 sm:px-3 py-1.5 space-y-1">
        <div className="flex items-center gap-x-2 gap-y-1 flex-wrap text-[10px] min-w-0">
          {DEFAULT_PATROL_CAMERA_IDS.map(id => {
            const online = bodycamOnlineById[id as keyof typeof bodycamOnlineById]
            const label = PATROL_BODYCAM_LABELS[id] ?? id
            return (
              <span
                key={id}
                className={cn(
                  'inline-flex items-center gap-1 font-semibold shrink-0',
                  online ? 'text-emerald-400' : 'text-slate-500',
                )}
              >
                <span className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  online ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500',
                )} />
                {label}
              </span>
            )
          })}
          <span className="text-[#334155] hidden sm:inline">·</span>
          <span className="text-sky-300/90 tabular-nums shrink-0">{observedCount} quan sát</span>
          <span className="text-[#334155]">·</span>
          <span className="text-violet-300/90 tabular-nums shrink-0">{identifiedCount} định danh</span>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          <LayerToggle compact={viewport.compactChrome} active={layers.polygon} color="#6366f1" onClick={() => toggleLayer('polygon')}>Khu vực</LayerToggle>
          <LayerToggle compact={viewport.compactChrome} active={layers.detection} color="#38bdf8" onClick={() => toggleLayer('detection')}>Người</LayerToggle>
          <LayerToggle compact={viewport.compactChrome} active={layers.route} color="#22c55e" onClick={() => toggleLayer('route')}>Mũ</LayerToggle>
        </div>
      </div>

      <div className={cn('min-w-0 relative', viewport.embeddedMapClass)}>
        <PatrolGeoHeatmap
          zones={liveZones}
          cameraPositions={mergedCameraPositions}
          routeHistory={mergedRouteHistory}
          layer="combined"
          displayMode="count"
          countMode="current"
          showSiteBoundary={layers.polygon}
          showZonePolygons={false}
          showDetections={layers.detection}
          liveDetectionDots={filteredDots}
          followLiveGps={hc02Online && hc02Live.hasLiveGps}
          liveGpsLat={hc02Online ? hc02Live.lat : null}
          liveGpsLng={hc02Online ? hc02Live.lng : null}
          showDensity={false}
          showRoute={layers.route}
          showHelmetMarkers={layers.route}
          showCameras={layers.route}
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
