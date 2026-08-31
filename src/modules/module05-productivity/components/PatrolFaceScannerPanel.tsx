import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  Loader2,
  ScanFace,
  Settings2,
  X,
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
import { FaceScanFourPoseRing } from './FaceScanFourPoseRing'
import {
  analyzeFaceScanFrame,
  faceReadyForSlot,
  guidanceForHint,
  guidanceForSlot,
  type ScanPoseSlot,
} from '../utils/patrolFaceScanGuide'
import {
  defaultFaceScanPoses,
  FACE_SCAN_POSE_COUNT,
  FACE_SCAN_POSE_LABELS,
} from '../utils/patrolFaceScanPoses'

export type FaceScanCaptureMode = 'auto' | 'manual'

interface PatrolFaceScannerPanelProps {
  person?: PatrolWorkerPerson
  sessionId?: string
  initialEnrollment?: PatrolScanEnrollment
  subtitle?: string
  onEnrollmentChange?: (enrollment: PatrolScanEnrollment) => void
  onScanComplete?: (enrollment: PatrolScanEnrollment) => void
}

const APPLE_PRIMARY_INSTRUCTION =
  'Từ từ xoay đầu để hoàn thành vòng tròn.'

export function PatrolFaceScannerPanel({
  person,
  sessionId,
  initialEnrollment,
  onEnrollmentChange,
  onScanComplete,
}: PatrolFaceScannerPanelProps) {
  const isSession = Boolean(sessionId)
  const subjectKey = sessionId ?? person?.pers_id ?? ''

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [backendOnline, setBackendOnline] = useState<boolean | null>(null)
  const [enrollment, setEnrollment] = useState<PatrolScanEnrollment | null>(initialEnrollment ?? null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [panelError, setPanelError] = useState<string | null>(null)
  const [captureMode, setCaptureMode] = useState<FaceScanCaptureMode>('auto')
  const [manualHint, setManualHint] = useState('')
  const [accessibilityOpen, setAccessibilityOpen] = useState(false)

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
    captureMode,
  )

  const refreshStatus = useCallback(async () => {
    if (!subjectKey) return
    setPanelError(null)
    try {
      const online = await pingPatrolProfileBackend()
      setBackendOnline(online)
      if (!online) {
        setPanelError('Không kết nối backend tuần tra.')
        return
      }
      const status = isSession
        ? await fetchPatrolEnrollSession(sessionId!)
        : await fetchPatrolScanEnrollment(person!.pers_id)
      handleEnrollment(status)
    } catch (err) {
      setBackendOnline(false)
      setPanelError(err instanceof Error ? err.message : 'Không tải được trạng thái quét.')
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
    if (initialEnrollment) setEnrollment(initialEnrollment)
  }, [initialEnrollment?.session_id, initialEnrollment?.faces_captured, initialEnrollment?.complete])

  useEffect(() => {
    void refreshStatus()
    void startCamera()
    return () => {
      streamRef.current?.getTracks().forEach(track => track.stop())
    }
  }, [refreshStatus, startCamera, subjectKey])

  useEffect(() => {
    if (captureMode !== 'manual' || !cameraReady || !enrollment) return
    let cancelled = false
    const poll = window.setInterval(() => {
      void (async () => {
        const video = videoRef.current
        if (!video || cancelled) return
        const metrics = await analyzeFaceScanFrame(video)
        if (cancelled) return
        setManualHint(
          metrics.hasFace
            ? guidanceForHint(metrics.poseHint, autoScan.activeSlot)
            : guidanceForSlot(autoScan.activeSlot),
        )
      })()
    }, 400)
    return () => {
      cancelled = true
      window.clearInterval(poll)
    }
  }, [autoScan.activeSlot, cameraReady, captureMode, enrollment])

  const handleManualCapture = async () => {
    const video = videoRef.current
    if (!video || !cameraReady || complete) return
    const slot = autoScan.activeSlot as ScanPoseSlot
    const metrics = await analyzeFaceScanFrame(video)
    if (!faceReadyForSlot(metrics, slot)) {
      setPanelError(
        metrics.hasFace
          ? guidanceForHint(metrics.poseHint, slot)
          : guidanceForSlot(slot),
      )
      return
    }
    const imageB64 = captureFaceEnrollmentFrameBase64(video)
    if (!imageB64) {
      setPanelError('Không quét được khung hình.')
      return
    }
    setPanelError(null)
    try {
      const result = await submitScan(imageB64, slot)
      handleEnrollment(result.enrollment)
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : 'Lưu vector thất bại.')
    }
  }

  const handleStartOver = () => {
    window.location.reload()
  }

  const poses = enrollment?.poses ?? defaultFaceScanPoses()
  const facesRequired = enrollment?.faces_required ?? FACE_SCAN_POSE_COUNT
  const capturedCount = enrollment?.faces_captured ?? 0
  const complete = enrollment?.complete ?? false
  const capturedBySlot = poses.map(p => p.captured)
  const activeSlot = autoScan.activeSlot as ScanPoseSlot

  const poseHint = complete
    ? 'Hoàn tất quét mặt.'
    : captureMode === 'auto'
      ? autoScan.guidance
      : manualHint || guidanceForSlot(activeSlot)

  const showError = panelError ?? autoScan.error
  const busy = autoScan.capturing

  return (
    <div className="flex flex-col bg-black text-white min-h-[min(100dvh-8rem,720px)] -mx-1 sm:-mx-2">
      <div className="flex-1 flex flex-col items-center justify-center px-4 pt-4 pb-6">
        <div className="relative w-full max-w-[min(100vw-2rem,340px)] aspect-square rounded-[2.75rem] bg-black overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
          <div className="absolute inset-[7.5%] rounded-full overflow-hidden bg-[#0a0a0a]">
            <video
              ref={videoRef}
              playsInline
              muted
              className={cn(
                'absolute inset-0 w-full h-full object-cover scale-x-[-1]',
                !cameraReady && 'opacity-0',
              )}
            />
            {!cameraReady && !cameraError && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-white/40" />
              </div>
            )}
            <div
              className="pointer-events-none absolute top-1/2 left-[10%] right-[10%] h-px -translate-y-1/2 bg-sky-400/35 shadow-[0_0_14px_rgba(56,189,248,0.55)]"
              aria-hidden
            />
          </div>

          <FaceScanFourPoseRing
            activeSlot={activeSlot}
            capturedBySlot={capturedBySlot}
            holdProgress={captureMode === 'auto' ? autoScan.holdProgress : 0}
            complete={complete}
          />

          {complete && (
            <div className="absolute inset-[7.5%] rounded-full flex items-center justify-center bg-black/25 pointer-events-none">
              <CheckCircle className="w-16 h-16 text-green-400 drop-shadow-[0_0_18px_rgba(74,222,128,0.9)]" />
            </div>
          )}

          {busy && (
            <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 text-[10px] text-white/80">
              <Loader2 className="w-3 h-3 animate-spin" />
              Đang lưu…
            </div>
          )}

          <div className="absolute top-4 left-4 px-2.5 py-1 rounded-full bg-black/50 text-[10px] font-semibold tabular-nums text-white/75">
            {capturedCount}/{facesRequired}
          </div>
        </div>

        <p className="mt-10 text-center text-[1.0625rem] font-normal leading-snug text-white px-3 max-w-[20rem]">
          {complete ? 'Hoàn tất quét mặt.' : APPLE_PRIMARY_INSTRUCTION}
        </p>
        {!complete && (
          <p className={cn(
            'mt-3 text-center text-[0.8125rem] leading-relaxed px-4 max-w-[22rem]',
            autoScan.poseMatched ? 'text-green-400/90' : 'text-white/50',
          )}>
            {poseHint}
          </p>
        )}

        {(autoScan.successFlash && !complete) && (
          <p className="mt-2 text-center text-xs text-green-400">{autoScan.successFlash}</p>
        )}

        {showError && (
          <div className="mt-4 flex items-start gap-2 px-4 py-2.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs max-w-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="flex-1">{showError}</span>
          </div>
        )}

        {cameraError && (
          <p className="mt-4 text-center text-xs text-red-300/90 px-4">{cameraError}</p>
        )}
      </div>

      <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-3 shrink-0">
        <button
          type="button"
          onClick={() => setAccessibilityOpen(true)}
          className="w-full py-[0.9rem] rounded-full bg-[#1c1c1e] text-[1.0625rem] font-normal text-white hover:bg-[#2c2c2e] transition-colors"
        >
          Tùy chọn trợ năng
        </button>
        <button
          type="button"
          onClick={handleStartOver}
          disabled={complete}
          className="w-full py-[0.9rem] rounded-full bg-[#1c1c1e] text-[1.0625rem] font-normal text-white hover:bg-[#2c2c2e] transition-colors disabled:opacity-40"
        >
          Quét lại
        </button>
      </div>

      {accessibilityOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 p-4">
          <div
            className="w-full max-w-md rounded-2xl bg-[#1c1c1e] border border-white/10 shadow-2xl overflow-hidden"
            role="dialog"
            aria-label="Tùy chọn trợ năng quét mặt"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <span className="text-sm font-semibold flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-white/70" />
                Tùy chọn trợ năng
              </span>
              <button
                type="button"
                onClick={() => setAccessibilityOpen(false)}
                className="p-1.5 rounded-full hover:bg-white/10"
                aria-label="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[min(70vh,480px)] overflow-y-auto">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-white/45 mb-2">Chế độ quét</p>
                <div className="flex rounded-xl bg-black/40 p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => setCaptureMode('auto')}
                    className={cn(
                      'flex-1 py-2 rounded-lg text-xs font-semibold transition-colors',
                      captureMode === 'auto' ? 'bg-white/15 text-white' : 'text-white/50',
                    )}
                  >
                    Tự động
                  </button>
                  <button
                    type="button"
                    onClick={() => setCaptureMode('manual')}
                    className={cn(
                      'flex-1 py-2 rounded-lg text-xs font-semibold transition-colors',
                      captureMode === 'manual' ? 'bg-white/15 text-white' : 'text-white/50',
                    )}
                  >
                    Thủ công
                  </button>
                </div>
              </div>

              {captureMode === 'manual' && !complete && (
                <button
                  type="button"
                  onClick={() => void handleManualCapture()}
                  disabled={busy || !cameraReady || backendOnline === false}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold bg-green-500 text-black disabled:opacity-40"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanFace className="w-4 h-4" />}
                  Chụp: {poses.find(p => p.slot === activeSlot)?.label ?? 'góc hiện tại'}
                </button>
              )}

              <div>
                <p className="text-[10px] uppercase tracking-wider text-white/45 mb-2">
                  4 góc gallery · {capturedCount}/{facesRequired}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {poses.map(pose => {
                    const active = pose.slot === activeSlot && !complete && !pose.captured
                    return (
                      <div
                        key={pose.slot}
                        className={cn(
                          'flex items-center gap-2 px-2.5 py-2 rounded-xl border text-[10px]',
                          pose.captured && 'border-green-500/30 bg-green-500/10',
                          active && 'border-sky-400/40 bg-sky-400/10',
                          !pose.captured && !active && 'border-white/10 bg-black/30',
                        )}
                      >
                        {pose.captured
                          ? <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                          : <ScanFace className={cn('w-3.5 h-3.5 shrink-0', active ? 'text-sky-400' : 'text-white/40')} />}
                        <span className={cn('font-medium truncate', pose.captured && 'text-green-400')}>
                          {pose.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[10px] text-white/40 mt-2 leading-relaxed">
                  {FACE_SCAN_POSE_LABELS.join(' · ')}
                </p>
              </div>

              <button
                type="button"
                onClick={() => void refreshStatus()}
                className="w-full py-2.5 rounded-xl text-xs font-semibold border border-white/15 text-white/80 hover:bg-white/5"
              >
                Làm mới trạng thái
              </button>
            </div>

            <button
              type="button"
              onClick={() => setAccessibilityOpen(false)}
              className="w-full py-3.5 border-t border-white/10 text-sm text-sky-400 font-medium flex items-center justify-center gap-1"
            >
              Đóng
              <ChevronDown className="w-4 h-4 sm:hidden" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
