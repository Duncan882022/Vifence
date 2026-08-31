import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Camera,
  CheckCircle,
  Hand,
  Loader2,
  RotateCcw,
  ScanFace,
  Zap,
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
import { FaceScanProgressRing } from './FaceScanProgressRing'
import { FaceScanLiveHint } from './FaceScanLiveHint'
import {
  analyzeFaceScanFrame,
  faceNearSlot,
  faceReadyForManualCapture,
  guidanceForHint,
  guidanceForSlot,
  manualScanBlockedInstruction,
  type ScanPoseSlot,
} from '../utils/patrolFaceScanGuide'
import {
  defaultFaceScanPoses,
  faceScanMainInstruction,
  FACE_SCAN_POSE_COUNT,
  faceScanPoseLabel,
} from '../utils/patrolFaceScanPoses'
import {
  attachFaceScanStreamToVideo,
  faceScanCameraErrorMessage,
  isFaceScanStreamLive,
  openFaceScanCameraStream,
  stopFaceScanStream,
  type FaceScanCameraErrorCode,
} from '../utils/patrolFaceScanCamera'

export type FaceScanCaptureMode = 'auto' | 'manual'

interface PatrolFaceScannerPanelProps {
  person?: PatrolWorkerPerson
  sessionId?: string
  initialEnrollment?: PatrolScanEnrollment
  subtitle?: string
  onEnrollmentChange?: (enrollment: PatrolScanEnrollment) => void
  onScanComplete?: (enrollment: PatrolScanEnrollment) => void
  onStartOver?: () => void | Promise<void>
}

