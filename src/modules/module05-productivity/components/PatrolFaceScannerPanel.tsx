import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Camera,
  CheckCircle,
  Hand,
  Loader2,
  RefreshCw,
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
import { FaceScanFourPoseRing } from './FaceScanFourPoseRing'
import {
  analyzeFaceScanFrame,
  guidanceForHint,
  guidanceForSlot,
  type ScanPoseSlot,
} from '../utils/patrolFaceScanGuide'
import {
  defaultFaceScanPoses,
  FACE_SCAN_POSE_COUNT,
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

export function PatrolFaceScannerPanel({
  person,
  sessionId,
  initialEnrollment,
  subtitle,
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
  const [loading, setLoading] = useState(false)
  const [panelError, setPanelError] = useState<string | null>(null)
  const [captureMode, setCaptureMode] = useState<FaceScanCaptureMode>('auto')
  const [manualHint, setManualHint] = useState<string>('')

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
    const imageB64 = captureFaceEnrollmentFrameBase64(video)
    if (!imageB64) {
      setPanelError('Không quét được khung hình.')
      return
    }
    setPanelError(null)
    try {
      const result = await submitScan(imageB64, autoScan.activeSlot)
      handleEnrollment(result.enrollment)
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : 'Lưu vector thất bại.')
    }
  }

  const poses = enrollment?.poses ?? defaultFaceScanPoses()
  const facesRequired = enrollment?.faces_required ?? FACE_SCAN_POSE_COUNT
  const capturedCount = enrollment?.faces_captured ?? 0
  const complete = enrollment?.complete ?? false
  const capturedBySlot = poses.map(p => p.captured)
  const displayName = person?.full_name ?? person?.display_name
  const defaultSubtitle = subtitle ?? (
    isSession
      ? 'eKYC 4 góc (TRÊN · TRÁI · PHẢI · DƯỚI) — chọn Tự động hoặc Thủ công.'
      : `Quét ${facesRequired} góc mặt cho ${displayName} (${person?.employee_code ?? person?.pers_id}).`
  )

  const instruction = complete
    ? '✓ Hoàn tất — vòng tròn xanh đủ 4 góc.'
    : captureMode === 'auto'
      ? autoScan.guidance
      : manualHint || guidanceForSlot(autoScan.activeSlot)

  const showError = panelError ?? autoScan.error
  const busy = autoScan.capturing

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">
            Quét khuôn mặt eKYC
          </h2>
          <p className="text-[11px] text-muted-foreground mt-1 max-w-xl">{defaultSubtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => void refreshStatus()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/10 shrink-0 self-start"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Làm mới
        </button>
      </div>

      {!complete && (
        <div className="flex rounded-lg border border-[#1e2433] bg-[#0b0f1a] p-1 gap-1">
          <button
            type="button"
            onClick={() => setCaptureMode('auto')}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-md text-[11px] font-semibold transition-colors',
              captureMode === 'auto'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Zap className="w-3.5 h-3.5" />
            Tự động
          </button>
          <button
            type="button"
            onClick={() => setCaptureMode('manual')}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-md text-[11px] font-semibold transition-colors',
              captureMode === 'manual'
                ? 'bg-violet-500/20 text-violet-300 border border-violet-400/40'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Hand className="w-3.5 h-3.5" />
            Thủ công
          </button>
        </div>
      )}

      {(autoScan.successFlash || complete) && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-green-500/25 bg-green-500/10 text-green-400 text-xs">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>
            {complete
              ? isSession
                ? `Đủ ${facesRequired} góc — nhấn Tiếp tục để nhập thông tin.`
                : 'Hoàn thành — hồ sơ sẵn sàng nhận diện trên Module 05.'
              : autoScan.successFlash}
          </span>
        </div>
      )}

      {showError && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-red-500/25 bg-red-500/10 text-red-400 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{showError}</span>
          {autoScan.error && captureMode === 'auto' && (
            <button type="button" onClick={autoScan.retry} className="text-[10px] underline shrink-0">
              Thử lại
            </button>
          )}
        </div>
      )}

      <div className="relative aspect-square max-h-[min(72vh,520px)] mx-auto rounded-xl overflow-hidden border border-[#1e2433] bg-black w-full">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
        />

        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <FaceScanFourPoseRing
            activeSlot={autoScan.activeSlot as ScanPoseSlot}
            capturedBySlot={capturedBySlot}
            holdProgress={captureMode === 'auto' ? autoScan.holdProgress : 0}
            complete={complete}
          />
          {complete && (
            <CheckCircle className="absolute w-14 h-14 text-green-400 drop-shadow-[0_0_14px_rgba(74,222,128,1)] z-50" />
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 p-4 pt-16 bg-gradient-to-t from-black/95 via-black/60 to-transparent pointer-events-none z-20">
          <p className={cn(
            'text-center font-bold leading-snug text-sm sm:text-base',
            complete ? 'text-green-400' : 'text-white',
          )}>
            {instruction}
          </p>
          {!complete && (
            <p className="text-center text-[10px] text-white/55 mt-1.5">
              {guidanceForSlot(autoScan.activeSlot as ScanPoseSlot)}
            </p>
          )}
        </div>

        <div className="absolute left-3 top-3 flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/60 border border-white/10 text-[10px] z-20">
          <Camera className="w-3 h-3 text-sky-400" />
          <span className={complete ? 'text-green-400' : cameraReady ? 'text-sky-300' : 'text-amber-400'}>
            {cameraReady
              ? captureMode === 'auto'
                ? autoScan.scanMode === 'fallback' ? 'Tự quét' : 'Tự quét + AI'
                : 'Thủ công'
              : 'Đang mở camera…'}
          </span>
        </div>

        <div className="absolute right-3 top-3 px-2 py-1 rounded-md bg-black/60 border border-white/10 text-[10px] font-bold tabular-nums z-20">
          <span className={complete ? 'text-green-400' : 'text-sky-300'}>
            {capturedCount}/{facesRequired}
          </span>
        </div>

        {busy && (
          <div className="absolute right-3 top-10 flex items-center gap-1 px-2 py-1 rounded-md bg-sky-500/20 text-[10px] text-sky-300 z-20">
            <Loader2 className="w-3 h-3 animate-spin" />
            Đang lưu…
          </div>
        )}

        {cameraError && (
          <div className="absolute inset-x-3 bottom-28 p-2 rounded-lg bg-red-500/15 border border-red-500/30 text-[10px] text-red-300 z-20">
            {cameraError}
          </div>
        )}
      </div>

      {captureMode === 'manual' && !complete && (
        <button
          type="button"
          onClick={() => void handleManualCapture()}
          disabled={busy || !cameraReady || backendOnline === false}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold bg-violet-500 text-white hover:bg-violet-500/90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ScanFace className="w-5 h-5" />}
          Chụp góc: {poses.find(p => p.slot === autoScan.activeSlot)?.label ?? 'này'}
        </button>
      )}

      <div className="rounded-xl border border-[#1e2433] bg-[#0b0f1a] p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">4 góc gallery</span>
          <span className={cn('text-[10px] font-bold tabular-nums', complete ? 'text-green-400' : 'text-sky-400')}>
            {capturedCount}/{facesRequired}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {poses.map(pose => {
            const active = pose.slot === autoScan.activeSlot && !complete && !pose.captured
            return (
              <div
                key={pose.slot}
                className={cn(
                  'flex items-center gap-2 px-2.5 py-2 rounded-lg border text-[10px]',
                  pose.captured && 'border-green-500/30 bg-green-500/10',
                  active && 'border-sky-400/40 bg-sky-400/10',
                  !pose.captured && !active && 'border-[#1e2433]',
                )}
              >
                {pose.captured
                  ? <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                  : <ScanFace className={cn('w-3.5 h-3.5 shrink-0', active ? 'text-sky-400' : 'text-muted-foreground')} />}
                <span className={cn('font-medium truncate', pose.captured && 'text-green-400')}>{pose.label}</span>
              </div>
            )
          })}
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed pt-1">
          {captureMode === 'auto'
            ? 'Tự động: giữ yên theo hướng dẫn — vòng TRÊN/TRÁI/PHẢI/DƯỚI lần lượt chuyển xanh.'
            : 'Thủ công: căn mặt theo hướng dẫn rồi bấm Chụp từng góc.'}
        </p>
      </div>
    </div>
  )
}
