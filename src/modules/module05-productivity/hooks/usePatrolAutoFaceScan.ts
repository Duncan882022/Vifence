import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { captureFaceEnrollmentFrameBase64 } from '../utils/patrolFaceCapture'
import type { PatrolScanEnrollment } from '../services/patrolWorkerProfile.service'
import {
  analyzeFaceScanFrame,
  basicFacePresentInVideo,
  faceReadyForAutoSlot,
  getPatrolFaceScanModelStatus,
  guidanceForHint,
  guidanceForSlot,
  preloadPatrolFaceScanModels,
  type ScanPoseSlot,
} from '../utils/patrolFaceScanGuide'
import { faceScanMainInstruction } from '../utils/patrolFaceScanPoses'
import {
  computeFaceScanRingProgress,
  FACE_SCAN_AI_HOLD_MS,
  FACE_SCAN_HOLD_CAPTURE_MS,
  FACE_SCAN_HOLD_MISMATCH_TICKS,
  FACE_SCAN_MODEL_LOAD_TIMEOUT_MS,
} from '../utils/patrolFaceScanProgress'

const TICK_MS = 120
const CAPTURE_COOLDOWN_MS = 900

export type PatrolFaceScanSubmit = (
  imageB64: string,
  slot: ScanPoseSlot,
) => Promise<{ face_added: boolean; enrollment: PatrolScanEnrollment; message?: string }>

