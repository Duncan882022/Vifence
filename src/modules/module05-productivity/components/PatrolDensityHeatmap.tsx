/**
 * PatrolDensityHeatmap — map live HC-01/HC-02.
 * HC-01 offline khi stream tắt; HC-02 marker theo GPS thật.
 */
import { useEffect, useMemo, useState } from 'react'

import { cn } from '@/utils/cn'
import {
  getPatrolMobileLiveSnapshot,
  subscribePatrolMobileLiveSnapshot,
} from '@/services/patrolMobileMetricsBridge'
import { MOCK_PATROL_DASHBOARD } from '../data/patrolMockData'
import { DEFAULT_PATROL_CAMERA_IDS } from '../data/patrolCameras'
import { useHc02LiveDetectionDots } from '../hooks/useHc02LiveDetectionDots'
import { usePatrolHelmetLiveMetrics } from '../hooks/usePatrolHelmetLiveMetrics'
import { usePatrolWebSocket } from '../services/usePatrolWebSocket'
import { PatrolGeoHeatmap } from './PatrolGeoHeatmap'

function LayerToggle({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean
  color: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium transition-all border',
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

export function PatrolDensityHeatmap() {
  const [layers, setLayers] = useState({
    polygon: false,
    detection: true,
    density: false,
    route: true,
  })
  const [mobileHc02Live, setMobileHc02Live] = useState(
    () => Boolean(getPatrolMobileLiveSnapshot('HC-02')?.streamOnline),
  )

  const { liveZones, cameraPositions, routeHistory } = usePatrolWebSocket(
    MOCK_PATROL_DASHBOARD.sessionLabel,
  )
  const hc02Live = useHc02LiveDetectionDots()
  const metrics = usePatrolHelmetLiveMetrics(DEFAULT_PATROL_CAMERA_IDS)

  useEffect(() => {
    return subscribePatrolMobileLiveSnapshot(snap => {
      setMobileHc02Live(Boolean(snap && snap.cameraId === 'HC-02' && snap.streamOnline))
    })
  }, [])

  const helmetOnlineById = useMemo(() => {
    const map: Record<string, boolean> = {
      'HC-01': false,
      'HC-02': false,
    }
    for (const row of metrics.perCamera) {
      map[row.camera_id] = Boolean(row.stream_online)
    }
    if (mobileHc02Live) map['HC-02'] = true
    return map
  }, [metrics.perCamera, mobileHc02Live])

  const mergedCameraPositions = useMemo(() => {
    const next = { ...cameraPositions }
    if (hc02Live.hasLiveGps && hc02Live.lat != null && hc02Live.lng != null) {
      next['HC-02'] = [hc02Live.lat, hc02Live.lng]
    }
    return next
  }, [cameraPositions, hc02Live.hasLiveGps, hc02Live.lat, hc02Live.lng])

  const mergedRouteHistory = useMemo(() => {
    if (!hc02Live.hasLiveGps || hc02Live.lat == null || hc02Live.lng == null) {
      const { 'HC-02': _drop, ...rest } = routeHistory
      return rest
    }
    const pos: [number, number] = [hc02Live.lat, hc02Live.lng]
    const hist = routeHistory['HC-02'] ?? []
    // Bỏ điểm giả ZONE_B nếu lệch > ~50m so với GPS thật
    const filtered = hist.filter(([la, ln]) => {
      const dLat = (la - pos[0]) * 111_320
      const dLng = (ln - pos[1]) * 111_320 * Math.cos((pos[0] * Math.PI) / 180)
      return Math.hypot(dLat, dLng) < 80
    })
    const last = filtered[filtered.length - 1]
    if (last && last[0] === pos[0] && last[1] === pos[1]) {
      return { ...routeHistory, 'HC-02': filtered }
    }
    return {
      ...routeHistory,
      'HC-02': [...filtered, pos].slice(-150),
    }
  }, [routeHistory, hc02Live.hasLiveGps, hc02Live.lat, hc02Live.lng])

  const toggleLayer = (k: keyof typeof layers) =>
    setLayers(prev => ({ ...prev, [k]: !prev[k] }))

  return (
    <div className="flex flex-col overflow-hidden lg:h-full lg:min-h-0">
      <div className="shrink-0 border-b border-[#1e2433] bg-[#0d1117] px-2 sm:px-3 py-2 space-y-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[8px] text-[#475569] font-semibold tracking-wider uppercase mr-0.5">Lớp</span>
          <LayerToggle active={layers.polygon} color="#6366f1" onClick={() => toggleLayer('polygon')}>Khu vực</LayerToggle>
          <LayerToggle active={layers.detection} color="#38bdf8" onClick={() => toggleLayer('detection')}>Người (live)</LayerToggle>
          <LayerToggle active={layers.route} color="#22c55e" onClick={() => toggleLayer('route')}>Mũ / lộ trình</LayerToggle>
        </div>

        <div className="flex items-center gap-2 text-[9px] text-[#94a3b8] flex-wrap">
          <span className={helmetOnlineById['HC-01'] ? 'text-emerald-400/90' : 'text-slate-500'}>
            HC-01 {helmetOnlineById['HC-01'] ? 'ONLINE' : 'OFFLINE'}
          </span>
          <span className="text-[#334155]">·</span>
          <span className={helmetOnlineById['HC-02'] ? 'text-emerald-400/90' : 'text-slate-500'}>
            HC-02 {helmetOnlineById['HC-02'] ? 'ONLINE' : 'OFFLINE'}
          </span>
          {hc02Live.hasLiveGps ? (
            <span className="text-sky-300/90">
              GPS: {hc02Live.lat?.toFixed(5)}, {hc02Live.lng?.toFixed(5)}
              {hc02Live.historicalDotCount > 0
                ? hc02Live.personCount > 0
                  ? ` · ${hc02Live.personCount} đang thấy · ${hc02Live.historicalDotCount} trên map`
                  : ` · ${hc02Live.historicalDotCount} người trên map`
                : hc02Live.personCount > 0
                  ? ` · ${hc02Live.personCount} người (chưa ghi map)`
                  : ''}
            </span>
          ) : hc02Live.waitingGpsForDots ? (
            <span className="text-amber-400/90">
              Detect {hc02Live.personCount} người — chờ GPS để vẽ chấm trên map…
            </span>
          ) : (
            <span className="text-amber-400/80">
              HC-02: chờ GPS… (trong nhà iPhone có thể báo LocationUnknown — đợi Wi‑Fi)
            </span>
          )}
        </div>
      </div>

      <div className="min-w-0 relative lg:flex-1 lg:min-h-[200px] max-lg:h-[360px]">
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
          liveDetectionDots={hc02Live.dots}
          followLiveGps={hc02Live.hasLiveGps}
          liveGpsLat={hc02Live.lat}
          liveGpsLng={hc02Live.lng}
          showDensity={false}
          showRoute={layers.route}
          showCameras={layers.route}
          helmetOnlineById={helmetOnlineById}
          requireLiveGpsForHc02
          hasHc02LiveGps={hc02Live.hasLiveGps}
        />
      </div>
    </div>
  )
}
