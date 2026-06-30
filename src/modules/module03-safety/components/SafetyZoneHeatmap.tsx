import { useMemo, useState, useRef } from 'react'
import { AlertTriangle, MapPin } from 'lucide-react'
import { computeHeatmapZones } from '../services/safetyHeatmap.service'
import { SAFETY_VIOLATIONS } from '../data/safetyViolations'

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
  textColor: string
  badgeFill: string
}> = {
  none: {
    fill: '#22c55e', stroke: '#4ade80',
    fillOpacity: 0.18, fillOpacityHover: 0.28, strokeOpacity: 0.35,
    textColor: '#86efac', badgeFill: '#16a34a',
  },
  medium: {
    fill: '#f97316', stroke: '#fb923c',
    fillOpacity: 0.32, fillOpacityHover: 0.44, strokeOpacity: 0.65,
    textColor: '#fdba74', badgeFill: '#ea580c',
  },
  high: {
    fill: '#ef4444', stroke: '#f87171',
    fillOpacity: 0.42, fillOpacityHover: 0.55, strokeOpacity: 0.80,
    textColor: '#fca5a5', badgeFill: '#dc2626',
  },
}

interface ZoneShape {
  id: string
  x: number
  y: number
  width: number
  height: number
}

/**
 * Layout (viewBox 0 0 600 400):
 *
 * Top row    y=15–185  : [Khu A w=275] [road 10] [Khu B w=285]
 * Horiz road y=185–195
 * Mid row    y=195–305 : [Khu D w=155] [road 10] [Khu C w=210] [road 10] [Crane w=185]
 * Horiz road y=305–315
 * Bot row    y=315–385 : [Gate w=90] [road 10] [Yard w=280] [road 10] [Access road]
 */
const ZONE_SHAPES: ZoneShape[] = [
  { id: 'khu-a', x: 15,  y: 15,  width: 275, height: 170 },
  { id: 'khu-b', x: 300, y: 15,  width: 285, height: 170 },
  { id: 'khu-d', x: 15,  y: 195, width: 155, height: 110 },
  { id: 'khu-c', x: 180, y: 195, width: 210, height: 110 },
  { id: 'crane', x: 400, y: 195, width: 185, height: 110 },
  { id: 'gate',  x: 15,  y: 315, width: 90,  height: 70  },
  { id: 'yard',  x: 115, y: 315, width: 280, height: 70  },
]

const LEGEND_ITEMS = [
  { color: '#ef4444', label: 'Cao (≥3)' },
  { color: '#f97316', label: 'Trung bình (1–2)' },
  { color: '#22c55e', label: 'An toàn (0)' },
]

