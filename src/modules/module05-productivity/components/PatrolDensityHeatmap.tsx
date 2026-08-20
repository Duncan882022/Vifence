/**
 * PatrolDensityHeatmap — HQCV §12 toolbar + Leaflet map.
 * Mobile và desktop dùng cùng map overlay (khu vực + mũ tuần tra).
 */
import { useMemo, useState } from 'react'

import { cn } from '@/utils/cn'
import { MOCK_PATROL_DASHBOARD } from '../data/patrolMockData'
import type { PatrolDensityLayer } from '../services/patrolHeatmap.service'
import { usePatrolWebSocket } from '../services/usePatrolWebSocket'
import { PatrolGeoHeatmap } from './PatrolGeoHeatmap'

/* ── Layer config ───────────────────────────────────────────── */
type HeatLayer = PatrolDensityLayer | 'route'

const LAYER_OPTS: { key: HeatLayer; label: string }[] = [
  { key: 'people',   label: 'Người' },
  { key: 'vehicle',  label: 'Máy' },
  { key: 'combined', label: 'Tổng hợp' },
  { key: 'route',    label: 'Lộ trình tuần tra' },
]

const LEGEND = [
  { color: '#ef4444', label: 'Rất cao' },
  { color: '#eab308', label: 'Cao' },
  { color: '#22c55e', label: 'Trung bình' },
  { color: '#38bdf8', label: 'Thấp' },
  { color: '#475569', label: 'Chưa đến' },
] as const


function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'font-semibold transition-colors whitespace-nowrap',
        'flex-1 min-w-0 px-1.5 sm:px-2.5 py-1.5 sm:py-1 text-[9px] sm:text-[10px]',
        active
          ? 'bg-sky-500 text-white'
          : 'bg-[#1a2235] text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

/* ── Component ──────────────────────────────────────────────── */
export function PatrolDensityHeatmap() {
  const [heatLayer, setHeatLayer] = useState<HeatLayer>('people')

  const { liveZones, cameraPositions } = usePatrolWebSocket(
    MOCK_PATROL_DASHBOARD.sessionLabel,
  )

  const isRouteOnly = heatLayer === 'route'
  const activeLayer: PatrolDensityLayer = isRouteOnly ? 'people' : heatLayer

  return (
    <div className="flex flex-col overflow-hidden lg:h-full lg:min-h-0">
      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-[#1e2433] bg-[#0d1117] px-2 sm:px-3 py-2 space-y-2">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 min-w-0">
          <div className="flex flex-1 rounded-lg overflow-hidden border border-[#334155] min-w-0">
            {LAYER_OPTS.map(({ key, label }) => (
              <ToggleBtn
                key={key}
                active={heatLayer === key}
                onClick={() => setHeatLayer(key)}
              >
                {label}
              </ToggleBtn>
            ))}
          </div>

        </div>

        {!isRouteOnly && (
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-0.5">
            {LEGEND.map(({ color, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1 shrink-0 text-muted-foreground"
              >
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: color }}
                />
                <span className="text-[9px] whitespace-nowrap">{label}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Map — cùng overlay khu vực + mũ trên mọi breakpoint ── */}
      <div className="min-w-0 relative lg:flex-1 lg:min-h-[200px] max-lg:h-[360px]">
        <PatrolGeoHeatmap
          zones={liveZones}
          cameraPositions={cameraPositions}
          layer={activeLayer}
          displayMode="count"
          countMode="current"
          showRoute
          showCameras
          showZoneStats={!isRouteOnly}
        />
      </div>
    </div>
  )
}
