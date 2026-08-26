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
import { captureVideoFrameBase64 } from '@/modules/module02-training/services/mobileAiBackend.service'
import {
  fetchPatrolEnrollSession,
  fetchPatrolScanEnrollment,
  pingPatrolProfileBackend,
  scanPatrolEnrollSessionFace,
  scanPatrolWorkerFace,
  type PatrolScanEnrollment,
  type PatrolWorkerPerson,
} from '../services/patrolWorkerProfile.service'

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
  const [activeSlot, setActiveSlot] = useState(1)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const refreshStatus = useCallback(async () => {
    if (!subjectKey) return
    setLoading(true)
    setErrorMsg(null)
    try {
      const online = await pingPatrolProfileBackend()
      setBackendOnline(online)
      if (!online) {
        setErrorMsg('Không kết nối backend tuần tra. Kiểm tra URL backend AI.')
        return
      }
      const status = isSession
        ? await fetchPatrolEnrollSession(sessionId!)
        : await fetchPatrolScanEnrollment(person!.pers_id)
      setEnrollment(status)
      onEnrollmentChange?.(status)
      const nextSlot = status.poses.find(p => !p.captured)?.slot
      if (nextSlot) setActiveSlot(nextSlot)
      if (status.complete) onScanComplete?.(status)
    } catch (err) {
      setBackendOnline(false)
      setErrorMsg(err instanceof Error ? err.message : 'Không tải được trạng thái quét.')
    } finally {
      setLoading(false)
    }
  }, [subjectKey, isSession, sessionId, person, onEnrollmentChange, onScanComplete])

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

  const handleCapture = async () => {
    const video = videoRef.current
    if (!video || !cameraReady || !subjectKey) {
      setErrorMsg('Camera chưa sẵn sàng.')
      return
    }

    const imageB64 = captureVideoFrameBase64(video, 640, 0.82)
    if (!imageB64) {
      setErrorMsg('Không chụp được khung hình. Thử lại sau vài giây.')
      return
    }

    setCapturing(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      const result = isSession
        ? await scanPatrolEnrollSessionFace(sessionId!, imageB64, activeSlot)
        : await scanPatrolWorkerFace(person!.pers_id, imageB64, activeSlot)
      setEnrollment(result.enrollment)
      onEnrollmentChange?.(result.enrollment)
      if (result.message === 'duplicate_angle') {
        setSuccessMsg('Góc này trùng vector đã lưu — thử nghiêng đầu thêm.')
      } else if (result.face_added) {
        setSuccessMsg(`Đã lưu góc "${result.enrollment.poses.find(p => p.slot === activeSlot)?.label ?? activeSlot}".`)
      }
      const pending = result.enrollment.poses.find(p => !p.captured)
      if (pending) {
        setActiveSlot(pending.slot)
      } else if (result.enrollment.complete) {
        onScanComplete?.(result.enrollment)
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lưu ảnh thất bại.')
    } finally {
      setCapturing(false)
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
      ? 'Quét 3 góc mặt — hệ thống đánh giá đủ vector rồi mới sang bước nhập họ tên và đơn vị.'
      : `Quét 3 góc mặt cho ${displayName} (${person?.employee_code ?? person?.pers_id}) — `
        + 'vector lưu vào kho tuần tra Module 05, khớp nhận diện trên mũ & flycam.'
  )

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

      {successMsg && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-green-500/25 bg-green-500/10 text-green-400 text-xs">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-red-500/25 bg-red-500/10 text-red-400 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-4">
        <div className="relative aspect-[4/3] rounded-xl overflow-hidden border border-[#1e2433] bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
          />
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-[42%] aspect-[3/4] rounded-[999px] border-2 border-violet-400/50 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
          <div className="absolute left-3 top-3 flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/55 border border-white/10 text-[10px]">
            <Camera className="w-3 h-3 text-violet-400" />
            <span className={cameraReady ? 'text-green-400' : 'text-amber-400'}>
              {cameraReady ? 'Camera sẵn sàng' : 'Đang mở camera…'}
            </span>
          </div>
          {cameraError && (
            <div className="absolute inset-x-3 bottom-3 p-2 rounded-lg bg-red-500/15 border border-red-500/30 text-[10px] text-red-300">
              {cameraError}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-[#1e2433] bg-[#0b0f1a] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tiến độ vector</span>
              <span className={cn('text-[10px] font-bold tabular-nums', complete ? 'text-green-400' : 'text-violet-400')}>
                {capturedCount}/{enrollment?.faces_required ?? 3}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[#1e2433] overflow-hidden">
              <div
                className={cn('h-full transition-all', complete ? 'bg-green-400' : 'bg-violet-400')}
                style={{ width: `${Math.round((capturedCount / (enrollment?.faces_required ?? 3)) * 100)}%` }}
              />
            </div>
            <div className="space-y-2">
              {poses.map(pose => (
                <button
                  key={pose.slot}
                  type="button"
                  onClick={() => setActiveSlot(pose.slot)}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left transition-colors',
                    pose.slot === activeSlot
                      ? 'border-violet-400/40 bg-violet-400/10'
                      : 'border-[#1e2433] hover:border-[#2a3855]',
                  )}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <ScanFace className={cn('w-3.5 h-3.5 shrink-0', pose.captured ? 'text-green-400' : 'text-muted-foreground')} />
                    <span className="text-[11px] font-medium truncate">{pose.label}</span>
                  </span>
                  {pose.captured
                    ? <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    : <span className="text-[9px] text-muted-foreground shrink-0">Chưa quét</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[#1e2433] bg-[#0b0f1a] p-4 space-y-3">
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Góc đang quét: <span className="text-foreground font-semibold">{poses.find(p => p.slot === activeSlot)?.label}</span>.
              {isSession
                ? ' Đủ 3 góc sẽ chuyển sang nhập họ tên và đơn vị.'
                : ' Vector embedding dùng chung engine nhận diện tuần tra (SFace).'}
            </p>
            <button
              type="button"
              onClick={() => void handleCapture()}
              disabled={capturing || !cameraReady || backendOnline === false || complete}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-violet-500 text-white hover:bg-violet-500/90 transition-all disabled:opacity-50"
            >
              {capturing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanFace className="w-4 h-4" />}
              {complete ? 'Đã đủ 3 góc' : `Chụp ${poses.find(p => p.slot === activeSlot)?.label ?? 'góc này'}`}
            </button>
            {complete && (
              <p className="text-[10px] text-green-400 text-center">
                {isSession
                  ? 'Đủ vector — nhấn Tiếp tục bên dưới để nhập thông tin.'
                  : 'Hồ sơ đủ vector — sẵn sàng nhận diện trên Module 05.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
