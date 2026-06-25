import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts'
import { Download, FileText } from 'lucide-react'
import { Header } from '@/components/common/Header/Header'
import { PageLayout, Tier1, Tier2, Panel } from '@/components/common/PageLayout/PageLayout'
import { KPICard } from '@/components/common/KPICard/KPICard'
import type { KPIData } from '@/types/api'

const reportingKPIs: KPIData[] = [
  { label: 'Lao động hôm nay', value: 67, unit: 'người', change: 3, changeType: 'increase' },
  { label: 'Vi phạm an toàn', value: 8, unit: 'vi phạm', change: -2, changeType: 'decrease' },
  { label: 'Tỷ lệ đào tạo', value: '88.1', unit: '%', change: 3, changeType: 'increase' },
  { label: 'Sự cố vệ sinh', value: 6, unit: 'sự cố', change: -1, changeType: 'decrease' },
]

const weeklyWorkforce = [
  { day: 'T2', workers: 65, violations: 5 },
  { day: 'T3', workers: 70, violations: 8 },
  { day: 'T4', workers: 68, violations: 6 },
  { day: 'T5', workers: 72, violations: 4 },
  { day: 'T6', workers: 67, violations: 8 },
  { day: 'T7', workers: 45, violations: 2 },
]

const monthlyTrend = [
  { week: 'Tuần 1', safety: 18, training: 92, productivity: 78 },
  { week: 'Tuần 2', safety: 15, training: 88, productivity: 80 },
  { week: 'Tuần 3', safety: 12, training: 90, productivity: 82 },
  { week: 'Tuần 4', safety: 10, training: 91, productivity: 85 },
]

const chartStyle = {
  contentStyle: {
    backgroundColor: 'hsl(222 84% 8%)',
    border: '1px solid hsl(217 33% 17%)',
    borderRadius: '6px',
    fontSize: '11px',
  },
  labelStyle: { color: 'hsl(210 40% 98%)' },
}

export function Module08Page() {
  return (
    <>
      <Header
        title="Báo Cáo Điều Hành"
        subtitle="Tổng hợp dữ liệu toàn công trường"
      />
      <PageLayout>
        <Tier1>
          {reportingKPIs.map((kpi, i) => (
            <KPICard key={i} data={kpi} />
          ))}
        </Tier1>

        <Tier2>
          <Panel
            title="Lao Động & Vi Phạm Trong Tuần"
            headerRight={
              <div className="flex gap-1">
                {(['Ngày', 'Tuần', 'Tháng'] as const).map((p) => (
                  <button
                    key={p}
                    className={`px-2 py-0.5 rounded text-xs ${p === 'Tuần' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            }
            className="h-[320px]"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyWorkforce} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} />
                <Tooltip {...chartStyle} />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Bar dataKey="workers" fill="hsl(212 100% 47%)" radius={[2, 2, 0, 0]} name="Lao động" />
                <Bar dataKey="violations" fill="hsl(0 84% 60%)" radius={[2, 2, 0, 0]} name="Vi phạm" />
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          <Panel title="Xu Hướng Tháng" className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} />
                <Tooltip {...chartStyle} />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Line type="monotone" dataKey="safety" stroke="hsl(0 84% 60%)" strokeWidth={2} dot={{ r: 3 }} name="Vi phạm AT" />
                <Line type="monotone" dataKey="training" stroke="hsl(142 76% 36%)" strokeWidth={2} dot={{ r: 3 }} name="Đào tạo (%)" />
                <Line type="monotone" dataKey="productivity" stroke="hsl(212 100% 47%)" strokeWidth={2} dot={{ r: 3 }} name="Năng suất (%)" />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
        </Tier2>

        <Panel
          title="Xuất Báo Cáo"
          headerRight={
            <div className="flex gap-2">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted hover:bg-accent text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                <FileText className="w-3.5 h-3.5" />
                Xuất PDF
              </button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/10 hover:bg-primary/20 text-xs font-medium text-primary transition-colors">
                <Download className="w-3.5 h-3.5" />
                Tải xuống Excel
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-3 gap-3">
            {[
              { period: 'Ngày', date: '24/06/2026', status: 'Đã tổng hợp' },
              { period: 'Tuần', date: 'T3 2026', status: 'Đã tổng hợp' },
              { period: 'Tháng', date: 'Tháng 6/2026', status: 'Đang cập nhật' },
            ].map((r) => (
              <div key={r.period} className="p-4 rounded-md bg-muted/50 border border-border flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Báo cáo theo {r.period}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.date}</p>
                  <p className="text-xs text-green-400 mt-1">{r.status}</p>
                </div>
                <button className="p-2 rounded-md bg-muted hover:bg-accent transition-colors">
                  <Download className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
        </Panel>
      </PageLayout>
    </>
  )
}
