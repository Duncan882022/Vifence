import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Camera, Pause, Play } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useBlobUrl } from '../../hooks/useInspectionFlow'
import { formatClock } from '../../services/workflow/ids'
import { sessionElapsedSec } from '../../services/workflow/sessionLogic'
import type { AiFinding, Evidence, InspectionSession, Issue } from '../../workflow.types'

export interface VideoMarker {
  id: string
  at: number
  to?: number
  kind: 'snapshot' | 'voice' | 'measurement' | 'checklist' | 'ai' | 'issue'
  label: string
  tone?: 'pass' | 'fail' | 'review' | 'neutral'
}

const MARKER_CLASS: Record<VideoMarker['kind'], string> = {
  snapshot: 'bg-sky-400',
  voice: 'bg-cyan-400',
  measurement: 'bg-slate-300',
  checklist: 'bg-green-400',
  ai: 'bg-purple-400',
  issue: 'bg-red-500',
}

const TONE_CLASS: Record<NonNullable<VideoMarker['tone']>, string> = {
  pass: 'bg-green-400',
  fail: 'bg-red-400',
  review: 'bg-amber-400',
  neutral: 'bg-gray-400',
}

export function buildMarkers(session: InspectionSession, evidence: Evidence[], findings: AiFinding[], issues: Issue[]): VideoMarker[] {
  const out: VideoMarker[] = []
  for (const e of evidence) {
    if (e.ctx.sessionId !== session.id) continue
    const kind = e.type === 'snapshot' ? 'snapshot' : e.type === 'voice' ? 'voice' : 'measurement'
    out.push({ id: e.id, at: e.ctx.videoTs, to: e.videoTo, kind, label: e.label })
  }
  for (const [criterionId, r] of Object.entries(session.results)) {
    if (r.videoTs == null || r.status === 'not_checked') continue
    const tone = r.status === 'pass' ? 'pass' : r.status === 'fail' ? 'fail' : r.status === 'review' ? 'review' : 'neutral'
    out.push({ id: `cl-${criterionId}`, at: r.videoTs, kind: 'checklist', label: `${criterionId} ${r.status.toUpperCase()}`, tone })
  }
  for (const f of findings) {
    if (f.verdict === 'pass_candidate') continue
    out.push({ id: f.id, at: f.videoFrom, to: f.videoTo, kind: 'ai', label: `AI · ${f.summary}` })
  }
  for (const i of issues) {
    if (i.sessionId === session.id) out.push({ id: i.id, at: i.videoTs, kind: 'issue', label: i.id })
  }
  return out.sort((a, b) => a.at - b.at)
}

interface Props {
  session: InspectionSession
  markers: VideoMarker[]
  seek?: { sec: number; nonce: number } | null
  className?: string
}

/** §28 Video player — timeline marker; click bằng chứng → nhảy tới mốc đầu clip. */
export const EvidenceVideoPlayer = memo(function EvidenceVideoPlayer({ session, markers, seek, className }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const blobUrl = useBlobUrl(session.video?.blobKey)
  const src = blobUrl ?? session.video?.url ?? null
  const fallbackDuration = session.video?.durationSec || sessionElapsedSec(session)
  const [duration, setDuration] = useState(fallbackDuration)
  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(false)

  useEffect(() => setDuration(fallbackDuration), [fallbackDuration])

  const seekTo = (sec: number) => {
    const t = Math.max(0, Math.min(sec, duration || sec))
    setCurrent(t)
    const v = videoRef.current
    if (v && src) v.currentTime = t
  }

  const seekRef = useRef(seekTo)
  seekRef.current = seekTo
  useEffect(() => {
    if (seek) seekRef.current(seek.sec)
  }, [seek])

  const pct = (sec: number) => `${duration > 0 ? Math.min(100, (sec / duration) * 100) : 0}%`
  const active = useMemo(() => markers.filter(m => current >= m.at && current <= (m.to ?? m.at + 3)), [markers, current])

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="relative aspect-video rounded-lg overflow-hidden bg-black border border-[#1e2433]">
        {src ? (
          <video
            ref={videoRef}
            src={src}
            playsInline
            className="absolute inset-0 w-full h-full object-contain"
            onLoadedMetadata={e => {
              const d = e.currentTarget.duration
              if (Number.isFinite(d) && d > 0) setDuration(d)
              if (current > 0) e.currentTarget.currentTime = current
            }}
            onTimeUpdate={e => setCurrent(e.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center px-6">
            <Camera className="w-6 h-6 text-muted-foreground/60" />
            <p className="text-[11px] font-semibold text-muted-foreground">
              {session.seeded ? 'Video gốc lưu trên H1 / máy chủ' : 'Chưa có bản sao video trên thiết bị này'}
            </p>
            <p className="text-[10px] text-muted-foreground/60">Timeline vẫn giữ đúng mốc thời gian của bằng chứng.</p>
          </div>
        )}
        <div className="absolute top-2 left-2 bg-black/60 rounded px-2 py-1 text-[10px] text-white font-mono">
          {session.id} · {formatClock(current)} / {formatClock(duration)}
        </div>
        {active.length > 0 && (
          <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1">
            {active.slice(0, 3).map(m => (
              <span key={m.id} className="bg-black/70 text-white text-[9px] rounded px-1.5 py-0.5 truncate max-w-full">{m.label}</span>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!src}
          onClick={() => {
            const v = videoRef.current
            if (!v) return
            if (v.paused) void v.play()
            else v.pause()
          }}
          className="w-8 h-8 shrink-0 rounded-lg border border-white/10 flex items-center justify-center text-foreground disabled:opacity-40"
          aria-label={playing ? 'Tạm dừng' : 'Phát'}
        >
          {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>
        <div
          className="relative flex-1 h-8 rounded bg-white/5 cursor-pointer"
          onClick={e => {
            const r = e.currentTarget.getBoundingClientRect()
            seekTo(((e.clientX - r.left) / r.width) * duration)
          }}
        >
          {markers.filter(m => m.to != null).map(m => (
            <span key={`band-${m.id}`} className={cn('absolute top-0 h-1.5 rounded-sm opacity-60', MARKER_CLASS[m.kind])} style={{ left: pct(m.at), width: `calc(${pct((m.to ?? m.at) - m.at)} + 2px)` }} />
          ))}
          {markers.map(m => (
            <button
              key={m.id}
              type="button"
              title={`${formatClock(m.at)} · ${m.label}`}
              onClick={e => {
                e.stopPropagation()
                seekTo(m.at)
              }}
              className={cn(
                'absolute top-2 -translate-x-1/2 w-2 h-4 rounded-sm',
                m.kind === 'checklist' && m.tone ? TONE_CLASS[m.tone] : MARKER_CLASS[m.kind],
              )}
              style={{ left: pct(m.at) }}
            >
              {m.kind === 'issue' && <AlertTriangle className="w-2 h-2 text-white" />}
            </button>
          ))}
          <span className="absolute top-0 bottom-0 w-px bg-white" style={{ left: pct(current) }} />
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-[9px] text-muted-foreground">
        {(['snapshot', 'voice', 'measurement', 'checklist', 'ai', 'issue'] as const).map(k => (
          <span key={k} className="inline-flex items-center gap-1"><span className={cn('w-2 h-2 rounded-sm', MARKER_CLASS[k])} />{k}</span>
        ))}
      </div>
    </div>
  )
})