export interface PatrolAutoFaceScanState {
  activeSlot: ScanPoseSlot
  guidance: string
  subGuidance: string
  ringProgress: number
  holdProgress: number
  faceDetected: boolean
  poseMatched: boolean
  capturing: boolean
  modelStatus: 'loading' | 'ready' | 'unavailable'
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
  captureMode: 'auto' | 'manual' = 'auto',
): PatrolAutoFaceScanState & { retry: () => void; resetScanAttempt: () => void } {
  const [activeSlot, setActiveSlot] = useState<ScanPoseSlot>(1)
  const [subGuidance, setSubGuidance] = useState(guidanceForSlot(1))
  const [faceDetected, setFaceDetected] = useState(false)
  const [poseMatched, setPoseMatched] = useState(false)
  const [holdProgress, setHoldProgress] = useState(0)
  const [capturing, setCapturing] = useState(false)
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [scanMode, setScanMode] = useState<'ai' | 'fallback'>('ai')
  const [error, setError] = useState<string | null>(null)
  const [successFlash, setSuccessFlash] = useState<string | null>(null)

  const holdStartRef = useRef(0)
  const lastCaptureAtRef = useRef(0)
  const capturingRef = useRef(false)
  const analyzingRef = useRef(false)
  const mismatchStreakRef = useRef(0)
  const modelLoadStartedRef = useRef(Date.now())

  const capturedCount = enrollment?.faces_captured ?? 0
  const required = enrollment?.faces_required ?? 4
  const complete = enrollment?.complete ?? false
  const holdProgressClamped = Math.max(0, Math.min(1, holdProgress))
  const ringProgress = computeFaceScanRingProgress(
    capturedCount,
    required,
    holdProgressClamped,
    complete,
  )
  const guidance = complete
    ? `Hoàn thành! Đủ ${required} góc mặt.`
    : faceScanMainInstruction(activeSlot, false, 'auto')

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

  const resetHold = useCallback(() => {
    holdStartRef.current = 0
    mismatchStreakRef.current = 0
    setHoldProgress(0)
  }, [])

  const resetScanAttempt = useCallback(() => {
    resetHold()
    setError(null)
    setSuccessFlash(null)
    if (enrollment) {
      const pending = enrollment.poses.find(p => !p.captured)
      const slot = (pending?.slot ?? 1) as ScanPoseSlot
      setActiveSlot(slot)
      setSubGuidance(enrollment.complete ? `Hoàn thành! Đủ ${required} góc mặt.` : guidanceForSlot(slot))
    }
  }, [enrollment, required, resetHold])

  useEffect(() => {
    if (!enrollment) return
    const pending = enrollment.poses.find(p => !p.captured)
    const slot = (pending?.slot ?? 1) as ScanPoseSlot
    setActiveSlot(slot)
    setSubGuidance(enrollment.complete ? `Hoàn thành! Đủ ${required} góc mặt.` : guidanceForSlot(slot))
    resetHold()
  }, [enrollment?.pers_id, enrollment?.session_id, enrollment?.faces_captured, enrollment?.complete, resetHold, required])

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
      resetHold()

      if (result.message === 'duplicate_angle') {
        setSuccessFlash('Góc này giống ảnh trước — quay thêm một chút.')
        setSubGuidance('Quay đầu thêm một chút rồi giữ yên…')
      } else if (result.face_added) {
        setSuccessFlash('Đã lưu!')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lưu vector thất bại.')
      resetHold()
    } finally {
      capturingRef.current = false
      setCapturing(false)
    }
  }, [complete, onEnrollmentChange, resetHold, submitScan, videoRef])

  const runHoldCapture = useCallback(async (slot: ScanPoseSlot, now: number, holdMs: number) => {
    if (holdStartRef.current === 0) holdStartRef.current = now
    const elapsed = now - holdStartRef.current
    const progress = Math.min(1, elapsed / holdMs)
    setHoldProgress(progress)
    setSubGuidance(
      progress >= 1
        ? 'Đang quét…'
        : 'Giữ yên — vòng tròn đang được quét',
    )
    if (elapsed >= holdMs) {
      await runCapture(slot)
    }
  }, [runCapture])

  const bumpMismatch = useCallback(() => {
    mismatchStreakRef.current += 1
    if (mismatchStreakRef.current >= FACE_SCAN_HOLD_MISMATCH_TICKS) {
      resetHold()
    }
  }, [resetHold])

  useEffect(() => {
    modelLoadStartedRef.current = Date.now()
    preloadPatrolFaceScanModels()
    const poll = window.setInterval(() => {
      const s = resolveModelStatus()
      setModelStatus(prev => (prev === s ? prev : s))
    }, 400)
    return () => window.clearInterval(poll)
  }, [resolveModelStatus])

  useEffect(() => {
    if (!enabled || complete || !enrollment || captureMode !== 'auto') return

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

          const modelTimedOut = now - modelLoadStartedRef.current >= FACE_SCAN_MODEL_LOAD_TIMEOUT_MS
          const useFallback = status === 'unavailable' || (status === 'loading' && modelTimedOut)

          if (useFallback) {
            setScanMode('fallback')
            const hasBasicFace = basicFacePresentInVideo(video)
            setFaceDetected(hasBasicFace)
            setPoseMatched(hasBasicFace)
            if (!hasBasicFace) {
              bumpMismatch()
              if (mismatchStreakRef.current >= FACE_SCAN_HOLD_MISMATCH_TICKS) {
                setSubGuidance('Đưa mặt vào giữa khung tròn')
              }
              return
            }
            mismatchStreakRef.current = 0
            await runHoldCapture(slot, now, FACE_SCAN_HOLD_CAPTURE_MS)
            return
          }

          if (status === 'loading') {
            setScanMode('ai')
            setSubGuidance('Đang tải AI nhận diện góc mặt…')
            resetHold()
            return
          }

          setScanMode('ai')
          const metrics = await analyzeFaceScanFrame(video)
          if (cancelled) return

          const hasFace = metrics.hasFace
          const matched = faceReadyForAutoSlot(metrics, slot)

          setFaceDetected(hasFace)
          setPoseMatched(matched)

          if (!hasFace) {
            bumpMismatch()
            setSubGuidance(guidanceForSlot(slot))
            return
          }

          if (!matched) {
            bumpMismatch()
            setSubGuidance(guidanceForHint(metrics.poseHint, slot))
            return
          }

          mismatchStreakRef.current = 0
          await runHoldCapture(slot, now, FACE_SCAN_AI_HOLD_MS)
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
  }, [
    activeSlot,
    bumpMismatch,
    complete,
    enabled,
    enrollment,
    resetHold,
    resolveModelStatus,
    captureMode,
    runHoldCapture,
    videoRef,
  ])

  const retry = useCallback(() => {
    setError(null)
    resetHold()
    modelLoadStartedRef.current = Date.now()
    preloadPatrolFaceScanModels()
  }, [resetHold])

  return {
    activeSlot,
    guidance,
    subGuidance,
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
    resetScanAttempt,
  }
}
