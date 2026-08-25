import { useMemo, useRef } from 'react'
import { Radio, Square } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useHelmetPublisher } from '../publisher/useHelmetPublisher'
import { PATROL_HELMET_IDS, getHelmetIngest } from '../data/helmetIngest'

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * Phát sóng mũ từ chính máy đang mở CMS.
 *
 * Dùng khi chỉ có một thiết bị: iOS tắt camera của tab nền, nên mở trang Phát
 * sóng riêng rồi quay lại CMS là mất hình. Publish ngay trong tab CMS thì
 * camera luôn ở tab đang hiển thị, và tile lấy thẳng luồng local để lên hình.
 */
export function LocalBroadcastControl({ className }: { className?: string }) {
  const helmetId = useMemo(
    () => PATROL_HELMET_IDS.find(id => getHelmetIngest(id).kind === 'whip'),
    [],
  )
  // Hook giữ luồng camera; preview hiển thị ở tile nên không cần thẻ video riêng.
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const { state, start, stop } = useHelmetPublisher({
    helmetId: helmetId ?? PATROL_HELMET_IDS[0],
    videoRef,
  })

  if (!helmetId) return null

  const broadcasting = state.status === 'live' || state.status === 'starting'
  const label = state.status === 'live'
    ? `Đang phát ${formatElapsed(state.elapsedSec)}`
    : state.status === 'starting'
      ? 'Đang kết nối…'
      : 'Phát sóng máy này'

  return (
    <button
      type="button"
      onClick={() => (broadcasting ? stop() : void start())}
      title={
        broadcasting
          ? `Dừng phát sóng ${helmetId} từ thiết bị này`
          : `Dùng camera thiết bị này làm ${helmetId}`
      }
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold whitespace-nowrap transition-colors',
        broadcasting
          ? 'border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20'
          : 'border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40',
        className,
      )}
    >
      {state.status === 'live' ? (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" aria-hidden />
          <Square className="w-3 h-3" aria-hidden />
        </>
      ) : (
        <Radio className="w-3 h-3" aria-hidden />
      )}
      <span className="tabular-nums">{label}</span>
    </button>
  )
}
