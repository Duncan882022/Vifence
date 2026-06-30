import { useMemo, useState, useRef } from 'react'
import { AlertTriangle, MapPin } from 'lucide-react'
import { computeHeatmapZones } from '../services/safetyHeatmap.service'
import { SAFETY_VIOLATIONS } from '../data/safetyViolations'
import {
  SITE_VIEWBOX,
  SITE_BOUNDARY_PATH,
  SITE_ZONE_SHAPES,
  SITE_ROADS,
  CRANE_SYMBOL,
  SCALE_BAR,
} from '../data/safetySiteMapPaths'

interface SafetyZoneHeatmapProps {
  selectedZoneId?: string | null
  onSelectZone?: (zoneId: string | null) => void
}

type RiskLevel = 'none' | 'medium' | 'high'

function getRiskLevel(count: number): RiskLevel {
  if (count === 0) return 'none'
  if (count <= 2) return 'medium'
  return 'high'
}

const RISK_CONFIG: Record<RiskLevel, {
  fill: string
  stroke: string
  fillOpacity: number
  fillOpacityHover: number
  strokeOpacity: number
  glow: string
  textColor: string
  badgeFill: string
}> = {
  none: {
    fill: '#22c55e',
    stroke: '#4ade80',
    fillOpacity: 0.22,
    fillOpacityHover: 0.32,
    strokeOpacity: 0.45,
    glow: 'rgba(34,197,94,0.25)',
    textColor: '#86efac',
    badgeFill: '#16a34a',
  },
  medium: {
    fill: '#f97316',
    stroke: '#fb923c',
    fillOpacity: 0.38,
    fillOpacityHover: 0.5,
    strokeOpacity: 0.7,
    glow: 'rgba(249,115,22,0.35)',
    textColor: '#fdba74',
    badgeFill: '#ea580c',
  },
  high: {
    fill: '#ef4444',
    stroke: '#f87171',
    fillOpacity: 0.48,
    fillOpacityHover: 0.6,
    strokeOpacity: 0.85,
    glow: 'rgba(239,68,68,0.45)',
    textColor: '#fca5a5',
    badgeFill: '#dc2626',
  },
}

const LEGEND_ITEMS = [
  { color: '#ef4444', label: 'Cao (≥3)' },
  { color: '#f97316', label: 'Trung bình (1–2)' },
  { color: '#22c55e', label: 'An toàn (0)' },
]