export function SafetyZoneHeatmap({ selectedZoneId, onSelectZone }: SafetyZoneHeatmapProps) {
  const zones     = useMemo(() => computeHeatmapZones(SAFETY_VIOLATIONS), [])
  const zoneMap   = useMemo(() => new Map(zones.map(z => [z.id, z])), [zones])
  const total     = useMemo(() => zones.reduce((s, z) => s + z.count, 0), [zones])
  const totalPend = useMemo(() => zones.reduce((s, z) => s + z.pending, 0), [zones])

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [mouse, setMouse]         = useState({ x: 0, y: 0 })
  const containerRef              = useRef<HTMLDivElement>(null)

  const hoveredZone = hoveredId ? zoneMap.get(hoveredId) : null

  function handleMouseMove(e: React.MouseEvent) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sub-header */}
      <div className="px-3 py-2 border-b border-[#1e2433] shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="text-[10px] text-muted-foreground truncate">
            <span className="font-semibold text-foreground">7 ngày qua</span>
            <span className="mx-1 hidden sm:inline">·</span>
            <span className="tabular-nums hidden sm:inline">{total} vi phạm</span>
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

      {/* Map + legend */}
      <div className="flex-1 min-h-0 flex flex-col p-2 gap-1.5">
        {/* SVG map container */}
        <div
          ref={containerRef}
          className="relative flex-1 min-h-0 bg-[#060d18] rounded-lg border border-[#1e2b3d] overflow-hidden"
          onMouseMove={handleMouseMove}
        >
          <svg
            viewBox="0 0 600 400"
            className="w-full h-full"
            onMouseLeave={() => setHoveredId(null)}
          >
            <defs>
              {/* Subtle grid */}
              <pattern id="sitegrid" width="30" height="30" patternUnits="userSpaceOnUse">
                <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#0f1f35" strokeWidth="0.5" />
              </pattern>
              {/* Larger grid marks */}
              <pattern id="sitegrid2" width="120" height="120" patternUnits="userSpaceOnUse">
                <path d="M 120 0 L 0 0 0 120" fill="none" stroke="#162233" strokeWidth="0.8" />
              </pattern>
              {/* Glow for selected */}
              <filter id="zoneglow" x="-15%" y="-15%" width="130%" height="130%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Background */}
            <rect width="600" height="400" fill="#060d18" />
            <rect width="600" height="400" fill="url(#sitegrid)" />
            <rect width="600" height="400" fill="url(#sitegrid2)" />

            {/* Outer site perimeter */}
            <rect x="8" y="8" width="584" height="384" fill="none"
              stroke="#1e3a5f" strokeWidth="1.5" strokeDasharray="6 3" rx="3" />

            {/* Horizontal road bands */}
            <rect x="8" y="185" width="584" height="10" fill="#0a1628" />
            <line x1="8" y1="190" x2="592" y2="190"
              stroke="#1e3a5f" strokeWidth="0.8" strokeDasharray="10 5" strokeOpacity="0.6" />

            <rect x="8" y="305" width="584" height="10" fill="#0a1628" />
            <line x1="8" y1="310" x2="592" y2="310"
              stroke="#1e3a5f" strokeWidth="0.8" strokeDasharray="10 5" strokeOpacity="0.6" />

            {/* Vertical road bands */}
            <rect x="290" y="8" width="10" height="177" fill="#0a1628" />
            <line x1="295" y1="8" x2="295" y2="185"
              stroke="#1e3a5f" strokeWidth="0.8" strokeDasharray="8 4" strokeOpacity="0.6" />

            <rect x="170" y="195" width="10" height="120" fill="#0a1628" />
            <line x1="175" y1="195" x2="175" y2="315"
              stroke="#1e3a5f" strokeWidth="0.8" strokeDasharray="8 4" strokeOpacity="0.6" />

            <rect x="390" y="195" width="10" height="120" fill="#0a1628" />
            <line x1="395" y1="195" x2="395" y2="315"
              stroke="#1e3a5f" strokeWidth="0.8" strokeDasharray="8 4" strokeOpacity="0.6" />

            <rect x="105" y="315" width="10" height="70" fill="#0a1628" />
            <line x1="110" y1="315" x2="110" y2="385"
              stroke="#1e3a5f" strokeWidth="0.8" strokeDasharray="6 3" strokeOpacity="0.6" />

            <rect x="395" y="315" width="10" height="70" fill="#0a1628" />
            <line x1="400" y1="315" x2="400" y2="385"
              stroke="#1e3a5f" strokeWidth="0.8" strokeDasharray="6 3" strokeOpacity="0.6" />

            {/* Access road area (bottom-right, non-interactive) */}
            <rect x="405" y="315" width="180" height="70" fill="#0a1628"
              stroke="#1e3a5f" strokeWidth="0.5" rx="2" />
            <text x="495" y="346" textAnchor="middle" fill="#1e3a5f" fontSize="8" fontStyle="italic">
              Đường Ra Vào
            </text>
            <text x="495" y="358" textAnchor="middle" fill="#1e3a5f" fontSize="7" fontStyle="italic">
              Công Trình
            </text>
            {/* Arrow indicating entrance */}
            <path d="M 460,365 L 540,365 L 535,361 M 540,365 L 535,369"
              fill="none" stroke="#1e3a5f" strokeWidth="1" strokeOpacity="0.5" />

            {/* Zone rectangles */}
            {ZONE_SHAPES.map(shape => {
              const zone       = zoneMap.get(shape.id)
              const count      = zone?.count ?? 0
              const risk       = getRiskLevel(count)
              const cfg        = RISK_CONFIG[risk]
              const isSelected = selectedZoneId === shape.id
              const isHovered  = hoveredId === shape.id

              const cx = shape.x + shape.width / 2
              const cy = shape.y + shape.height / 2

              // Only show sublabel if zone is tall/wide enough
              const showSublabel = shape.height >= 100 && shape.width >= 130
              const mainSize     = shape.width >= 200 ? 11 : shape.width >= 130 ? 10 : 9
              const labelY       = showSublabel ? cy - 8 : cy

              // Count badge: top-right corner
              const badgeCx = shape.x + shape.width - 14
              const badgeCy = shape.y + 14
              const badgeR  = count >= 10 ? 11 : 9

              return (
                <g
                  key={shape.id}
                  onClick={() => onSelectZone?.(isSelected ? null : shape.id)}
                  onMouseEnter={() => setHoveredId(shape.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{ cursor: onSelectZone ? 'pointer' : 'default' }}
                >
                  {/* Zone fill */}
                  <rect
                    x={shape.x}
                    y={shape.y}
                    width={shape.width}
                    height={shape.height}
                    fill={cfg.fill}
                    fillOpacity={isHovered ? cfg.fillOpacityHover : cfg.fillOpacity}
                    stroke={isSelected ? '#ffffff' : cfg.stroke}
                    strokeWidth={isSelected ? 2 : 1}
                    strokeOpacity={isSelected ? 0.8 : cfg.strokeOpacity}
                    rx="2"
                  />

                  {/* Inner subtle border for depth */}
                  <rect
                    x={shape.x + 3}
                    y={shape.y + 3}
                    width={shape.width - 6}
                    height={shape.height - 6}
                    fill="none"
                    stroke={cfg.stroke}
                    strokeWidth="0.5"
                    strokeOpacity={0.15}
                    rx="1"
                  />

                  {/* Zone main label */}
                  <text
                    x={cx}
                    y={labelY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    fillOpacity={0.9}
                    fontSize={mainSize}
                    fontWeight="600"
                    fontFamily="system-ui, sans-serif"
                  >
                    {zone?.label ?? shape.id}
                  </text>

                  {/* Sublabel */}
                  {showSublabel && zone?.sublabel && (
                    <text
                      x={cx}
                      y={cy + 9}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill={cfg.textColor}
                      fillOpacity={0.65}
                      fontSize={8}
                      fontFamily="system-ui, sans-serif"
                    >
                      {zone.sublabel}
                    </text>
                  )}

                  {/* Violation count badge */}
                  {count > 0 && (
                    <g>
                      <circle
                        cx={badgeCx}
                        cy={badgeCy}
                        r={badgeR}
                        fill={cfg.badgeFill}
                        fillOpacity={0.92}
                        stroke={cfg.stroke}
                        strokeWidth="1.5"
                        strokeOpacity={0.7}
                      />
                      <text
                        x={badgeCx}
                        y={badgeCy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="white"
                        fontSize={count >= 10 ? 7 : 9}
                        fontWeight="700"
                        fontFamily="system-ui, sans-serif"
                      >
                        {count}
                      </text>
                    </g>
                  )}

                  {/* Pending amber dot */}
                  {(zone?.pending ?? 0) > 0 && (
                    <circle
                      cx={shape.x + 10}
                      cy={shape.y + 10}
                      r="4"
                      fill="#f59e0b"
                      fillOpacity={0.9}
                      stroke="#fbbf24"
                      strokeWidth="1"
                    />
                  )}

                  {/* Selected glow ring */}
                  {isSelected && (
                    <rect
                      x={shape.x - 2}
                      y={shape.y - 2}
                      width={shape.width + 4}
                      height={shape.height + 4}
                      fill="none"
                      stroke="white"
                      strokeWidth="2"
                      strokeOpacity="0.3"
                      rx="4"
                      filter="url(#zoneglow)"
                    />
                  )}
                </g>
              )
            })}

            {/* Site label */}
            <text x="300" y="395" textAnchor="middle" fill="#1e3a5f" fontSize="7" fontStyle="italic">
              OCP1 — Hạ Long Xanh · Sơ đồ mặt bằng công trường
            </text>

            {/* Compass rose */}
            <g transform="translate(572, 28)">
              <circle cx="0" cy="0" r="11" fill="#0a1628" stroke="#1e3a5f" strokeWidth="1" />
              <text x="0" y="1" textAnchor="middle" dominantBaseline="middle"
                fill="#334155" fontSize="8" fontWeight="700">N</text>
              <path d="M0,-7 L2.5,-1 L0,-3 L-2.5,-1 Z" fill="#3b82f6" fillOpacity="0.75" />
            </g>
          </svg>

          {/* Floating tooltip */}
          {hoveredZone && (
            <div
              className="absolute z-20 pointer-events-none"
              style={{
                left: mouse.x + 14,
                top:  mouse.y - 10,
                transform:
                  mouse.x > (containerRef.current?.clientWidth ?? 400) * 0.6
                    ? 'translateX(calc(-100% - 28px))'
                    : undefined,
              }}
            >
              <div className="bg-[#0e1c30] border border-[#1e3a5f] rounded-lg px-3 py-2 shadow-2xl min-w-[148px]">
                <p className="text-[10px] font-semibold text-white leading-tight">
                  {hoveredZone.label}
                </p>
                {hoveredZone.sublabel && (
                  <p className="text-[9px] text-slate-400 mt-0.5">{hoveredZone.sublabel}</p>
                )}
                <div className="mt-2 flex items-center gap-1.5">
                  <span className={`text-[14px] font-bold tabular-nums leading-none ${
                    getRiskLevel(hoveredZone.count) === 'high'   ? 'text-red-400'
                    : getRiskLevel(hoveredZone.count) === 'medium' ? 'text-orange-400'
                    : 'text-green-400'
                  }`}>
                    {hoveredZone.count}
                  </span>
                  <span className="text-[9px] text-slate-500 leading-none">vi phạm</span>
                  {hoveredZone.pending > 0 && (
                    <span className="ml-auto text-[8px] text-amber-400">
                      {hoveredZone.pending} chờ
                    </span>
                  )}
                </div>
                {hoveredZone.peakSeverity && hoveredZone.count > 0 && (
                  <p className={`text-[8px] mt-1 ${
                    hoveredZone.peakSeverity === 'high'   ? 'text-red-400/70'
                    : hoveredZone.peakSeverity === 'medium' ? 'text-orange-400/70'
                    : 'text-slate-500'
                  }`}>
                    Mức độ:{' '}
                    {hoveredZone.peakSeverity === 'high'   ? 'Cao'
                     : hoveredZone.peakSeverity === 'medium' ? 'Trung bình'
                     : 'Thấp'}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 px-1 shrink-0">
          {LEGEND_ITEMS.map(item => (
            <span key={item.label} className="inline-flex items-center gap-1 text-[9px] text-gray-500">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0 inline-block"
                style={{ backgroundColor: item.color, opacity: 0.7 }}
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
