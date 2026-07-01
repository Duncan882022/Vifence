import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  BarChart, Bar,
} from 'recharts'
import { Panel } from '@/components/common/PageLayout/PageLayout'
import type { FleetSummary, TrendPoint, ShiftData } from '../types'

const DONUT_COLORS = ['#22c55e', '#fbbf24', '#f87171']
const DONUT_LABELS = ['Hoạt động', 'Chờ việc', 'Dừng máy']

interface Props {
  fleet: FleetSummary
  trendData: TrendPoint[]
  shiftData: ShiftData[]
}

export function OperationAnalyticsPanel({ fleet, trendData, shiftData }: Props) {
  const total = fleet.workingHours + fleet.idleHours + fleet.downtimeHours
  const donutData = [
    { name: 'Hoạt động', value: fleet.workingHours, pct: Math.round((fleet.workingHours / total) * 100) },
    { name: 'Chờ việc',  value: fleet.idleHours,    pct: Math.round((fleet.idleHours / total) * 100) },
    { name: 'Dừng máy',  value: fleet.downtimeHours, pct: Math.round((fleet.downtimeHours / total) * 100) },
  ]

  return (
    <Panel title="Phân tích vận hành" expandable className="h-full min-h-0">
      <div className="flex flex-col gap-4 h-full min-h-0 overflow-y-auto">

        {/* Donut: Phân bổ thời gian */}
        <div>
          <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-2">
            Phân bổ thời gian (giờ)
          </p>
          <div className="flex items-center gap-3">
            <div className="w-[90px] h-[90px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    innerRadius={28}
                    outerRadius={42}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                    animationBegin={100}
                    animationDuration={900}
                  >
                    {donutData.map((_, i) => (
                      <Cell key={i} fill={DONUT_COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 8, fontSize: 10 }}
                    formatter={(v: number) => [`${v.toLocaleString('vi-VN')}h`, '']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-1.5">
              {donutData.map((item, i) => (
                <div key={item.name} className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: DONUT_COLORS[i] }} />
                    <span className="text-[9px] text-muted-foreground/80">{DONUT_LABELS[i]}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-bold tabular-nums text-foreground">
                      {item.value.toLocaleString('vi-VN')}h
                    </span>
                    <span className="text-[8px] text-muted-foreground/50">({item.pct}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Line: Utilization trend 7 days */}
        <div>
          <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-2">
            Xu hướng Utilization (7 ngày)
          </p>
          <div className="h-[80px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="#1e2433" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fill: '#64748b', fontSize: 8 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[60, 100]}
                  tick={{ fill: '#64748b', fontSize: 8 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 8, fontSize: 10 }}
                  formatter={(v: number) => [`${v}%`, 'Utilization']}
                />
                <Line
                  type="monotone"
                  dataKey="utilizationPct"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: '#38bdf8', strokeWidth: 0 }}
                  activeDot={{ r: 4, fill: '#38bdf8' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bar: Shift distribution */}
        <div>
          <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-2">
            Năng suất theo ca (m cọc/giờ)
          </p>
          <div className="h-[80px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={shiftData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="#1e2433" vertical={false} />
                <XAxis
                  dataKey="shift"
                  tick={{ fill: '#64748b', fontSize: 8 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 35]}
                  tick={{ fill: '#64748b', fontSize: 8 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 8, fontSize: 10 }}
                  formatter={(v: number) => [`${v} m/giờ`, '']}
                />
                <Bar dataKey="outputPerHour" fill="#a78bfa" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </Panel>
  )
}