export function SafetyZoneHeatmap({ selectedZoneId, onSelectZone }: SafetyZoneHeatmapProps) {
  const zones = useMemo(() => computeHeatmapZones(SAFETY_VIOLATIONS), [])
  const zoneMap = useMemo(() => new Map(zones.map(z => [z.id, z])), [zones])
  const total = useMemo(() => zones.reduce((s, z) => s + z.count, 0), [zones])
  const totalPend = useMemo(() => zones.reduce((s, z) => s + z.pending, 0), [zones])

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [mouse, setMouse] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  const hoveredZone = hoveredId ? zoneMap.get(hoveredId) : null

  function handleMouseMove(e: React.MouseEvent) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 py-2 border-b border-[#1e2433] shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="text-[10px] text-muted-foreground truncate">
            <span className="font-semibold text-foreground">Bản đồ khu vực OCP1</span>
            <span className="mx-1 hidden sm:inline">·</span>
            <span className="tabular-nums hidden sm:inline">7 ngày · {total} vi phạm</span>
            {totalPend > 0 && (
              <>
                <span className="mx-1 hidden md:inline text-muted-foreground/50">·</span>
                <span className="hidden md:inline text-amber-500/80 tabular-nums">{totalPend} chờ xử lý</span>
              </>
            )}
          </span>
        </div>
        {selectedZoneId && (
          <button
            type="button"
            onClick={() => onSelectZone?.(null)}
            className="text-[9px] text-primary hover:text-primary/80 px-1.5 py-0.5 rounded hover:bg-primary/10 transition-colors shrink-0"
          >
            Bỏ lọc
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col p-2 gap-1.5">
        <div
          ref={containerRef}
          className="relative flex-1 min-h-[220px] bg-[#050a12] rounded-lg border border-[#1e2b3d] overflow-hidden"
          onMouseMove={handleMouseMove}
        >
          {/* Ambient map glow */}
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_70%_55%_at_50%_42%,rgba(14,165,233,0.06),transparent_72%)]" />

          <svg
            viewBox={SITE_VIEWBOX}
            className="relative w-full h-full"
            preserveAspectRatio="xMidYMid meet"
            onMouseLeave={() => setHoveredId(null)}
          >
            <defs>
              <pattern id="safety-map-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#0c1828" strokeWidth="0.45" />
              </pattern>
              <pattern id="safety-map-grid-major" width="128" height="128" patternUnits="userSpaceOnUse">
                <path d="M 128 0 L 0 0 0 128" fill="none" stroke="#132033" strokeWidth="0.7" />
              </pattern>
              <linearGradient id="safety-land" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#0f172a" />
                <stop offset="100%" stopColor="#0a1018" />
              </linearGradient>
              <filter id="zone-heat-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="zone-select-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Base layers */}
            <rect width="640" height="420" fill="url(#safety-land)" />
            <rect width="640" height="420" fill="url(#safety-map-grid)" />
            <rect width="640" height="420" fill="url(#safety-map-grid-major)" />

            {/* Site land mass inside boundary */}
            <path d={SITE_BOUNDARY_PATH} fill="#0c1420" fillOpacity="0.92" stroke="#334155" strokeWidth="1.2" strokeDasharray="5 3" />

            {/* Internal roads */}
            {SITE_ROADS.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="none"
                stroke="#1e293b"
                strokeWidth="10"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {SITE_ROADS.map((d, i) => (
              <path
                key={`line-${i}`}
                d={d}
                fill="none"
                stroke="#475569"
                strokeWidth="0.6"
                strokeDasharray="6 4"
                strokeOpacity="0.45"
              />
            ))}

            {/* Zone polygons — heatmap fill */}
            {SITE_ZONE_SHAPES.map(shape => {
              const zone = zoneMap.get(shape.id)
              const count = zone?.count ?? 0
              const risk = getRiskLevel(count)
              const cfg = RISK_CONFIG[risk]
              const isSelected = selectedZoneId === shape.id
              const isHovered = hoveredId === shape.id

              return (
                <g
                  key={shape.id}
                  onClick={() => onSelectZone?.(isSelected ? null : shape.id)}
                  onMouseEnter={() => setHoveredId(shape.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{ cursor: onSelectZone ? 'pointer' : 'default' }}
                >
                  {/* Heat glow under zone */}
                  {count > 0 && (
                    <path
                      d={shape.d}
                      fill={cfg.glow}
                      fillOpacity={isHovered ? 0.9 : 0.65}
                      filter="url(#zone-heat-glow)"
                      pointerEvents="none"
                    />
                  )}

                  <path
                    d={shape.d}
                    fill={cfg.fill}
                    fillOpacity={isHovered ? cfg.fillOpacityHover : cfg.fillOpacity}
                    stroke={isSelected ? '#ffffff' : cfg.stroke}
                    strokeWidth={isSelected ? 2.2 : 1.2}
                    strokeOpacity={isSelected ? 0.95 : cfg.strokeOpacity}
                    strokeLinejoin="round"
                  />

                  {/* Hatching for safe zones */}
                  {count === 0 && (
                    <path
                      d={shape.d}
                      fill="url(#safety-map-grid)"
                      fillOpacity="0.35"
                      pointerEvents="none"
                    />
                  )}

                  {/* Zone label */}
                  <text
                    x={shape.labelX}
                    y={shape.labelY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    fillOpacity={0.92}
                    fontSize={shape.id === 'gate' ? 8.5 : 10}
                    fontWeight="600"
                    fontFamily="system-ui, sans-serif"
                    pointerEvents="none"
                  >
                    {zone?.label ?? shape.id}
                  </text>
                  {shape.sublabelY != null && zone?.sublabel && (
                    <text
                      x={shape.labelX}
                      y={shape.sublabelY}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill={cfg.textColor}
                      fillOpacity="0.7"
                      fontSize="7.5"
                      fontFamily="system-ui, sans-serif"
                      pointerEvents="none"
                    >
                      {zone.sublabel}
                    </text>
                  )}

                  {/* Count pin */}
                  {count > 0 && (
                    <g pointerEvents="none">
                      <circle
                        cx={shape.labelX + (shape.id === 'gate' ? 28 : 36)}
                        cy={shape.labelY - (shape.sublabelY ? 18 : 12)}
                        r={count >= 10 ? 11 : 9}
                        fill={cfg.badgeFill}
                        fillOpacity="0.95"
                        stroke="#fff"
                        strokeWidth="1.2"
                        strokeOpacity="0.35"
                      />
                      <text
                        x={shape.labelX + (shape.id === 'gate' ? 28 : 36)}
                        y={shape.labelY - (shape.sublabelY ? 18 : 12)}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="white"
                        fontSize={count >= 10 ? 7 : 8.5}
                        fontWeight="700"
                        fontFamily="system-ui, sans-serif"
                      >
                        {count}
                      </text>
                    </g>
                  )}

                  {(zone?.pending ?? 0) > 0 && (
                    <circle
                      cx={shape.labelX - 32}
                      cy={shape.labelY - 14}
                      r="4.5"
                      fill="#f59e0b"
                      stroke="#fbbf24"
                      strokeWidth="1"
                      pointerEvents="none"
                    />
                  )}

                  {isSelected && (
                    <path
                      d={shape.d}
                      fill="none"
                      stroke="white"
                      strokeWidth="2.5"
                      strokeOpacity="0.45"
                      filter="url(#zone-select-glow)"
                      pointerEvents="none"
                    />
                  )}
                </g>
              )
            })}

            {/* Crane tower symbol */}
            <g pointerEvents="none" opacity="0.55">
              <line
                x1={CRANE_SYMBOL.cx}
                y1={CRANE_SYMBOL.cy + CRANE_SYMBOL.r}
                x2={CRANE_SYMBOL.cx}
                y2={CRANE_SYMBOL.cy - CRANE_SYMBOL.r * 1.6}
                stroke="#94a3b8"
                strokeWidth="1.5"
              />
              <line
                x1={CRANE_SYMBOL.cx - CRANE_SYMBOL.r * 1.4}
                y1={CRANE_SYMBOL.cy - CRANE_SYMBOL.r * 0.4}
                x2={CRANE_SYMBOL.cx + CRANE_SYMBOL.r * 1.8}
                y2={CRANE_SYMBOL.cy - CRANE_SYMBOL.r * 0.9}
                stroke="#94a3b8"
                strokeWidth="1.2"
              />
              <circle cx={CRANE_SYMBOL.cx} cy={CRANE_SYMBOL.cy - CRANE_SYMBOL.r * 1.6} r="2" fill="#cbd5e1" />
            </g>

            {/* Scale bar */}
            <g pointerEvents="none">
              <line
                x1={SCALE_BAR.x}
                y1={SCALE_BAR.y}
                x2={SCALE_BAR.x + SCALE_BAR.len}
                y2={SCALE_BAR.y}
                stroke="#64748b"
                strokeWidth="1.5"
              />
              <line x1={SCALE_BAR.x} y1={SCALE_BAR.y - 3} x2={SCALE_BAR.x} y2={SCALE_BAR.y + 3} stroke="#64748b" strokeWidth="1" />
              <line
                x1={SCALE_BAR.x + SCALE_BAR.len}
                y1={SCALE_BAR.y - 3}
                x2={SCALE_BAR.x + SCALE_BAR.len}
                y2={SCALE_BAR.y + 3}
                stroke="#64748b"
                strokeWidth="1"
              />
              <text x={SCALE_BAR.x + SCALE_BAR.len / 2} y={SCALE_BAR.y + 12} textAnchor="middle" fill="#64748b" fontSize="7">
                {SCALE_BAR.label}
              </text>
            </g>

            {/* Compass */}
            <g transform="translate(612, 36)" pointerEvents="none">
              <circle cx="0" cy="0" r="12" fill="#0a1628" stroke="#475569" strokeWidth="1" />
              <text x="0" y="1" textAnchor="middle" dominantBaseline="middle" fill="#94a3b8" fontSize="8" fontWeight="700">
                B
              </text>
              <path d="M0,-8 L2,-1 L0,-3 L-2,-1 Z" fill="#38bdf8" fillOpacity="0.8" />
            </g>

            {/* Site title */}
            <text x="320" y="408" textAnchor="middle" fill="#475569" fontSize="7.5" fontStyle="italic">
              OCP1 — Hạ Long Xanh · Sơ đồ phân khu an toàn
            </text>
          </svg>

          {hoveredZone && (
            <div
              className="absolute z-20 pointer-events-none"
              style={{
                left: mouse.x + 14,
                top: mouse.y - 10,
                transform:
                  mouse.x > (containerRef.current?.clientWidth ?? 400) * 0.58
                    ? 'translateX(calc(-100% - 28px))'
                    : undefined,
              }}
            >
              <div className="bg-[#0e1c30]/95 border border-[#1e3a5f] rounded-lg px-3 py-2 shadow-2xl min-w-[152px] backdrop-blur-sm">
                <p className="text-[10px] font-semibold text-white leading-tight">{hoveredZone.label}</p>
                {hoveredZone.sublabel && (
                  <p className="text-[9px] text-slate-400 mt-0.5">{hoveredZone.sublabel}</p>
                )}
                <div className="mt-2 flex items-center gap-1.5">
                  <span
                    className={`text-[14px] font-bold tabular-nums leading-none ${
                      getRiskLevel(hoveredZone.count) === 'high'
                        ? 'text-red-400'
                        : getRiskLevel(hoveredZone.count) === 'medium'
                          ? 'text-orange-400'
                          : 'text-green-400'
                    }`}
                  >
                    {hoveredZone.count}
                  </span>
                  <span className="text-[9px] text-slate-500">vi phạm · 7 ngày</span>
                  {hoveredZone.pending > 0 && (
                    <span className="ml-auto text-[8px] text-amber-400">{hoveredZone.pending} chờ</span>
                  )}
                </div>
                {hoveredZone.peakSeverity && hoveredZone.count > 0 && (
                  <p
                    className={`text-[8px] mt-1 ${
                      hoveredZone.peakSeverity === 'high'
                        ? 'text-red-400/70'
                        : hoveredZone.peakSeverity === 'medium'
                          ? 'text-orange-400/70'
                          : 'text-slate-500'
                    }`}
                  >
                    Mức độ cao nhất:{' '}
                    {hoveredZone.peakSeverity === 'high'
                      ? 'Cao'
                      : hoveredZone.peakSeverity === 'medium'
                        ? 'Trung bình'
                        : 'Thấp'}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 px-1 shrink-0 flex-wrap">
          {LEGEND_ITEMS.map(item => (
            <span key={item.label} className="inline-flex items-center gap-1 text-[9px] text-gray-500">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 inline-block"
                style={{ backgroundColor: item.color, opacity: 0.75 }}
              />
              {item.label}
            </span>
          ))}
          {totalPend > 0 && (
            <span className="inline-flex items-center gap-1 text-[9px] text-amber-600/70 ml-auto">
              <AlertTriangle className="w-2.5 h-2.5" />
              {totalPend} chờ xử lý
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
