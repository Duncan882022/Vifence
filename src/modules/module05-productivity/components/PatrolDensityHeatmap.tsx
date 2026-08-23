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
  DETECTION_DOT_IN_VIEW_MS,
  DETECTION_DOT_OPACITY_IN_VIEW,
  DETECTION_DOT_OPACITY_OUT_OF_VIEW,
  type DetectionDot,
} from '../data/patrolDetectionData'
import { PATROL_SITE_CENTER } from '../data/patrolSiteMap'
import { useHc02LiveDetectionDots } from '../hooks/useHc02LiveDetectionDots'
import { usePatrolHelmetLiveMetrics } from '../hooks/usePatrolHelmetLiveMetrics'
import { useWorkforceRealtimeState } from '../hooks/useWorkforceRealtimeState'
import { usePatrolWebSocket } from '../services/usePatrolWebSocket'
import { usePatrolHeatmapViewport } from '../hooks/usePatrolHeatmapViewport'
import { PatrolGeoHeatmap } from './PatrolGeoHeatmap'
import { WorkforceObjectSheet } from './WorkforceObjectSheet'
import {
  HEATMAP_TIME_TABS,
  heatmapWindowMs,
  isVerifiedWorkerLabel,
  type HeatmapTimeWindow,
} from '../utils/workforceHeatmapUi'
import {
  isPatrolManuallyIdentified,
  resolvePatrolObjectLabel,
  subscribePatrolManualIdentity,
} from '../services/patrolManualIdentity.service'
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
}: {
  /** Phóng to tại chỗ — giữ nguyên map instance, ROI và layer state. */
  expanded?: boolean
  onCloseExpand?: () => void
}) {
  const viewport = usePatrolHeatmapViewport()
  const [layers, setLayers] = useState({
    polygon: true,
    detection: true,
    density: true,
    route: true,
  })
  const [timeWindow, setTimeWindow] = useState<HeatmapTimeWindow>('live')
  const [selectedObject, setSelectedObject] = useState<ObjectState | null>(null)
  const [identityRevision, setIdentityRevision] = useState(0)
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
  const metrics = usePatrolHelmetLiveMetrics(DEFAULT_PATROL_CAMERA_IDS)

  useEffect(() => {
    return subscribePatrolManualIdentity(() => setIdentityRevision(t => t + 1))
  }, [])

  useEffect(() => {
    return subscribePatrolMobileLiveSnapshot(snap => {
      setMobileHc02Live(Boolean(snap && snap.cameraId === 'HC-02' && snap.streamOnline))
    })
  }, [])

  const helmetOnlineById = useMemo(() => {
    const map: Record<string, boolean> = { 'HC-01': false, 'HC-02': false }
    for (const row of metrics.perCamera) {
      map[row.camera_id] = Boolean(row.stream_online)
    }
    if (mobileHc02Live || hc02Helmet?.online) map['HC-02'] = true
    return map
  }, [metrics.perCamera, mobileHc02Live, hc02Helmet?.online])

  const mergedCameraPositions = useMemo(() => {
    const next = { ...cameraPositions }
    const hc01Wf = workforce.helmets['HC-01']
    if (helmetOnlineById['HC-01'] && hc01Wf?.lat != null && hc01Wf?.lon != null) {
      next['HC-01'] = [hc01Wf.lat, hc01Wf.lon]
    }
    const hc02Wf = workforce.helmets['HC-02']
    if (helmetOnlineById['HC-02']) {
      if (hc02Wf?.lat != null && hc02Wf?.lon != null) {
        next['HC-02'] = [hc02Wf.lat, hc02Wf.lon]
      } else if (hc02Live.lat != null && hc02Live.lng != null) {
        next['HC-02'] = [hc02Live.lat, hc02Live.lng]
      } else {
        next['HC-02'] = PATROL_SITE_CENTER
      }
    } else if (hc02Live.hasLiveGps && hc02Live.lat != null && hc02Live.lng != null) {
      next['HC-02'] = [hc02Live.lat, hc02Live.lng]
    } else if (hc02Wf?.lat != null && hc02Wf?.lon != null) {
      next['HC-02'] = [hc02Wf.lat, hc02Wf.lon]
    }
    return next
  }, [
    cameraPositions,
    helmetOnlineById,
    workforce.helmets,
    hc02Live.hasLiveGps,
    hc02Live.lat,
    hc02Live.lng,
  ])

  const mergedRouteHistory = useMemo(() => {
    if (!hc02Live.hasLiveGps || hc02Live.lat == null || hc02Live.lng == null) {
      const { 'HC-02': _drop, ...rest } = routeHistory
      return rest
    }
    const pos: [number, number] = [hc02Live.lat, hc02Live.lng]
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
  }, [routeHistory, hc02Live.hasLiveGps, hc02Live.lat, hc02Live.lng])

  const toggleLayer = (k: keyof typeof layers) =>
    setLayers(prev => ({ ...prev, [k]: !prev[k] }))

  const filteredDots = useMemo(() => {
    void identityRevision
    const cutoff = Date.now() - heatmapWindowMs(timeWindow)
    const now = Date.now()
    const activeObjectIds = new Set(
      liveObjects.filter(o => o.status === 'ACTIVE').map(o => o.object_id),
    )

    const markInView = (dot: DetectionDot): DetectionDot => {
      let inCameraView = dot.inCameraView
      if (inCameraView == null) {
        inCameraView = Boolean(
          (dot.objectId && activeObjectIds.has(dot.objectId))
          || (dot.lastSeenAt != null && now - dot.lastSeenAt < DETECTION_DOT_IN_VIEW_MS),
        )
      }
      return {
        ...dot,
        inCameraView,
        opacity: inCameraView ? DETECTION_DOT_OPACITY_IN_VIEW : DETECTION_DOT_OPACITY_OUT_OF_VIEW,
      }
    }

    const hist = hc02Live.dots.filter(d => {
      if (d.lastSeenAt == null) return timeWindow !== 'live'
      return d.lastSeenAt >= cutoff
    }).map(d => markInView(d))

    const objectDots = liveObjects
      .filter(o => o.lat != null && o.lon != null)
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
          objectId: o.object_id,
          verified: o.identity_status === 'VERIFIED' || manual,
          inCameraView: o.status === 'ACTIVE',
        })
      })

    if (timeWindow === 'live' && objectDots.length > 0) {
      return objectDots
    }
    const byId = new Map(hist.map(d => [d.id, d]))
    for (const od of objectDots) byId.set(od.id, od)
    if (timeWindow !== 'live') {
      for (const hp of workforce.heatPoints) {
        const ts = Date.parse(hp.timestamp)
        if (!Number.isFinite(ts) || ts < cutoff) continue
        const id = `heat-${hp.object_id}-${ts}`
        if (byId.has(id)) continue
        byId.set(id, markInView({
          id,
          type: 'person',
          position: [hp.lat, hp.lon],
          zoneId: hp.zone_id,
          cameraId: 'HC-02',
          confidence: hp.weight,
          label: resolvePatrolObjectLabel(hp.object_id, hp.object_id),
          lastSeenAt: ts,
          objectId: hp.object_id,
          verified: isPatrolManuallyIdentified(hp.object_id),
          inCameraView: false,
        }))
      }
    }
    return [...byId.values()]
  }, [hc02Live.dots, timeWindow, liveObjects, workforce.heatPoints, identityRevision])

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
    if (zonePop) return zonePop.observed_count
    if (timeWindow === 'live' && hc02Live.personCount > 0) return hc02Live.personCount
    return filteredDots.length || hc02Live.historicalDotCount
  }, [zonePop, timeWindow, hc02Live.personCount, hc02Live.historicalDotCount, filteredDots.length])

  const identifiedCount = useMemo(() => {
    if (zonePop) return zonePop.breakdown.verified_identities
    void identityRevision
    const fromObjects = liveObjects.filter(
      o => o.identity_status === 'VERIFIED' || isPatrolManuallyIdentified(o.object_id),
    ).length
    if (fromObjects > 0) return fromObjects
    return filteredDots.filter(d => d.verified || isVerifiedWorkerLabel(d.label)).length
  }, [zonePop, liveObjects, filteredDots, identityRevision])

  const hc02Online = Boolean(hc02Helmet?.online) || helmetOnlineById['HC-02']
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
          {HEATMAP_TIME_TABS.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setTimeWindow(tab.key)}
              className={cn(
                'px-2 py-0.5 rounded text-[9px] font-medium border transition-colors shrink-0',
                timeWindow === tab.key
                  ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                  : 'bg-transparent text-[#64748b] border-[#334155] hover:border-[#475569]',
              )}
            >
              {tab.label}
            </button>
          ))}
          <span className="w-px h-3.5 bg-[#334155] mx-0.5 shrink-0" aria-hidden />
          <LayerToggle compact={viewport.compactChrome} active={layers.polygon} color="#6366f1" onClick={() => toggleLayer('polygon')}>Khu vực</LayerToggle>
          <LayerToggle compact={viewport.compactChrome} active={layers.detection} color="#38bdf8" onClick={() => toggleLayer('detection')}>Người</LayerToggle>
          <LayerToggle compact={viewport.compactChrome} active={layers.density} color="#f59e0b" onClick={() => toggleLayer('density')}>Mật độ</LayerToggle>
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
          showZonePolygons={layers.polygon}
          showDetections={layers.detection}
          liveDetectionDots={filteredDots}
          followLiveGps={hc02Live.hasLiveGps}
          liveGpsLat={hc02Live.lat}
          liveGpsLng={hc02Live.lng}
          showDensity={layers.density && timeWindow !== 'live'}
          showRoute={layers.route}
          showCameras={layers.route}
          helmetOnlineById={helmetOnlineById}
          helmetHeadingById={helmetHeadingById}
          onDetectionClick={onDetectionClick}
          requireLiveGpsForHc02
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
      {expanded && (
        <div className="flex-1 min-h-[180px] invisible pointer-events-none" aria-hidden />
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