export function PatrolFaceScannerPanel({
  person,
  sessionId,
  initialEnrollment,
  subtitle,
  onEnrollmentChange,
  onScanComplete,
  onStartOver,
}: PatrolFaceScannerPanelProps) {
  const isSession = Boolean(sessionId)
  const subjectKey = sessionId ?? person?.pers_id ?? ''

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const cameraStartingRef = useRef(false)

  const [backendOnline, setBackendOnline] = useState<boolean | null>(null)
  const [enrollment, setEnrollment] = useState<PatrolScanEnrollment | null>(initialEnrollment ?? null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraStarting, setCameraStarting] = useState(false)
  const [cameraAwaitingTap, setCameraAwaitingTap] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [panelError, setPanelError] = useState<string | null>(null)
  const [captureMode, setCaptureMode] = useState<FaceScanCaptureMode>('auto')
  const [manualHint, setManualHint] = useState<string>('')
  const [manualReady, setManualReady] = useState(false)
  const [manualNear, setManualNear] = useState(false)
  const [startingOver, setStartingOver] = useState(false)

  const handleEnrollment = useCallback((next: PatrolScanEnrollment) => {
    setEnrollment(next)
    onEnrollmentChange?.(next)
    if (next.complete) onScanComplete?.(next)
  }, [onEnrollmentChange, onScanComplete])

  const handleEnrollmentRef = useRef(handleEnrollment)
  handleEnrollmentRef.current = handleEnrollment

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
    cameraReady && Boolean(subjectKey),
    handleEnrollment,
    captureMode,
    backendOnline === true,
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
      handleEnrollmentRef.current(status)
    } catch (err) {
      setBackendOnline(false)
      setPanelError(err instanceof Error ? err.message : 'Không tải được trạng thái quét.')
    } finally {
      setLoading(false)
    }
  }, [subjectKey, isSession, sessionId, person])

  const startCamera = useCallback(async () => {
    if (cameraStartingRef.current) return

    const video = videoRef.current
    const existing = streamRef.current
    if (isFaceScanStreamLive(existing) && video) {
      await attachFaceScanStreamToVideo(video, existing!)
      setCameraReady(true)
      setCameraAwaitingTap(false)
      setCameraError(null)
      return
    }

    cameraStartingRef.current = true
    setCameraStarting(true)
    setCameraError(null)
    setCameraAwaitingTap(false)

    try {
      stopFaceScanStream(streamRef.current)
      streamRef.current = null

      const stream = await openFaceScanCameraStream()
      streamRef.current = stream
      if (!videoRef.current) return
      await attachFaceScanStreamToVideo(videoRef.current, stream)
      setCameraReady(true)
    } catch (err) {
      stopFaceScanStream(streamRef.current)
      streamRef.current = null
      setCameraReady(false)
      const code = (err as { code?: FaceScanCameraErrorCode }).code ?? 'failed'
      setCameraError(faceScanCameraErrorMessage(code))
      setCameraAwaitingTap(true)
    } finally {
      cameraStartingRef.current = false
      setCameraStarting(false)
    }
  }, [])

  useEffect(() => {
    if (initialEnrollment) setEnrollment(initialEnrollment)
  }, [initialEnrollment?.session_id, initialEnrollment?.faces_captured, initialEnrollment?.complete])

  useEffect(() => {
    void refreshStatus()
  }, [subjectKey])

  useEffect(() => {
    void startCamera()
    return () => {
      stopFaceScanStream(streamRef.current)
      streamRef.current = null
    }
  }, [startCamera])

  useEffect(() => {
    if (captureMode !== 'manual' || !cameraReady || !enrollment) return
    let cancelled = false
    const poll = window.setInterval(() => {
      void (async () => {
        const video = videoRef.current
        if (!video || cancelled) return
        const modelStatus = autoScan.modelStatus
        if (modelStatus !== 'ready') {
          setManualReady(false)
          setManualNear(false)
          setManualHint(manualScanBlockedInstruction(modelStatus))
          return
        }
        const metrics = await analyzeFaceScanFrame(video)
        if (cancelled) return
        const slot = autoScan.activeSlot as ScanPoseSlot
        const ready = faceReadyForManualCapture(metrics, slot, modelStatus)
        const near = faceNearSlot(metrics, slot)
        setManualReady(ready)
        setManualNear(near)
        if (ready) {
          setManualHint('Sẵn sàng chụp — giữ yên và bấm nút bên dưới')
          if (panelError) setPanelError(null)
        } else if (near) {
          setManualHint(`Gần đúng góc ${faceScanPoseLabel(slot)} — chỉnh thêm một chút`)
        } else {
          setManualHint(
            metrics.hasFace
              ? guidanceForHint(metrics.poseHint, slot)
              : guidanceForSlot(slot),
          )
        }
      })()
    }, 400)
    return () => {
      cancelled = true
      window.clearInterval(poll)
    }
  }, [autoScan.activeSlot, autoScan.modelStatus, cameraReady, captureMode, enrollment])

  useEffect(() => {
    if (captureMode === 'auto') {
      setManualReady(false)
      setManualNear(false)
    }
  }, [captureMode])

  const handleManualCapture = async () => {
    const video = videoRef.current
    if (!video || !cameraReady || complete) return
    const slot = autoScan.activeSlot as ScanPoseSlot
    const modelStatus = autoScan.modelStatus

    if (modelStatus !== 'ready') {
      setPanelError(manualScanBlockedInstruction(modelStatus))
      return
    }

    const metrics = await analyzeFaceScanFrame(video)
    if (!faceReadyForManualCapture(metrics, slot, modelStatus)) {
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

  const handleStartOver = async () => {
    setStartingOver(true)
    setPanelError(null)
    autoScan.resetScanAttempt()
    try {
      if (onStartOver) {
        await onStartOver()
      } else {
        await refreshStatus()
      }
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : 'Không thể bắt đầu lại.')
    } finally {
      setStartingOver(false)
    }
  }

  const poses = enrollment?.poses ?? defaultFaceScanPoses()
  const facesRequired = enrollment?.faces_required ?? FACE_SCAN_POSE_COUNT
  const capturedCount = enrollment?.faces_captured ?? 0
  const complete = enrollment?.complete ?? false
  const displayName = person?.full_name ?? person?.display_name
  const defaultSubtitle = subtitle ?? (
    isSession
      ? 'Quét 4 góc mặt — tự động hoặc thủ công.'
      : `Quét ${facesRequired} góc mặt cho ${displayName} (${person?.employee_code ?? person?.pers_id}).`
  )

  const manualAiBlocked = captureMode === 'manual' && autoScan.modelStatus !== 'ready'

  const mainInstruction = complete
    ? (isSession ? 'Đủ 4 góc — nhấn Tiếp tục để nhập thông tin.' : 'Hoàn thành — hồ sơ sẵn sàng nhận diện.')
    : manualAiBlocked
      ? manualScanBlockedInstruction(autoScan.modelStatus)
      : captureMode === 'auto'
        ? autoScan.guidance
        : manualHint || faceScanMainInstruction(autoScan.activeSlot, false, 'manual')

  const subInstruction = complete
    ? null
    : manualAiBlocked
      ? (autoScan.modelStatus === 'loading'
        ? 'Nút Chụp sẽ bật khi AI tải xong.'
        : 'Hoặc dùng chế độ Tự động (giữ yên theo hướng dẫn).')
      : captureMode === 'auto'
        ? autoScan.subGuidance
        : `Bước ${autoScan.activeSlot}/4 · ${faceScanPoseLabel(autoScan.activeSlot)}`

  const showError = panelError ?? autoScan.error
  const busy = autoScan.capturing || startingOver

  return (
    <div className="space-y-5">
      {defaultSubtitle && (
        <p className="text-[11px] text-muted-foreground text-center max-w-md mx-auto">{defaultSubtitle}</p>
      )}

      {(autoScan.successFlash || complete) && (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-green-500/25 bg-green-500/10 text-green-400 text-xs max-w-md mx-auto">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{complete ? mainInstruction : autoScan.successFlash}</span>
        </div>
      )}

      {showError && (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-red-500/25 bg-red-500/10 text-red-400 text-xs max-w-md mx-auto">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{showError}</span>
          {autoScan.error && captureMode === 'auto' && (
            <button type="button" onClick={autoScan.retry} className="text-[10px] underline shrink-0">
              Thử lại
            </button>
          )}
        </div>
      )}

      {/* Face ID viewport */}
      <div className="relative mx-auto w-full max-w-[380px] aspect-square bg-black rounded-2xl overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
        />

        {(cameraAwaitingTap || (cameraStarting && !cameraReady)) && (
          <div className="absolute inset-0 z-[25] flex flex-col items-center justify-center gap-3 px-6 bg-black/55">
            <button
              type="button"
              onClick={() => void startCamera()}
              disabled={cameraStarting}
              className="inline-flex flex-col items-center gap-2 px-6 py-5 rounded-2xl bg-white/12 border border-white/20 text-white hover:bg-white/18 disabled:opacity-60"
            >
              {cameraStarting
                ? <Loader2 className="w-10 h-10 animate-spin text-sky-300" />
                : <Camera className="w-10 h-10 text-sky-300" />}
              <span className="text-sm font-semibold">
                {cameraStarting ? 'Đang mở camera…' : 'Bật camera'}
              </span>
            </button>
            {cameraAwaitingTap && !cameraStarting && (
              <p className="text-[11px] text-white/60 text-center max-w-[240px] leading-relaxed">
                Safari cần bạn bấm nút này nếu chưa cấp quyền camera.
              </p>
            )}
          </div>
        )}

        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <FaceScanProgressRing
            activeSlot={autoScan.activeSlot as ScanPoseSlot}
            capturedCount={capturedCount}
            facesRequired={facesRequired}
            holdProgress={captureMode === 'auto' ? autoScan.holdProgress : 0}
            approachProgress={captureMode === 'auto' ? autoScan.approachProgress : 0}
            complete={complete}
            scanLine={!complete && (captureMode === 'auto'
              ? autoScan.faceDetected || autoScan.approachProgress > 0.05 || autoScan.scanMode === 'fallback'
              : manualNear || manualReady)}
          />
          {captureMode === 'auto' && !complete && cameraReady && (
            <FaceScanLiveHint
              hint={autoScan.liveHint}
              holdProgress={autoScan.holdProgress}
            />
          )}
          {complete && (
            <CheckCircle className="absolute w-16 h-16 text-green-400 drop-shadow-[0_0_16px_rgba(74,222,128,0.95)] z-50" />
          )}
        </div>

        {cameraError && !cameraAwaitingTap && (
          <div className="absolute inset-x-4 bottom-4 z-[30] space-y-2">
            <div className="p-2.5 rounded-lg bg-red-500/15 border border-red-500/30 text-[10px] text-red-300 text-center leading-relaxed">
              {cameraError}
            </div>
            <button
              type="button"
              onClick={() => void startCamera()}
              disabled={cameraStarting}
              className="w-full py-2 rounded-lg text-[11px] font-semibold bg-white/10 text-white border border-white/15"
            >
              Thử lại camera
            </button>
          </div>
        )}

        {busy && (
          <div className="absolute top-4 right-4 flex items-center gap-1 px-2 py-1 rounded-full bg-black/70 text-[10px] text-sky-300 z-20">
            <Loader2 className="w-3 h-3 animate-spin" />
            Đang lưu…
          </div>
        )}
      </div>

      {/* Instruction */}
      <div className="text-center space-y-1.5 px-4 max-w-md mx-auto">
        <p className={cn(
          'text-base sm:text-lg font-medium leading-snug',
          complete ? 'text-green-400' : 'text-white',
        )}>
          {mainInstruction}
        </p>
        {subInstruction && captureMode !== 'auto' && (
          <p className="text-sm text-white/55">{subInstruction}</p>
        )}
        {!complete && captureMode === 'auto' && (
          <p className="text-xs text-white/45 tabular-nums">
            {capturedCount}/{facesRequired} góc
            {autoScan.faceDetected
              ? autoScan.poseMatched
                ? autoScan.holdProgress > 0
                  ? ` · quét ${Math.round(autoScan.holdProgress * 100)}%`
                  : ' · giữ yên…'
                : ' · chỉnh góc…'
              : ' · đưa mặt vào khung'}
            {autoScan.scanMode === 'fallback' && ' · chế độ cơ bản'}
            {backendOnline === false && ' · chờ backend'}
          </p>
        )}
        {!complete && captureMode === 'manual' && (
          <p className="text-[10px] text-white/40 tabular-nums">
            {capturedCount}/{facesRequired} góc
          </p>
        )}
      </div>

      {/* Mode + actions */}
      {!complete && (
        <div className="max-w-md mx-auto space-y-2 px-2">
          <div className="flex rounded-xl border border-white/10 bg-white/[0.04] p-1 gap-1">
            <button
              type="button"
              onClick={() => setCaptureMode('auto')}
              className={cn(
                'flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-colors',
                captureMode === 'auto'
                  ? 'bg-white/12 text-white'
                  : 'text-white/50 hover:text-white/80',
              )}
            >
              <Zap className="w-3.5 h-3.5" />
              Tự động
            </button>
            <button
              type="button"
              onClick={() => setCaptureMode('manual')}
              className={cn(
                'flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-colors',
                captureMode === 'manual'
                  ? 'bg-white/12 text-white'
                  : 'text-white/50 hover:text-white/80',
              )}
            >
              <Hand className="w-3.5 h-3.5" />
              Thủ công
            </button>
          </div>

          {captureMode === 'manual' && (
            <button
              type="button"
              onClick={() => void handleManualCapture()}
              disabled={busy || !cameraReady || backendOnline === false || autoScan.modelStatus !== 'ready'}
              className={cn(
                'w-full inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-semibold disabled:opacity-40 border transition-colors',
                manualReady
                  ? 'bg-green-500/90 text-white border-green-400/50 hover:bg-green-500'
                  : manualNear
                    ? 'bg-amber-500/15 text-amber-100 border-amber-400/40 hover:bg-amber-500/25'
                    : 'bg-white/10 text-white hover:bg-white/15 border-white/10',
              )}
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ScanFace className="w-5 h-5" />}
              {autoScan.modelStatus === 'ready'
                ? manualReady
                  ? `Chụp ${faceScanPoseLabel(autoScan.activeSlot)}`
                  : manualNear
                    ? `Chỉnh góc ${faceScanPoseLabel(autoScan.activeSlot)}`
                    : `Chụp góc ${faceScanPoseLabel(autoScan.activeSlot)}`
                : autoScan.modelStatus === 'loading'
                  ? 'Đang chờ AI…'
                  : 'AI không khả dụng'}
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleStartOver()}
            disabled={busy || loading}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-semibold bg-white/[0.06] text-white/80 hover:bg-white/10 disabled:opacity-40 border border-white/10"
          >
            {startingOver ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Bắt đầu lại
          </button>
        </div>
      )}

      {/* Compact pose progress */}
      <div className="max-w-md mx-auto rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <div className="grid grid-cols-4 gap-1.5">
          {poses.map(pose => {
            const active = pose.slot === autoScan.activeSlot && !complete && !pose.captured
            return (
              <div
                key={pose.slot}
                className={cn(
                  'flex flex-col items-center gap-1 px-1 py-2 rounded-lg text-[9px] text-center',
                  pose.captured && 'bg-green-500/10 text-green-400',
                  active && 'bg-white/10 text-white',
                  !pose.captured && !active && 'text-white/40',
                )}
              >
                {pose.captured
                  ? <CheckCircle className="w-3.5 h-3.5" />
                  : <span className="w-3.5 h-3.5 rounded-full border border-current opacity-60" />}
                <span className="font-medium leading-tight truncate w-full">{pose.label}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
