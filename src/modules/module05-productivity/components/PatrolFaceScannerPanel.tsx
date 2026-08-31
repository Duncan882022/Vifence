import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
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

/** SVG ellipse — viewBox 100×133 khớp aspect 3:4 của khung quét mặt. */
const RING_CX = 50
const RING_CY = 66.5
const RING_RX = 43
const RING_RY = 57
const RING_STROKE = 11
/** Cung tối thiểu luôn hiện (~30%) để thấy rõ trên mobile Safari. */
const RING_MIN_ARC = 0.3

function FaceScanOvalFrame({
  progress,
  holdProgress,
  complete,
  poseMatched,
  faceDetected: _faceDetected,
  capturing: _capturing,
  children,
}: {
  progress: number
  holdProgress: number
  complete: boolean
  poseMatched: boolean
  faceDetected: boolean
  capturing: boolean
  children?: ReactNode
}) {
  const mainProgress = complete ? 1 : Math.max(0, Math.min(1, progress))
  const hold = complete ? 0 : Math.max(0, Math.min(1, holdProgress))
  const accent = complete || poseMatched ? '#22c55e' : '#0ea5e9'
  const visibleProgress = complete
    ? 1
    : Math.max(mainProgress, RING_MIN_ARC)
  const ringDash = `${(visibleProgress * 100).toFixed(1)} 100`

  return (
    <div className="relative w-[50%] max-w-[280px] aspect-[3/4] shrink-0 overflow-visible">
      <div
        className="absolute inset-0 rounded-[999px] z-[1] pointer-events-none"
        style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.48)' }}
        aria-hidden
      />
      <svg
        className={cn(
          'absolute inset-0 w-full h-full z-[40] pointer-events-none overflow-visible',
          complete && 'animate-pulse',
        )}
        viewBox="0 0 100 133"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <ellipse
          cx={RING_CX}
          cy={RING_CY}
          rx={RING_RX}
          ry={RING_RY}
          fill="none"
          stroke="rgba(255,255,255,0.72)"
          strokeWidth={RING_STROKE + 1}
        />
        <ellipse
          cx={RING_CX}
          cy={RING_CY}
          rx={RING_RX}
          ry={RING_RY}
          fill="none"
          stroke={accent}
          strokeWidth={complete ? RING_STROKE + 3 : RING_STROKE}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={ringDash}
          transform={`rotate(-90 ${RING_CX} ${RING_CY})`}
          style={{
            filter: complete
              ? 'drop-shadow(0 0 14px rgba(34,197,94,1)) drop-shadow(0 0 6px rgba(134,239,172,1))'
              : 'drop-shadow(0 0 10px rgba(14,165,233,0.95)) drop-shadow(0 0 4px rgba(56,189,248,0.8))',
            transition: 'stroke-dasharray 0.15s ease, stroke 0.2s ease',
          }}
        />
      </svg>
      {!complete && hold > 0.04 && (
        <div
          className="absolute inset-[10%] rounded-[999px] pointer-events-none z-[35]"
          style={{
            boxShadow: `inset 0 0 0 3px rgba(134,239,172,${0.35 + hold * 0.65})`,
          }}
          aria-hidden
        />
      )}
      <div
        className={cn(
          'absolute inset-[5px] rounded-[999px] z-[20] pointer-events-none border-[3px]',
          complete
            ? 'border-green-400/70'
            : poseMatched
              ? 'border-green-400/60'
              : 'border-sky-400/55',
        )}
        aria-hidden
      />
      <div className="absolute inset-0 z-[50] flex items-center justify-center pointer-events-none">
        {children}
      </div>
    </div>
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
  const [manualOpen, setManualOpen] = useState(false)

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
    setManualOpen(false)
    setPanelError(null)
    try {
      const result = await submitScan(imageB64, autoScan.activeSlot)
      handleEnrollment(result.enrollment)
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : 'Lưu vector thất bại.')
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
  const busy = autoScan.capturing
  const scanModeLabel = complete
    ? 'Hoàn thành'
    : autoScan.scanMode === 'fallback'
      ? 'Tự quét (giữ yên)'
      : autoScan.modelStatus === 'loading'
        ? 'Đang tải AI…'
        : 'Tự quét'

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

          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
            <FaceScanOvalFrame
              progress={autoScan.ringProgress}
              holdProgress={autoScan.holdProgress}
              complete={complete}
              poseMatched={autoScan.poseMatched}
              faceDetected={autoScan.faceDetected}
              capturing={busy}
            >
              {complete && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <CheckCircle className="w-12 h-12 sm:w-16 sm:h-16 text-green-400 drop-shadow-[0_0_14px_rgba(74,222,128,1)]" />
                </div>
              )}
            </FaceScanOvalFrame>
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
            <span className={complete ? 'text-green-400' : cameraReady ? 'text-sky-300' : 'text-amber-400'}>
              {cameraReady ? scanModeLabel : 'Đang mở camera…'}
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
            <div className="h-2 rounded-full bg-[#1e2433] overflow-hidden">
              <div
                className={cn('h-full transition-all duration-300', complete ? 'bg-green-400' : 'bg-sky-400')}
                style={{ width: `${Math.round(Math.max(autoScan.ringProgress, complete ? 1 : 0.08) * 100)}%` }}
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
              {complete
                ? 'Đủ 3 góc — vòng tròn xanh hoàn tất. Không cần bấm chụp.'
                : (
                  <>
                    Góc đang quét:{' '}
                    <span className="text-foreground font-semibold">
                      {poses.find(p => p.slot === autoScan.activeSlot)?.label}
                    </span>
                    . Đưa mặt vào khung oval và giữ yên — hệ thống tự chụp (eKYC).
                  </>
                )}
            </p>
            {!complete && (
              <button
                type="button"
                onClick={() => setManualOpen(v => !v)}
                className="text-[10px] text-muted-foreground/90 underline underline-offset-2 hover:text-foreground"
              >
                {manualOpen ? 'Ẩn quét thủ công' : 'Không tự quét được? Bấm quét thủ công'}
              </button>
            )}
            {!complete && manualOpen && (
              <button
                type="button"
                onClick={() => void handleManualCapture()}
                disabled={busy || !cameraReady || backendOnline === false}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border border-sky-400/30 text-sky-300 hover:bg-sky-400/10 transition-all disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanFace className="w-4 h-4" />}
                Quét thủ công — {poses.find(p => p.slot === autoScan.activeSlot)?.label ?? 'góc này'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
