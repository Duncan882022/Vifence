import { useState, useMemo, useEffect } from 'react'
import {
  Play, Pause, Volume2, Download, LogIn, LogOut,
  Clock, BookOpen, Building2, User, Radio, Camera,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { TrialLockPopup } from '@/components/common/TrialLock/TrialLockPopup'
import { useTrialLock } from '@/hooks/useTrialLock'
import { DEMO_NOW } from '../data/trainingMockData'
import { formatCourseMeta } from '../data/trainingCourseMeta'
import { getCourseRoomCamera, cameraDisplayLabel } from '../data/trainingCameras'
import { CameraVideoFeed } from './CameraVideoFeed'
import type { TrainingEvent, AttendanceStatus, AttendanceSession, CourseRecord } from './TrainingEventTable'
import {
  getAttendanceBadges,
  attendanceStatusConfig,
  getSessionStatus,
  formatRecordSessions,
} from './TrainingEventTable'

/* ─────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────── */
function toMin(t: string): number {
  if (t === '—' || t === '…') return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function timeToPct(time: string, start: string, end: string): number {
  const s = toMin(start), e = toMin(end), t = toMin(time)
  if (e <= s) return 0
  return Math.max(0, Math.min(100, ((t - s) / (e - s)) * 100))
}

function demoNowHHmm(): string {
  return `${String(DEMO_NOW.hours).padStart(2, '0')}:${String(DEMO_NOW.minutes).padStart(2, '0')}`
}

function buildTicks(start: string, end: string): string[] {
  const s = toMin(start), e = toMin(end)
  const steps = Math.min(7, Math.max(3, Math.round((e - s) / 30)))
  const interval = (e - s) / steps
  return Array.from({ length: steps + 1 }, (_, i) => {
    const total = s + i * interval
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(Math.round(total % 60)).padStart(2, '0')}`
  })
}

function totalMinutes(sessions: AttendanceSession[], end: string, finished: boolean): number {
  const now = demoNowHHmm()
  return sessions.reduce((sum, sess) => {
    const out = sess.out ?? (finished ? end : now)
    return sum + Math.max(0, toMin(out) - toMin(sess.in))
  }, 0)
}

function wasLateArrival(sessions: AttendanceSession[], startTime: string): boolean {
  const firstIn = sessions[0]?.in
  return !!firstIn && toMin(firstIn) > toMin(startTime)
}

function requiredMinutes(start: string, end: string): number {
  return Math.ceil((toMin(end) - toMin(start)) * 0.75)
}

type TimelineKind = 'course-start' | 'check-in' | 'check-out' | 'course-end' | 'outcome'

interface TimelineItem {
  id: string
  time: string
  kind: TimelineKind
  label: string
  badges: AttendanceStatus[]
  pending?: boolean
  seekable: boolean
}

function buildTimeline(rec: CourseRecord): TimelineItem[] {
  const finished = getSessionStatus(rec.startTime, rec.endTime) === 'finished'
  const allBadges = getAttendanceBadges(rec)
  const lateOnArrival = wasLateArrival(rec.sessions, rec.startTime)
  const outcomeBadges = allBadges.filter(b => !(b === 'late' && lateOnArrival))
  const items: TimelineItem[] = []

  items.push({
    id: 'course-start',
    time: rec.startTime,
    kind: 'course-start',
    label: 'Ca bắt đầu',
    badges: [],
    seekable: true,
  })

  if (rec.sessions.length === 0 && rec.status === 'absent') {
    if (finished) {
      items.push({
        id: 'course-end',
        time: rec.endTime,
        kind: 'course-end',
        label: 'Ca kết thúc',
        badges: [],
        seekable: true,
      })
      items.push({
        id: 'outcome',
        time: rec.endTime,
        kind: 'outcome',
        label: 'Kết quả điểm danh',
        badges: ['absent'],
        seekable: false,
      })
    }
    return items
  }

  rec.sessions.forEach((sess, i) => {
    items.push({
      id: `in-${i}`,
      time: sess.in,
      kind: 'check-in',
      label: i === 0 ? 'Check-in' : `Check-in lần ${i + 1}`,
      badges: i === 0 && lateOnArrival ? ['late'] : [],
      seekable: true,
    })
    if (sess.out) {
      items.push({
        id: `out-${i}`,
        time: sess.out,
        kind: 'check-out',
        label: i === 0 && rec.sessions.length === 1 ? 'Check-out' : `Check-out lần ${i + 1}`,
        badges: [],
        seekable: true,
      })
    } else if (!finished) {
      items.push({
        id: `out-pending-${i}`,
        time: '…',
        kind: 'check-out',
        label: 'Check-out',
        badges: [],
        pending: true,
        seekable: false,
      })
    }
  })

  if (finished) {
    items.push({
      id: 'course-end',
      time: rec.endTime,
      kind: 'course-end',
      label: 'Ca kết thúc',
      badges: [],
      seekable: true,
    })
    if (outcomeBadges.length > 0) {
      items.push({
        id: 'outcome',
        time: rec.endTime,
        kind: 'outcome',
        label: 'Kết quả điểm danh',
        badges: outcomeBadges,
        seekable: false,
      })
    }
  }

  return items
}

const SPEEDS = [0.5, 1, 1.5, 2, 4]

function StatusBadge({ status, small }: { status: AttendanceStatus; small?: boolean }) {
  const cfg = attendanceStatusConfig[status]
  return (
    <span className={cn(
      'font-bold rounded whitespace-nowrap inline-flex items-center gap-1',
      small ? 'text-[8px] px-1 py-0.5' : 'text-[9px] px-1.5 py-0.5',
      cfg.color, cfg.bg,
    )}>
      {(status === 'attending' || status === 'away') && (
        <span className={cn(
          'w-1.5 h-1.5 rounded-full animate-pulse shrink-0',
          status === 'attending' ? 'bg-sky-400' : 'bg-cyan-400',
        )} />
      )}
      {cfg.label}
    </span>
  )
}

function StatusBadges({ badges, small }: { badges: AttendanceStatus[]; small?: boolean }) {
  return (
    <div className="flex flex-wrap gap-0.5">
      {badges.map(b => <StatusBadge key={b} status={b} small={small} />)}
    </div>
  )
}

function TimelineIcon({ kind }: { kind: TimelineKind }) {
  const base = 'w-3.5 h-3.5 shrink-0'
  switch (kind) {
    case 'check-in':  return <LogIn className={cn(base, 'text-sky-400')} />
    case 'check-out': return <LogOut className={cn(base, 'text-red-400')} />
    case 'course-start':
    case 'course-end': return <Clock className={cn(base, 'text-muted-foreground/50')} />
    case 'outcome':   return <Radio className={cn(base, 'text-primary/70')} />
  }
}

function SessionBadge({ finished }: { finished: boolean }) {
  const label = finished ? 'Đã hoàn thành' : 'Đang diễn ra'
  const color = finished ? 'text-gray-400' : 'text-green-400'
  const bg = finished ? 'bg-gray-500/15' : 'bg-green-500/15'
  return (
    <span className={cn('text-[8px] font-bold px-1 py-0.5 rounded inline-flex items-center gap-1', color, bg)}>
      {!finished && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
      {label}
    </span>
  )
}

interface TrainingPlaybackProps {
  event: TrainingEvent | null
}

export function TrainingPlayback({ event }: TrainingPlaybackProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [speedIdx, setSpeedIdx] = useState(1)
  const [activeId, setActiveId] = useState<string | null>(null)
  const { visible: trialVisible, show: showTrial, dismiss: dismissTrial } = useTrialLock()

  const rec = event?.courseRecord
  const start = rec?.startTime ?? '08:00'
  const end = rec?.endTime ?? '17:00'
  const sessions = rec?.sessions ?? []
  const finished = getSessionStatus(start, end) === 'finished'
  const badges = rec ? getAttendanceBadges(rec) : []
  const primary = badges[0]
  const timeline = useMemo(() => (rec ? buildTimeline(rec) : []), [rec])
  const ticks = buildTicks(start, end)
  const courseMeta = rec
    ? formatCourseMeta(rec.startTime, rec.endTime, rec.sessionDate, rec.zone)
    : '—'
  const camera = rec ? getCourseRoomCamera(rec.courseName, rec.zone) : undefined

  const attended = totalMinutes(sessions, end, finished)
  const duration = toMin(end) - toMin(start)
  const required = requiredMinutes(start, end)
  const pctOfSession = duration > 0 ? Math.round((attended / duration) * 1000) / 10 : 0
  const meetsRequirement = attended >= required
  const shortfall = Math.max(0, required - attended)
  const thresholdPct = duration > 0 ? Math.round((required / duration) * 1000) / 10 : 75
  const barColor = primary ? attendanceStatusConfig[primary].dot : 'bg-primary'

  useEffect(() => {
    if (!rec) {
      setProgress(0)
      setActiveId(null)
      setIsPlaying(false)
      return
    }
    const anchor = rec.sessions[0]?.in ?? rec.startTime
    setProgress(timeToPct(anchor, rec.startTime, rec.endTime))
    setActiveId(rec.sessions[0] ? 'in-0' : 'course-start')
    setIsPlaying(false)
    setSpeedIdx(1)
  }, [event?.id, rec])

  const seekTo = (time: string, id: string) => {
    if (time === '—' || time === '…') return
    setProgress(timeToPct(time, start, end))
    setActiveId(id)
  }

  if (!event || !rec) {
    return (
      <div className="flex flex-1 items-center justify-center text-[11px] text-muted-foreground/50">
        Chưa chọn sự kiện
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">

      {/* ── Identity bar ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 border-b border-[#1e2433] shrink-0 bg-[#0a0e1a]">
        <div className="flex items-center gap-1.5 min-w-0">
          <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-[11px] font-semibold text-foreground truncate">{event.workerName}</span>
          <span className="text-[9px] text-muted-foreground/50 shrink-0">{event.workerCode}</span>
          {event.role && (
            <span className="text-[9px] text-muted-foreground/60 truncate hidden sm:inline">· {event.role}</span>
          )}
        </div>
        <span className="text-[#1e2433] hidden sm:inline">|</span>
        <div className="flex items-center gap-1.5 min-w-0">
          <Building2 className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="text-[10px] text-primary/80 truncate">{event.contractor}</span>
          {event.companyCode && (
            <span className="text-[9px] text-muted-foreground/50 shrink-0">{event.companyCode}</span>
          )}
        </div>
        <span className="text-[#1e2433] hidden sm:inline">|</span>
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <BookOpen className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="text-[10px] text-foreground truncate">{rec.courseName}</span>
          <span className="text-[9px] text-muted-foreground/60 truncate shrink-0">{courseMeta}</span>
          <SessionBadge finished={finished} />
        </div>
        <button className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#1a2235] border border-[#1e2433] hover:bg-[#222d42] transition-colors text-[10px] text-muted-foreground hover:text-foreground shrink-0">
          <Download className="w-3 h-3" />
          Xuất clip
        </button>
      </div>

      {/* ── Body: video | event stream — stack on mobile ── */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">

        {/* Video column — camera gắn phòng/khoá */}
        <div className="shrink-0 lg:flex-[62] flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-[#1e2433]">
          <div className="relative w-full aspect-video lg:aspect-auto lg:flex-1 lg:min-h-0 bg-[#060b14] overflow-hidden">
            {camera?.streamUrl ? (
              <>
                <CameraVideoFeed
                  src={camera.streamUrl}
                  cameraId={camera.id}
                  streamType={camera.streamType}
                  playing={isPlaying}
                  aiOverlay
                />
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 4px)',
                  }}
                />
                <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded bg-black/55 backdrop-blur-sm">
                  <Camera className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[9px] text-white/80 font-medium truncate">{cameraDisplayLabel(camera)}</span>
                </div>
              </>
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-[#0f1922] via-[#0a1219] to-[#060d14]" />
            )}

            {!isPlaying && (
              <button
                onClick={() => setIsPlaying(true)}
                className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors"
              >
                <span className="w-14 h-14 rounded-full bg-primary/85 hover:bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                  <Play className="w-6 h-6 text-white ml-0.5" />
                </span>
              </button>
            )}
            {isPlaying && (
              <button
                onClick={() => setIsPlaying(false)}
                className="absolute bottom-3 right-3 z-10 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors"
              >
                <Pause className="w-4 h-4 text-white" />
              </button>
            )}
          </div>

          {/* Scrubber */}
          <div className="px-4 py-3 shrink-0 space-y-2 bg-[#0b0f1a] border-t border-[#1e2433]">
            <div
              className="relative w-full h-2 bg-[#1a2235] rounded-full cursor-pointer overflow-hidden"
              onClick={e => {
                const r = e.currentTarget.getBoundingClientRect()
                setProgress(((e.clientX - r.left) / r.width) * 100)
                setActiveId(null)
              }}
            >
              {sessions.map((sess, i) => {
                const left = timeToPct(sess.in, start, end)
                const outT = sess.out ?? (finished ? end : demoNowHHmm())
                const right = timeToPct(outT, start, end)
                return (
                  <div
                    key={i}
                    className={cn('absolute top-0 h-full opacity-60', barColor)}
                    style={{ left: `${left}%`, width: `${Math.max(0, right - left)}%` }}
                  />
                )
              })}
              <div className="absolute top-0 h-full w-0.5 bg-white/90 shadow" style={{ left: `${progress}%` }} />
            </div>
            <div className="flex justify-between text-[8px] text-muted-foreground/50 tabular-nums">
              {ticks.map(t => <span key={t}>{t}</span>)}
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-7 h-7 rounded-full bg-primary flex items-center justify-center"
                >
                  {isPlaying ? <Pause className="w-3 h-3 text-white" /> : <Play className="w-3 h-3 text-white ml-px" />}
                </button>
                <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />
                <input type="range" min={0} max={100} defaultValue={75} className="w-16 h-1 accent-primary cursor-pointer" />
              </div>
              <button
                onClick={() => setSpeedIdx(i => (i + 1) % SPEEDS.length)}
                className={cn(
                  'px-2 py-0.5 rounded text-[10px] font-bold',
                  SPEEDS[speedIdx] !== 1 ? 'bg-primary/15 text-primary' : 'bg-[#1a2235] text-muted-foreground',
                )}
              >
                {SPEEDS[speedIdx]}x
              </button>
            </div>
          </div>
        </div>

        {/* Event stream — sync listing row */}
        <div className="flex-none lg:flex-[38] flex flex-col min-h-[260px] lg:min-h-0 bg-[#0b0f1a]">

          <div className="px-3 py-2.5 border-b border-[#1e2433] shrink-0">
            <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Điểm danh
            </p>
            <StatusBadges badges={badges} small />
            <p className={cn(
              'text-[9px] mt-1 tabular-nums',
              primary ? attendanceStatusConfig[primary].color + '/80' : 'text-muted-foreground',
            )}>
              {formatRecordSessions(rec)}
            </p>
            {rec.minutesDelta > 0 && (
              <p className="text-[9px] text-orange-400/80 mt-0.5 tabular-nums">
                Lệch {rec.minutesDelta} phút so với quy định
              </p>
            )}
            <div className="mt-2 pt-2 border-t border-[#1e2433]/60 space-y-2">
              <p className="text-[8px] text-muted-foreground/60 leading-snug">
                Quy định: có mặt tối thiểu <span className="text-foreground/80 font-semibold">75%</span> thời lượng ca
                {' '}({required} / {duration} phút)
              </p>

              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <p className="text-[8px] text-muted-foreground/50">Thời gian có mặt</p>
                  <p className="text-[11px] font-bold tabular-nums text-foreground">
                    {attended}
                    <span className="text-[9px] font-normal text-muted-foreground/70"> / {duration} phút</span>
                  </p>
                  {!finished && sessions.some(s => s.out === null) && (
                    <p className="text-[7px] text-muted-foreground/45 mt-0.5">Tính đến {demoNowHHmm()} · ca đang diễn ra</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[8px] text-muted-foreground/50">Ngưỡng 75%</p>
                  <p className="text-[10px] font-semibold tabular-nums text-muted-foreground">{required} phút</p>
                </div>
              </div>

              <div className="relative">
                <div className="h-1.5 rounded-full bg-[#1e2433] overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', meetsRequirement ? 'bg-green-400' : 'bg-red-400')}
                    style={{ width: `${Math.min(pctOfSession, 100)}%` }}
                  />
                </div>
                <div
                  className="absolute top-0 h-1.5 w-px bg-yellow-400/80"
                  style={{ left: `${Math.min(thresholdPct, 100)}%` }}
                  title={`Ngưỡng 75% (${required} phút)`}
                />
                <div className="flex justify-between text-[7px] text-muted-foreground/45 tabular-nums mt-0.5">
                  <span>{rec.startTime}</span>
                  <span>{pctOfSession}% ca</span>
                  <span>{rec.endTime}</span>
                </div>
              </div>

              <p className={cn(
                'text-[9px] font-semibold tabular-nums',
                meetsRequirement ? 'text-green-400' : 'text-red-400',
              )}>
                {meetsRequirement
                  ? `Đủ quy định — ${attended} phút ≥ ${required} phút`
                  : `Chưa đủ — thiếu ${shortfall} phút (có ${attended}, cần ${required})`}
              </p>
            </div>
          </div>

          <div className="px-3 py-1.5 border-b border-[#1e2433] shrink-0">
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
              Dòng sự kiện
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2">
            {timeline.length === 0 ? (
              <p className="text-[10px] text-muted-foreground/40 italic py-4 text-center">Không có sự kiện</p>
            ) : (
              <div className="relative">
                <div className="absolute left-[15px] top-2 bottom-2 w-px bg-[#1e2433]" />
                <div className="space-y-0.5">
                  {timeline.map(item => {
                    const isActive = activeId === item.id
                    const isOutcome = item.kind === 'outcome'
                    const isCourseMarker = item.kind === 'course-start' || item.kind === 'course-end'
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={!item.seekable}
                        onClick={() => item.seekable && seekTo(item.time, item.id)}
                        className={cn(
                          'w-full text-left flex gap-2.5 items-start py-2 px-1.5 rounded-lg transition-colors',
                          item.seekable && 'hover:bg-[#1a2235]/60 cursor-pointer',
                          !item.seekable && 'cursor-default',
                          isActive && 'bg-primary/10 ring-1 ring-primary/25',
                          isOutcome && 'bg-[#1a2235]/30 mt-1',
                        )}
                      >
                        <div className={cn(
                          'relative z-10 w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0 border-2',
                          isOutcome
                            ? 'bg-[#0b0f1a] border-primary/30'
                            : isCourseMarker
                              ? 'bg-[#0b0f1a] border-[#1e2433]'
                              : item.kind === 'check-in'
                                ? 'bg-[#0b0f1a] border-sky-500/40'
                                : 'bg-[#0b0f1a] border-red-500/40',
                        )}>
                          <TimelineIcon kind={item.kind} />
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn(
                              'text-[10px] font-semibold tabular-nums',
                              item.pending ? 'text-muted-foreground/40 italic' : 'text-foreground',
                            )}>
                              {item.time}
                            </span>
                            <span className={cn(
                              'text-[10px]',
                              isCourseMarker ? 'text-muted-foreground/50' : 'text-foreground/80',
                            )}>
                              {item.label}
                            </span>
                          </div>
                          {item.badges.length > 0 && (
                            <div className="mt-1">
                              <StatusBadges badges={item.badges} small />
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="px-3 py-2.5 border-t border-[#1e2433] shrink-0 flex gap-2">
            <button
              type="button"
              onClick={showTrial}
              className="flex-1 py-1.5 rounded bg-yellow-500/15 text-yellow-400 text-[9px] font-bold hover:bg-yellow-500/25 transition-colors"
            >
              Yêu cầu giải trình
            </button>
            <button
              type="button"
              onClick={showTrial}
              className="flex-1 py-1.5 rounded bg-primary/15 text-primary text-[9px] font-bold hover:bg-primary/25 transition-colors"
            >
              Xử lý
            </button>
          </div>
        </div>
      </div>

      <TrialLockPopup visible={trialVisible} onDismiss={dismissTrial} />
    </div>
  )
}
