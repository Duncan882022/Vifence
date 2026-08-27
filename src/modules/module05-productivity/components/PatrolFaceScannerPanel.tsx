import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Camera,
  CheckCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import {
  fetchPatrolEnrollSession,
  fetchPatrolScanEnrollment,
  pingPatrolProfileBackend,
  scanPatrolEnrollSessionFace,
  scanPatrolWorkerFace,
  type PatrolScanEnrollment,
  type PatrolWorkerPerson,
} from '../services/patrolWorkerProfile.service'
import { usePatrolAutoFaceScan } from '../hooks/usePatrolAutoFaceScan'
import { guidanceForSlot } from '../utils/patrolFaceScanGuide'

interface PatrolFaceScannerPanelProps {
  /** Quét bổ sung vector cho hồ sơ đã có (HR / tra mã). */
  person?: PatrolWorkerPerson
  /** Phiên quét tự phục vụ — chưa có hồ sơ. */
  sessionId?: string
  subtitle?: string
  onEnrollmentChange?: (enrollment: PatrolScanEnrollment) => void
  /** Gọi khi đủ 3 góc (phiên tự phục vụ). */
  onScanComplete?: (enrollment: PatrolScanEnrollment) => void
}

function FaceScanProgressRing({
  progress,
  poseMatched,
  capturing,
  complete,
}: {
  progress: number
  poseMatched: boolean
  capturing: boolean
  complete: boolean
}) {
  const clamped = Math.max(0, Math.min(1, progress))
  const dash = 100 - clamped * 100
  const ringColor = complete
    ? '#4ade80'
    : capturing
      ? '#38bdf8'
      : poseMatched
        ? '#4ade80'
        : 'rgba(74,222,128,0.35)'

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <ellipse
        cx="50"
        cy="50"
        rx="21"
        ry="28"
        fill="none"
        stroke="rgba(255,255,255,0.1)"
        strokeWidth="1"
      />
      <ellipse
        cx="50"
        cy="50"
        rx="21"
        ry="28"
        fill="none"
        stroke={ringColor}
        strokeWidth="2.2"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray="100"
        strokeDashoffset={dash}
        transform="rotate(-90 50 50)"
        style={{
          transition: 'stroke-dashoffset 0.45s ease, stroke 0.25s ease',
          filter: poseMatched || complete ? 'drop-shadow(0 0 4px rgba(74,222,128,0.6))' : undefined,
        }}
      />
    </svg>
  )
}

