import { useState, useRef, useEffect } from 'react'
import { ArrowLeft, Play, BookOpen, Building2, Loader2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import { TruncateText } from '@/components/common/TruncateText/TruncateText'
import { DEMO_NOW } from '../data/trainingMockData'
import { getAttendeeAvatarUrl } from '../data/trainingAvatars'
import { formatCourseMeta, getCourseZone, type TrainingZone } from '../data/trainingCourseMeta'
import { buildTrainingPlaybackEvent, buildTrainingPlaybackEventFromRecord } from '../services/trainingPlayback.service'
import { Avatar } from '@/components/common/Avatar/Avatar'

/* ─────────────────────────────────────────────────────────────
   TYPES  (mirrors future API contract)
───────────────────────────────────────────────────────────── */
/**
 * Attendance status — reflects what the system CAN know at the time of query.
 *
 * ── REAL-TIME (determinable while session is ongoing) ──────────
 *   attending    — checked in on time, `out: null` (currently inside)
 *   late         — checked in after startTime, `out: null` (still inside; exception locked)
 *   away         — checked out during an ongoing session; outcome unknown until session ends
 *                  (might return → insufficient/completed, or not → skipped/left-early)
 *   absent       — no check-in yet; session still running so could still arrive
 *
 * ── FINALIZED (only after session endTime has passed) ──────────
 *   completed    — first-in ≤ startTime, last-out ≥ endTime, total ≥ 3/4 duration
 *   late         — (also final) arrived late, may or may not have completed duration
 *   left-early   — single session, out < endTime, total ≥ 3/4 but left before end
 *                  OR: arrived on time, left before end and didn't return
 *   skipped      — checked in, left mid-session, never returned; total < 3/4
 *   insufficient — ≥1 session(s), total attended < 3/4 of scheduled duration
 *   absent       — (also final) no check-in at all after session ended
 *
 * ── NOTE on "late" ────────────────────────────────────────────
 *   `late` is locked the moment the person checks in past startTime.
 *   After session ends, backend additionally evaluates whether they
 *   also left early / had insufficient hours and may promote the status.
 *   For simplicity, the most severe exception wins:
 *   absent > skipped > insufficient > left-early > late > attending/completed
 */
export type AttendanceStatus =
  | 'attending'    // real-time: inside, on time
  | 'away'         // real-time: left mid-session, outcome TBD
  | 'late'         // real-time + final: arrived late
  | 'completed'    // final: full attendance, on time
  | 'left-early'   // final: left before end
  | 'skipped'      // final: left & never returned, total < 3/4
  | 'insufficient' // final: multiple exits, total < 3/4
  | 'absent'       // real-time + final: no check-in
/** @deprecated use AttendanceStatus */
export type ExceptionType = AttendanceStatus
type CourseStatus = AttendanceStatus

/**
 * Whether the scheduled course window is currently active (cột "Trạng thái").
 * Computed from courseStart/courseEnd — never stored in API.
 */
export type SessionStatus = 'in-session' | 'finished'

/** Demo clock — 11:30 on 24/06/2026 (see trainingMockData.ts) */

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Derive session status from scheduled window vs demo clock. */
export function getSessionStatus(courseStart: string, courseEnd: string): SessionStatus {
  const nowMs = DEMO_NOW.hours * 60 + DEMO_NOW.minutes
  const startMs = timeToMinutes(courseStart)
  const endMs = timeToMinutes(courseEnd)
  if (nowMs < startMs || nowMs >= endMs) return 'finished'
  return 'in-session'
}

/**
 * One physical presence window recorded by camera.
 *   in  — check-in  "HH:mm"
 *   out — check-out "HH:mm" | null (null = still inside at time of query)
 */
export interface AttendanceSession {
  in: string
  out: string | null
}

/**
 * One attendance record for a single course.
 * Maps to: GET /api/v1/training/attendance/:studentId
 *
 * sessions semantics by status:
 *   attending    — [{ in, out:null }]               inside now, session ongoing
 *   away         — [{ in, out }]                    left mid-session, session still ongoing
 *                  may have multiple entries if they re-entered then left again
 *   late         — [{ in, out|null }]               arrived late; null if still inside
 *   completed    — [{ in, out }]                    in ≤ startTime, out ≥ endTime
 *   left-early   — [{ in, out }]                    out < endTime, never returned
 *   skipped      — [{ in, out }]                    left mid-session, never returned, < 3/4
 *   insufficient — [{ in, out }, …, { in, out|null }] total attended < 3/4 duration
 *   absent       — []                              no check-in recorded
 */
export interface CourseRecord {
  id: string
  /** e.g. "TB-A-2026-06-24" — used as API key */
  courseCode: string
  courseName: string
  /** ISO date "2026-06-24" */
  sessionDate: string
  /** Scheduled start/end "HH:mm" */
  startTime: string
  endTime: string
  zone: TrainingZone
  status: CourseStatus
  /**
   * Secondary violations alongside primary `status`.
   * e.g. status='skipped', flags=['late'] → đi trễ + bỏ học.
   * Omit or [] when only one behavior applies.
   */
  flags?: AttendanceStatus[]
  sessions: AttendanceSession[]
  /**
   *   late         → minutes late vs scheduled start
   *   left-early   → minutes left before scheduled end
   *   skipped      → minutes attended before final walkout
   *   insufficient → minutes SHORT of 3/4-attendance threshold
   *   completed / absent → 0
   */
  minutesDelta: number
}

/**
 * One attendance event — every participant in a training session today.
 * Maps to: GET /api/v1/training/attendance/today
 */
export interface TrainingAttendee {
  id: string
  employeeCode: string
  name: string
  /** Hex color for avatar — UI-generated or stored in profile */
  avatarColor: string
  /** Contractor company name */
  company: string
  /** Contractor code, e.g. "DC-001" */
  companyCode: string
  role: string
  /** Attendance outcome for today's session */
  currentStatus: AttendanceStatus
  /** Course name of today's session */
  currentCourse: string
  courseDate: string   // "DD/MM"
  courseStart: string  // "HH:mm"
  courseEnd: string    // "HH:mm"
  /** First check-in time ("—" if absent) */
  actualTime: string
  exceptionMinutes: number
  courseHistory: CourseRecord[]
}
/** @deprecated use TrainingAttendee */
export type ExceptionStudent = TrainingAttendee

/** Playback event — carries full session data for the video timeline. */
export interface TrainingEvent {
  id: string
  /** ISO-8601 timestamp of first check-in "YYYY-MM-DDTHH:mm:ss" */
  time: string
  workerName: string
  workerCode: string
  contractor: string
  course: string
  type: AttendanceStatus
  status: 'pending' | 'processed'
  /** Full attendance record with all sessions for timeline rendering */
  courseRecord?: CourseRecord
  companyCode?: string
  role?: string
}

/* ─────────────────────────────────────────────────────────────
   CONFIG
───────────────────────────────────────────────────────────── */
export const attendanceStatusConfig: Record<AttendanceStatus, {
  label: string; color: string; bg: string; dot: string
}> = {
  /* ── real-time ── */
  attending:    { label: 'Đang học',   color: 'text-sky-400',    bg: 'bg-sky-500/15',    dot: 'bg-sky-400'    },
  away:         { label: 'Tạm vắng',  color: 'text-cyan-400',   bg: 'bg-cyan-500/15',   dot: 'bg-cyan-400'   },
  late:         { label: 'Đi trễ',    color: 'text-orange-400', bg: 'bg-orange-500/15', dot: 'bg-orange-400' },
  absent:       { label: 'Vắng mặt',  color: 'text-gray-400',   bg: 'bg-gray-500/15',   dot: 'bg-gray-400'   },
  /* ── finalized (session ended) ── */
  completed:    { label: 'Hoàn thành', color: 'text-green-400',  bg: 'bg-green-500/15',  dot: 'bg-green-400'  },
  'left-early': { label: 'Về sớm',     color: 'text-red-400',    bg: 'bg-red-500/15',    dot: 'bg-red-400'    },
  skipped:      { label: 'Bỏ học',     color: 'text-purple-400', bg: 'bg-purple-500/15', dot: 'bg-purple-400' },
  insufficient: { label: 'Thiếu giờ',  color: 'text-amber-400',  bg: 'bg-amber-500/15',  dot: 'bg-amber-400'  },
}
const statusConfig = attendanceStatusConfig
const courseStatusConfig = statusConfig

const sessionStatusConfig: Record<SessionStatus, { label: string; color: string; bg: string; pulse?: boolean }> = {
  'in-session': { label: 'Đang diễn ra',  color: 'text-green-400', bg: 'bg-green-500/15', pulse: true  },
  'finished':   { label: 'Đã hoàn thành', color: 'text-gray-400',  bg: 'bg-gray-500/15',  pulse: false },
}

export type EventTabKey = AttendanceStatus | 'all'

/** Ngoại lệ điểm danh — NL / KPI (không gồm đang học, tạm vắng, hoàn thành) */
export const EXCEPTION_ATTENDANCE_STATUSES: AttendanceStatus[] = [
  'late',
  'left-early',
  'skipped',
  'insufficient',
  'absent',
]

const TABS: { key: EventTabKey; label: string }[] = [
  { key: 'all',          label: 'Tất cả'    },
  { key: 'attending',    label: 'Đang học'  },
  { key: 'away',         label: 'Tạm vắng' },
  { key: 'late',         label: 'Đi trễ'    },
  { key: 'absent',       label: 'Vắng mặt'  },
  { key: 'completed',    label: 'Hoàn thành'},
  { key: 'left-early',   label: 'Về sớm'    },
  { key: 'skipped',      label: 'Bỏ học'    },
  { key: 'insufficient', label: 'Thiếu giờ' },
]

function matchesTab(s: TrainingAttendee, tab: EventTabKey): boolean {
  if (tab === 'all') return true
  return getAttendeeBadges(s).includes(tab)
}

/* ─────────────────────────────────────────────────────────────
   CANONICAL COURSE SCHEDULE  (single source of truth)
   All course codes, names, zones and times are
   defined here and referenced consistently in every record.

   TB-A  | Toolbox A         | OCP1-A | 07:30–09:30
   CNTB  | Cọc nhồi B        | OCP1-A | 08:00–12:00
   PCCC  | PCCC C            | OCP1-B | 08:00–12:00
   DCE   | Điện cơ E         | OCP1-B | 11:30–13:30
   VHMN  | Vận hành máy nâng | OCP1-B | 13:00–17:00
   KTXD  | KT xây dựng       | OCP1-A | 14:00–17:00
   ATMT  | AT môi trường     | OCP1-A | 14:00–17:00
   ATDC  | An toàn đầu ca    | OCP1-A | 07:30–09:30
   MHKT  | Máy hạng nặng     | OCP1-B | 08:00–12:00
───────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────
   MOCK DATA  — structured to mirror real API response
───────────────────────────────────────────────────────────── */
export const TRAINING_ATTENDEES: TrainingAttendee[] = [
  /* ────────────────────────────────────────────────────────────────────
     sessions rules:
       completed    → [{in, out}]                   1 session
       late (past/finished) → [{in, out}]                stayed to end, out filled at session close
       late (ongoing)       → [{in, out:null}]           still in class
       left-early   → [{in, out}]                   left before end
       skipped      → [{in, out}]                   walked out, never returned
       insufficient → [{in,out}, {in,out}, …]       ≥2 sessions, total < 3/4
       absent       → []
     For skipped / insufficient: actualTime = first check-in time
  ──────────────────────────────────────────────────────────────────── */

  /* ── 1 ── Phạm Văn Cường (Delta Corp) → CNTB late ─────── */
  {
    id: 'w-001', employeeCode: 'NV000789', name: 'Phạm Văn Cường',
    avatarColor: '#3B82F6', company: 'Delta Corp', companyCode: 'DC-001',
    role: 'Công nhân cơ khí',
    currentStatus: 'late', currentCourse: 'Cọc nhồi B',
    courseDate: '24/06', courseStart: '08:00', courseEnd: '12:00',
    actualTime: '08:15', exceptionMinutes: 15,
    courseHistory: [
      { id: 'cr-001-1', courseCode: 'TB-A-2026-06-17',  courseName: 'Toolbox A',        sessionDate: '2026-06-17', startTime: '07:30', endTime: '09:30', zone: 'OCP1-A',  status: 'completed',  sessions: [{in:'07:28', out:'09:30'}],                                       minutesDelta: 0  },
      { id: 'cr-001-2', courseCode: 'PCCC-2026-06-17',  courseName: 'PCCC C',           sessionDate: '2026-06-17', startTime: '08:00', endTime: '12:00', zone: 'OCP1-B', status: 'left-early', sessions: [{in:'07:58', out:'11:30'}],                                       minutesDelta: 30 },
      { id: 'cr-001-3', courseCode: 'CNTB-2026-06-24',  courseName: 'Cọc nhồi B',       sessionDate: '2026-06-24', startTime: '08:00', endTime: '12:00', zone: 'OCP1-A',  status: 'late',       sessions: [{in:'08:15', out:null}],                                       minutesDelta: 15 },
    ],
  },

  /* ── 2 ── Trần Văn Bình (XYZ JSC) → TB-A left-early ─── */
  {
    id: 'w-002', employeeCode: 'NV000456', name: 'Trần Văn Bình',
    avatarColor: '#F97316', company: 'XYZ JSC', companyCode: 'XY-002',
    role: 'Thợ hàn bậc 3',
    currentStatus: 'left-early', currentCourse: 'Toolbox A',
    courseDate: '24/06', courseStart: '07:30', courseEnd: '09:30',
    actualTime: '08:55', exceptionMinutes: 35,
    courseHistory: [
      { id: 'cr-002-1', courseCode: 'TB-A-2026-06-10',  courseName: 'Toolbox A',        sessionDate: '2026-06-10', startTime: '07:30', endTime: '09:30', zone: 'OCP1-A',  status: 'completed',  sessions: [{in:'07:25', out:'09:30'}],                                       minutesDelta: 0  },
      { id: 'cr-002-2', courseCode: 'CNTB-2026-06-17',  courseName: 'Cọc nhồi B',       sessionDate: '2026-06-17', startTime: '08:00', endTime: '12:00', zone: 'OCP1-A',  status: 'completed',  sessions: [{in:'07:55', out:'12:00'}],                                       minutesDelta: 0  },
      { id: 'cr-002-3', courseCode: 'TB-A-2026-06-24',  courseName: 'Toolbox A',        sessionDate: '2026-06-24', startTime: '07:30', endTime: '09:30', zone: 'OCP1-A',  status: 'left-early', sessions: [{in:'07:30', out:'08:55'}],                                       minutesDelta: 35 },
    ],
  },

  /* ── 3 ── Lê Văn Dũng (ABC Construction) → PCCC absent ── */
  {
    id: 'w-003', employeeCode: 'NV000321', name: 'Lê Văn Dũng',
    avatarColor: '#10B981', company: 'ABC Construction', companyCode: 'AB-003',
    role: 'Giám sát thi công',
    currentStatus: 'absent', currentCourse: 'PCCC C',
    courseDate: '24/06', courseStart: '08:00', courseEnd: '12:00',
    actualTime: '—', exceptionMinutes: 0,
    courseHistory: [
      { id: 'cr-003-1', courseCode: 'TB-A-2026-06-10',  courseName: 'Toolbox A',        sessionDate: '2026-06-10', startTime: '07:30', endTime: '09:30', zone: 'OCP1-A',  status: 'completed',  sessions: [{in:'07:28', out:'09:30'}],                                       minutesDelta: 0 },
      { id: 'cr-003-2', courseCode: 'ATDC-2026-06-23',  courseName: 'An toàn đầu ca',   sessionDate: '2026-06-23', startTime: '07:30', endTime: '09:30', zone: 'OCP1-A',  status: 'absent',     sessions: [],                                                                minutesDelta: 0 },
      { id: 'cr-003-3', courseCode: 'PCCC-2026-06-24',  courseName: 'PCCC C',           sessionDate: '2026-06-24', startTime: '08:00', endTime: '12:00', zone: 'OCP1-B', status: 'absent',     sessions: [],                                                                minutesDelta: 0 },
    ],
  },

  /* ── 4 ── Hoàng Văn Em (XYZ JSC) → CNTB skipped
     Vào 08:00, rời 08:45, không quay lại.
     actualTime = check-in, exceptionMinutes = minutes attended before walkout */
  {
    id: 'w-004', employeeCode: 'NV000654', name: 'Hoàng Văn Em',
    avatarColor: '#8B5CF6', company: 'XYZ JSC', companyCode: 'XY-002',
    role: 'Vận hành máy',
    currentStatus: 'skipped', currentCourse: 'Cọc nhồi B',
    courseDate: '24/06', courseStart: '08:00', courseEnd: '12:00',
    actualTime: '08:00', exceptionMinutes: 45,
    courseHistory: [
      { id: 'cr-004-1', courseCode: 'TB-A-2026-06-17',  courseName: 'Toolbox A',        sessionDate: '2026-06-17', startTime: '07:30', endTime: '09:30', zone: 'OCP1-A',  status: 'completed',  sessions: [{in:'07:29', out:'09:30'}],                                       minutesDelta: 0  },
      { id: 'cr-004-2', courseCode: 'CNTB-2026-06-24',  courseName: 'Cọc nhồi B',       sessionDate: '2026-06-24', startTime: '08:00', endTime: '12:00', zone: 'OCP1-A',  status: 'skipped',    sessions: [{in:'08:00', out:'08:45'}],                                       minutesDelta: 45 },
    ],
  },

  /* ── 5 ── Nguyễn Thị Phương (Delta Corp) → TB-A late ──── */
  {
    id: 'w-005', employeeCode: 'NV000112', name: 'Nguyễn Thị Phương',
    avatarColor: '#EC4899', company: 'Delta Corp', companyCode: 'DC-001',
    role: 'Nhân viên ATLD',
    currentStatus: 'late', currentCourse: 'Toolbox A',
    courseDate: '24/06', courseStart: '07:30', courseEnd: '09:30',
    actualTime: '07:55', exceptionMinutes: 25,
    courseHistory: [
      { id: 'cr-005-1', courseCode: 'VHMN-2026-06-10',  courseName: 'Vận hành máy nâng', sessionDate: '2026-06-10', startTime: '13:00', endTime: '17:00', zone: 'OCP1-B',   status: 'completed',  sessions: [{in:'13:00', out:'17:00'}],                                       minutesDelta: 0 },
      { id: 'cr-005-2', courseCode: 'PCCC-2026-06-17',  courseName: 'PCCC C',           sessionDate: '2026-06-17', startTime: '08:00', endTime: '12:00', zone: 'OCP1-B', status: 'completed',  sessions: [{in:'08:02', out:'12:00'}],                                       minutesDelta: 0 },
      { id: 'cr-005-3', courseCode: 'TB-A-2026-06-24',  courseName: 'Toolbox A',        sessionDate: '2026-06-24', startTime: '07:30', endTime: '09:30', zone: 'OCP1-A',  status: 'late',       sessions: [{in:'07:55', out:'09:30'}],                                       minutesDelta: 25 },
    ],
  },

  /* ── 6 ── Vũ Minh Giang (ABC Construction) → CNTB absent  */
  {
    id: 'w-006', employeeCode: 'NV000223', name: 'Vũ Minh Giang',
    avatarColor: '#06B6D4', company: 'ABC Construction', companyCode: 'AB-003',
    role: 'Thợ điện công trình',
    currentStatus: 'absent', currentCourse: 'Cọc nhồi B',
    courseDate: '24/06', courseStart: '08:00', courseEnd: '12:00',
    actualTime: '—', exceptionMinutes: 0,
    courseHistory: [
      { id: 'cr-006-1', courseCode: 'TB-A-2026-06-10',  courseName: 'Toolbox A',        sessionDate: '2026-06-10', startTime: '07:30', endTime: '09:30', zone: 'OCP1-A',  status: 'completed',  sessions: [{in:'07:30', out:'09:30'}],                                       minutesDelta: 0 },
      { id: 'cr-006-2', courseCode: 'MHKT-2026-06-23',  courseName: 'Máy hạng nặng',    sessionDate: '2026-06-23', startTime: '08:00', endTime: '12:00', zone: 'OCP1-B', status: 'skipped',    sessions: [{in:'08:00', out:'08:20'}],                                       minutesDelta: 20 },
      { id: 'cr-006-3', courseCode: 'CNTB-2026-06-24',  courseName: 'Cọc nhồi B',       sessionDate: '2026-06-24', startTime: '08:00', endTime: '12:00', zone: 'OCP1-A',  status: 'absent',     sessions: [],                                                                minutesDelta: 0 },
    ],
  },

  /* ── 7 ── Đinh Quốc Hùng (Minh Phát JSC) → TB-A late ─── */
  {
    id: 'w-007', employeeCode: 'NV001045', name: 'Đinh Quốc Hùng',
    avatarColor: '#F59E0B', company: 'Minh Phát JSC', companyCode: 'MP-004',
    role: 'Thợ xây bậc 4',
    currentStatus: 'late', currentCourse: 'Toolbox A',
    courseDate: '24/06', courseStart: '07:30', courseEnd: '09:30',
    actualTime: '08:22', exceptionMinutes: 52,
    courseHistory: [
      { id: 'cr-007-1', courseCode: 'CNTB-2026-06-17',  courseName: 'Cọc nhồi B',       sessionDate: '2026-06-17', startTime: '08:00', endTime: '12:00', zone: 'OCP1-A',  status: 'completed',  sessions: [{in:'07:55', out:'12:00'}],                                       minutesDelta: 0  },
      { id: 'cr-007-2', courseCode: 'TB-A-2026-06-24',  courseName: 'Toolbox A',        sessionDate: '2026-06-24', startTime: '07:30', endTime: '09:30', zone: 'OCP1-A',  status: 'late',       sessions: [{in:'08:22', out:'09:30'}],                                       minutesDelta: 52 },
    ],
  },

  /* ── 8 ── Bùi Thị Lan (Sunrise Const.) → PCCC left-early  */
  {
    id: 'w-008', employeeCode: 'NV000887', name: 'Bùi Thị Lan',
    avatarColor: '#A78BFA', company: 'Sunrise Const.', companyCode: 'SR-005',
    role: 'Nhân viên an toàn',
    currentStatus: 'left-early', currentCourse: 'PCCC C',
    courseDate: '24/06', courseStart: '08:00', courseEnd: '12:00',
    actualTime: '11:15', exceptionMinutes: 45,
    courseHistory: [
      { id: 'cr-008-1', courseCode: 'TB-A-2026-06-17',  courseName: 'Toolbox A',        sessionDate: '2026-06-17', startTime: '07:30', endTime: '09:30', zone: 'OCP1-A',  status: 'completed',  sessions: [{in:'07:28', out:'09:30'}],                                       minutesDelta: 0  },
      { id: 'cr-008-2', courseCode: 'PCCC-2026-06-24',  courseName: 'PCCC C',           sessionDate: '2026-06-24', startTime: '08:00', endTime: '12:00', zone: 'OCP1-B', status: 'left-early', sessions: [{in:'07:58', out:'11:15'}],                                       minutesDelta: 45 },
    ],
  },


  /* ── 10 ── Trương Văn Khoa (XYZ JSC) → TB-A absent ────── */
  {
    id: 'w-010', employeeCode: 'NV000771', name: 'Trương Văn Khoa',
    avatarColor: '#FB923C', company: 'XYZ JSC', companyCode: 'XY-002',
    role: 'Thợ lắp đặt cơ điện',
    currentStatus: 'absent', currentCourse: 'Toolbox A',
    courseDate: '24/06', courseStart: '07:30', courseEnd: '09:30',
    actualTime: '—', exceptionMinutes: 0,
    courseHistory: [
      { id: 'cr-010-1', courseCode: 'CNTB-2026-06-10',  courseName: 'Cọc nhồi B',       sessionDate: '2026-06-10', startTime: '08:00', endTime: '12:00', zone: 'OCP1-A',  status: 'completed',  sessions: [{in:'07:58', out:'12:00'}],                                       minutesDelta: 0 },
      { id: 'cr-010-2', courseCode: 'ATDC-2026-06-23',  courseName: 'An toàn đầu ca',   sessionDate: '2026-06-23', startTime: '07:30', endTime: '09:30', zone: 'OCP1-A',  status: 'absent',     sessions: [],                                                                minutesDelta: 0 },
      { id: 'cr-010-3', courseCode: 'TB-A-2026-06-24',  courseName: 'Toolbox A',        sessionDate: '2026-06-24', startTime: '07:30', endTime: '09:30', zone: 'OCP1-A',  status: 'absent',     sessions: [],                                                                minutesDelta: 0 },
    ],
  },

  /* ── 11 ── Lý Thị Mỹ Duyên (ABC Construction) → CNTB late */
  {
    id: 'w-011', employeeCode: 'NV000334', name: 'Lý Thị Mỹ Duyên',
    avatarColor: '#F472B6', company: 'ABC Construction', companyCode: 'AB-003',
    role: 'Giám sát chất lượng',
    currentStatus: 'late', currentCourse: 'Cọc nhồi B',
    courseDate: '24/06', courseStart: '08:00', courseEnd: '12:00',
    actualTime: '08:18', exceptionMinutes: 18,
    courseHistory: [
      { id: 'cr-011-1', courseCode: 'TB-A-2026-06-10',  courseName: 'Toolbox A',        sessionDate: '2026-06-10', startTime: '07:30', endTime: '09:30', zone: 'OCP1-A',  status: 'completed',  sessions: [{in:'07:28', out:'09:30'}],                                       minutesDelta: 0  },
      { id: 'cr-011-2', courseCode: 'CNTB-2026-06-24',  courseName: 'Cọc nhồi B',       sessionDate: '2026-06-24', startTime: '08:00', endTime: '12:00', zone: 'OCP1-A',  status: 'late',       sessions: [{in:'08:18', out:null}],                                       minutesDelta: 18 },
    ],
  },

  /* ── 12 ── Phan Minh Tuấn (Minh Phát JSC) → CNTB insufficient
     Ca: 08:00–12:00 (240p).
     Vào 08:00 → Ra 09:00 · Vào 09:30 → Ra 11:00
     Tổng dự: 60p + 90p = 150p / 240p = 62.5% < 75% (=180p) → thiếu 30p
     actualTime = first check-in                                           */
  {
    id: 'w-012', employeeCode: 'NV001199', name: 'Phan Minh Tuấn',
    avatarColor: '#60A5FA', company: 'Minh Phát JSC', companyCode: 'MP-004',
    role: 'Công nhân xây dựng',
    currentStatus: 'insufficient', currentCourse: 'Cọc nhồi B',
    courseDate: '24/06', courseStart: '08:00', courseEnd: '12:00',
    actualTime: '08:00', exceptionMinutes: 30,
    courseHistory: [
      { id: 'cr-012-1', courseCode: 'PCCC-2026-06-17',  courseName: 'PCCC C',           sessionDate: '2026-06-17', startTime: '08:00', endTime: '12:00', zone: 'OCP1-B', status: 'late',          sessions: [{in:'08:12', out:'12:00'}],                                     minutesDelta: 12 },
      { id: 'cr-012-2', courseCode: 'CNTB-2026-06-24',  courseName: 'Cọc nhồi B',       sessionDate: '2026-06-24', startTime: '08:00', endTime: '12:00', zone: 'OCP1-A', status: 'insufficient',  flags: ['late'], sessions: [{in:'08:12', out:'09:00'}, {in:'09:30', out:'11:00'}],          minutesDelta: 30 },
    ],
  },

  /* ── 13 ── Cao Văn Nam (Sunrise Const.) → TB-A late ────── */
  {
    id: 'w-013', employeeCode: 'NV001210', name: 'Cao Văn Nam',
    avatarColor: '#E879F9', company: 'Sunrise Const.', companyCode: 'SR-005',
    role: 'Thợ ốp lát',
    currentStatus: 'late', currentCourse: 'Toolbox A',
    courseDate: '24/06', courseStart: '07:30', courseEnd: '09:30',
    actualTime: '08:31', exceptionMinutes: 61,
    courseHistory: [
      { id: 'cr-013-1', courseCode: 'ATDC-2026-06-23',  courseName: 'An toàn đầu ca',   sessionDate: '2026-06-23', startTime: '07:30', endTime: '09:30', zone: 'OCP1-A',  status: 'completed',  sessions: [{in:'07:30', out:'09:30'}],                                       minutesDelta: 0  },
      { id: 'cr-013-2', courseCode: 'TB-A-2026-06-24',  courseName: 'Toolbox A',        sessionDate: '2026-06-24', startTime: '07:30', endTime: '09:30', zone: 'OCP1-A',  status: 'late',       sessions: [{in:'08:31', out:'09:30'}],                                       minutesDelta: 61 },
    ],
  },

  /* ── 14 ── Đặng Thị Hoa (XYZ JSC) → PCCC absent ───────── */
  {
    id: 'w-014', employeeCode: 'NV000990', name: 'Đặng Thị Hoa',
    avatarColor: '#38BDF8', company: 'XYZ JSC', companyCode: 'XY-002',
    role: 'Kế toán công trường',
    currentStatus: 'absent', currentCourse: 'PCCC C',
    courseDate: '24/06', courseStart: '08:00', courseEnd: '12:00',
    actualTime: '—', exceptionMinutes: 0,
    courseHistory: [
      { id: 'cr-014-1', courseCode: 'TB-A-2026-06-10',  courseName: 'Toolbox A',        sessionDate: '2026-06-10', startTime: '07:30', endTime: '09:30', zone: 'OCP1-A',  status: 'completed',  sessions: [{in:'07:25', out:'09:30'}],                                       minutesDelta: 0 },
      { id: 'cr-014-2', courseCode: 'PCCC-2026-06-24',  courseName: 'PCCC C',           sessionDate: '2026-06-24', startTime: '08:00', endTime: '12:00', zone: 'OCP1-B', status: 'absent',     sessions: [],                                                                minutesDelta: 0 },
    ],
  },

  /* ── 15 ── Hồ Quốc Việt (Delta Corp) → CNTB left-early ── */
  {
    id: 'w-015', employeeCode: 'NV001301', name: 'Hồ Quốc Việt',
    avatarColor: '#4ADE80', company: 'Delta Corp', companyCode: 'DC-001',
    role: 'Thợ mộc công trình',
    currentStatus: 'left-early', currentCourse: 'Cọc nhồi B',
    courseDate: '24/06', courseStart: '08:00', courseEnd: '12:00',
    actualTime: '08:20', exceptionMinutes: 70,
    courseHistory: [
      { id: 'cr-015-1', courseCode: 'TB-A-2026-06-10',  courseName: 'Toolbox A',        sessionDate: '2026-06-10', startTime: '07:30', endTime: '09:30', zone: 'OCP1-A',  status: 'completed',  sessions: [{in:'07:28', out:'09:30'}],                                       minutesDelta: 0  },
      { id: 'cr-015-2', courseCode: 'VHMN-2026-06-17',  courseName: 'Vận hành máy nâng', sessionDate: '2026-06-17', startTime: '13:00', endTime: '17:00', zone: 'OCP1-B',   status: 'completed',  sessions: [{in:'13:00', out:'17:00'}],                                       minutesDelta: 0  },
      { id: 'cr-015-3', courseCode: 'CNTB-2026-06-24',  courseName: 'Cọc nhồi B',       sessionDate: '2026-06-24', startTime: '08:00', endTime: '12:00', zone: 'OCP1-A',  status: 'left-early', flags: ['late'], sessions: [{in:'08:20', out:'10:50'}],                                       minutesDelta: 70 },
    ],
  },

  /* ── 16 ── Kiều Thanh Thảo (ABC Construction) → CNTB skipped + late
     Vào 08:25 (trễ 25p), rời 09:20, không quay lại. */
  {
    id: 'w-016', employeeCode: 'NV000412', name: 'Kiều Thanh Thảo',
    avatarColor: '#FCD34D', company: 'ABC Construction', companyCode: 'AB-003',
    role: 'Nhân viên hành chính',
    currentStatus: 'skipped', currentCourse: 'Cọc nhồi B',
    courseDate: '24/06', courseStart: '08:00', courseEnd: '12:00',
    actualTime: '08:25', exceptionMinutes: 55,
    courseHistory: [
      { id: 'cr-016-1', courseCode: 'TB-A-2026-06-17',  courseName: 'Toolbox A',        sessionDate: '2026-06-17', startTime: '07:30', endTime: '09:30', zone: 'OCP1-A',  status: 'late',       sessions: [{in:'07:48', out:'09:30'}],                                       minutesDelta: 18 },
      { id: 'cr-016-2', courseCode: 'CNTB-2026-06-24',  courseName: 'Cọc nhồi B',       sessionDate: '2026-06-24', startTime: '08:00', endTime: '12:00', zone: 'OCP1-A',  status: 'skipped',    flags: ['late'], sessions: [{in:'08:25', out:'09:20'}],                                       minutesDelta: 55 },
    ],
  },


  /* ── 18 ── Mai Xuân Trường (Delta Corp) → TB-A absent ──── */
  {
    id: 'w-018', employeeCode: 'NV000678', name: 'Mai Xuân Trường',
    avatarColor: '#FB7185', company: 'Delta Corp', companyCode: 'DC-001',
    role: 'Công nhân sắt thép',
    currentStatus: 'absent', currentCourse: 'Toolbox A',
    courseDate: '24/06', courseStart: '07:30', courseEnd: '09:30',
    actualTime: '—', exceptionMinutes: 0,
    courseHistory: [
      { id: 'cr-018-1', courseCode: 'CNTB-2026-06-10',  courseName: 'Cọc nhồi B',       sessionDate: '2026-06-10', startTime: '08:00', endTime: '12:00', zone: 'OCP1-A',  status: 'completed',  sessions: [{in:'08:00', out:'12:00'}],                                       minutesDelta: 0 },
      { id: 'cr-018-2', courseCode: 'TB-A-2026-06-24',  courseName: 'Toolbox A',        sessionDate: '2026-06-24', startTime: '07:30', endTime: '09:30', zone: 'OCP1-A',  status: 'absent',     sessions: [],                                                                minutesDelta: 0 },
    ],
  },

  /* ── 19 ── Nguyễn Văn Hoàng (XYZ JSC) → PCCC late ──────  */
  {
    id: 'w-019', employeeCode: 'NV001155', name: 'Nguyễn Văn Hoàng',
    avatarColor: '#A3E635', company: 'XYZ JSC', companyCode: 'XY-002',
    role: 'Giám sát an toàn',
    currentStatus: 'late', currentCourse: 'PCCC C',
    courseDate: '24/06', courseStart: '08:00', courseEnd: '12:00',
    actualTime: '08:44', exceptionMinutes: 44,
    courseHistory: [
      { id: 'cr-019-1', courseCode: 'TB-A-2026-06-10',  courseName: 'Toolbox A',        sessionDate: '2026-06-10', startTime: '07:30', endTime: '09:30', zone: 'OCP1-A',  status: 'completed',  sessions: [{in:'07:28', out:'09:30'}],                                       minutesDelta: 0  },
      { id: 'cr-019-2', courseCode: 'MHKT-2026-06-23',  courseName: 'Máy hạng nặng',    sessionDate: '2026-06-23', startTime: '08:00', endTime: '12:00', zone: 'OCP1-B', status: 'left-early', sessions: [{in:'08:00', out:'10:30'}],                                       minutesDelta: 90 },
      { id: 'cr-019-3', courseCode: 'PCCC-2026-06-24',  courseName: 'PCCC C',           sessionDate: '2026-06-24', startTime: '08:00', endTime: '12:00', zone: 'OCP1-B', status: 'late',       sessions: [{in:'08:44', out:null}],                                       minutesDelta: 44 },
    ],
  },

  /* ── 20 ── Phùng Anh Tuấn (Sunrise Const.) → TB-A left-early */
  {
    id: 'w-020', employeeCode: 'NV001320', name: 'Phùng Anh Tuấn',
    avatarColor: '#2DD4BF', company: 'Sunrise Const.', companyCode: 'SR-005',
    role: 'Thợ cốt pha',
    currentStatus: 'left-early', currentCourse: 'Toolbox A',
    courseDate: '24/06', courseStart: '07:30', courseEnd: '09:30',
    actualTime: '09:00', exceptionMinutes: 30,
    courseHistory: [
      { id: 'cr-020-1', courseCode: 'PCCC-2026-06-17',  courseName: 'PCCC C',           sessionDate: '2026-06-17', startTime: '08:00', endTime: '12:00', zone: 'OCP1-B', status: 'completed',  sessions: [{in:'07:58', out:'12:00'}],                                       minutesDelta: 0  },
      { id: 'cr-020-2', courseCode: 'TB-A-2026-06-24',  courseName: 'Toolbox A',        sessionDate: '2026-06-24', startTime: '07:30', endTime: '09:30', zone: 'OCP1-A',  status: 'left-early', sessions: [{in:'07:30', out:'09:00'}],                                       minutesDelta: 30 },
    ],
  },

  /* ── COMPLETED attendees (today's sessions) ────────────────── */

  /* ── C01 ── Nguyễn Thị Lan (Delta Corp) → Toolbox A ✓ */
  { id:'w-c01', employeeCode:'NV001101', name:'Nguyễn Thị Lan',    avatarColor:'#06B6D4', company:'Delta Corp',      companyCode:'DC-001', role:'Kỹ thuật viên',       currentStatus:'completed', currentCourse:'Toolbox A',     courseDate:'24/06', courseStart:'07:30', courseEnd:'09:30', actualTime:'07:27', exceptionMinutes:0,
    courseHistory:[{ id:'cr-c01-1', courseCode:'TB-A-2026-06-24',  courseName:'Toolbox A',    sessionDate:'2026-06-24', startTime:'07:30', endTime:'09:30', zone:'OCP1-A', status:'completed',  sessions:[{in:'07:27', out:'09:32'}], minutesDelta:0 }]},
  /* ── C02 ── Trần Quốc Bảo (XYZ JSC) → Toolbox A ✓ */
  { id:'w-c02', employeeCode:'NV001102', name:'Trần Quốc Bảo',     avatarColor:'#8B5CF6', company:'XYZ JSC',         companyCode:'XY-002', role:'Thợ hàn bậc 2',        currentStatus:'completed', currentCourse:'Toolbox A',     courseDate:'24/06', courseStart:'07:30', courseEnd:'09:30', actualTime:'07:29', exceptionMinutes:0,
    courseHistory:[{ id:'cr-c02-1', courseCode:'TB-A-2026-06-24',  courseName:'Toolbox A',    sessionDate:'2026-06-24', startTime:'07:30', endTime:'09:30', zone:'OCP1-A', status:'completed',  sessions:[{in:'07:29', out:'09:30'}], minutesDelta:0 }]},
  /* ── C03 ── Lê Thị Hương (ABC Construction) → Toolbox A ✓ */
  { id:'w-c03', employeeCode:'NV001103', name:'Lê Thị Hương',      avatarColor:'#F59E0B', company:'ABC Construction', companyCode:'AB-003', role:'Giám sát an toàn',     currentStatus:'completed', currentCourse:'Toolbox A',     courseDate:'24/06', courseStart:'07:30', courseEnd:'09:30', actualTime:'07:25', exceptionMinutes:0,
    courseHistory:[{ id:'cr-c03-1', courseCode:'TB-A-2026-06-24',  courseName:'Toolbox A',    sessionDate:'2026-06-24', startTime:'07:30', endTime:'09:30', zone:'OCP1-A', status:'completed',  sessions:[{in:'07:25', out:'09:31'}], minutesDelta:0 }]},
  /* ── C04 ── Phạm Minh Tuấn (Sunrise Const.) → Toolbox A ✓ */
  { id:'w-c04', employeeCode:'NV001104', name:'Phạm Minh Tuấn',    avatarColor:'#10B981', company:'Sunrise Const.',   companyCode:'SR-005', role:'Công nhân xây dựng',   currentStatus:'completed', currentCourse:'Toolbox A',     courseDate:'24/06', courseStart:'07:30', courseEnd:'09:30', actualTime:'07:28', exceptionMinutes:0,
    courseHistory:[{ id:'cr-c04-1', courseCode:'TB-A-2026-06-24',  courseName:'Toolbox A',    sessionDate:'2026-06-24', startTime:'07:30', endTime:'09:30', zone:'OCP1-A', status:'completed',  sessions:[{in:'07:28', out:'09:30'}], minutesDelta:0 }]},
  /* ── ATTENDING — ca đang diễn ra lúc 11:30 ────────────────── */

  /* ── C05–C08 Cọc nhồi B ● */
  { id:'w-c05', employeeCode:'NV001105', name:'Ngô Văn Tùng',      avatarColor:'#EC4899', company:'Minh Phát JSC',    companyCode:'MP-005', role:'Kỹ sư địa kỹ thuật',   currentStatus:'attending', currentCourse:'Cọc nhồi B',    courseDate:'24/06', courseStart:'08:00', courseEnd:'12:00', actualTime:'07:58', exceptionMinutes:0,
    courseHistory:[{ id:'cr-c05-1', courseCode:'CNTB-2026-06-24',  courseName:'Cọc nhồi B',   sessionDate:'2026-06-24', startTime:'08:00', endTime:'12:00', zone:'OCP1-A', status:'attending',  sessions:[{in:'07:58', out:null}], minutesDelta:0 }]},
  { id:'w-c06', employeeCode:'NV001106', name:'Đinh Thị Mai',      avatarColor:'#3B82F6', company:'Delta Corp',       companyCode:'DC-001', role:'Công nhân cơ khí',      currentStatus:'attending', currentCourse:'Cọc nhồi B',    courseDate:'24/06', courseStart:'08:00', courseEnd:'12:00', actualTime:'07:55', exceptionMinutes:0,
    courseHistory:[{ id:'cr-c06-1', courseCode:'CNTB-2026-06-24',  courseName:'Cọc nhồi B',   sessionDate:'2026-06-24', startTime:'08:00', endTime:'12:00', zone:'OCP1-A', status:'attending',  sessions:[{in:'07:55', out:null}], minutesDelta:0 }]},
  { id:'w-c07', employeeCode:'NV001107', name:'Hoàng Thị Ngọc',    avatarColor:'#F97316', company:'XYZ JSC',          companyCode:'XY-002', role:'Thợ hàn bậc 3',        currentStatus:'attending', currentCourse:'Cọc nhồi B',    courseDate:'24/06', courseStart:'08:00', courseEnd:'12:00', actualTime:'08:00', exceptionMinutes:0,
    courseHistory:[{ id:'cr-c07-1', courseCode:'CNTB-2026-06-24',  courseName:'Cọc nhồi B',   sessionDate:'2026-06-24', startTime:'08:00', endTime:'12:00', zone:'OCP1-A', status:'attending',  sessions:[{in:'08:00', out:null}], minutesDelta:0 }]},
  { id:'w-c08', employeeCode:'NV001108', name:'Bùi Văn Khoa',      avatarColor:'#14B8A6', company:'ABC Construction',  companyCode:'AB-003', role:'Kỹ thuật viên cơ khí', currentStatus:'attending', currentCourse:'Cọc nhồi B',    courseDate:'24/06', courseStart:'08:00', courseEnd:'12:00', actualTime:'07:57', exceptionMinutes:0,
    courseHistory:[{ id:'cr-c08-1', courseCode:'CNTB-2026-06-24',  courseName:'Cọc nhồi B',   sessionDate:'2026-06-24', startTime:'08:00', endTime:'12:00', zone:'OCP1-A', status:'attending',  sessions:[{in:'07:57', out:null}], minutesDelta:0 }]},
  { id:'w-att01', employeeCode:'NV001130', name:'Bùi Văn Thanh',   avatarColor:'#F59E0B', company:'Minh Phát JSC',    companyCode:'MP-005', role:'Thợ xây bậc 3',        currentStatus:'attending', currentCourse:'Cọc nhồi B',    courseDate:'24/06', courseStart:'08:00', courseEnd:'12:00', actualTime:'08:02', exceptionMinutes:0,
    courseHistory:[{ id:'cr-att01-1', courseCode:'CNTB-2026-06-24', courseName:'Cọc nhồi B', sessionDate:'2026-06-24', startTime:'08:00', endTime:'12:00', zone:'OCP1-A', status:'attending', sessions:[{in:'08:02', out:null}], minutesDelta:0 }]},
  { id:'w-att02', employeeCode:'NV001131', name:'Nguyễn Thị Xuân', avatarColor:'#E879F9', company:'Sunrise Const.',   companyCode:'SR-005', role:'Nhân viên hành chính', currentStatus:'attending', currentCourse:'Cọc nhồi B',    courseDate:'24/06', courseStart:'08:00', courseEnd:'12:00', actualTime:'08:05', exceptionMinutes:0,
    courseHistory:[{ id:'cr-att02-1', courseCode:'CNTB-2026-06-24', courseName:'Cọc nhồi B', sessionDate:'2026-06-24', startTime:'08:00', endTime:'12:00', zone:'OCP1-A', status:'attending', sessions:[{in:'08:05', out:null}], minutesDelta:0 }]},

  /* ── C09–C12 PCCC C ● */
  { id:'w-c09', employeeCode:'NV001109', name:'Vũ Thị Thu',        avatarColor:'#A78BFA', company:'Sunrise Const.',    companyCode:'SR-005', role:'Nhân viên an toàn',    currentStatus:'attending', currentCourse:'PCCC C',        courseDate:'24/06', courseStart:'08:00', courseEnd:'12:00', actualTime:'07:52', exceptionMinutes:0,
    courseHistory:[{ id:'cr-c09-1', courseCode:'PCCC-2026-06-24',  courseName:'PCCC C',        sessionDate:'2026-06-24', startTime:'08:00', endTime:'12:00', zone:'OCP1-B', status:'attending',  sessions:[{in:'07:52', out:null}], minutesDelta:0 }]},
  { id:'w-c10', employeeCode:'NV001110', name:'Lý Văn Nam',        avatarColor:'#F43F5E', company:'Minh Phát JSC',    companyCode:'MP-005', role:'Vận hành thiết bị',    currentStatus:'attending', currentCourse:'PCCC C',        courseDate:'24/06', courseStart:'08:00', courseEnd:'12:00', actualTime:'07:58', exceptionMinutes:0,
    courseHistory:[{ id:'cr-c10-1', courseCode:'PCCC-2026-06-24',  courseName:'PCCC C',        sessionDate:'2026-06-24', startTime:'08:00', endTime:'12:00', zone:'OCP1-B', status:'attending',  sessions:[{in:'07:58', out:null}], minutesDelta:0 }]},
  { id:'w-c11', employeeCode:'NV001111', name:'Trịnh Văn Hùng',    avatarColor:'#0EA5E9', company:'Delta Corp',       companyCode:'DC-001', role:'Công nhân điện',        currentStatus:'attending', currentCourse:'PCCC C',        courseDate:'24/06', courseStart:'08:00', courseEnd:'12:00', actualTime:'07:55', exceptionMinutes:0,
    courseHistory:[{ id:'cr-c11-1', courseCode:'PCCC-2026-06-24',  courseName:'PCCC C',        sessionDate:'2026-06-24', startTime:'08:00', endTime:'12:00', zone:'OCP1-B', status:'attending',  sessions:[{in:'07:55', out:null}], minutesDelta:0 }]},
  { id:'w-c12', employeeCode:'NV001112', name:'Đặng Thị Linh',     avatarColor:'#84CC16', company:'XYZ JSC',          companyCode:'XY-002', role:'Giám sát thi công',    currentStatus:'attending', currentCourse:'PCCC C',        courseDate:'24/06', courseStart:'08:00', courseEnd:'12:00', actualTime:'07:59', exceptionMinutes:0,
    courseHistory:[{ id:'cr-c12-1', courseCode:'PCCC-2026-06-24',  courseName:'PCCC C',        sessionDate:'2026-06-24', startTime:'08:00', endTime:'12:00', zone:'OCP1-B', status:'attending',  sessions:[{in:'07:59', out:null}], minutesDelta:0 }]},
  { id:'w-att03', employeeCode:'NV001132', name:'Phạm Văn An',     avatarColor:'#38BDF8', company:'XYZ JSC',          companyCode:'XY-002', role:'Thợ lắp đặt',          currentStatus:'attending', currentCourse:'PCCC C',        courseDate:'24/06', courseStart:'08:00', courseEnd:'12:00', actualTime:'08:01', exceptionMinutes:0,
    courseHistory:[{ id:'cr-att03-1', courseCode:'PCCC-2026-06-24', courseName:'PCCC C', sessionDate:'2026-06-24', startTime:'08:00', endTime:'12:00', zone:'OCP1-B', status:'attending', sessions:[{in:'08:01', out:null}], minutesDelta:0 }]},
  { id:'w-att04', employeeCode:'NV001133', name:'Trần Minh Khang', avatarColor:'#2DD4BF', company:'Sunrise Const.',   companyCode:'SR-005', role:'Vận hành máy',         currentStatus:'attending', currentCourse:'PCCC C',        courseDate:'24/06', courseStart:'08:00', courseEnd:'12:00', actualTime:'08:03', exceptionMinutes:0,
    courseHistory:[{ id:'cr-att04-1', courseCode:'PCCC-2026-06-24', courseName:'PCCC C', sessionDate:'2026-06-24', startTime:'08:00', endTime:'12:00', zone:'OCP1-B', status:'attending', sessions:[{in:'08:03', out:null}], minutesDelta:0 }]},

  /* ── Điện cơ E (11:30–13:30, vừa bắt đầu) ────── */
  /* ── A01 ── Cao Thị Bích (Delta Corp) → Điện cơ E ● */
  { id:'w-a01', employeeCode:'NV001201', name:'Cao Thị Bích',      avatarColor:'#06B6D4', company:'Delta Corp',       companyCode:'DC-001', role:'Kỹ thuật điện',         currentStatus:'attending', currentCourse:'Điện cơ E',     courseDate:'24/06', courseStart:'11:30', courseEnd:'13:30', actualTime:'11:28', exceptionMinutes:0,
    courseHistory:[{ id:'cr-a01-1', courseCode:'DCE-2026-06-24',   courseName:'Điện cơ E',    sessionDate:'2026-06-24', startTime:'11:30', endTime:'13:30', zone:'OCP1-B', status:'attending', sessions:[{in:'11:28', out:null}],                                          minutesDelta:0 }]},
  /* ── A02 ── Nguyễn Văn Phú (ABC Construction) → Điện cơ E ● */
  { id:'w-a02', employeeCode:'NV001202', name:'Nguyễn Văn Phú',    avatarColor:'#F59E0B', company:'ABC Construction', companyCode:'AB-003', role:'Thợ điện bậc 3',        currentStatus:'attending', currentCourse:'Điện cơ E',     courseDate:'24/06', courseStart:'11:30', courseEnd:'13:30', actualTime:'11:30', exceptionMinutes:0,
    courseHistory:[{ id:'cr-a02-1', courseCode:'DCE-2026-06-24',   courseName:'Điện cơ E',    sessionDate:'2026-06-24', startTime:'11:30', endTime:'13:30', zone:'OCP1-B', status:'attending', sessions:[{in:'11:30', out:null}],                                          minutesDelta:0 }]},
  /* ── A03 ── Trần Minh Đức (XYZ JSC) → Điện cơ E ● (late) */
  { id:'w-a03', employeeCode:'NV001203', name:'Trần Minh Đức',     avatarColor:'#F97316', company:'XYZ JSC',          companyCode:'XY-002', role:'Công nhân điện',         currentStatus:'late',      currentCourse:'Điện cơ E',     courseDate:'24/06', courseStart:'11:30', courseEnd:'13:30', actualTime:'11:47', exceptionMinutes:17,
    courseHistory:[{ id:'cr-a03-1', courseCode:'DCE-2026-06-24',   courseName:'Điện cơ E',    sessionDate:'2026-06-24', startTime:'11:30', endTime:'13:30', zone:'OCP1-B', status:'late',      sessions:[{in:'11:47', out:null}],                                          minutesDelta:17}]},
  /* ── A04 ── Lê Thị Phương (Sunrise Const.) → Điện cơ E ● */
  { id:'w-a04', employeeCode:'NV001204', name:'Lê Thị Phương',     avatarColor:'#A78BFA', company:'Sunrise Const.',   companyCode:'SR-005', role:'Giám sát thi công',     currentStatus:'attending', currentCourse:'Điện cơ E',     courseDate:'24/06', courseStart:'11:30', courseEnd:'13:30', actualTime:'11:29', exceptionMinutes:0,
    courseHistory:[{ id:'cr-a04-1', courseCode:'DCE-2026-06-24',   courseName:'Điện cơ E',    sessionDate:'2026-06-24', startTime:'11:30', endTime:'13:30', zone:'OCP1-B', status:'attending', sessions:[{in:'11:29', out:null}],                                          minutesDelta:0 }]},
  /* ── A05 ── Vũ Minh Khải (Minh Phát JSC) → Điện cơ E ↯ tạm vắng */
  /* Checked in 11:33, left 11:58, session still ongoing → outcome TBD */
  { id:'w-a05', employeeCode:'NV001205', name:'Vũ Minh Khải',      avatarColor:'#06B6D4', company:'Minh Phát JSC',   companyCode:'MP-005', role:'Kỹ thuật điện',          currentStatus:'away',      currentCourse:'Điện cơ E',     courseDate:'24/06', courseStart:'11:30', courseEnd:'13:30', actualTime:'11:33', exceptionMinutes:0,
    courseHistory:[{ id:'cr-a05-1', courseCode:'DCE-2026-06-24',   courseName:'Điện cơ E',    sessionDate:'2026-06-24', startTime:'11:30', endTime:'13:30', zone:'OCP1-B', status:'away',      flags:['late'], sessions:[{in:'11:33', out:'11:58'}],                                       minutesDelta:3 }]},
]

const INITIAL_COUNT = 8
const BATCH_SIZE    = 6

/* ─────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────── */

/** Locate the CourseRecord for the attendee's current session. */
function getCurrentRecord(s: TrainingAttendee): CourseRecord | undefined {
  const [dd, mm] = s.courseDate.split('/')
  const isoDate = `2026-${mm}-${dd}`
  return s.courseHistory.find(r => r.courseName === s.currentCourse && r.sessionDate === isoDate)
}

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function wasLateArrival(sessions: AttendanceSession[], startTime: string): boolean {
  const firstIn = sessions[0]?.in
  return !!firstIn && timeToMin(firstIn) > timeToMin(startTime)
}

/** Resolve secondary flags — uses API `flags` or derives late from first check-in. */
function resolveFlags(r: CourseRecord): AttendanceStatus[] {
  const fromApi = r.flags ?? []
  if (fromApi.length > 0) return fromApi.filter(f => f !== r.status)
  if (r.status !== 'late' && r.status !== 'absent' && wasLateArrival(r.sessions, r.startTime)) {
    return ['late']
  }
  return []
}

/** Chronological badge order — sự kiện xảy ra trước hiển thị trước (late = lúc check-in). */
const BADGE_ORDER: AttendanceStatus[] = [
  'late',
  'attending',
  'away',
  'left-early',
  'skipped',
  'insufficient',
  'completed',
  'absent',
]

function sortBadgesChronological(badges: AttendanceStatus[]): AttendanceStatus[] {
  return [...new Set(badges)].sort((a, b) => BADGE_ORDER.indexOf(a) - BADGE_ORDER.indexOf(b))
}

/** All badges to render for one course record (primary + secondary), chronological order. */
export function getAttendanceBadges(r: CourseRecord): AttendanceStatus[] {
  if (r.status === 'absent') return ['absent']
  if (r.status === 'late') return ['late']
  const flags = resolveFlags(r)
  const all = flags.length ? [r.status, ...flags] : [r.status]
  return sortBadgesChronological(all)
}

export function getAttendeeBadges(s: TrainingAttendee): AttendanceStatus[] {
  const rec = getCurrentRecord(s)
  return rec ? getAttendanceBadges(rec) : [s.currentStatus]
}

/** Có ngoại lệ điểm danh (đi trễ, về sớm, bỏ học, vắng mặt, thiếu giờ, …) */
export function attendeeHasException(s: TrainingAttendee): boolean {
  return getAttendeeBadges(s).some(b => EXCEPTION_ATTENDANCE_STATUSES.includes(b))
}

/** Format in/out for display — `…` only while session is still ongoing. */
function formatSessionTime(sess: AttendanceSession, endTime: string, sessionFinished: boolean): string {
  if (sess.out) return `${sess.in}–${sess.out}`
  if (!sessionFinished) return `${sess.in}–…`
  return `${sess.in}–${endTime}`
}

/** One-line in/out times shown in the event listing row (detail in playback). */
export function getAttendanceDetailLine(s: TrainingAttendee): string {
  if (s.currentStatus === 'absent') return ''
  const rec = getCurrentRecord(s)
  if (!rec || rec.sessions.length === 0) return ''
  const finished = getSessionStatus(s.courseStart, s.courseEnd) === 'finished'
  return rec.sessions.map(sess => formatSessionTime(sess, rec.endTime, finished)).join(' · ')
}

function attendanceDetailLine(s: TrainingAttendee): string {
  return getAttendanceDetailLine(s)
}

/** Session time chain — same format as Sự kiện listing. */
export function formatRecordSessions(r: CourseRecord): string {
  if (r.sessions.length === 0) return '—'
  const finished = getSessionStatus(r.startTime, r.endTime) === 'finished'
  return r.sessions.map(s => formatSessionTime(s, r.endTime, finished)).join(' · ')
}

function attendeeCourseMeta(s: TrainingAttendee): string {
  return formatCourseMeta(s.courseStart, s.courseEnd, s.courseDate, getCourseZone(s.currentCourse))
}

function recordCourseMeta(r: CourseRecord): string {
  return formatCourseMeta(r.startTime, r.endTime, r.sessionDate, r.zone)
}

/* ─────────────────────────────────────────────────────────────
   UI ATOMS
───────────────────────────────────────────────────────────── */
export { Avatar }

export function StatusBadge({ status, small }: { status: AttendanceStatus; small?: boolean }) {
  const cfg = statusConfig[status]
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

export function StatusBadges({ badges, small }: { badges: AttendanceStatus[]; small?: boolean }) {
  return (
    <div className="flex flex-wrap gap-0.5">
      {badges.map(b => (
        <StatusBadge key={b} status={b} small={small} />
      ))}
    </div>
  )
}

export function SessionBadge({ courseStart, courseEnd, small }: { courseStart: string; courseEnd: string; small?: boolean }) {
  const ss  = getSessionStatus(courseStart, courseEnd)
  const cfg = sessionStatusConfig[ss]
  return (
    <span className={cn(
      'font-bold rounded whitespace-nowrap inline-flex items-center gap-1',
      small ? 'text-[8px] px-1 py-0.5' : 'text-[9px] px-1.5 py-0.5',
      cfg.color, cfg.bg,
    )}>
      {cfg.pulse && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />}
      {cfg.label}
    </span>
  )
}

/* ─────────────────────────────────────────────────────────────
   STUDENT LIST
───────────────────────────────────────────────────────────── */
/* Columns: avatar | học viên | nhà thầu | khoá học + trạng thái lớp | trạng thái điểm danh | play */
const LIST_COLS = 'grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_24px]'

interface StudentListProps {
  students: TrainingAttendee[]
  tab: EventTabKey
  onTabChange: (t: EventTabKey) => void
  onSelect: (s: TrainingAttendee) => void
  onSelectContractor: (company: string) => void
  onPlayback: (ev: TrainingEvent) => void
}

function StudentList({ students, tab, onTabChange, onSelect, onSelectContractor, onPlayback }: StudentListProps) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT)
  const [loading, setLoading]           = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setVisibleCount(INITIAL_COUNT) }, [tab, students])

  const visible = students.slice(0, visibleCount)
  const hasMore = visibleCount < students.length

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || loading) return
        setLoading(true)
        setTimeout(() => { setVisibleCount(c => c + BATCH_SIZE); setLoading(false) }, 350)
      },
      { threshold: 0.1 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loading])

  const counts = TABS.reduce<Record<string, number>>((acc, t) => {
    acc[t.key] = TRAINING_ATTENDEES.filter(s => matchesTab(s, t.key)).length
    return acc
  }, {})

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Tabs */}
      <div className="flex border-b border-[#1e2433] shrink-0 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => onTabChange(t.key)}
            className={cn(
              'px-3 py-2 text-[10px] font-medium whitespace-nowrap transition-colors border-b-2 -mb-px',
              tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            {counts[t.key] > 0 && (
              <span className={cn(
                'ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold',
                tab === t.key ? 'bg-primary/20 text-primary' : 'bg-[#1a2235] text-muted-foreground',
              )}>
                {counts[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Sticky column headers */}
      <div className={cn(
        'grid gap-x-2 px-3 py-2 border-b border-[#1e2433] shrink-0 sticky top-0 z-10',
        'bg-[#0b0f1a]',
        LIST_COLS,
      )}>
        <div />
        {['Học viên', 'Nhà thầu', 'Khoá học', 'Điểm danh', ''].map(h => (
          <span key={h} className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</span>
        ))}
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#1e2433]">
        {students.length === 0 && (
          <div className="flex items-center justify-center h-24">
            <p className="text-[11px] text-muted-foreground">Không có dữ liệu</p>
          </div>
        )}

        {visible.map(s => (
          <div
            key={s.id}
            onClick={() => onSelect(s)}
            className={cn('grid gap-x-2 items-center px-3 py-2.5 cursor-pointer hover:bg-[#1a2235]/50 transition-colors group', LIST_COLS)}
          >
            <Avatar name={s.name} color={s.avatarColor} src={getAttendeeAvatarUrl(s.id, s.name)} size="sm" />

            <div className="min-w-0">
              <TruncateText as="p" className="text-[10px] font-semibold text-foreground leading-tight">{s.name}</TruncateText>
              <TruncateText as="p" className="text-[9px] text-muted-foreground/60">{s.role}</TruncateText>
            </div>

            <button
              onClick={e => { e.stopPropagation(); onSelectContractor(s.company) }}
              className="min-w-0 text-left"
              title={`${s.company} (${s.companyCode})`}
            >
              <TruncateText as="p" className="text-[10px] text-primary/75 hover:text-primary transition-colors hover:underline underline-offset-2 decoration-dotted">
                {s.company}
              </TruncateText>
              <p className="text-[8px] text-muted-foreground/40">{s.companyCode}</p>
            </button>

            {/* Khoá học + trạng thái buổi học */}
            <div className="min-w-0">
              <TruncateText as="p" className="text-[10px] font-semibold text-foreground leading-tight">{s.currentCourse}</TruncateText>
              <TruncateText as="p" className="text-[9px] text-muted-foreground/70 mt-0.5 leading-snug" title={attendeeCourseMeta(s)}>
                {attendeeCourseMeta(s)}
              </TruncateText>
              <div className="mt-0.5">
                <SessionBadge courseStart={s.courseStart} courseEnd={s.courseEnd} small />
              </div>
            </div>

            {/* Điểm danh — primary + flags */}
            <div className="min-w-0">
              {(() => {
                const badges = getAttendeeBadges(s)
                const primary = badges[0]
                return (
                  <>
                    <StatusBadges badges={badges} small />
                    <TruncateText
                      as="p"
                      className={cn('text-[9px] mt-0.5', statusConfig[primary].color + '/80')}
                      title={attendanceDetailLine(s)}
                    >
                      {attendanceDetailLine(s)}
                    </TruncateText>
                  </>
                )
              })()}
            </div>

            <button
              onClick={e => {
                e.stopPropagation()
                const ev = buildTrainingPlaybackEvent(s)
                if (ev) onPlayback(ev)
              }}
              className="p-1 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
              title="Xem lại video"
            >
              <Play className="w-3 h-3" />
            </button>
          </div>
        ))}

        {hasMore && (
          <div ref={sentinelRef} className="flex items-center justify-center py-3">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" /> : <div className="h-3.5" />}
          </div>
        )}

        {!hasMore && students.length > 0 && (
          <div className="flex items-center justify-center py-3">
            <span className="text-[9px] text-muted-foreground/35">— {students.length} sự kiện —</span>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   SHARED: completion stats bar
───────────────────────────────────────────────────────────── */
const STATUS_ORDER: CourseStatus[] = [
  /* real-time */ 'attending', 'away', 'late', 'absent',
  /* finalized */ 'completed', 'left-early', 'skipped', 'insufficient',
]
const statusDot: Record<CourseStatus, string> = {
  attending:    'bg-sky-400',
  away:         'bg-cyan-400',
  late:         'bg-orange-400',
  absent:       'bg-gray-500',
  completed:    'bg-green-400',
  'left-early': 'bg-red-400',
  skipped:      'bg-purple-400',
  insufficient: 'bg-amber-400',
}

interface CompletionStatsProps { records: CourseRecord[] }
function CompletionStats({ records }: CompletionStatsProps) {
  const total = records.length
  if (total === 0) return null
  const by = STATUS_ORDER.reduce<Record<CourseStatus, number>>(
    (acc, s) => { acc[s] = records.filter(r => r.status === s).length; return acc },
    { attending: 0, away: 0, late: 0, absent: 0, completed: 0, 'left-early': 0, skipped: 0, insufficient: 0 },
  )
  const rate = Math.round((by.completed / total) * 100)

  return (
    <div className="px-3 py-2.5 border-b border-[#1e2433] bg-[#0a0e1a]">
      {/* Progress bar */}
      <div className="flex h-1.5 rounded-full overflow-hidden bg-[#1e2433] mb-2">
        {STATUS_ORDER.map(s => by[s] > 0 && (
          <div
            key={s}
            className={cn('h-full', statusDot[s])}
            style={{ width: `${(by[s] / total) * 100}%` }}
          />
        ))}
      </div>
      {/* Stat pills */}
      <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
        <span className="text-[9px] font-semibold text-foreground/70">
          Tổng {total} buổi · Hoàn thành <span className="text-green-400">{rate}%</span>
        </span>
        {STATUS_ORDER.filter(s => by[s] > 0).map(s => (
          <span key={s} className="flex items-center gap-1 text-[9px]">
            <span className={cn('w-1.5 h-1.5 rounded-full', statusDot[s])} />
            <span className="text-muted-foreground/70">{courseStatusConfig[s].label}</span>
            <span className={cn('font-semibold', courseStatusConfig[s].color)}>{by[s]}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   SHARED: course history table
───────────────────────────────────────────────────────────── */
/* Columns: Khoá học | Trạng thái+detail | play */
const HIST_COLS = 'grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_20px]'

interface CourseHistoryTableProps {
  records: CourseRecord[]
  worker: Pick<TrainingAttendee, 'id' | 'name' | 'employeeCode' | 'company' | 'companyCode' | 'role'>
  onPlayback: (ev: TrainingEvent) => void
}
function CourseHistoryTable({ records, worker, onPlayback }: CourseHistoryTableProps) {
  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className={cn('grid gap-x-2 px-3 py-1.5 sticky top-0 z-10 bg-[#0b0f1a] border-b border-[#1e2433]', HIST_COLS)}>
        {['Khoá học', 'Trạng thái · Chi tiết', ''].map(h => (
          <span key={h} className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide truncate">{h}</span>
        ))}
      </div>

      <div className="divide-y divide-[#1e2433]/60">
        {records.map(r => {
          const badges = getAttendanceBadges(r)
          const primary = badges[0]
          const cfg = courseStatusConfig[primary]
          return (
            <div key={r.id} className={cn('grid gap-x-2 items-center px-3 py-2 group hover:bg-[#1a2235]/30 transition-colors', HIST_COLS)}>
              <div className="min-w-0 flex items-start gap-1.5">
                <span className={cn('w-1.5 h-1.5 rounded-full shrink-0 mt-1', statusDot[primary])} />
                <div className="min-w-0">
                  <TruncateText as="p" className="text-[10px] font-semibold text-foreground leading-snug">{r.courseName}</TruncateText>
                  <TruncateText as="p" className="text-[9px] text-muted-foreground/70 mt-0.5 leading-snug" title={recordCourseMeta(r)}>
                    {recordCourseMeta(r)}
                  </TruncateText>
                </div>
              </div>
              <div className="min-w-0">
                <StatusBadges badges={badges} small />
                <TruncateText
                  as="p"
                  className={cn('text-[9px] mt-0.5', cfg.color, 'opacity-80')}
                  title={formatRecordSessions(r)}
                >
                  {formatRecordSessions(r)}
                </TruncateText>
              </div>
              <button
                onClick={() => onPlayback(buildTrainingPlaybackEventFromRecord(r, worker))}
                className="p-0.5 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
              >
                <Play className="w-2.5 h-2.5" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   STUDENT DETAIL
───────────────────────────────────────────────────────────── */
interface StudentDetailProps {
  student: TrainingAttendee
  backLabel?: string
  onBack: () => void
  onPlayback: (ev: TrainingEvent) => void
}

function StudentDetail({ student, backLabel = 'Danh sách', onBack, onPlayback }: StudentDetailProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Back nav */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1e2433] shrink-0">
        <button onClick={onBack} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          {backLabel}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Identity card */}
        <div className="flex items-start gap-3 px-3 py-3 border-b border-[#1e2433]">
          <Avatar name={student.name} color={student.avatarColor} src={getAttendeeAvatarUrl(student.id, student.name)} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-foreground leading-tight">{student.name}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{student.company} · {student.role}</p>
            <p className="text-[9px] text-muted-foreground/50">{student.employeeCode}</p>
          </div>
        </div>

        {/* Completion stats */}
        <CompletionStats records={student.courseHistory} />

        {/* Course history table */}
        <div className="pt-2">
          <div className="flex items-center gap-1.5 px-3 pb-1.5">
            <BookOpen className="w-3 h-3 text-muted-foreground" />
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Lịch sử khoá học</span>
          </div>
          <CourseHistoryTable
            records={student.courseHistory}
            worker={{
              id: student.id,
              name: student.name,
              employeeCode: student.employeeCode,
              company: student.company,
              companyCode: student.companyCode,
              role: student.role,
            }}
            onPlayback={onPlayback}
          />
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   CONTRACTOR DETAIL
───────────────────────────────────────────────────────────── */
interface ContractorDetailProps {
  company: string
  onBack: () => void
  onSelectStudent: (s: TrainingAttendee) => void
}

function ContractorDetail({ company, onBack, onSelectStudent }: ContractorDetailProps) {
  const workers     = TRAINING_ATTENDEES.filter(s => s.company === company)
  const allRecords  = workers.flatMap(s => s.courseHistory)

  /* Columns: avatar | học viên | khoá học hôm nay | ngoại lệ + giờ */
  const WORKER_COLS = 'grid-cols-[28px_minmax(0,1fr)_minmax(0,1.2fr)_auto]'

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1e2433] shrink-0">
        <button onClick={onBack} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Danh sách
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Company header */}
        <div className="flex items-start gap-3 px-3 py-3 border-b border-[#1e2433]">
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-primary/60" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-foreground">{company}</p>
            <p className="text-[9px] text-muted-foreground/50">
              {workers[0]?.companyCode} · {workers.length} học viên hôm nay
            </p>
          </div>
        </div>

        {/* Aggregate completion stats across ALL course records of this contractor */}
        <CompletionStats records={allRecords} />

        {/* Worker listing */}
        <div className="flex flex-col min-h-0">
          {/* Sticky header */}
          <div className={cn('grid gap-x-2 px-3 py-1.5 sticky top-0 z-10 bg-[#0b0f1a] border-b border-[#1e2433] shrink-0', WORKER_COLS)}>
            <div />
            {['Học viên', 'Khoá học', 'Điểm danh'].map(h => (
              <span key={h} className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide truncate">{h}</span>
            ))}
          </div>

          <div className="divide-y divide-[#1e2433]/60 overflow-y-auto">
            {workers.map(s => (
              <div
                key={s.id}
                onClick={() => onSelectStudent(s)}
                className={cn('grid gap-x-2 items-center px-3 py-2.5 cursor-pointer hover:bg-[#1a2235]/50 transition-colors group', WORKER_COLS)}
              >
                <Avatar name={s.name} color={s.avatarColor} src={getAttendeeAvatarUrl(s.id, s.name)} size="sm" />

                <div className="min-w-0">
                  <TruncateText as="p" className="text-[10px] font-semibold text-foreground">{s.name}</TruncateText>
                  <TruncateText as="p" className="text-[9px] text-muted-foreground/60">{s.role}</TruncateText>
                </div>

                <div className="min-w-0">
                  <TruncateText as="p" className="text-[10px] font-semibold text-foreground">{s.currentCourse}</TruncateText>
                  <TruncateText as="p" className="text-[9px] text-muted-foreground/70 mt-0.5 leading-snug" title={attendeeCourseMeta(s)}>
                    {attendeeCourseMeta(s)}
                  </TruncateText>
                </div>

                <div className="shrink-0 text-right">
                  {(() => {
                    const badges = getAttendeeBadges(s)
                    const primary = badges[0]
                    return (
                      <>
                        <div className="flex flex-wrap gap-0.5 justify-end">
                          <StatusBadges badges={badges} small />
                        </div>
                        <p className={cn('text-[9px] mt-0.5', statusConfig[primary].color + '/80')}>
                          {attendanceDetailLine(s)}
                        </p>
                      </>
                    )
                  })()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   MAIN EXPORT
───────────────────────────────────────────────────────────── */
interface TrainingEventTableProps {
  onSelectEvent?: (event: TrainingEvent) => void
  onPlayback?: (event: TrainingEvent) => void
  selectedId?: string
}

type View =
  | { kind: 'list' }
  | { kind: 'contractor'; company: string }
  | { kind: 'student'; student: TrainingAttendee; from: 'list' | 'contractor'; company?: string }

export function TrainingEventTable({ onPlayback }: TrainingEventTableProps) {
  const [tab, setTab]   = useState<EventTabKey>('all')
  const [view, setView] = useState<View>({ kind: 'list' })

  const students = TRAINING_ATTENDEES
    .filter(s => matchesTab(s, tab))
    .sort((a, b) => {
      const aLive = getSessionStatus(a.courseStart, a.courseEnd) === 'in-session' ? 0 : 1
      const bLive = getSessionStatus(b.courseStart, b.courseEnd) === 'in-session' ? 0 : 1
      return aLive - bLive
    })
  const handlePlayback = (ev: TrainingEvent) => onPlayback?.(ev)

  if (view.kind === 'student') {
    return (
      <StudentDetail
        student={view.student}
        backLabel={view.from === 'contractor' ? view.company : 'Danh sách'}
        onBack={() => view.from === 'contractor'
          ? setView({ kind: 'contractor', company: view.company! })
          : setView({ kind: 'list' })}
        onPlayback={handlePlayback}
      />
    )
  }

  if (view.kind === 'contractor') {
    return (
      <ContractorDetail
        company={view.company}
        onBack={() => setView({ kind: 'list' })}
        onSelectStudent={s => setView({ kind: 'student', student: s, from: 'contractor', company: view.company })}
      />
    )
  }

  return (
    <StudentList
      students={students}
      tab={tab}
      onTabChange={setTab}
      onSelect={s => setView({ kind: 'student', student: s, from: 'list' })}
      onSelectContractor={company => setView({ kind: 'contractor', company })}
      onPlayback={handlePlayback}
    />
  )
}
