/**
 * PatrolDensityHeatmap — HQCV §12 toolbar + Leaflet map.
 *
 * Layer switch: [ Người ] [ Máy ] [ Tổng hợp ] [ Lộ trình tuần tra ]
 * Realtime count only — no session/density toggles.
 */
import { useEffect, useMemo, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { cn } from '@/utils/cn'
import { MOCK_PATROL_DASHBOARD } from '../data/patrolMockData'
import type { PatrolDensityLayer } from '../services/patrolHeatmap.service'
import { usePatrolWebSocket } from '../services/usePatrolWebSocket'
import { PatrolGeoHeatmap } from './PatrolGeoHeatmap'

/* ── Layer config ───────────────────────────────────────────── */
type HeatLayer = PatrolDensityLayer | 'route'

const LAYER_OPTS: { key: HeatLayer; label: string; shortLabel: string }[] = [
  { key: 'people',   label: 'Người', shortLabel: 'Người' },
  { key: 'vehicle',  label: 'Máy', shortLabel: 'Máy' },
  { key: 'combined', label: 'Tổng hợp', shortLabel: 'Tổng' },
  { key: 'route',    label: 'Lộ trình tuần tra', shortLabel: 'Lộ trình' },
]

function formatSessionDate(sessionLabel: string): string {
  const dateStr = sessionLabel.replace('PATROL_', '').slice(0, 8)
  const y = dateStr.slice(0, 4)
  const m = dateStr.slice(4, 6)
  const d = dateStr.slice(6, 8)
  return `${d}/${m}/${y} 08:00`
}

/* ── Toggle button ──────────────────────────────────────────── */
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
        'px-2 sm:px-2.5 py-1 text-[9px] sm:text-[10px] font-semibold transition-colors whitespace-nowrap',
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
  const [showZoneStats, setShowZoneStats] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 640 : true,
  )

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)')
    const update = () => setShowZoneStats(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  const { liveZones, cameraPositions } = usePatrolWebSocket(
    MOCK_PATROL_DASHBOARD.sessionLabel,
  )

  const isRouteOnly = heatLayer === 'route'
  const activeLayer: PatrolDensityLayer = isRouteOnly ? 'people' : heatLayer

  const sessionLabel = useMemo(
    () => formatSessionDate(MOCK_PATROL_DASHBOARD.sessionLabel),
    [],
  )

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-[#1e2433] bg-[#0d1117] px-2 sm:px-3 py-1.5 sm:py-2 space-y-1.5">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2 min-w-0">
          <div className="overflow-x-auto scrollbar-none -mx-0.5 px-0.5">
            <div className="inline-flex rounded-md overflow-hidden border border-[#334155] shrink-0 min-w-max">
              {LAYER_OPTS.map(({ key, label, shortLabel }) => (
                <ToggleBtn
                  key={key}
                  active={heatLayer === key}
                  onClick={() => setHeatLayer(key)}
                >
                  <span className="sm:hidden">{shortLabel}</span>
                  <span className="hidden sm:inline">{label}</span>
                </ToggleBtn>
              ))}
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-md border border-[#334155] bg-[#1a2235] px-2 sm:px-2.5 py-1 shrink-0 self-start sm:self-auto sm:ml-auto">
            <CalendarDays className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-sky-400 shrink-0" />
            <span className="text-[9px] sm:text-[10px] font-medium text-foreground tabular-nums whitespace-nowrap">
              {sessionLabel}
            </span>
          </div>
        </div>

        {!isRouteOnly && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[8px] sm:text-[9px] text-muted-foreground overflow-x-auto scrollbar-none">
            {[
              { color: '#ef4444', label: 'Rất cao' },
              { color: '#eab308', label: 'Cao' },
              { color: '#22c55e', label: 'Trung bình' },
              { color: '#38bdf8', label: 'Thấp' },
              { color: '#475569', label: 'Chưa đến' },
            ].map(({ color, label }) => (
              <span key={label} className="inline-flex items-center gap-1">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ background: color }}
                />
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Leaflet Map ─────────────────────────────────────── */}
      <div className="flex-1 min-h-[200px] sm:min-h-[240px] md:min-h-[280px] min-w-0 relative">
        <PatrolGeoHeatmap
          zones={liveZones}
          cameraPositions={cameraPositions}
          layer={activeLayer}
          displayMode="count"
          countMode="current"
          showRoute={true}
          showCameras={true}
          showZoneStats={!isRouteOnly && showZoneStats}
        />
      </div>

    </div>
  )
}
