/**
 * PatrolDensityHeatmap — Module 05 UI per
 * specs/module05/REALTIME_WORKFORCE_HEATMAP_SPECIFICATION.md
 */
import { useEffect, useMemo, useState } from 'react'

import { cn } from '@/utils/cn'
import {
  getPatrolMobileLiveSnapshot,
  subscribePatrolMobileLiveSnapshot,
} from '@/services/patrolMobileMetricsBridge'
import { DEFAULT_PATROL_CAMERA_IDS, PATROL_BODYCAM_LABELS, PATROL_SITE_AREA } from '../data/patrolCameras'
import { PATROL_SITE_NAME } from '../data/patrolSiteMap'
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
  stubObservabilityBand,
  type HeatmapTimeWindow,
} from '../utils/workforceHeatmapUi'
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

export function PatrolDensityHeatmap({ variant = 'embedded' }: { variant?: 'embedded' | 'modal' }) {
  const viewport = usePatrolHeatmapViewport()
  const [layers, setLayers] = useState({
    polygon: true,
    detection: true,
    density: true,
    route: true,
  })
  const [timeWindow, setTimeWindow] = useState<HeatmapTimeWindow>('live')
  const [selectedObject, setSelectedObject] = useState<ObjectState | null>(null)
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
    if (hc02Live.hasLiveGps && hc02Live.lat != null && hc02Live.lng != null) {
      next['HC-02'] = [hc02Live.lat, hc02Live.lng]
    } else if (hc02Helmet?.lat != null && hc02Helmet?.lon != null) {
      next['HC-02'] = [hc02Helmet.lat, hc02Helmet.lon]
    }
    return next
  }, [cameraPositions, hc02Live.hasLiveGps, hc02Live.lat, hc02Live.lng, hc02Helmet?.lat, hc02Helmet?.lon])

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
    const cutoff = Date.now() - heatmapWindowMs(timeWindow)
    const hist = hc02Live.dots.filter(d => {
      if (d.lastSeenAt == null) return timeWindow !== 'live'
      return d.lastSeenAt >= cutoff
    })
    const objectDots = liveObjects
      .filter(o => o.lat != null && o.lon != null)
      .map(o => ({
        id: o.object_id,
        type: 'person' as const,
        position: [o.lat!, o.lon!] as [number, number],
        zoneId: o.zone_id,
        cameraId: o.helmet_id,
        confidence: o.position_confidence,
        label: o.worker_name || o.object_id,
        lastSeenAt: Date.parse(o.last_seen) || Date.now(),
        opacity: o.status === 'ACTIVE' ? 0.92 : 0.48,
        objectId: o.object_id,
        verified: o.identity_status === 'VERIFIED',
      }))
    if (timeWindow === 'live' && objectDots.length > 0) {
      return objectDots
    }
    const byId = new Map(hist.map(d => [d.id, { ...d, opacity: d.opacity ?? 0.72 }]))
    for (const od of objectDots) byId.set(od.id, od)
    // Spec §7.3 — heat samples for non-live windows (1/object/3s backend)
    if (timeWindow !== 'live') {
      for (const hp of workforce.heatPoints) {
        const ts = Date.parse(hp.timestamp)
        if (!Number.isFinite(ts) || ts < cutoff) continue
        const id = `heat-${hp.object_id}-${ts}`
        if (byId.has(id)) continue
        byId.set(id, {
          id,
          type: 'person',
          position: [hp.lat, hp.lon],
          zoneId: hp.zone_id,
          cameraId: 'HC-02',
          confidence: hp.weight,
          label: hp.object_id,
          lastSeenAt: ts,
          opacity: Math.min(0.55, 0.2 + hp.weight * 0.35),
          objectId: hp.object_id,
        })
      }
    }
    return [...byId.values()]
  }, [hc02Live.dots, timeWindow, liveObjects, workforce.heatPoints])

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
    const fromObjects = liveObjects.filter(o => o.identity_status === 'VERIFIED').length
    if (fromObjects > 0) return fromObjects
    return filteredDots.filter(d => isVerifiedWorkerLabel(d.label)).length
  }, [zonePop, liveObjects, filteredDots])

  const observability = zonePop?.observability_band
    ?? stubObservabilityBand({
      personCount: hc02Live.personCount,
      historicalDotCount: hc02Live.historicalDotCount,
      hasGps: hc02Live.hasLiveGps,
    })

  const lastUpdateLabel = useMemo(() => {
    const ts = hc02Helmet?.timestamp || zonePop?.timestamp || workforce.server_time
    if (!ts) return null
    const ageSec = Math.max(0, Math.round((Date.now() - Date.parse(ts)) / 1000))
    if (!Number.isFinite(ageSec)) return null
    return ageSec <= 1 ? '1s' : `${ageSec}s`
  }, [hc02Helmet?.timestamp, zonePop?.timestamp, workforce.server_time])

  const activeZoneName = useMemo(() => {
    if (hc02Helmet?.zone_id) return PATROL_SITE_NAME
    const zone = liveZones.find(z => (z.peopleCurrent ?? 0) > 0)
      ?? liveZones.find(z => z.coverage === 'VISITED')
      ?? liveZones[0]
    return zone?.name ?? PATROL_SITE_NAME
  }, [hc02Helmet?.zone_id, liveZones])

  const hc02Online = Boolean(hc02Helmet?.online) || helmetOnlineById['HC-02']
  const bodycamOnlineById = useMemo(() => ({
    'HC-01': Boolean(helmetOnlineById['HC-01']),
    'HC-02': hc02Online,
  }), [helmetOnlineById, hc02Online])
  const bodycamOnlineCount = DEFAULT_PATROL_CAMERA_IDS.filter(
    id => bodycamOnlineById[id as keyof typeof bodycamOnlineById],
  ).length

  return (
    <div className="flex flex-col overflow-hidden lg:h-full lg:min-h-0 min-h-0">
      <div className="shrink-0 border-b border-[#1e2433] bg-[#0d1117] px-2 sm:px-3 py-2 space-y-1.5">
        <div className="flex items-start gap-2 flex-wrap min-w-0">
          <div className="flex flex-col gap-1.5 min-w-0 shrink-0">
            <span className="text-[8px] sm:text-[9px] font-bold text-muted-foreground/70 uppercase tracking-widest">
              Bodycam
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              {DEFAULT_PATROL_CAMERA_IDS.map(id => {
                const online = bodycamOnlineById[id as keyof typeof bodycamOnlineById]
                const label = PATROL_BODYCAM_LABELS[id] ?? id
                return (
                  <span
                    key={id}
                    className={cn(
                      'inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-semibold shrink-0',
                      online ? 'text-emerald-400' : 'text-slate-500',
                    )}
                  >
                    {label}
                    <span className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      online ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500',
                    )} />
                    {online ? 'ONLINE' : 'OFFLINE'}
                  </span>
                )
              })}
            </div>
            <span className="text-[9px] text-muted-foreground/60 tabular-nums">
              {bodycamOnlineCount}/{DEFAULT_PATROL_CAMERA_IDS.length} luồng · {PATROL_SITE_AREA}
            </span>
          </div>
          <span className="text-[10px] sm:text-[11px] text-[#94a3b8] min-w-0">
            Zone {activeZoneName}
            <span className="text-[#334155] mx-1">·</span>
            <span className="text-sky-300/90 tabular-nums">{observedCount} người quan sát</span>
            <span className="text-[#334155] mx-1">·</span>
            <span className="text-violet-300/90 tabular-nums">{identifiedCount} đã định danh</span>
          </span>
        </div>

        <div className="flex items-center gap-x-2 gap-y-0.5 text-[9px] sm:text-[10px] text-[#64748b] flex-wrap min-w-0">
          {hc02Live.hasLiveGps ? (
            <span className="text-sky-300/80 tabular-nums">
              GPS: {hc02Live.lat?.toFixed(5)}, {hc02Live.lng?.toFixed(5)}
              {headingDeg != null && Number.isFinite(headingDeg) ? ` · Heading ${Math.round(headingDeg)}°` : ''}
            </span>
          ) : hc02Live.waitingGpsForDots ? (
            <span className="text-amber-400/80">Detect {hc02Live.personCount} — chờ GPS…</span>
          ) : (
            <span className="text-amber-400/80">Chờ GPS…</span>
          )}
          <span className="text-[#334155]">·</span>
          <span className={cn(
            observability === 'HIGH' && 'text-emerald-400/90',
            observability === 'MEDIUM' && 'text-amber-400/90',
            observability === 'LOW' && 'text-slate-500',
          )}>
            Observability: {observability}
          </span>
          {lastUpdateLabel && (
            <>
              <span className="text-[#334155]">·</span>
              <span>Last: {lastUpdateLabel}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[8px] sm:text-[9px] text-[#475569] font-semibold tracking-wider uppercase mr-0.5 shrink-0">
            Thời gian
          </span>
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
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[8px] sm:text-[9px] text-[#475569] font-semibold tracking-wider uppercase mr-0.5 shrink-0">
            Lớp
          </span>
          <LayerToggle compact={viewport.compactChrome} active={layers.polygon} color="#6366f1" onClick={() => toggleLayer('polygon')}>Khu vực</LayerToggle>
          <LayerToggle compact={viewport.compactChrome} active={layers.detection} color="#38bdf8" onClick={() => toggleLayer('detection')}>Người</LayerToggle>
          <LayerToggle compact={viewport.compactChrome} active={layers.density} color="#f59e0b" onClick={() => toggleLayer('density')}>Mật độ</LayerToggle>
          <LayerToggle compact={viewport.compactChrome} active={layers.route} color="#22c55e" onClick={() => toggleLayer('route')}>Mũ/Lộ trình</LayerToggle>
        </div>

        {liveObjects.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[8px] text-[#475569] font-semibold uppercase mr-0.5">Objects</span>
            {liveObjects.slice(0, 8).map(obj => (
              <button
                key={obj.object_id}
                type="button"
                onClick={() => setSelectedObject(obj)}
                className={cn(
                  'px-1.5 py-0.5 rounded text-[8px] border tabular-nums',
                  obj.identity_status === 'VERIFIED'
                    ? 'border-violet-500/40 text-violet-300 bg-violet-500/10'
                    : obj.status === 'ACTIVE'
                      ? 'border-sky-500/40 text-sky-300 bg-sky-500/10'
                      : 'border-slate-600 text-slate-400 bg-slate-800/40 opacity-70',
                )}
              >
                {obj.worker_name || obj.object_id.replace(/^OBJ-\d+-/, 'OBJ-')}
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        className={cn(
          'min-w-0 relative min-h-0',
          variant === 'modal' ? viewport.modalMapClass : viewport.embeddedMapClass,
        )}
      >
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
          hasHc02LiveGps={hc02Live.hasLiveGps}
          mapZoom={viewport.mapZoom}
          compactControls={viewport.compactChrome}
        />
        <WorkforceObjectSheet object={selectedObject} onClose={() => setSelectedObject(null)} />
      </div>
    </div>
  )
}
