import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Maximize2 } from 'lucide-react'
import { GlassCard } from './GlassCard'
import type { MmtbRow, RegionAllocation } from '../types'

const PIN_COLORS = ['#38bdf8', '#34d399', '#fbbf24', '#a78bfa', '#f87171', '#22d3ee']

interface VietnamRegionMapProps {
  regions: RegionAllocation[]
  getMachinesByRegion: (regionId: string) => MmtbRow[]
}

export function VietnamRegionMap({ regions, getMachinesByRegion }: VietnamRegionMapProps) {
  const [activeRegion, setActiveRegion] = useState<RegionAllocation | null>(null)
  const sorted = [...regions].sort((a, b) => b.machineCount - a.machineCount)

  return (
    <GlassCard
      title="PHÂN BỔ THEO KHU VỰC"
      delay={0.25}
      className="relative min-h-[320px]"
      action={
        <button type="button" className="text-slate-600 hover:text-slate-400 transition-colors p-0.5">
          <Maximize2 className="w-3.5 h-3.5" strokeWidth={1.75} />
        </button>
      }
    >
      <div className="flex gap-3 flex-1 min-h-0">
        {/* Vietnam SVG map */}
        <div className="relative flex-1 min-w-0 flex items-start justify-center">
          {/* Fixed-aspect container so pin % coords map 1:1 to SVG space */}
          <div className="relative w-full max-w-[130px]" style={{ aspectRatio: '200/400' }}>
            <svg
              viewBox="0 0 200 400"
              className="absolute inset-0 w-full h-full"
              aria-hidden
            >
              <defs>
                <linearGradient id="vn-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="rgba(56,189,248,0.18)" />
                  <stop offset="100%" stopColor="rgba(16,185,129,0.13)" />
                </linearGradient>
              </defs>
              {/* Vietnam S-shape silhouette — viewBox 0 0 200 400
                  N (top): wide Red River Delta / Gulf of Tonkin coast
                  Waist: Huế / Hải Vân pass ~y=150–170
                  S (bottom): Mekong Delta fan */}
              <path
                d={[
                  'M 44,12 C 68,5 96,4 96,4 L 158,10',
                  'C 163,18 165,28 162,38 L 155,50',
                  'C 150,58 144,66 136,74 L 126,86',
                  'C 118,98 110,110 103,124 L 97,138',
                  'C 93,148 90,157 89,163',
                  'C 90,169 94,174 99,180 L 105,190',
                  'C 109,202 113,214 117,226 L 120,238',
                  'C 123,250 126,262 129,274 L 131,286',
                  'C 129,298 124,310 118,322 L 110,334',
                  'C 100,344 87,352 74,360 L 56,364',
                  'C 46,358 38,347 34,334 L 30,318 L 28,300',
                  'C 26,280 25,260 24,240 L 23,212',
                  'C 22,188 22,166 22,145',
                  'C 22,126 24,108 26,92 L 28,76',
                  'C 26,60 22,44 20,30',
                  'C 26,18 34,13 44,12 Z',
                ].join(' ')}
                fill="url(#vn-grad)"
                stroke="rgba(56,189,248,0.35)"
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {/* Hạ Long Bay indentation hint */}
              <path
                d="M 138,74 C 142,70 148,68 152,72 C 148,78 142,80 138,74 Z"
                fill="rgba(56,189,248,0.08)"
                stroke="rgba(56,189,248,0.20)"
                strokeWidth="0.8"
              />
              {/* Phú Quốc island */}
              <ellipse cx="36" cy="352" rx="5" ry="8"
                fill="rgba(56,189,248,0.10)"
                stroke="rgba(56,189,248,0.28)"
                strokeWidth="1"
              />
            </svg>

            {/* Region pins — positioned relative to the aspect-ratio box */}
            {regions.map((region, i) => (
              <button
                key={region.id}
                type="button"
                onClick={() => setActiveRegion(activeRegion?.id === region.id ? null : region)}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 group z-[1]"
                style={{ left: `${region.x}%`, top: `${region.y}%` }}
              >
              <motion.span
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.95 }}
                className="flex flex-col items-center"
              >
                <span
                  className="rounded-full border-2 flex items-center justify-center font-bold text-white shadow-lg"
                  style={{
                    width: `${Math.max(24, Math.min(40, 20 + region.machineCount / 14))}px`,
                    height: `${Math.max(24, Math.min(40, 20 + region.machineCount / 14))}px`,
                    fontSize: '8px',
                    background: `${PIN_COLORS[i % PIN_COLORS.length]}2a`,
                    borderColor: `${PIN_COLORS[i % PIN_COLORS.length]}bb`,
                    boxShadow: `0 0 14px ${PIN_COLORS[i % PIN_COLORS.length]}44`,
                  }}
                >
                  {region.machineCount}
                </span>
              </motion.span>
              </button>
            ))}
          </div>{/* end aspect-ratio box */}
        </div>

        {/* Legend list */}
        <ul className="w-[46%] shrink-0 space-y-2.5 py-1">
          {sorted.map((region, i) => (
            <li key={region.id}>
              <button
                type="button"
                onClick={() => setActiveRegion(activeRegion?.id === region.id ? null : region)}
                className="w-full flex items-center justify-between gap-2 text-left group"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: PIN_COLORS[i % PIN_COLORS.length] }}
                  />
                  <span className="text-[10px] text-slate-400 group-hover:text-slate-200 truncate transition-colors leading-tight">
                    {region.name}
                  </span>
                </span>
                <span className="text-[12px] font-bold text-white tabular-nums shrink-0">
                  {region.machineCount}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Region popup */}
      <AnimatePresence>
        {activeRegion && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="absolute inset-x-3 bottom-3 rounded-xl border border-white/10 bg-[#0a1525]/98 backdrop-blur-xl p-3 max-h-[110px] overflow-y-auto z-10 shadow-xl"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold text-white">{activeRegion.name} — {activeRegion.machineCount} máy</p>
              <button type="button" onClick={() => setActiveRegion(null)} className="text-[9px] text-slate-600 hover:text-slate-400">
                ✕
              </button>
            </div>
            <ul className="space-y-1">
              {getMachinesByRegion(activeRegion.id).slice(0, 5).map(m => (
                <li key={m.id} className="flex justify-between text-[10px]">
                  <span className="text-sky-300 font-medium">{m.machineCode}</span>
                  <span className="text-slate-500">{m.status}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  )
}
