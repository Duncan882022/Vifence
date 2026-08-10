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
import type { User } from '@/types/user'
import { captureVideoFrameBase64 } from '@/modules/module02-training/services/mobileAiBackend.service'
import {
  enrollWorkerFaceForIdentity,
  fetchWorkerGalleryStatusForIdentity,
  pingWorkerGalleryBackend,
  type FacialScannerIdentity,
  type WorkerEnrollmentStatus,
} from '../services/workerGallery.service'

interface FacialScannerPanelProps {
  identity: FacialScannerIdentity
  subtitle?: string
}

export function deriveEmployeeCodeFromUser(user: User): string {
  if (user.username?.trim()) return user.username.trim().toUpperCase()
  return `NV${user.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase() || '000001'}`
}

export function identityFromUser(user: User): FacialScannerIdentity {
  return {
    userId: user.id,
    workerName: user.fullName || user.name || user.username || 'Người dùng',
    employeeCode: deriveEmployeeCodeFromUser(user),
  }
}

export function FacialScannerPanel({ identity, subtitle }: FacialScannerPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [backendOnline, setBackendOnline] = useState<boolean | null>(null)
  const [enrollment, setEnrollment] = useState<WorkerEnrollmentStatus | null>(null)
  const [activeSlot, setActiveSlot] = useState(1)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const identityKey = identity.cccd ?? identity.userId ?? ''

  const refreshStatus = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const online = await pingWorkerGalleryBackend()
      setBackendOnline(online)
      if (!online) {
        setErrorMsg('Không kết nối được backend AI. Kiểm tra VITE_MOBILE_AI_BACKEND_URL.')
        return
      }
      const status = await fetchWorkerGalleryStatusForIdentity(identity)
      setEnrollment(status.enrollment ?? null)
      const nextSlot = status.enrollment?.poses.find(p => !p.captured)?.slot
      if (nextSlot) setActiveSlot(nextSlot)
    } catch (err) {
      setBackendOnline(false)
      setErrorMsg(err instanceof Error ? err.message : 'Không tải được trạng thái gallery.')
    } finally {
      setLoading(false)
    }
  }, [identity.userId, identity.cccd])

  const startCamera = useCallback(async () => {
    setCameraError(null)
    setCameraReady(false)
    try {
      streamRef.current?.getTracks().forEach(track => track.stop())
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 960 },
          height: { ideal: 720 },
        },
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
  }, [refreshStatus, startCamera, identityKey])

  const handleCapture = async () => {
    const video = videoRef.current
    if (!video || !cameraReady) {
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
      const next = await enrollWorkerFaceForIdentity(identity, imageB64, activeSlot)
      setEnrollment(next)
      setSuccessMsg(`Đã lưu góc "${next.poses.find(p => p.slot === activeSlot)?.label ?? activeSlot}".`)
      const pending = next.poses.find(p => !p.captured)
      if (pending) {
        setActiveSlot(pending.slot)
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lưu ảnh thất bại.')
    } finally {
      setCapturing(false)
    }
  }

  const poses = enrollment?.poses ?? [
    { slot: 1, label: 'Chính diện', captured: false, filename: '' },
    { slot: 2, label: 'Nghiêng trái', captured: false, filename: '' },
    { slot: 3, label: 'Nghiêng phải', captured: false, filename: '' },
  ]
  const capturedCount = enrollment?.poses_captured ?? poses.filter(p => p.captured).length
  const complete = enrollment?.complete ?? false
  const defaultSubtitle = identity.cccd
    ? `Quét 3 góc mặt để đăng ký nhận diện ATLĐ — CCCD: ${identity.employeeCode}.`
    : `Quét 3 góc mặt để hệ thống nhận diện bạn trên vi phạm PPE/WAH/PCCC — mã: ${identity.employeeCode}.`

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">
            Quét khuôn mặt ATLĐ
          </h2>
          <p className="text-[11px] text-muted-foreground mt-1 max-w-xl">
            {subtitle ?? defaultSubtitle}
          </p>
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
            <div className="w-[42%] aspect-[3/4] rounded-[999px] border-2 border-sky-400/50 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
          <div className="absolute left-3 top-3 flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/55 border border-white/10 text-[10px]">
            <Camera className="w-3 h-3 text-sky-400" />
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
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tiến độ quét</span>
              <span className={cn(
                'text-[10px] font-bold tabular-nums',
                complete ? 'text-green-400' : 'text-sky-400',
              )}>
                {capturedCount}/3
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[#1e2433] overflow-hidden">
              <div
                className={cn('h-full transition-all', complete ? 'bg-green-400' : 'bg-sky-400')}
                style={{ width: `${Math.round((capturedCount / 3) * 100)}%` }}
              />
            </div>
            <div className="space-y-2">
              {poses.map(pose => {
                const active = pose.slot === activeSlot
                return (
                  <button
                    key={pose.slot}
                    type="button"
                    onClick={() => setActiveSlot(pose.slot)}
                    className={cn(
                      'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left transition-colors',
                      active
                        ? 'border-sky-400/40 bg-sky-400/10'
                        : 'border-[#1e2433] hover:border-[#2a3855]',
                    )}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <ScanFace className={cn('w-3.5 h-3.5 shrink-0', pose.captured ? 'text-green-400' : 'text-muted-foreground')} />
                      <span className="text-[11px] font-medium truncate">{pose.label}</span>
                    </span>
                    {pose.captured ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    ) : (
                      <span className="text-[9px] text-muted-foreground shrink-0">Chưa quét</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="rounded-xl border border-[#1e2433] bg-[#0b0f1a] p-4 space-y-3">
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Góc đang quét: <span className="text-foreground font-semibold">{poses.find(p => p.slot === activeSlot)?.label}</span>.
              Giữ mặt trong khung oval, ánh sáng đều, không che khuôn mặt.
            </p>
            <button
              type="button"
              onClick={() => void handleCapture()}
              disabled={capturing || !cameraReady || backendOnline === false || complete}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/95 transition-all disabled:opacity-50"
            >
              {capturing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ScanFace className="w-4 h-4" />
              )}
              {complete ? 'Đã đủ 3 góc' : `Chụp ${poses.find(p => p.slot === activeSlot)?.label ?? 'góc này'}`}
            </button>
            {complete && (
              <p className="text-[10px] text-green-400 text-center">
                Gallery đã đủ dữ liệu nhận diện{identity.cccd ? ' cho CCCD này' : ' cho tài khoản này'}.
              </p>
            )}
            {backendOnline === false && (
              <p className="text-[10px] text-amber-400 text-center">
                Backend AI offline — không thể lưu ảnh.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
