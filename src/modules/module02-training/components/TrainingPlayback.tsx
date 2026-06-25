import { useState, useMemo } from 'react'
import {
  Play, Pause, Volume2, Download, LogIn, LogOut,
  Clock, BookOpen, Building2, User, Radio,
} from 'lucide-react'
import { cn } from '@/utils/cn'
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

function nowHHmm(): string {
  const n = new Date()
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`
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
  return sessions.reduce((sum, sess) => {
    const out = sess.out ?? (finished ? end : nowHHmm())
    return sum + Math.max(0, toMin(out) - toMin(sess.in))
  }, 0)
}

function wasLateArrival(sessions: AttendanceSession[], startTime: string): boolean {
  const firstIn = sessions[0]?.in
  return !!firstIn && toMin(firstIn) > toMin(startTime)
}

/* ── Chronological event stream (matches Sự kiện semantics) ── */
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

/* ── Shared badge atoms (sync with Sự kiện) ── */
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

/* ─────────────────────────────────────────────────────────────
   MAIN
───────────────────────────────────────────────────────────── */
interface TrainingPlaybackProps {
  event: TrainingEvent | null
}

export function TrainingPlayback({ event }: TrainingPlaybackProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress]     = useState(0)
  const [speedIdx, setSpeedIdx]     = useState(1)
  const [activeId, setActiveId]     = useState<string | null>(null)

  const rec      = event?.courseRecord
  const start    = rec?.startTime ?? '08:00'
  const end      = rec?.endTime   ?? '17:00'
  const sessions = rec?.sessions ?? []
  const finished = getSessionStatus(start, end) === 'finished'
  const badges   = rec ? getAttendanceBadges(rec) : event ? [event.type] : []
  const primary  = badges[0]
  const timeline = useMemo(() => (rec ? buildTimeline(rec) : []), [rec])
  const ticks    = buildTicks(start, end)

  const isoDate     = event?.time?.slice(0, 10) ?? ''
  const displayDate = isoDate
    ? `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}/${isoDate.slice(0, 4)}`
    : '—'

  const attended    = totalMinutes(sessions, end, finished)
  const duration    = toMin(end) - toMin(start)
  const pctAttended = duration > 0 ? Math.round((attended / duration) * 100) : 0
  const barColor    = attendanceStatusConfig[primary]?.dot ?? 'bg-primary'

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
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#1e2433] shrink-0 bg-[#0a0e1a]">
        <div className="flex items-center gap-1.5 min-w-0">
          <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-[11px] font-semibold text-foreground truncate">{event.workerName}</span>
          <span className="text-[9px] text-muted-foreground/50 shrink-0">{event.workerCode}</span>
        </div>
        <span className="text-[#1e2433]">|</span>
        <div className="flex items-center gap-1.5 min-w-0">
          <Building2 className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="text-[10px] text-primary/80 truncate">{event.contractor}</span>
        </div>
        <span className="text-[#1e2433]">|</span>
        <div className="flex items-center gap-1.5 min-w-0">
          <BookOpen className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="text-[10px] text-foreground truncate">{event.course}</span>
          <span className="text-[9px] text-muted-foreground/60 tabular-nums shrink-0">
            {displayDate} · {start}–{end}
          </span>
          <SessionBadge finished={finished} />
        </div>
        <div className="ml-auto">
          <button className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#1a2235] border border-[#1e2433] hover:bg-[#222d42] transition-colors text-[10px] text-muted-foreground hover:text-foreground">
            <Download className="w-3 h-3" />
            Xuất clip
          </button>
        </div>
      </div>

      {/* ── Body: video | event stream ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Video column */}
        <div className="flex-[62] flex flex-col min-h-0 border-r border-[#1e2433]">
          <div className="relative flex-1 min-h-0 bg-[#060b14] flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-br from-[#0f1922] via-[#0a1219] to-[#060d14]" />
            {!isPlaying ? (
              <button
                onClick={() => setIsPlaying(true)}
                className="relative z-10 w-14 h-14 rounded-full bg-primary/85 hover:bg-primary flex items-center justify-center transition-colors shadow-lg shadow-primary/20"
              >
                <Play className="w-6 h-6 text-white ml-0.5" />
              </button>
            ) : (
              <button
                onClick={() => setIsPlaying(false)}
                className="relative z-10 w-14 h-14 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors"
              >
                <Pause className="w-6 h-6 text-white" />
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
                const outT = sess.out ?? (finished ? end : nowHHmm())
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

        {/* Event stream column — sync with Sự kiện listing */}
        <div className="flex-[38] flex flex-col min-h-0 bg-[#0b0f1a]">

          {/* Summary card (mirrors listing row) */}
          <div className="px-3 py-2.5 border-b border-[#1e2433] shrink-0">
            <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Điểm danh
            </p>
            <StatusBadges badges={badges} small />
            <p className={cn('text-[9px] mt-1 tabular-nums', attendanceStatusConfig[primary].color + '/80')}>
              {formatRecordSessions(rec)}
            </p>
            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-[#1e2433]/60">
              <div className="flex-1">
                <p className="text-[8px] text-muted-foreground/50">Có mặt</p>
                <p className="text-[10px] font-semibold tabular-nums">{attended}p</p>
              </div>
              <div className="flex-1">
                <p className="text-[8px] text-muted-foreground/50">Tỷ lệ</p>
                <p className={cn('text-[10px] font-bold tabular-nums', pctAttended >= 75 ? 'text-green-400' : 'text-red-400')}>
                  {pctAttended}%
                </p>
              </div>
              <div className="flex-[2]">
                <div className="h-1 rounded-full bg-[#1e2433] overflow-hidden mt-1">
                  <div
                    className={cn('h-full rounded-full', pctAttended >= 75 ? 'bg-green-400' : 'bg-red-400')}
                    style={{ width: `${pctAttended}%` }}
                  />
                </div>
                <p className="text-[7px] text-muted-foreground/40 text-right mt-0.5">≥ 75%</p>
              </div>
            </div>
          </div>

          {/* Timeline header */}
          <div className="px-3 py-1.5 border-b border-[#1e2433] shrink-0">
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
              Dòng sự kiện
            </span>
          </div>

          {/* Scrollable event list */}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {timeline.length === 0 ? (
              <p className="text-[10px] text-muted-foreground/40 italic py-4 text-center">Không có sự kiện</p>
            ) : (
              <div className="relative">
                {/* Vertical connector line */}
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
                        {/* Node */}
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

                        {/* Content */}
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

          {/* Action */}
          <div className="px-3 py-2.5 border-t border-[#1e2433] shrink-0">
            <button className="w-full py-1.5 rounded bg-yellow-500/15 text-yellow-400 text-[9px] font-bold hover:bg-yellow-500/25 transition-colors">
              Y/c Giải trình
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
