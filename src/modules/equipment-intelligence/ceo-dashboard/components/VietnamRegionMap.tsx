import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassCard } from './GlassCard'
import type { MmtbRow, RegionAllocation } from '../types'

interface VietnamRegionMapProps {
  regions: RegionAllocation[]
  getMachinesByRegion: (regionId: string) => MmtbRow[]
}

export function VietnamRegionMap({ regions, getMachinesByRegion }: VietnamRegionMapProps) {
  const [activeRegion, setActiveRegion] = useState<RegionAllocation | null>(null)

  return (
    <GlassCard title="Phân bổ khu vực" delay={0.25} className="relative min-h-[280px]">
      <div className="relative aspect-[4/5] max-h-[320px] mx-auto">
        <svg viewBox="0 0 100 100" className="w-full h-full opacity-30" aria-hidden>
          <path
            d="M72 8 L78 15 L80 25 L75 35 L70 42 L65 48 L58 52 L52 58 L48 65 L50 72 L52 78 L55 85 L50 92 L45 88 L42 80 L38 72 L40 65 L45 58 L48 50 L52 42 L55 35 L58 28 L62 22 L68 15 Z"
            fill="rgba(56,189,248,0.15)"
            stroke="rgba(56,189,248,0.35)"
            strokeWidth="0.5"
          />
        </svg>

        {regions.map(region => (
          <button
            key={region.id}
            type="button"
            onClick={() => setActiveRegion(region)}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 group"
            style={{ left: `${region.x}%`, top: `${region.y}%` }}
          >
            <motion.span
              whileHover={{ scale: 1.1 }}
              className="flex flex-col items-center"
            >
              <span
                className="rounded-full border-2 border-sky-400/60 bg-sky-500/25 backdrop-blur-sm flex items-center justify-center font-bold text-white shadow-lg shadow-sky-500/20"
                style={{
                  width: `${Math.max(28, Math.min(52, region.machineCount / 8))}px`,
                  height: `${Math.max(28, Math.min(52, region.machineCount / 8))}px`,
                  fontSize: '9px',
                }}
              >
                {region.machineCount}
              </span>
              <span className="mt-1 text-[8px] font-medium text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap max-w-[80px] truncate">
                {region.name.split(' / ')[0]}
              </span>
            </motion.span>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {activeRegion && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute inset-x-4 bottom-4 rounded-xl border border-white/15 bg-[#0a1525]/95 backdrop-blur-xl p-3 max-h-[140px] overflow-y-auto z-10"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold text-white">{activeRegion.name}</p>
              <button type="button" onClick={() => setActiveRegion(null)} className="text-[10px] text-slate-500 hover:text-slate-300">Đóng</button>
            </div>
            <ul className="space-y-1">
              {getMachinesByRegion(activeRegion.id).slice(0, 6).map(m => (
                <li key={m.id} className="flex justify-between text-[10px] text-slate-400">
                  <span className="text-sky-300 font-medium">{m.machineCode}</span>
                  <span>{m.status}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  )
}
