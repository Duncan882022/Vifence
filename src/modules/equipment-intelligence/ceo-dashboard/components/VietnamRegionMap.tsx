import { useMemo, useState, useCallback, useId } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, X } from 'lucide-react'
import { Panel } from '@/components/common/PageLayout/PageLayout'
import { TierCollapseButton } from '@/modules/module02-training/components/TierCollapseButton'
import { cn } from '@/utils/cn'
import {
  VIETNAM_MAP_VIEWBOX,
  VIETNAM_MAINLAND,
  VIETNAM_ISLANDS,
} from '../data/vietnamMapPaths'
import type { MmtbRow, RegionAllocation } from '../types'

const VIEWBOX = VIETNAM_MAP_VIEWBOX.split(' ').map(Number)
const VB_WIDTH = VIEWBOX[2]
const VB_HEIGHT = VIEWBOX[3]

const TIER_STYLES = [
  { min: 200, color: '#4ade80', label: '≥200' },
  { min: 150, color: '#38bdf8', label: '≥150' },
  { min: 100, color: '#fbbf24', label: '≥100' },
  { min: 0, color: '#a78bfa', label: '<100' },
] as const

function getTierColor(count: number): string {
  return TIER_STYLES.find(t => count >= t.min)?.color ?? TIER_STYLES[3].color
}

function getMarkerRadius(count: number): number {
  return Math.max(14, Math.min(26, 10 + count / 18))
}

function toSvgCoords(region: RegionAllocation): { cx: number; cy: number } {
  return {
    cx: (region.x / 100) * VB_WIDTH,
    cy: (region.y / 100) * VB_HEIGHT,
  }
}

interface VietnamRegionMapProps {
  regions: RegionAllocation[]
  getMachinesByRegion: (regionId: string) => MmtbRow[]
  /** Tier-level collapse — ẩn/hiện nội dung map */
  open?: boolean
  onToggleOpen?: () => void
}

