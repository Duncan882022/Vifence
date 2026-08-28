import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Camera,
  CheckCircle,
  Loader2,
  RefreshCw,
  ScanFace,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { captureFaceEnrollmentFrameBase64 } from '../utils/patrolFaceCapture'
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
  person?: PatrolWorkerPerson
  sessionId?: string
  subtitle?: string
  onEnrollmentChange?: (enrollment: PatrolScanEnrollment) => void
  onScanComplete?: (enrollment: PatrolScanEnrollment) => void
}

function FaceScanProgressRing({
  stepProgress,
  holdProgress,
  poseMatched,
  capturing,
  complete,
}: {
  stepProgress: number
  holdProgress: number
  poseMatched: boolean
  capturing: boolean
  complete: boolean
}) {
  const stepClamped = Math.max(0, Math.min(1, stepProgress))
  const holdClamped = Math.max(0, Math.min(1, holdProgress))
  const stepDash = 100 - stepClamped * 100
  const holdDash = 100 - holdClamped * 100
  const ringColor = complete
    ? '#4ade80'
    : capturing
      ? '#38bdf8'
      : poseMatched
        ? '#4ade80'
        : 'rgba(56,189,248,0.35)'

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <ellipse cx="50" cy="50" rx="21" ry="28" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
      <ellipse
        cx="50"
        cy="50"
        rx="21"
        ry="28"
        fill="none"
        stroke={ringColor}
        strokeWidth="2"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray="100"
        strokeDashoffset={stepDash}
        transform="rotate(-90 50 50)"
        style={{ transition: 'stroke-dashoffset 0.35s ease' }}
      />
      {poseMatched && !complete && holdClamped > 0 && (
        <ellipse
          cx="50"
          cy="50"
          rx="18"
          ry="24"
          fill="none"
          stroke="#4ade80"
          strokeWidth="2.5"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100"
          strokeDashoffset={holdDash}
          transform="rotate(-90 50 50)"
          style={{
            transition: 'stroke-dashoffset 0.12s linear',
            filter: 'drop-shadow(0 0 6px rgba(74,222,128,0.7))',
          }}
        />
      )}
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
  const [manualCapturing, setManualCapturing] = useState(false)
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

  const handleManualCapture = async () => {
    const video = videoRef.current
    if (!video || !cameraReady || complete) return
    const imageB64 = captureFaceEnrollmentFrameBase64(video)
    if (!imageB64) {
      setPanelError('Không quét được khung hình.')
      return
    }
    setManualCapturing(true)
    setPanelError(null)
    try {
      const result = await submitScan(imageB64, autoScan.activeSlot)
      handleEnrollment(result.enrollment)
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : 'Lưu vector thất bại.')
    } finally {
      setManualCapturing(false)
    }
  }

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
      ? 'Giống eKYC: đưa mặt vào khung tròn, giữ yên — hệ thống tự quét 3 góc.'
      : `Quét 3 góc mặt cho ${displayName} (${person?.employee_code ?? person?.pers_id}).`
  )

  const showError = panelError ?? autoScan.error
  const busy = autoScan.capturing || manualCapturing

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

      <div className="flex flex-col gap-4">
        <div className="relative aspect-[3/4] sm:aspect-[4/3] rounded-xl overflow-hidden border border-[#1e2433] bg-black w-full max-w-xl mx-auto lg:max-w-none">
          <video
            ref={videoRef}
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
          />

          <FaceScanProgressRing
            stepProgress={autoScan.ringProgress}
            holdProgress={autoScan.holdProgress}
            poseMatched={autoScan.poseMatched}
            capturing={busy}
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
                      ? 'border-sky-400/50'
                      : 'border-sky-400/35',
              )}
            />
          </div>

          <div className="absolute inset-x-0 bottom-0 p-4 pt-12 bg-gradient-to-t from-black/90 via-black/55 to-transparent pointer-events-none">
            <p className={cn(
              'text-center font-bold leading-snug',
              complete ? 'text-green-400 text-lg' : 'text-white text-base sm:text-lg',
            )}>
              {complete ? '✓ Xong rồi!' : autoScan.guidance}
            </p>
            {!complete && (
              <p className="text-center text-[11px] text-white/60 mt-2">
                {guidanceForSlot(autoScan.activeSlot)}
              </p>
            )}
          </div>

          <div className="absolute left-3 top-3 flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/55 border border-white/10 text-[10px]">
            <Camera className="w-3 h-3 text-sky-400" />
            <span className={cameraReady ? 'text-green-400' : 'text-amber-400'}>
              {cameraReady
                ? autoScan.modelStatus === 'loading'
                  ? 'Đang tải AI…'
                  : 'Tự quét'
                : 'Đang mở camera…'}
            </span>
          </div>

          {busy && (
            <div className="absolute right-3 top-3 flex items-center gap-1.5 px-2 py-1 rounded-md bg-sky-500/20 border border-sky-400/30 text-[10px] text-sky-300">
              <Loader2 className="w-3 h-3 animate-spin" />
              Đang lưu…
            </div>
          )}

          {cameraError && (
            <div className="absolute inset-x-3 bottom-24 p-2 rounded-lg bg-red-500/15 border border-red-500/30 text-[10px] text-red-300 pointer-events-none">
              {cameraError}
            </div>
          )}
        </div>

        <div className="space-y-4 w-full max-w-xl mx-auto lg:max-w-none">
          <div className="rounded-xl border border-[#1e2433] bg-[#0b0f1a] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tiến độ quét</span>
              <span className={cn('text-[10px] font-bold tabular-nums', complete ? 'text-green-400' : 'text-sky-400')}>
                {capturedCount}/{enrollment?.faces_required ?? 3}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[#1e2433] overflow-hidden">
              <div
                className={cn('h-full transition-all', complete ? 'bg-green-400' : 'bg-sky-400')}
                style={{ width: `${Math.round((capturedCount / (enrollment?.faces_required ?? 3)) * 100)}%` }}
              />
            </div>
            <div className="space-y-2">
              {poses.map(pose => {
                const active = pose.slot === autoScan.activeSlot && !complete && !pose.captured
                return (
                  <div
                    key={pose.slot}
                    className={cn(
                      'flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-[11px] transition-colors',
                      pose.captured && 'border-green-500/30 bg-green-500/10',
                      active && !pose.captured && 'border-sky-400/40 bg-sky-400/10',
                      !pose.captured && !active && 'border-[#1e2433]',
                    )}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <ScanFace className={cn('w-3.5 h-3.5 shrink-0', pose.captured ? 'text-green-400' : active ? 'text-sky-400' : 'text-muted-foreground')} />
                      <span className={cn('font-medium truncate', pose.captured && 'text-green-400')}>{pose.label}</span>
                    </span>
                    {pose.captured
                      ? <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                      : active
                        ? <span className="text-[8px] text-sky-400 animate-pulse shrink-0">Đang quét</span>
                        : <span className="text-[9px] text-muted-foreground shrink-0">Chưa quét</span>}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-xl border border-[#1e2433] bg-[#0b0f1a] p-4 space-y-3">
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Góc đang quét: <span className="text-foreground font-semibold">{poses.find(p => p.slot === autoScan.activeSlot)?.label}</span>.
              Giữ mặt trong khung oval, ánh sáng đều, không che khuôn mặt — giống quét eKYC.
            </p>
            <button
              type="button"
              onClick={() => void handleManualCapture()}
              disabled={busy || !cameraReady || backendOnline === false || complete}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-sky-500 text-white hover:bg-sky-500/90 transition-all disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanFace className="w-4 h-4" />}
              {complete ? 'Đã đủ 3 góc' : `Quét ${poses.find(p => p.slot === autoScan.activeSlot)?.label ?? 'góc này'}`}
            </button>
            <p className="text-[9px] text-muted-foreground/80 text-center">
              Hệ thống tự quét khi giữ yên. Nếu không tự quét, bấm nút trên.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
