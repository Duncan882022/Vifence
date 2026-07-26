import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, MapPin, Radio, WifiOff } from 'lucide-react'
import type { SafetyViolationRecord } from '../../types/safety.types'
import {
  SITE_BOUNDARY_PATH,
  SITE_ROADS,
  SITE_VIEWBOX,
  SITE_ZONE_SHAPES,
} from '../../data/safetySiteMapPaths'
import { MONITORING_DEVICES } from '../../data/monitoringDevices'
import { SAFETY_ZONES } from '../../data/safetyZones'
import { computeZoneRiskLevels } from '../../services/safetyDashboard.service'
import { ZONE_RISK_COLORS } from '../../utils/safetyDashboardUi'
import { SAFETY_DEMO_TODAY } from '../../data/safetyDemoDate'

interface SafetySiteMapProps {
  records: SafetyViolationRecord[]
  selectedZoneId?: string | null
  onSelectZone?: (zoneId: string | null) => void
  linkToZonePage?: boolean
}

const DEVICE_DOT: Record<string, { color: string; r: number }> = {
  FIXED_CAMERA: { color: '#38bdf8', r: 4 },
  PTZ_CAMERA: { color: '#22d3ee', r: 5 },
  DRONE: { color: '#a78bfa', r: 5 },
  BODY_CAMERA: { color: '#f472b6', r: 3.5 },
  RADAR: { color: '#fb923c', r: 4 },
}

export function SafetySiteMap({ records, selectedZoneId, onSelectZone, linkToZonePage }: SafetySiteMapProps) {
  const riskMap = useMemo(() => computeZoneRiskLevels(records), [records])
  const zoneNameMap = useMemo(() => new Map(SAFETY_ZONES.map(z => [z.mapShapeId ?? z.id, z])), [])
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const openByZone = useMemo(() => {
    const m = new Map<string, number>()
    records.filter(v => v.detectedAt.startsWith(SAFETY_DEMO_TODAY) && v.status !== 'CLOSED').forEach(v => {
      m.set(v.zoneId, (m.get(v.zoneId) ?? 0) + 1)
    })
    return m
  }, [records])

  return (
    <div ref={containerRef} className="flex flex-col h-full min-h-[280px]">
      <div className="px-3 py-2 border-b border-[#1e2433] shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="text-[10px] text-muted-foreground truncate">
            <span className="font-semibold text-foreground">Bản đồ khu vực giám sát</span>
            <span className="mx-1">·</span>Giảng Võ thí điểm
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {Object.entries(ZONE_RISK_COLORS).slice(0, 4).map(([key, cfg]) => (
            <span key={key} className="hidden sm:flex items-center gap-1 text-[8px] text-muted-foreground">
              <span className="w-2 h-2 rounded-full" style={{ background: cfg.fill }} />
              {cfg.label}
            </span>
          ))}
        </div>
      </div>

      <div className="relative flex-1 min-h-0 p-2">
        <svg viewBox={SITE_VIEWBOX} className="w-full h-full" role="img" aria-label="Bản đồ khu vực giám sát">
          <defs>
            <pattern id="safety-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1e2433" strokeWidth="0.5" opacity="0.4" />
            </pattern>
          </defs>
          <rect width="640" height="420" fill="#0a0e17" />
          <rect width="640" height="420" fill="url(#safety-grid)" />
          <path d={SITE_BOUNDARY_PATH} fill="#111827" stroke="#374151" strokeWidth="1.5" />

          {SITE_ROADS.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="#4b5563" strokeWidth="8" strokeLinecap="round" opacity="0.35" />
          ))}

          {SITE_ZONE_SHAPES.map(shape => {
            const zone = zoneNameMap.get(shape.id)
            const zoneId = zone?.id ?? shape.id
            const risk = zone ? riskMap.get(zone.id) ?? 'NORMAL' : 'NORMAL'
            const colors = ZONE_RISK_COLORS[risk]
            const isSelected = selectedZoneId === zoneId
            const isHovered = hoveredId === shape.id
            const open = openByZone.get(zoneId) ?? 0

            return (
              <g key={shape.id}>
                {linkToZonePage ? (
                  <Link to={`/module03/zones/${zoneId}`} aria-label={`Xem khu vực ${zone?.name ?? zoneId}`}>
                    <path
                      d={shape.d}
                      fill={colors.fill}
                      fillOpacity={isSelected ? 0.55 : isHovered ? 0.45 : 0.28}
                      stroke={isSelected ? '#fff' : colors.stroke}
                      strokeWidth={isSelected ? 2 : 1}
                      strokeOpacity={0.8}
                      className="cursor-pointer transition-all"
                      onMouseEnter={() => setHoveredId(shape.id)}
                      onMouseLeave={() => setHoveredId(null)}
                    />
                  </Link>
                ) : (
                  <path
                    d={shape.d}
                    fill={colors.fill}
                    fillOpacity={isSelected ? 0.55 : isHovered ? 0.45 : 0.28}
                    stroke={isSelected ? '#fff' : colors.stroke}
                    strokeWidth={isSelected ? 2 : 1}
                    strokeOpacity={0.8}
                    className="cursor-pointer transition-all"
                    onClick={() => onSelectZone?.(isSelected ? null : zoneId)}
                    onMouseEnter={() => setHoveredId(shape.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  />
                )}
                <text
                  x={shape.labelX}
                  y={shape.labelY}
                  textAnchor="middle"
                  className="fill-foreground pointer-events-none select-none"
                  style={{ fontSize: 9, fontWeight: 700 }}
                >
                  {zone?.id.replace('ZONE-', '') ?? shape.id}
                </text>
                {open > 0 && (
                  <text
                    x={shape.labelX}
                    y={(shape.sublabelY ?? shape.labelY + 12)}
                    textAnchor="middle"
                    className="fill-red-400 pointer-events-none select-none"
                    style={{ fontSize: 8, fontWeight: 600 }}
                  >
                    {open} mở
                  </text>
                )}
              </g>
            )
          })}

          {MONITORING_DEVICES.filter(d => d.coordinates).map(device => {
            const dot = DEVICE_DOT[device.type] ?? DEVICE_DOT.FIXED_CAMERA
            const offline = device.status === 'OFFLINE'
            return (
              <g key={device.id} transform={`translate(${device.coordinates!.x}, ${device.coordinates!.y})`}>
                <circle
                  r={dot.r + 2}
                  fill={offline ? '#6b7280' : dot.color}
                  fillOpacity={0.25}
                />
                <circle r={dot.r} fill={offline ? '#6b7280' : dot.color} />
                {device.type === 'DRONE' && device.status === 'STANDBY' && (
                  <circle r={dot.r + 4} fill="none" stroke="#a78bfa" strokeWidth="1" opacity="0.6">
                    <animate attributeName="r" values="6;10;6" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
              </g>
            )
          })}
        </svg>

        <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#0b0f1a]/90 border border-[#1e2433] text-[8px] text-muted-foreground">
            <Camera className="w-2.5 h-2.5 text-sky-400" /> Camera
          </span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#0b0f1a]/90 border border-[#1e2433] text-[8px] text-muted-foreground">
            <Radio className="w-2.5 h-2.5 text-violet-400" /> Flycam
          </span>
          {MONITORING_DEVICES.some(d => d.status === 'OFFLINE') && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-[8px] text-red-400">
              <WifiOff className="w-2.5 h-2.5" /> Mất kết nối
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
