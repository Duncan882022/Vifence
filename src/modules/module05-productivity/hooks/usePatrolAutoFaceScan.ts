import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { captureFaceEnrollmentFrameBase64 } from '../utils/patrolFaceCapture'
import type { PatrolScanEnrollment } from '../services/patrolWorkerProfile.service'
import {
  analyzeFaceScanFrame,
  faceReadyForSlot,
  getPatrolFaceScanModelStatus,
  guidanceForHint,
  guidanceForSlot,
  preloadPatrolFaceScanModels,
  type ScanPoseSlot,
} from '../utils/patrolFaceScanGuide'
import {
  computeFaceScanRingProgress,
  FACE_SCAN_MODEL_LOAD_TIMEOUT_MS,
} from '../utils/patrolFaceScanProgress'

const TICK_MS = 200
const STABLE_FRAMES = 3
const CAPTURE_COOLDOWN_MS = 1400
/** Khi AI local không tải được — vẫn tự quét sau giữ yên (eKYC fallback). */
const FALLBACK_HOLD_MS = 1800

export type PatrolFaceScanSubmit = (
  imageB64: string,
  slot: ScanPoseSlot,
) => Promise<{ face_added: boolean; enrollment: PatrolScanEnrollment; message?: string }>

export interface PatrolAutoFaceScanState {
  activeSlot: ScanPoseSlot
  guidance: string
  /** Vòng ngoài — góc đã xong + phần giữ yên góc hiện tại (0–1). */
  ringProgress: number
  holdProgress: number
  faceDetected: boolean
  poseMatched: boolean
  capturing: boolean
  modelStatus: 'loading' | 'ready' | 'unavailable'
  /** AI local hay fallback giữ yên khi model không tải. */
  scanMode: 'ai' | 'fallback'
  error: string | null
  successFlash: string | null
}

