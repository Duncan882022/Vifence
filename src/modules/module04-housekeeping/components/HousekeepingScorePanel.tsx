import { useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { TrendingUp } from 'lucide-react'
import {
  getHousekeepingOverallScore,
  getHousekeepingScoreDelta,
  getHousekeepingScoreTrend,
} from '../services/housekeepingKpi.service'

const chartStyle = {
  contentStyle: {
    backgroundColor: '#0b0f1a',
    border: '1px solid #1e2433',
    borderRadius: '6px',
    fontSize: '11px',
  },
  labelStyle: { color: '#e2e8f0' },
}

function ScoreGauge({ score, max }: { score: number; max: number }) {
  const pct = (score / max) * 100
  const circumference = 2 * Math.PI * 54
  const offset = circumference - (pct / 100) * circumference

  return (
    <div className="relative w-32 h-32 sm:w-36 sm:h-36 shrink-0">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r="54" fill="none" stroke="#1e2433" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r="54"
          fill="none"
          stroke="url(#scoreGradient)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
        <defs>
          <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#0ea5e9" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl sm:text-3xl font-bold text-foreground tabular-nums leading-none">
          {score}
          <span className="text-sm text-muted-foreground font-medium">/{max}</span>
        </span>
      </div>
    </div>
  )
}

export function HousekeepingScorePanel() {
  const overall = getHousekeepingOverallScore()
  const delta = getHousekeepingScoreDelta()
  const trend = useMemo(() => getHousekeepingScoreTrend(), [])

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
        <ScoreGauge score={overall.current} max={overall.max} />

        <div className="flex-1 min-w-0 flex flex-col sm:flex-row items-center gap-3 sm:gap-4 w-full">
          <div className="flex-1 w-full sm:w-auto text-center sm:text-left px-4 py-3 rounded-lg border border-[#1e2433] bg-[#0b0f1a]">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">Xếp loại</p>
            <p className="text-xl sm:text-2xl font-bold text-sky-400">{overall.tierLabel}</p>
            <p className="text-[9px] text-muted-foreground mt-1">{overall.hint}</p>
          </div>

          <div className="text-center shrink-0 px-3">
            <div className="inline-flex items-center gap-1 text-green-400 font-bold text-lg tabular-nums">
              <TrendingUp className="w-4 h-4" />
              +{delta} điểm
            </div>
            <p className="text-[9px] text-muted-foreground mt-0.5">so với hôm qua</p>
            <p className="text-[10px] text-muted-foreground/80 tabular-nums mt-1">
              {overall.previous} → {overall.current}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-[140px] flex flex-col">
        <p className="text-[9px] sm:text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">
          Xu hướng Housekeeping Score
        </p>
        <div className="flex-1 min-h-[120px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2433" />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94a3b8' }} />
              <YAxis domain={[40, 100]} tick={{ fontSize: 9, fill: '#94a3b8' }} width={28} />
              <Tooltip {...chartStyle} formatter={(v: number) => [`${v} điểm`, 'Điểm']} />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#38bdf8"
                strokeWidth={2}
                dot={{ r: 3, fill: '#38bdf8' }}
                name="Điểm"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