function MapCanvas({
  regions,
  sorted,
  totalMachines,
  hoveredId,
  activeRegion,
  topRegionId,
  onHover,
  onSelect,
}: {
  regions: RegionAllocation[]
  sorted: RegionAllocation[]
  totalMachines: number
  hoveredId: string | null
  activeRegion: RegionAllocation | null
  topRegionId: string
  onHover: (id: string | null) => void
  onSelect: (region: RegionAllocation) => void
}) {
  const uid = useId().replace(/:/g, '')
  const colorById = useMemo(
    () => Object.fromEntries(regions.map(r => [r.id, getTierColor(r.machineCount)])),
    [regions],
  )

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2">
      {/* Map — full panel width, minimal padding */}
      <div className="relative flex-1 min-h-0 rounded-lg overflow-hidden border border-[#1e2433]/80 bg-[#060b14]">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_55%_60%_at_42%_48%,rgba(56,189,248,0.07),transparent_70%)]" />
        </div>

        <div className="relative flex-1 min-h-0 flex items-center justify-center p-1">
          <div className="h-full max-w-full aspect-[405/824]">
          <svg
            viewBox={VIETNAM_MAP_VIEWBOX}
            preserveAspectRatio="xMidYMid meet"
            className="w-full h-full"
            role="img"
            aria-label="Bản đồ phân bổ thiết bị Việt Nam"
          >
            <defs>
              <linearGradient id={`${uid}-land`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#141c2a" />
                <stop offset="100%" stopColor="#080d16" />
              </linearGradient>
              <linearGradient id={`${uid}-stroke`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="rgba(56,189,248,0.85)" />
                <stop offset="100%" stopColor="rgba(34,197,94,0.55)" />
              </linearGradient>
              <filter id={`${uid}-glow`} x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation="1.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id={`${uid}-pin-glow`} x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              {regions.map(r => (
                <radialGradient key={`heat-${r.id}`} id={`${uid}-heat-${r.id}`}>
                  <stop offset="0%" stopColor={colorById[r.id]} stopOpacity="0.3" />
                  <stop offset="100%" stopColor={colorById[r.id]} stopOpacity="0" />
                </radialGradient>
              ))}
            </defs>

            {/* Regional heat glow */}
            {regions.map(r => {
              const { cx, cy } = toSvgCoords(r)
              const active = hoveredId === r.id || activeRegion?.id === r.id
              return (
                <circle
                  key={`heat-${r.id}`}
                  cx={cx}
                  cy={cy}
                  r={45 + r.machineCount / 6}
                  fill={`url(#${uid}-heat-${r.id})`}
                  opacity={active ? 1 : 0.35}
                  className="transition-opacity duration-300"
                />
              )
            })}

            {/* Real Vietnam province boundaries */}
            <g filter={`url(#${uid}-glow)`}>
              {VIETNAM_MAINLAND.map(province => (
                <path
                  key={province.id}
                  d={province.path}
                  fill={`url(#${uid}-land)`}
                  stroke={`url(#${uid}-stroke)`}
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                />
              ))}
            </g>

            {/* Islands */}
            {VIETNAM_ISLANDS.map(island => (
              <circle
                key={island.id}
                cx={island.cx}
                cy={island.cy}
                r={island.r}
                fill="#0a0e18"
                stroke="rgba(56,189,248,0.25)"
                strokeWidth="0.8"
                strokeDasharray="2 2"
              />
            ))}

            {/* Region pins — SVG coords in same viewBox */}
            {regions.map(region => {
              const { cx, cy } = toSvgCoords(region)
              const color = colorById[region.id]
              const r = getMarkerRadius(region.machineCount)
              const isActive = activeRegion?.id === region.id
              const isHovered = hoveredId === region.id
              const isTop = region.id === topRegionId
              const highlighted = isActive || isHovered
              const fontSize = r > 20 ? 11 : 9

              return (
                <g
                  key={region.id}
                  className="cursor-pointer outline-none"
                  onMouseEnter={() => onHover(region.id)}
                  onMouseLeave={() => onHover(null)}
                  onClick={() => onSelect(region)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${region.name}: ${region.machineCount} máy`}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelect(region)
                    }
                  }}
                >
                  {isTop && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r + 10}
                      fill="none"
                      stroke={color}
                      strokeWidth="1"
                      opacity="0.35"
                      className="animate-pulse"
                    />
                  )}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r + 4}
                    fill={color}
                    opacity={highlighted ? 0.35 : 0.15}
                    filter={`url(#${uid}-pin-glow)`}
                  />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="#0d1117"
                    stroke={color}
                    strokeWidth={highlighted ? 2.5 : 1.5}
                    className="transition-all duration-200"
                  />
                  <text
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={highlighted ? '#ffffff' : color}
                    fontSize={fontSize}
                    fontWeight="700"
                    className="pointer-events-none select-none"
                    style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
                  >
                    {region.machineCount}
                  </text>
                  <title>{`${region.name} · ${region.machineCount} máy`}</title>
                </g>
              )
            })}
          </svg>
          </div>
        </div>

        {/* Tier legend — compact overlay */}
        <div className="absolute bottom-1.5 left-1.5 flex items-center gap-2 px-2 py-1 rounded-md bg-[#0d1117]/90 border border-[#1e2433]/70 backdrop-blur-sm">
          {TIER_STYLES.map(t => (
            <span key={t.label} className="flex items-center gap-1 text-[8px] text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: t.color }} />
              {t.label}
            </span>
          ))}
        </div>
      </div>

      {/* Compact region legend — single row on wide screens */}
      <ul className="shrink-0 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1">
        {sorted.map(region => {
          const color = colorById[region.id]
          const isActive = activeRegion?.id === region.id
          const isHovered = hoveredId === region.id
          const highlighted = isActive || isHovered
          const sharePct = Math.round((region.machineCount / totalMachines) * 100)

          return (
            <li key={region.id}>
              <button
                type="button"
                onClick={() => onSelect(region)}
                onMouseEnter={() => onHover(region.id)}
                onMouseLeave={() => onHover(null)}
                className={cn(
                  'w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left transition-all duration-200',
                  highlighted
                    ? 'bg-[#1a2235] border border-[#2a3855]'
                    : 'border border-transparent hover:bg-[#121826]/80 hover:border-[#1e2433]/50',
                )}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: color }}
                />
                <span className="flex-1 min-w-0">
                  <span className={cn(
                    'block text-[9px] leading-tight truncate',
                    highlighted ? 'text-foreground font-semibold' : 'text-muted-foreground',
                  )}>
                    {region.name}
                  </span>
                </span>
                <span className="text-[11px] font-bold text-foreground tabular-nums shrink-0">
                  {region.machineCount}
                </span>
                <span className="text-[8px] text-muted-foreground tabular-nums shrink-0 w-6 text-right">
                  {sharePct}%
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function VietnamRegionMap({
  regions,
  getMachinesByRegion,
  open = true,
  onToggleOpen,
}: VietnamRegionMapProps) {
  const [activeRegion, setActiveRegion] = useState<RegionAllocation | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const sorted = useMemo(
    () => [...regions].sort((a, b) => b.machineCount - a.machineCount),
    [regions],
  )
  const totalMachines = useMemo(
    () => regions.reduce((sum, r) => sum + r.machineCount, 0),
    [regions],
  )
  const topRegionId = sorted[0]?.id ?? ''

  const handleSelect = useCallback((region: RegionAllocation) => {
    setActiveRegion(prev => (prev?.id === region.id ? null : region))
  }, [])

  const mapProps = {
    regions,
    sorted,
    totalMachines,
    hoveredId,
    activeRegion,
    topRegionId,
    onHover: setHoveredId,
    onSelect: handleSelect,
  }

  const machineBadge = (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/25 text-[10px] font-bold text-primary tabular-nums whitespace-nowrap">
      <MapPin className="w-3 h-3 shrink-0" />
      {totalMachines.toLocaleString('vi-VN')} máy
    </span>
  )

  const headerControls = (
    <div className="flex items-center gap-1.5 min-w-0">
      {machineBadge}
      {onToggleOpen && (
        <TierCollapseButton
          open={open}
          onToggle={onToggleOpen}
          label="Phân bổ khu vực"
        />
      )}
    </div>
  )

  if (!open) {
    return (
      <Panel
        title="Phân bổ khu vực"
        fit
        className="shrink-0"
        headerRight={headerControls}
      >
        {null}
      </Panel>
    )
  }

  return (
    <Panel
      title="Phân bổ khu vực"
      noPadding
      expandable
      className="h-full min-h-0 relative"
      headerRight={headerControls}
      expandedContent={(
        <div className="flex flex-col flex-1 min-h-0 p-2 sm:p-3">
          <MapCanvas {...mapProps} />
          {activeRegion && (
            <RegionDetailPopup
              region={activeRegion}
              machines={getMachinesByRegion(activeRegion.id)}
              onClose={() => setActiveRegion(null)}
              className="mt-2 shrink-0"
            />
          )}
        </div>
      )}
    >
      <div className="flex flex-col flex-1 min-h-0 p-2 sm:p-3 relative">
        <MapCanvas {...mapProps} />

        <AnimatePresence>
          {activeRegion && (
            <RegionDetailPopup
              region={activeRegion}
              machines={getMachinesByRegion(activeRegion.id)}
              onClose={() => setActiveRegion(null)}
              className="absolute inset-x-2 sm:inset-x-3 bottom-2 sm:bottom-3 z-10"
            />
          )}
        </AnimatePresence>
      </div>
    </Panel>
  )
}

function RegionDetailPopup({
  region,
  machines,
  onClose,
  className,
}: {
  region: RegionAllocation
  machines: MmtbRow[]
  onClose: () => void
  className?: string
}) {
  const color = getTierColor(region.machineCount)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'rounded-xl border border-[#1e2433] bg-[#0d1117]/96 backdrop-blur-md p-3.5 max-h-[140px] overflow-y-auto',
        className,
      )}
      style={{ boxShadow: `0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px ${color}33 inset` }}
    >
      <div className="flex items-center justify-between mb-2.5 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-offset-1 ring-offset-[#0d1117]" style={{ background: color }} />
          <p className="text-[11px] font-bold text-foreground truncate">{region.name}</p>
          <span className="text-[10px] font-bold text-primary tabular-nums shrink-0 px-2 py-0.5 rounded-full bg-primary/10">
            {region.machineCount} máy
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-[#1a2235] transition-colors shrink-0"
          aria-label="Đóng"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <ul className="space-y-1.5">
        {machines.slice(0, 5).map(m => (
          <li key={m.id} className="flex justify-between items-center text-[10px] gap-2 py-0.5 border-b border-[#1e2433]/40 last:border-0">
            <span className="text-primary font-semibold">{m.machineCode}</span>
            <span className="text-muted-foreground truncate">{m.equipmentType}</span>
            <span className={cn(
              'text-[9px] font-medium shrink-0',
              m.status === 'Working' ? 'text-green-400'
                : m.status === 'Breakdown' ? 'text-red-400'
                  : m.status === 'Standby' ? 'text-amber-400' : 'text-sky-400',
            )}>
              {m.status}
            </span>
          </li>
        ))}
        {machines.length > 5 && (
          <li className="text-[9px] text-muted-foreground/70 pt-0.5">
            +{machines.length - 5} máy khác
          </li>
        )}
      </ul>
    </motion.div>
  )
}
