import { cn } from '@/utils/cn'

export function scoreColor(score: number): string {
  if (score >= 70) return 'text-green-400'
  if (score >= 50) return 'text-amber-400'
  if (score >= 30) return 'text-orange-400'
  return 'text-red-400'
}

export function scoreBarColor(score: number): string {
  if (score >= 70) return 'bg-green-400'
  if (score >= 50) return 'bg-amber-400'
  if (score >= 30) return 'bg-orange-400'
  return 'bg-red-400'
}

export function riskLabel(r: string): string {
  const map: Record<string, string> = {
    critical: 'Nghiêm trọng',
    high: 'Cao',
    medium: 'Trung bình',
    low: 'Thấp',
  }
  return map[r] ?? r
}

export function riskChipClass(r: string): string {
  const map: Record<string, string> = {
    critical: 'bg-red-500/15 text-red-400 border-red-500/30',
    high: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    low: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  }
  return map[r] ?? map.low
}

export function severityChipClass(s: string): string {
  return riskChipClass(s)
}

/** Map operational state → badge label (Vifence Vietnamese) */
export function stateBadgeLabel(state: string): string {
  const map: Record<string, string> = {
    WORKING: 'Đang tạo sản lượng',
    HARD_GEOLOGY: 'Đang tạo sản lượng',
    IDLE: 'Chờ việc',
    PLANNED_IDLE: 'Chờ việc',
    WAITING_CONCRETE: 'Chờ việc',
    WAITING_OPERATOR: 'Chờ việc',
    SAFETY_STOP: 'Dừng kỹ thuật',
    TECHNICAL_ERROR: 'Dừng kỹ thuật',
    NO_SIGNAL: 'Mất tín hiệu',
    OFF_PLAN: 'Ngoài kế hoạch',
  }
  return map[state] ?? state.replace(/_/g, ' ')
}

export function stateBadgeClass(state: string): string {
  if (state === 'WORKING' || state === 'HARD_GEOLOGY') {
    return 'bg-green-500/15 text-green-400 border-green-500/30'
  }
  if (['IDLE', 'PLANNED_IDLE', 'WAITING_CONCRETE', 'WAITING_OPERATOR'].includes(state)) {
    return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
  }
  if (['SAFETY_STOP', 'TECHNICAL_ERROR'].includes(state)) {
    return 'bg-red-500/15 text-red-400 border-red-500/30'
  }
  if (state === 'NO_SIGNAL') return 'bg-gray-500/15 text-gray-400 border-gray-500/30'
  return 'bg-purple-500/15 text-purple-400 border-purple-500/30'
}

export function fmtNum(n: number): string {
  return Number(n).toLocaleString('vi-VN')
}

export function fmtUsd(n: number): string {
  return `$${Number(n).toLocaleString('en-US')}`
}

export function ScoreBar({ score, className }: { score: number; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 min-w-[88px]', className)}>
      <div className="flex-1 h-1.5 rounded-full bg-[#1e2433] overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', scoreBarColor(score))}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
      <span className={cn('text-[10px] font-bold tabular-nums w-8 text-right', scoreColor(score))}>
        {score}%
      </span>
    </div>
  )
}

export const IMPACT_BY_STATE: Record<string, string> = {
  SAFETY_STOP: 'Dừng thi công — rủi ro người và tài sản',
  TECHNICAL_ERROR: 'Máy mất năng lực tạo sản lượng',
  WAITING_CONCRETE: 'Ca bê tông chậm — trễ tiến độ cọc',
  WAITING_OPERATOR: 'Thiếu vận hành — máy chờ không tải',
  HARD_GEOLOGY: 'Giảm tốc khoan — vượt giờ kế hoạch',
  NO_SIGNAL: 'Không theo dõi được — rủi ro ẩn',
  OFF_PLAN: 'Hoạt động ngoài kế hoạch — phát sinh chi phí',
  IDLE: 'Lãng phí giờ máy — tăng chi phí idle',
}

export const ACTION_BY_STATE: Record<string, string> = {
  SAFETY_STOP: 'Tổ chức toolbox — xác nhận vùng an toàn',
  TECHNICAL_ERROR: 'Liên hệ kỹ thuật SANY — bảo trì khẩn',
  WAITING_CONCRETE: 'Điều phối xe bê tông trong 45 phút',
  WAITING_OPERATOR: 'Cử vận hành viên từ tổ dự phòng',
  HARD_GEOLOGY: 'Khảo sát địa chất — điều chỉnh thông số khoan',
  NO_SIGNAL: 'Kiểm tra antena và kết nối IoT',
  OFF_PLAN: 'Đồng bộ lại lịch cọc với điều phối',
  IDLE: 'Di chuyển máy sang khu có backlog cao',
}
