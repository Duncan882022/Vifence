/**
 * Trang phát sóng cho người đeo mũ — tách hẳn khỏi CMS.
 *
 * CMS là màn giám sát (heatmap, KPI, sự kiện, overlay AI) — nặng và tốn pin.
 * Người đeo mũ chỉ cần: xem mình đang quay gì, biết còn kết nối không, và dừng
 * được khi hết ca. Không bbox, không KPI — AI chạy ở backend.
 */
import { memo, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Camera,
  MapPin,
  Radio,
  RefreshCw,
  SwitchCamera,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { PATROL_BODYCAM_LABELS } from '../data/patrolCameras'
import {
  getHelmetWhipUrl,
  isBrowserPublishHelmet,
  PATROL_HELMET_IDS,
} from '../data/helmetIngest'
import { useHelmetPublisher, type HelmetPublisherState } from './useHelmetPublisher'

const DEFAULT_HELMET_ID = 'HC-02'

function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':')
}

function formatBitrate(kbps: number): string {
  if (kbps <= 0) return '—'
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mbps`
  return `${kbps} kbps`
}

function qualityLabel(reason: string): string | null {
  if (reason === 'bandwidth') return 'Mạng yếu'
  if (reason === 'cpu') return 'Máy quá tải'
  return null
}

const StatRow = memo(function StatRow({
  label,
  value,
  tone = 'normal',
}: {
  label: string
  value: string
  tone?: 'normal' | 'good' | 'warn'
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[11px] text-[#94a3b8]">{label}</span>
      <span className={cn(
        'text-[12px] font-medium tabular-nums',
        tone === 'good' && 'text-emerald-400',
        tone === 'warn' && 'text-amber-400',
        tone === 'normal' && 'text-[#e2e8f0]',
      )}>
        {value}
      </span>
    </div>
  )
})

const StatusBanner = memo(function StatusBanner({
  state,
}: {
  state: HelmetPublisherState
}) {
  if (state.status === 'live') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <Radio className="w-4 h-4 text-emerald-400" aria-hidden />
        <span className="text-[12px] font-semibold text-emerald-300">Đang phát sóng</span>
      </div>
    )
  }

  if (state.status === 'starting') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2">
        <RefreshCw className="w-4 h-4 text-sky-400 animate-spin" aria-hidden />
        <span className="text-[12px] font-semibold text-sky-300">Đang kết nối…</span>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
        <div className="flex items-center gap-2">
          <WifiOff className="w-4 h-4 text-red-400" aria-hidden />
          <span className="text-[12px] font-semibold text-red-300">Chưa phát được</span>
        </div>
        {state.errorMessage && (
          <p className="mt-1 text-[11px] leading-relaxed text-red-200/80">
            {state.errorMessage}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#334155] bg-[#111827] px-3 py-2">
      <Camera className="w-4 h-4 text-[#94a3b8]" aria-hidden />
      <span className="text-[12px] font-semibold text-[#cbd5e1]">Chưa phát sóng</span>
    </div>
  )
})

export function HelmetPublisherPage() {
  const [searchParams] = useSearchParams()
  const videoRef = useRef<HTMLVideoElement>(null)

  const helmetId = useMemo(() => {
    const requested = searchParams.get('helmet')?.trim().toUpperCase()
    if (requested && (PATROL_HELMET_IDS as readonly string[]).includes(requested)) {
      return requested
    }
    return DEFAULT_HELMET_ID
  }, [searchParams])

  const { state, start, stop, flipCamera } = useHelmetPublisher({ helmetId, videoRef })

  const label = PATROL_BODYCAM_LABELS[helmetId] ?? helmetId
  // Bodycam phần cứng tự publish RTSP — không ai phải mở trang này cho nó.
  const publishesFromBrowser = isBrowserPublishHelmet(helmetId)
  const configured = publishesFromBrowser && Boolean(getHelmetWhipUrl(helmetId))
  const isBroadcasting = state.status === 'live' || state.status === 'starting'
  const limitation = qualityLabel(state.stats.qualityLimitation)

  const resolution = state.stats.frameWidth > 0
    ? `${state.stats.frameWidth}×${state.stats.frameHeight} · ${state.stats.framesPerSecond} fps`
    : '—'

  return (
    <div className="min-h-dvh bg-[#0a0f16] text-white flex flex-col items-center px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-md space-y-2.5">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-[15px] font-semibold">{label}</h1>
            <p className="text-[11px] text-[#94a3b8]">Phát sóng tuần tra</p>
          </div>
          <span className="rounded border border-[#334155] px-2 py-0.5 text-[10px] font-medium text-[#94a3b8]">
            {helmetId}
          </span>
        </header>

        <StatusBanner state={state} />

        {/* Trần chiều cao để nút Dừng luôn nằm trong tầm tay, không phải cuộn —
            người đeo mũ thường thao tác một tay giữa công trường. */}
        <div className="relative aspect-[3/4] max-h-[42dvh] w-full overflow-hidden rounded-xl border border-[#1f2937] bg-black">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={cn(
              'absolute inset-0 h-full w-full object-cover',
              !isBroadcasting && 'opacity-0',
            )}
          />

          {!isBroadcasting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#64748b]">
              <Camera className="w-8 h-8" aria-hidden />
              <span className="text-[11px]">Camera đang tắt</span>
            </div>
          )}

          {state.status === 'live' && (
            <button
              type="button"
              onClick={() => { void flipCamera() }}
              aria-label="Đổi camera trước/sau"
              className="absolute bottom-3 right-3 rounded-full bg-black/60 p-2.5 text-white/90 backdrop-blur transition-colors hover:bg-black/80"
            >
              <SwitchCamera className="w-4 h-4" aria-hidden />
            </button>
          )}
        </div>

        <div className="rounded-xl border border-[#1f2937] bg-[#0d1117] px-3 py-2 divide-y divide-[#1f2937]">
          <StatRow label="Thời lượng" value={formatDuration(state.elapsedSec)} />
          <StatRow
            label="Chất lượng"
            value={resolution}
          />
          <StatRow
            label="Băng thông"
            value={limitation ? `${formatBitrate(state.stats.bitrateKbps)} · ${limitation}` : formatBitrate(state.stats.bitrateKbps)}
            tone={limitation ? 'warn' : 'normal'}
          />
          <StatRow
            label="Độ trễ"
            value={state.stats.rttMs != null ? `${state.stats.rttMs} ms` : '—'}
            tone={state.stats.rttMs != null && state.stats.rttMs < 200 ? 'good' : 'normal'}
          />
          <StatRow
            label="Vị trí GPS"
            value={state.gps ? `±${Math.round(state.gps.accuracyM)} m` : 'Chưa có tín hiệu'}
            tone={state.gps ? 'good' : 'warn'}
          />
          <StatRow
            label="Hướng"
            value={state.headingDeg != null ? `${Math.round(state.headingDeg)}°` : '—'}
          />
        </div>

        <div className="flex items-center gap-2 px-1 text-[10px] text-[#64748b]">
          {state.telemetryConnected
            ? <Wifi className="w-3 h-3 text-emerald-400" aria-hidden />
            : <WifiOff className="w-3 h-3" aria-hidden />}
          <span>
            {state.telemetryConnected ? 'Đã gửi vị trí về trung tâm' : 'Chưa kết nối kênh vị trí'}
          </span>
          <MapPin className="ml-auto w-3 h-3" aria-hidden />
        </div>

        {!publishesFromBrowser && (
          <p className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-[11px] leading-relaxed text-sky-200/90">
            {label} là body cam phần cứng, tự phát sóng liên tục — không cần mở trang
            này. Xem trực tiếp trong mục Camera của CMS.
          </p>
        )}

        {publishesFromBrowser && !configured && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200/90">
            Chưa cấu hình máy chủ phát sóng. Đặt <code>VITE_MEDIAMTX_HOST</code> hoặc{' '}
            <code>VITE_MEDIAMTX_WEBRTC_URL</code> rồi build lại.
          </p>
        )}

        {isBroadcasting ? (
          <button
            type="button"
            onClick={stop}
            className="w-full rounded-lg border border-red-500/40 bg-red-500/15 py-3 text-[13px] font-semibold text-red-200 transition-colors hover:bg-red-500/25"
          >
            Dừng phát sóng
          </button>
        ) : (
          <button
            type="button"
            onClick={() => { void start() }}
            disabled={!configured}
            className={cn(
              'w-full rounded-lg border py-3 text-[13px] font-semibold transition-colors',
              configured
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                : 'cursor-not-allowed border-[#1f2937] bg-[#0d1117] text-[#475569]',
            )}
          >
            {configured ? 'Bắt đầu phát sóng' : 'Chưa sẵn sàng phát sóng'}
          </button>
        )}

        <p className="px-1 text-[10px] leading-relaxed text-[#475569]">
          Giữ màn hình bật trong ca trực. Mất sóng thì hệ thống tự phát lại khi có mạng.
        </p>
      </div>
    </div>
  )
}
