import { useState } from 'react'
import { Search, Plus } from 'lucide-react'
import { Header } from '@/components/common/Header/Header'
import { PageLayout, Tier1, Panel } from '@/components/common/PageLayout/PageLayout'
import { KPICard } from '@/components/common/KPICard/KPICard'
import { StatusBadge } from '@/components/common/StatusBadge/StatusBadge'
import type { KPIData } from '@/types/api'
import { formatDateTime } from '@/utils/format'

const inspectionKPIs: KPIData[] = [
  { label: 'Chờ nghiệm thu', value: 5, unit: 'hạng mục', change: 2, changeType: 'increase' },
  { label: 'Đã nghiệm thu', value: 12, unit: 'hạng mục', change: 3, changeType: 'increase' },
  { label: 'Từ chối', value: 1, unit: 'hạng mục', change: 1, changeType: 'increase' },
  { label: 'Tổng hạng mục', value: 18, unit: 'hạng mục', change: 5, changeType: 'increase' },
]

const inspectionItems = [
  { id: 'i-01', title: 'Móng Cọc Khu A', category: 'Kết cấu', status: 'approved' as const, submittedBy: 'Nguyễn Văn An', submittedAt: '2026-06-22T09:00:00', reviewedBy: 'Kỹ sư Trần Minh', reviewedAt: '2026-06-23T14:00:00' },
  { id: 'i-02', title: 'Dầm Sàn Tầng 2', category: 'Kết cấu', status: 'pending' as const, submittedBy: 'Lê Văn Cường', submittedAt: '2026-06-24T08:00:00' },
  { id: 'i-03', title: 'Hệ Thống Điện Tầng 1', category: 'Cơ Điện', status: 'pending' as const, submittedBy: 'Phạm Minh Đức', submittedAt: '2026-06-24T10:00:00' },
  { id: 'i-04', title: 'Lớp Chống Thấm Mái', category: 'Hoàn Thiện', status: 'rejected' as const, submittedBy: 'Hoàng Thị Em', submittedAt: '2026-06-23T13:00:00', reviewedBy: 'Kỹ sư Nguyễn Hòa', reviewedAt: '2026-06-24T09:00:00', notes: 'Cần kiểm tra lại lớp chống thấm' },
  { id: 'i-05', title: 'Vách Ngăn Tầng 3', category: 'Hoàn Thiện', status: 'approved' as const, submittedBy: 'Vũ Quốc Hùng', submittedAt: '2026-06-21T11:00:00', reviewedBy: 'Kỹ sư Lê Tuấn', reviewedAt: '2026-06-22T15:00:00' },
]

const statusVariant = { approved: 'success' as const, pending: 'warning' as const, rejected: 'danger' as const }
const statusLabel = { approved: 'Đã nghiệm thu', pending: 'Chờ nghiệm thu', rejected: 'Từ chối' }

export function Module07Page() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const filtered = inspectionItems.filter(item => {
    const matchSearch = item.title.toLowerCase().includes(search.toLowerCase()) || item.category.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || item.status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <>
      <Header
        title="Nghiệm Thu"
        subtitle="Quản lý hạng mục và hồ sơ nghiệm thu"
      />
      <PageLayout>
        <Tier1>
          {inspectionKPIs.map((kpi, i) => (
            <KPICard key={i} data={kpi} />
          ))}
        </Tier1>

        <Panel
          title="Danh Sách Hạng Mục Nghiệm Thu"
          headerRight={
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Tìm kiếm..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-muted border border-border rounded px-6 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-muted border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none"
              >
                <option value="all">Tất cả</option>
                <option value="pending">Chờ nghiệm thu</option>
                <option value="approved">Đã nghiệm thu</option>
                <option value="rejected">Từ chối</option>
              </select>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/80 transition-colors">
                <Plus className="w-3 h-3" />
                Thêm hạng mục
              </button>
            </div>
          }
        >
          <div className="space-y-2">
            {filtered.map((item) => (
              <div key={item.id} className="p-4 rounded-md bg-muted/50 border border-border">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                      <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">{item.category}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Gửi bởi: <span className="text-foreground">{item.submittedBy}</span> · {formatDateTime(item.submittedAt)}
                    </p>
                    {item.reviewedBy && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Xét duyệt: <span className="text-foreground">{item.reviewedBy}</span> · {item.reviewedAt ? formatDateTime(item.reviewedAt) : ''}
                      </p>
                    )}
                    {item.notes && (
                      <p className="text-xs text-yellow-400 mt-1 bg-yellow-500/10 px-2 py-1 rounded">Ghi chú: {item.notes}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <StatusBadge variant={statusVariant[item.status]} label={statusLabel[item.status]} />
                    {item.status === 'pending' && (
                      <div className="flex gap-1">
                        <button className="text-[10px] px-2 py-0.5 rounded bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors">Duyệt</button>
                        <button className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">Từ chối</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </PageLayout>
    </>
  )
}