export function usePatrolAutoFaceScan(
  videoRef: RefObject<HTMLVideoElement | null>,
  submitScan: PatrolFaceScanSubmit,
  enrollment: PatrolScanEnrollment | null,
  enabled: boolean,
  onEnrollmentChange: (enrollment: PatrolScanEnrollment) => void,
): PatrolAutoFaceScanState & { retry: () => void } {
  const [activeSlot, setActiveSlot] = useState<ScanPoseSlot>(1)
  const [guidance, setGuidance] = useState(guidanceForSlot(1))
  const [faceDetected, setFaceDetected] = useState(false)
  const [poseMatched, setPoseMatched] = useState(false)
  const [holdProgress, setHoldProgress] = useState(0)
  const [capturing, setCapturing] = useState(false)
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [scanMode, setScanMode] = useState<'ai' | 'fallback'>('ai')
  const [error, setError] = useState<string | null>(null)
  const [successFlash, setSuccessFlash] = useState<string | null>(null)

  const stableCountRef = useRef(0)
  const holdStartRef = useRef(0)
  const lastCaptureAtRef = useRef(0)
  const capturingRef = useRef(false)
  const analyzingRef = useRef(false)
  const slotEnteredAtRef = useRef(Date.now())
  const modelLoadStartedRef = useRef(Date.now())

  const capturedCount = enrollment?.faces_captured ?? 0
  const required = enrollment?.faces_required ?? 3
  const complete = enrollment?.complete ?? false
  const holdProgressClamped = Math.max(0, Math.min(1, holdProgress))
  const ringProgress = computeFaceScanRingProgress(
    capturedCount,
    required,
    holdProgressClamped,
    complete,
  )

  const resolveModelStatus = useCallback((): 'loading' | 'ready' | 'unavailable' => {
    const raw = getPatrolFaceScanModelStatus()
    if (raw === 'loading') {
      if (Date.now() - modelLoadStartedRef.current >= FACE_SCAN_MODEL_LOAD_TIMEOUT_MS) {
        return 'unavailable'
      }
      return 'loading'
    }
    return raw
  }, [])

  useEffect(() => {
    if (!enrollment) return
    const pending = enrollment.poses.find(p => !p.captured)
    const slot = (pending?.slot ?? 1) as ScanPoseSlot
    setActiveSlot(slot)
    setGuidance(enrollment.complete ? 'Hoàn thành! Đủ 3 góc mặt rồi.' : guidanceForSlot(slot))
    slotEnteredAtRef.current = Date.now()
    stableCountRef.current = 0
    holdStartRef.current = 0
    setHoldProgress(0)
  }, [enrollment?.pers_id, enrollment?.session_id, enrollment?.faces_captured, enrollment?.complete])

  const runCapture = useCallback(async (slot: ScanPoseSlot) => {
    const video = videoRef.current
    if (!video || capturingRef.current || complete) return
    capturingRef.current = true
    setCapturing(true)
    setError(null)
    setSuccessFlash(null)

    const imageB64 = captureFaceEnrollmentFrameBase64(video)
    if (!imageB64) {
      setError('Không quét được — thử lại.')
      capturingRef.current = false
      setCapturing(false)
      return
    }

    try {
      const result = await submitScan(imageB64, slot)
      onEnrollmentChange(result.enrollment)
      lastCaptureAtRef.current = Date.now()
      stableCountRef.current = 0
      holdStartRef.current = 0
      setHoldProgress(0)

      if (result.message === 'duplicate_angle') {
        setSuccessFlash('Góc này giống ảnh trước — quay thêm một chút.')
      } else if (result.face_added) {
        setSuccessFlash('Đã lưu!')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lưu vector thất bại.')
      stableCountRef.current = 0
      holdStartRef.current = 0
      setHoldProgress(0)
    } finally {
      capturingRef.current = false
      setCapturing(false)
    }
  }, [complete, onEnrollmentChange, submitScan, videoRef])

  useEffect(() => {
    modelLoadStartedRef.current = Date.now()
    preloadPatrolFaceScanModels()
    const poll = window.setInterval(() => {
      const s = resolveModelStatus()
      setModelStatus(prev => (prev === s ? prev : s))
      setScanMode(prev => {
        if (s === 'ready') return 'ai'
        if (s === 'unavailable') return 'fallback'
        return prev
      })
    }, 400)
    return () => window.clearInterval(poll)
  }, [resolveModelStatus])

  useEffect(() => {
    if (!enabled || complete || !enrollment) return

    let cancelled = false

    const tick = () => {
      void (async () => {
        if (cancelled || capturingRef.current || analyzingRef.current) return
        const video = videoRef.current
        if (!video || video.readyState < 2) return

        const now = Date.now()
        if (now - lastCaptureAtRef.current < CAPTURE_COOLDOWN_MS) return

        const slot = activeSlot
        analyzingRef.current = true

        try {
          const status = resolveModelStatus()
          setModelStatus(status)
          if (status === 'ready') setScanMode('ai')
          else if (status === 'unavailable') setScanMode('fallback')

          let matched = false
          let hasFace = false

          if (status === 'ready') {
            const metrics = await analyzeFaceScanFrame(video)
            if (cancelled) return

            hasFace = metrics.hasFace
            matched = faceReadyForSlot(metrics, slot)
            setFaceDetected(hasFace)
            setPoseMatched(matched)

            if (capturingRef.current) {
              setGuidance('Đang lưu… giữ yên')
              return
            }

            if (!hasFace || !matched) {
              stableCountRef.current = 0
              holdStartRef.current = 0
              setHoldProgress(0)
              setGuidance(
                hasFace
                  ? guidanceForHint(metrics.poseHint, slot)
                  : guidanceForSlot(slot),
              )
              return
            }
          } else if (status === 'unavailable') {
            // Fallback eKYC: giữ yên trong khung ~1.8s rồi tự quét (backend xác thực mặt)
            hasFace = true
            matched = now - slotEnteredAtRef.current > 600
            setFaceDetected(true)
            setPoseMatched(matched)
            if (!matched) {
              setGuidance('Đưa mặt vào khung tròn — giữ yên')
              return
            }
          } else {
            setGuidance('Đang tải AI nhận diện…')
            return
          }

          if (holdStartRef.current === 0) holdStartRef.current = now

          if (status === 'ready') {
            stableCountRef.current += 1
            const progress = Math.min(1, stableCountRef.current / STABLE_FRAMES)
            setHoldProgress(progress)
            setGuidance(progress >= 1 ? 'Đang quét…' : `Giữ yên… ${Math.ceil((1 - progress) * STABLE_FRAMES * TICK_MS / 1000) || 1}s`)

            if (stableCountRef.current >= STABLE_FRAMES) {
              await runCapture(slot)
            }
          } else {
            const elapsed = now - holdStartRef.current
            const progress = Math.min(1, elapsed / FALLBACK_HOLD_MS)
            setHoldProgress(progress)
            setGuidance(progress >= 1 ? 'Đang quét…' : 'Giữ yên trong khung…')
            if (elapsed >= FALLBACK_HOLD_MS) {
              await runCapture(slot)
            }
          }
        } finally {
          analyzingRef.current = false
        }
      })()
    }

    const timer = window.setInterval(tick, TICK_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [activeSlot, complete, enabled, enrollment, resolveModelStatus, runCapture, videoRef])

  const retry = useCallback(() => {
    setError(null)
    stableCountRef.current = 0
    holdStartRef.current = 0
    setHoldProgress(0)
  }, [])

  return {
    activeSlot,
    guidance,
    ringProgress,
    holdProgress: holdProgressClamped,
    faceDetected,
    poseMatched,
    capturing,
    modelStatus,
    scanMode,
    error,
    successFlash,
    retry,
  }
}