export function PatrolFaceScannerPanel({
  person,
  sessionId,
  subtitle,
  onEnrollmentChange,
  onScanComplete,
}: PatrolFaceScannerPanelProps) {
  const isSession = Boolean(sessionId)
  const subjectKey = sessionId ?? person?.pers_id ?? ''

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [backendOnline, setBackendOnline] = useState<boolean | null>(null)
  const [enrollment, setEnrollment] = useState<PatrolScanEnrollment | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [panelError, setPanelError] = useState<string | null>(null)

  const handleEnrollment = useCallback((next: PatrolScanEnrollment) => {
    setEnrollment(next)
    onEnrollmentChange?.(next)
    if (next.complete) onScanComplete?.(next)
  }, [onEnrollmentChange, onScanComplete])

  const submitScan = useCallback(async (imageB64: string, slot: number) => {
    if (isSession) {
      return scanPatrolEnrollSessionFace(sessionId!, imageB64, slot)
    }
    return scanPatrolWorkerFace(person!.pers_id, imageB64, slot)
  }, [isSession, sessionId, person])

  const autoScan = usePatrolAutoFaceScan(
    videoRef,
    submitScan,
    enrollment,
    cameraReady && backendOnline === true && Boolean(subjectKey),
    handleEnrollment,
  )

  const refreshStatus = useCallback(async () => {
    if (!subjectKey) return
    setLoading(true)
    setPanelError(null)
    try {
      const online = await pingPatrolProfileBackend()
      setBackendOnline(online)
      if (!online) {
        setPanelError('Không kết nối backend tuần tra. Kiểm tra URL backend AI.')
        return
      }
      const status = isSession
        ? await fetchPatrolEnrollSession(sessionId!)
        : await fetchPatrolScanEnrollment(person!.pers_id)
      handleEnrollment(status)
    } catch (err) {
      setBackendOnline(false)
      setPanelError(err instanceof Error ? err.message : 'Không tải được trạng thái quét.')
    } finally {
      setLoading(false)
    }
  }, [subjectKey, isSession, sessionId, person, handleEnrollment])

  const startCamera = useCallback(async () => {
    setCameraError(null)
    setCameraReady(false)
    try {
      streamRef.current?.getTracks().forEach(track => track.stop())
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      await video.play()
      setCameraReady(true)
    } catch {
      setCameraError('Không mở được camera. Cho phép quyền camera trên trình duyệt.')
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
    void startCamera()
    return () => {
      streamRef.current?.getTracks().forEach(track => track.stop())
    }
  }, [refreshStatus, startCamera, subjectKey])

  const poses = enrollment?.poses ?? [
    { slot: 1, label: 'Chính diện', captured: false },
    { slot: 2, label: 'Nghiêng trái', captured: false },
    { slot: 3, label: 'Nghiêng phải', captured: false },
  ]
  const capturedCount = enrollment?.faces_captured ?? 0
  const complete = enrollment?.complete ?? false
  const displayName = person?.full_name ?? person?.display_name
  const defaultSubtitle = subtitle ?? (
    isSession
      ? 'Đưa mặt vào khung tròn, làm theo hướng dẫn trên màn hình — hệ thống tự quét, không cần bấm nút.'
      : `Quét 3 góc mặt cho ${displayName} (${person?.employee_code ?? person?.pers_id}) — `
        + 'đưa mặt vào khung và làm theo chữ trên màn hình.'
  )

  const showError = panelError ?? autoScan.error

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">
            Quét khuôn mặt tuần tra
          </h2>
          <p className="text-[11px] text-muted-foreground mt-1 max-w-xl">{defaultSubtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => void refreshStatus()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 text-foreground hover:bg-white/10 border border-white/10 transition-colors shrink-0 self-start"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Làm mới
        </button>
      </div>

      {(autoScan.successFlash || complete) && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-green-500/25 bg-green-500/10 text-green-400 text-xs">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>
            {complete
              ? isSession
                ? 'Đủ vector — nhấn Tiếp tục bên dưới để nhập thông tin.'
                : 'Hoàn thành — hồ sơ sẵn sàng nhận diện trên Module 05.'
              : autoScan.successFlash}
          </span>
        </div>
      )}
      {showError && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-red-500/25 bg-red-500/10 text-red-400 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{showError}</span>
          {autoScan.error && (
            <button type="button" onClick={autoScan.retry} className="text-[10px] underline shrink-0">
              Thử lại
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-4">
        <div className="relative aspect-[4/3] rounded-xl overflow-hidden border border-[#1e2433] bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
          />

          <FaceScanProgressRing
            progress={autoScan.ringProgress}
            poseMatched={autoScan.poseMatched}
            capturing={autoScan.capturing}
            complete={complete}
          />

          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div
              className={cn(
                'w-[42%] aspect-[3/4] rounded-[999px] transition-colors duration-300',
                'border-2 shadow-[0_0_0_9999px_rgba(0,0,0,0.38)]',
                complete
                  ? 'border-green-400/80'
                  : autoScan.poseMatched
                    ? 'border-green-400/70'
                    : autoScan.faceDetected
                      ? 'border-sky-400/45'
                      : 'border-white/25',
              )}
            />
          </div>

          <div className="absolute inset-x-0 bottom-0 p-4 pt-10 bg-gradient-to-t from-black/85 via-black/50 to-transparent pointer-events-none">
            <p className={cn(
              'text-center font-bold leading-snug',
              complete ? 'text-green-400 text-base' : 'text-white text-sm sm:text-base',
            )}>
              {complete ? '✓ Xong rồi!' : autoScan.guidance}
            </p>
            {!complete && (
              <p className="text-center text-[10px] text-white/55 mt-1.5">
                {guidanceForSlot(autoScan.activeSlot)}
              </p>
            )}
          </div>

          <div className="absolute left-3 top-3 flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/55 border border-white/10 text-[10px]">
            <Camera className="w-3 h-3 text-violet-400" />
            <span className={cameraReady ? 'text-green-400' : 'text-amber-400'}>
              {cameraReady ? 'Tự quét' : 'Đang mở camera…'}
            </span>
          </div>

          {autoScan.capturing && (
            <div className="absolute right-3 top-3 flex items-center gap-1.5 px-2 py-1 rounded-md bg-sky-500/20 border border-sky-400/30 text-[10px] text-sky-300">
              <Loader2 className="w-3 h-3 animate-spin" />
              Đang lưu…
            </div>
          )}

          {cameraError && (
            <div className="absolute inset-x-3 bottom-20 p-2 rounded-lg bg-red-500/15 border border-red-500/30 text-[10px] text-red-300 pointer-events-none">
              {cameraError}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-[#1e2433] bg-[#0b0f1a] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Vòng tròn xanh</span>
              <span className={cn('text-[10px] font-bold tabular-nums', complete ? 'text-green-400' : 'text-green-400/90')}>
                {capturedCount}/{enrollment?.faces_required ?? 3}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Chỉ cần đưa mặt vào khung và làm theo chữ trên màn hình. Hệ thống tự quét — không cần bấm nút.
            </p>
            <ol className="space-y-2">
              {poses.map((pose, idx) => {
                const active = pose.slot === autoScan.activeSlot && !complete && !pose.captured
                const done = pose.captured
                return (
                  <li
                    key={pose.slot}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-lg border text-[11px] transition-colors',
                      done && 'border-green-500/30 bg-green-500/10',
                      active && !done && 'border-green-400/40 bg-green-400/10',
                      !done && !active && 'border-[#1e2433] bg-[#0a0e17]/50',
                    )}
                  >
                    <span className={cn(
                      'w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0',
                      done ? 'bg-green-400 text-[#0a0e17]' : active ? 'bg-green-400/20 text-green-400 ring-1 ring-green-400/50' : 'bg-[#1e2433] text-muted-foreground',
                    )}>
                      {done ? '✓' : idx + 1}
                    </span>
                    <span className={cn('font-medium flex-1', done && 'text-green-400')}>{pose.label}</span>
                    {active && !done && (
                      <span className="text-[8px] text-green-400 animate-pulse shrink-0">Đang quét</span>
                    )}
                  </li>
                )
              })}
            </ol>
          </div>

          {!isSession && !complete && (
            <p className="text-[10px] text-muted-foreground leading-relaxed px-1">
              Vector embedding dùng chung engine nhận diện tuần tra (SFace).
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
