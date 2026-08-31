import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { captureFaceEnrollmentFrameBase64 } from '../utils/patrolFaceCapture'
import type { PatrolScanEnrollment } from '../services/patrolWorkerProfile.service'
import {
  analyzeFaceScanFrame,
  faceLooseInFrame,
  faceReadyForSlot,
  getPatrolFaceScanModelStatus,
  guidanceForHint,
  guidanceForSlot,
  preloadPatrolFaceScanModels,
  type ScanPoseSlot,
} from '../utils/patrolFaceScanGuide'
import {
  computeFaceScanRingProgress,
  FACE_SCAN_AI_HOLD_MS,
  FACE_SCAN_HOLD_CAPTURE_MS,
  FACE_SCAN_MODEL_LOAD_TIMEOUT_MS,
} from '../utils/patrolFaceScanProgress'

const TICK_MS = 200
const CAPTURE_COOLDOWN_MS = 1400
/** BlazeFace báo ready nhưng không detect — chuyển hold-capture sau ~1.2s. */
const NO_FACE_FORCE_HOLD_TICKS = 6

export type PatrolFaceScanSubmit = (
  imageB64: string,
  slot: ScanPoseSlot,
) => Promise<{ face_added: boolean; enrollment: PatrolScanEnrollment; message?: string }>

export interface PatrolAutoFaceScanState {
  activeSlot: ScanPoseSlot
  guidance: string
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
): PatrolAutoFaceScanState & { retry: () => void } {
  const [activeSlot, setActiveSlot] = useState<ScanPoseSlot>(1)
  const [guidance, setGuidance] = useState(guidanceForSlot(1))
  const [faceDetected, setFaceDetected] = useState(false)
  const [poseMatched, setPoseMatched] = useState(false)
  const [holdProgress, setHoldProgress] = useState(0)
  const [capturing, setCapturing] = useState(false)
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [scanMode, setScanMode] = useState<'ai' | 'fallback'>('fallback')
  const [error, setError] = useState<string | null>(null)
  const [successFlash, setSuccessFlash] = useState<string | null>(null)

  const holdStartRef = useRef(0)
  const lastCaptureAtRef = useRef(0)
  const capturingRef = useRef(false)
  const analyzingRef = useRef(false)
  const modelLoadStartedRef = useRef(Date.now())
  const noFaceStreakRef = useRef(0)
  const forceHoldCaptureRef = useRef(true)

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
    setHoldProgress(0)
  }, [])

  useEffect(() => {
    if (!enrollment) return
    const pending = enrollment.poses.find(p => !p.captured)
    const slot = (pending?.slot ?? 1) as ScanPoseSlot
    setActiveSlot(slot)
    setGuidance(enrollment.complete ? `Hoàn thành! Đủ ${required} góc mặt.` : guidanceForSlot(slot))
    noFaceStreakRef.current = 0
    forceHoldCaptureRef.current = true
    resetHold()
  }, [enrollment?.pers_id, enrollment?.session_id, enrollment?.faces_captured, enrollment?.complete, resetHold])

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
      noFaceStreakRef.current = 0
      forceHoldCaptureRef.current = true

      if (result.message === 'duplicate_angle') {
        setSuccessFlash('Góc này giống ảnh trước — quay thêm một chút.')
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
    setGuidance(
      progress >= 1
        ? 'Đang quét…'
        : 'Giữ yên trong khung tròn — hệ thống tự chụp',
    )
    if (elapsed >= holdMs) {
      await runCapture(slot)
    }
  }, [runCapture])

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
          const useHoldCapture = forceHoldCaptureRef.current
            || status === 'unavailable'
            || status === 'loading' && modelTimedOut

          if (useHoldCapture) {
            setScanMode('fallback')
            setFaceDetected(true)
            setPoseMatched(true)
            await runHoldCapture(slot, now, FACE_SCAN_HOLD_CAPTURE_MS)
            return
          }

          setScanMode('ai')
          const metrics = await analyzeFaceScanFrame(video)
          if (cancelled) return

          const hasFace = metrics.hasFace
          const loose = faceLooseInFrame(metrics)
          const matched = faceReadyForSlot(metrics, slot) || (slot === 1 && loose)

          setFaceDetected(hasFace)
          setPoseMatched(matched)

          if (!hasFace) {
            noFaceStreakRef.current += 1
            if (noFaceStreakRef.current >= NO_FACE_FORCE_HOLD_TICKS) {
              forceHoldCaptureRef.current = true
              setScanMode('fallback')
              setFaceDetected(true)
              setPoseMatched(true)
              await runHoldCapture(slot, now, FACE_SCAN_HOLD_CAPTURE_MS)
              return
            }
            resetHold()
            setGuidance(guidanceForSlot(slot))
            return
          }

          noFaceStreakRef.current = 0
          forceHoldCaptureRef.current = false

          if (!matched) {
            resetHold()
            setGuidance(guidanceForHint(metrics.poseHint, slot))
            return
          }

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
    complete,
    enabled,
    enrollment,
    resetHold,
    resolveModelStatus,
    runCapture,
    captureMode,
    runHoldCapture,
    videoRef,
  ])

  const retry = useCallback(() => {
    setError(null)
    noFaceStreakRef.current = 0
    forceHoldCaptureRef.current = true
    resetHold()
  }, [resetHold])

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
