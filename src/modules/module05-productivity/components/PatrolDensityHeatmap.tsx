/**
 * PatrolDensityHeatmap — 4-layer toolbar + Leaflet map.
 * Layer 1: Polygon  | Layer 2: Detection | Layer 3: Density | Layer 4: Patrol Route
 */
import { useState } from 'react'

import { cn } from '@/utils/cn'
import { MOCK_PATROL_DASHBOARD } from '../data/patrolMockData'
import { usePatrolWebSocket } from '../services/usePatrolWebSocket'
import { PatrolGeoHeatmap } from './PatrolGeoHeatmap'

const LEGEND = [
  { color: '#ef4444', label: 'Rất cao' },
  { color: '#eab308', label: 'Cao' },
  { color: '#22c55e', label: 'Trung bình' },
  { color: '#38bdf8', label: 'Thấp' },
  { color: '#475569', label: 'Chưa đến' },
] as const

/* ── Shared button components ───────────────────────────────── */

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

/* ── Component ──────────────────────────────────────────────── */
export function PatrolDensityHeatmap() {
  const [layers, setLayers] = useState({
    polygon:   true,
    detection: true,
    density:   true,
    route:     true,
  })

  const { liveZones, cameraPositions, routeHistory } = usePatrolWebSocket(
    MOCK_PATROL_DASHBOARD.sessionLabel,
  )

  const toggleLayer = (k: keyof typeof layers) =>
    setLayers(prev => ({ ...prev, [k]: !prev[k] }))

  return (
    <div className="flex flex-col overflow-hidden lg:h-full lg:min-h-0">
      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-[#1e2433] bg-[#0d1117] px-2 sm:px-3 py-2 space-y-1.5">

        {/* Row 1 — 4 layer toggles */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[8px] text-[#475569] font-semibold tracking-wider uppercase mr-0.5">Lớp</span>
          <LayerToggle active={layers.polygon}   color="#6366f1" onClick={() => toggleLayer('polygon')}>Khu vực</LayerToggle>
          <LayerToggle active={layers.detection} color="#38bdf8" onClick={() => toggleLayer('detection')}>Detection</LayerToggle>
          <LayerToggle active={layers.density}   color="#f97316" onClick={() => toggleLayer('density')}>Mật độ</LayerToggle>
          <LayerToggle active={layers.route}     color="#22c55e" onClick={() => toggleLayer('route')}>Lộ trình</LayerToggle>
        </div>

        {/* Row 2 — Density legend */}
        {layers.density && (
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
            {LEGEND.map(({ color, label }) => (
              <span key={label} className="inline-flex items-center gap-1 shrink-0 text-muted-foreground">
                <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-[9px] whitespace-nowrap">{label}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Map ─────────────────────────────────────────────── */}
      <div className="min-w-0 relative lg:flex-1 lg:min-h-[200px] max-lg:h-[360px]">
        <PatrolGeoHeatmap
          zones={liveZones}
          cameraPositions={cameraPositions}
          routeHistory={routeHistory}
          layer="combined"
          displayMode="count"
          countMode="current"
          showSiteBoundary={layers.polygon}
          showZonePolygons={layers.polygon}
          showDetections={layers.detection}
          showDensity={layers.density}
          showRoute={layers.route}
          showCameras={layers.route}
        />
      </div>
    </div>
  )
}
