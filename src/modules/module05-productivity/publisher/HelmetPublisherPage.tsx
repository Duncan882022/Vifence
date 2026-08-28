/**
 * Trang phát sóng cho người đeo mũ — tách hẳn khỏi CMS.
 *
 * Điện thoại chỉ làm nhiệm vụ quay và đẩy WHIP lên MediaMTX. Theo dõi tuần tra
 * mở Module 05 trên thiết bị khác (laptop/tablet).
 */
import { memo, useRef } from 'react'
import {
  Camera,
  Compass,
  Gauge,
  MapPin,
  SwitchCamera,
  Timer,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { PATROL_BODYCAM_LABELS } from '../data/patrolCameras'
import {
  getBrowserPublishHelmetId,
  getHelmetWhipUrl,
  isBrowserPublishHelmet,
} from '../data/helmetIngest'
import { useHelmetPublisher } from './useHelmetPublisher'
import { usePublisherPatrolAuth } from './usePublisherPatrolAuth'
import type { WhipConnectionState } from '@/services/webrtc/whipClient'

function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':')
}

function formatBitrate(kbps: number): string {
  if (kbps <= 0) return '—'
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mbps`
  return `${Math.round(kbps)} kbps`
}

function qualityLabel(reason: string): string | null {
  if (reason === 'bandwidth') return 'Mạng yếu'
  if (reason === 'cpu') return 'Máy quá tải'
  return null
}

function connectionLabel(state: WhipConnectionState): string {
  switch (state) {
    case 'connected': return 'Đã kết nối'
    case 'connecting': return 'Đang bắt tay…'
    case 'reconnecting': return 'Đang nối lại…'
    case 'failed': return 'Lỗi kết nối'
    case 'closed': return 'Đã ngắt'
    default: return 'Chưa kết nối'
  }
}

const KpiTile = memo(function KpiTile({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'normal',
}: {
  icon: typeof Timer
  label: string
  value: string
  sub?: string
  tone?: 'normal' | 'good' | 'warn'
}) {
  return (
    <div className="rounded-lg border border-[#1f2937] bg-[#0d1117] px-2.5 py-2">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3 h-3 text-[#64748b]" aria-hidden />
        <span className="text-[9px] font-medium uppercase tracking-wide text-[#64748b]">{label}</span>
      </div>
      <p className={cn(
        'text-[15px] font-semibold tabular-nums leading-none',
        tone === 'good' && 'text-emerald-400',
        tone === 'warn' && 'text-amber-400',
        tone === 'normal' && 'text-[#e2e8f0]',
      )}>
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 text-[9px] text-[#64748b] tabular-nums truncate">{sub}</p>
      )}
    </div>
  )
})

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
        'text-[12px] font-medium tabular-nums text-right',
        tone === 'good' && 'text-emerald-400',
        tone === 'warn' && 'text-amber-400',
        tone === 'normal' && 'text-[#e2e8f0]',
      )}>
        {value}
      </span>
    </div>
  )
})

export function HelmetPublisherPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const helmetId = getBrowserPublishHelmetId()

  const patrolAuth = usePublisherPatrolAuth()
  const { state, start, stop, flipCamera } = useHelmetPublisher({
    helmetId,
    videoRef,
    patrolAuthReady: patrolAuth === 'ready',
  })

  const label = PATROL_BODYCAM_LABELS[helmetId] ?? helmetId
  const publishesFromBrowser = isBrowserPublishHelmet(helmetId)
  const configured = publishesFromBrowser && Boolean(getHelmetWhipUrl(helmetId))
  const isBroadcasting = state.status === 'live' || state.status === 'starting'
  const limitation = qualityLabel(state.stats.qualityLimitation)

  const facingLabel = state.facing === 'environment' ? 'Camera sau' : 'Camera trước'

  const gpsText = state.gps
    ? `${state.gps.lat.toFixed(5)}, ${state.gps.lng.toFixed(5)}`
    : 'Chưa có tín hiệu'

  return (
    <div className="min-h-dvh bg-[#0a0f16] text-white flex flex-col items-center px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-md space-y-3">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#64748b] mb-0.5">
              Vifence · Tuần tra
            </p>
            <h1 className="text-[17px] font-bold leading-tight">Phát sóng</h1>
            <p className="text-[11px] text-[#94a3b8] mt-0.5">
              Camera thiết bị này → {label}
            </p>
          </div>
        </header>

        {state.status === 'live' && (
          <div className="grid grid-cols-2 gap-2">
            <KpiTile
              icon={Timer}
              label="Thời lượng"
              value={formatDuration(state.elapsedSec)}
            />
            <KpiTile
              icon={Gauge}
              label="Băng thông"
              value={formatBitrate(state.stats.bitrateKbps)}
              sub={limitation ?? undefined}
              tone={limitation ? 'warn' : state.stats.bitrateKbps >= 800 ? 'good' : 'normal'}
            />
          </div>
        )}

        <div className="relative aspect-[3/4] max-h-[40dvh] w-full overflow-hidden rounded-xl border border-[#1f2937] bg-black shadow-lg shadow-black/40">
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
              <Camera className="w-10 h-10 opacity-40" aria-hidden />
              <span className="text-[11px]">Xem trước camera</span>
            </div>
          )}

          {state.status === 'live' && (
            <>
              <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/65 px-2 py-1 backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[10px] font-bold tracking-wide text-white">LIVE</span>
              </div>
              <div className="absolute top-3 right-3 rounded-full bg-black/65 px-2 py-1 text-[10px] text-white/90 backdrop-blur-sm tabular-nums">
                {formatDuration(state.elapsedSec)}
              </div>
              <button
                type="button"
                onClick={() => { void flipCamera() }}
                aria-label="Đổi camera trước/sau"
                className="absolute bottom-3 right-3 rounded-full bg-black/65 p-2.5 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/85 active:scale-95"
              >
                <SwitchCamera className="w-4 h-4" aria-hidden />
              </button>
              <div className="absolute bottom-3 left-3 rounded-full bg-black/65 px-2 py-1 text-[10px] text-white/80 backdrop-blur-sm">
                {facingLabel}
              </div>
            </>
          )}
        </div>

        <div className="rounded-xl border border-[#1f2937] bg-[#0d1117] px-3 py-1 divide-y divide-[#1f2937]">
          <StatRow label="Kết nối WebRTC" value={connectionLabel(state.connection)} />
          <StatRow
            label="Gói mất (packets lost)"
            value={state.stats.packetsLost > 0 ? String(state.stats.packetsLost) : '0'}
            tone={state.stats.packetsLost > 20 ? 'warn' : 'normal'}
          />
          <StatRow
            label="Giới hạn chất lượng"
            value={limitation ?? 'Không'}
            tone={limitation ? 'warn' : 'good'}
          />
          <StatRow
            label="Vị trí GPS"
            value={gpsText}
            tone={state.gps ? 'good' : 'warn'}
          />
          {state.gps && (
            <StatRow
              label="Độ chính xác GPS"
              value={`±${Math.round(state.gps.accuracyM)} m`}
            />
          )}
          <StatRow
            label="La bàn"
            value={state.headingDeg != null ? `${Math.round(state.headingDeg)}°` : '—'}
          />
        </div>

        <div className={cn(
          'flex items-center gap-2 rounded-lg border px-3 py-2 text-[10px]',
          state.telemetryConnected
            ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-200/90'
            : 'border-[#1f2937] bg-[#0d1117] text-[#64748b]',
        )}>
          {state.telemetryConnected
            ? <Wifi className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden />
            : <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden />}
          <span className="flex-1">
            {state.telemetryConnected
              ? 'Đã gửi GPS & hướng về trung tâm'
              : 'Chưa kết nối kênh telemetry'}
          </span>
          <MapPin className="w-3.5 h-3.5 shrink-0 opacity-60" aria-hidden />
          <Compass className="w-3.5 h-3.5 shrink-0 opacity-60" aria-hidden />
        </div>

        {!publishesFromBrowser && (
          <p className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-[11px] leading-relaxed text-sky-200/90">
            {label} là bodycam phần cứng, tự phát RTSP liên tục — không cần trang này.
            Xem trực tiếp trong Module 05 trên thiết bị khác.
          </p>
        )}

        {patrolAuth === 'failed' && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200/90">
            Chưa kết nối kênh vị trí — video vẫn phát được nhưng bản đồ CMS có thể
            không cập nhật GPS. Liên hệ quản trị nếu lỗi kéo dài.
          </p>
        )}

        {publishesFromBrowser && !configured && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200/90">
            Chưa cấu hình máy chủ phát sóng (MediaMTX). Liên hệ quản trị để bật WHIP.
          </p>
        )}

        {(state.status === 'error' || state.status === 'starting') && state.errorMessage && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] leading-relaxed text-red-200/90">
            {state.errorMessage}
          </p>
        )}

        {isBroadcasting ? (
          <button
            type="button"
            onClick={stop}
            className="w-full rounded-xl border border-red-500/40 bg-red-500/15 py-3.5 text-[14px] font-semibold text-red-200 transition-colors hover:bg-red-500/25 active:scale-[0.99]"
          >
            Dừng phát sóng
          </button>
        ) : (
          <button
            type="button"
            onClick={() => { void start() }}
            disabled={!configured}
            className={cn(
              'w-full rounded-xl border py-3.5 text-[14px] font-semibold transition-colors active:scale-[0.99]',
              configured
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                : 'cursor-not-allowed border-[#1f2937] bg-[#0d1117] text-[#475569]',
            )}
          >
            {configured ? 'Bắt đầu phát sóng' : 'Chưa sẵn sàng phát sóng'}
          </button>
        )}
      </div>
    </div>
  )
}
