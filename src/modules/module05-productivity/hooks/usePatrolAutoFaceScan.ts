import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { captureFaceEnrollmentFrameBase64 } from '../utils/patrolFaceCapture'
import type { PatrolScanEnrollment } from '../services/patrolWorkerProfile.service'
import {
  analyzeFaceScanFrame,
  autoScanInstruction,
  basicFacePresentInVideo,
  faceReadyForAutoSlot,
  getPatrolFaceScanModelStatus,
  guidanceForSlot,
  liveScanHint,
  poseApproachProgress,
  preloadPatrolFaceScanModels,
  type LiveScanHint,
  type ScanPoseSlot,
} from '../utils/patrolFaceScanGuide'
import { FACE_SCAN_POSE_COUNT } from '../utils/patrolFaceScanPoses'
import { isHandheldDevice } from '@/modules/module02-training/services/deviceCamera.service'
import { faceScanMainInstruction } from '../utils/patrolFaceScanPoses'
import {
  computeFaceScanRingProgress,
  FACE_SCAN_AI_HOLD_MS,
  FACE_SCAN_HOLD_CAPTURE_MS,
  FACE_SCAN_HOLD_MISMATCH_TICKS,
  FACE_SCAN_MODEL_LOAD_TIMEOUT_MS,
} from '../utils/patrolFaceScanProgress'

const ANALYZE_MS = 180
const CAPTURE_COOLDOWN_MS = 900
const MODEL_LOAD_TIMEOUT_MS = isHandheldDevice() ? 3500 : FACE_SCAN_MODEL_LOAD_TIMEOUT_MS

export type PatrolFaceScanSubmit = (
  imageB64: string,
  slot: ScanPoseSlot,
) => Promise<{ face_added: boolean; enrollment: PatrolScanEnrollment; message?: string }>

export interface PatrolAutoFaceScanState {
  activeSlot: ScanPoseSlot
  guidance: string
  subGuidance: string
  liveHint: LiveScanHint
  ringProgress: number
  holdProgress: number
  approachProgress: number
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
  scanActive: boolean,
  onEnrollmentChange: (enrollment: PatrolScanEnrollment) => void,
  captureMode: 'auto' | 'manual' = 'auto',
  canSubmit = true,
): PatrolAutoFaceScanState & { retry: () => void; resetScanAttempt: () => void } {
  const [activeSlot, setActiveSlot] = useState<ScanPoseSlot>(1)
  const [subGuidance, setSubGuidance] = useState(guidanceForSlot(1))
  const [liveHint, setLiveHint] = useState<LiveScanHint>(() =>
    liveScanHint(null, 1, 'approach'),
  )
  const [faceDetected, setFaceDetected] = useState(false)
  const [poseMatched, setPoseMatched] = useState(false)
  const [holdProgress, setHoldProgress] = useState(0)
  const [approachProgress, setApproachProgress] = useState(0)
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
  const poseReadyRef = useRef(false)
  const holdMsRef = useRef(FACE_SCAN_AI_HOLD_MS)
  const activeSlotRef = useRef<ScanPoseSlot>(1)
  const canSubmitRef = useRef(canSubmit)

  canSubmitRef.current = canSubmit

  const applyHint = useCallback((
    metrics: Parameters<typeof liveScanHint>[0],
    slot: ScanPoseSlot,
    phase: Parameters<typeof liveScanHint>[2],
    holdProgress = 0,
  ) => {
    const hint = liveScanHint(metrics, slot, phase, holdProgress)
    setLiveHint(hint)
    setSubGuidance(hint.text)
  }, [])

  const capturedCount = enrollment?.faces_captured ?? 0
  const required = enrollment?.faces_required ?? FACE_SCAN_POSE_COUNT
  const complete = enrollment?.complete ?? false
  const holdProgressClamped = Math.max(0, Math.min(1, holdProgress))
  const approachProgressClamped = Math.max(0, Math.min(0.88, approachProgress))
  const ringProgress = computeFaceScanRingProgress(
    capturedCount,
    required,
    holdProgressClamped,
    complete,
    approachProgressClamped,
  )
  const guidance = complete
    ? `Hoàn thành! Đủ ${required} góc mặt.`
    : faceScanMainInstruction(activeSlot, false, 'auto')

  activeSlotRef.current = activeSlot

  const resolveModelStatus = useCallback((): 'loading' | 'ready' | 'unavailable' => {
    const raw = getPatrolFaceScanModelStatus()
    if (raw === 'loading') {
      if (Date.now() - modelLoadStartedRef.current >= MODEL_LOAD_TIMEOUT_MS) {
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
    setApproachProgress(0)
  }, [])

  const resetScanAttempt = useCallback(() => {
    resetHold()
    setError(null)
    setSuccessFlash(null)
    poseReadyRef.current = false
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
    poseReadyRef.current = false
  }, [enrollment?.pers_id, enrollment?.session_id, enrollment?.faces_captured, enrollment?.complete, resetHold, required])

  const runCapture = useCallback(async (slot: ScanPoseSlot) => {
    const video = videoRef.current
    if (!video || capturingRef.current || complete) return
    capturingRef.current = true
    setCapturing(true)
    setError(null)
    setSuccessFlash(null)
    poseReadyRef.current = false

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
        applyHint(null, slot, 'approach')
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
  }, [applyHint, complete, onEnrollmentChange, resetHold, submitScan, videoRef])

  const tickHold = useCallback((now: number) => {
    if (!poseReadyRef.current || capturingRef.current) return
    if (now - lastCaptureAtRef.current < CAPTURE_COOLDOWN_MS) return

    const slot = activeSlotRef.current
    const holdMs = holdMsRef.current
    if (holdStartRef.current === 0) holdStartRef.current = now
    const elapsed = now - holdStartRef.current
    const progress = Math.min(1, elapsed / holdMs)
    setHoldProgress(progress)
    setSubGuidance(
      progress >= 1
        ? autoScanInstruction(null, slot, 'capture')
        : autoScanInstruction(null, slot, 'hold', progress),
    )
    applyHint(null, slot, progress >= 1 ? 'capture' : 'hold', progress)
    if (elapsed >= holdMs) {
      if (!canSubmitRef.current) {
        setError('Chưa kết nối backend — thử lại sau.')
        resetHold()
        return
      }
      void runCapture(slot)
    }
  }, [applyHint, resetHold, runCapture])

  const bumpMismatch = useCallback(() => {
    mismatchStreakRef.current += 1
    if (mismatchStreakRef.current >= FACE_SCAN_HOLD_MISMATCH_TICKS) {
      poseReadyRef.current = false
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
    if (!scanActive || complete || !enrollment || captureMode !== 'auto') return

    let cancelled = false

    const analyze = () => {
      void (async () => {
        if (cancelled || capturingRef.current || analyzingRef.current) return
        const video = videoRef.current
        if (!video || video.readyState < 2) return

        const slot = activeSlotRef.current
        analyzingRef.current = true

        try {
          const basicFace = basicFacePresentInVideo(video)
          const status = resolveModelStatus()
          setModelStatus(status)

          const modelTimedOut = Date.now() - modelLoadStartedRef.current >= MODEL_LOAD_TIMEOUT_MS
          const useFallback = status === 'unavailable' || (status === 'loading' && modelTimedOut)

          if (useFallback) {
            setScanMode('fallback')
            holdMsRef.current = FACE_SCAN_HOLD_CAPTURE_MS
            setFaceDetected(basicFace)
            setPoseMatched(basicFace)
            if (basicFace) {
              mismatchStreakRef.current = 0
              poseReadyRef.current = true
              setApproachProgress(0.55)
              applyHint(null, slot, 'fallback')
            } else {
              bumpMismatch()
              poseReadyRef.current = false
              setApproachProgress(0)
              applyHint(null, slot, 'fallback')
            }
            return
          }

          if (status === 'loading') {
            setScanMode('ai')
            setFaceDetected(basicFace)
            setApproachProgress(basicFace ? 0.2 : 0)
            if (basicFace) {
              applyHint(null, slot, 'fallback')
            } else {
              applyHint(null, slot, 'loading')
            }
            poseReadyRef.current = false
            resetHold()
            return
          }

          setScanMode('ai')
          holdMsRef.current = FACE_SCAN_AI_HOLD_MS
          const metrics = await analyzeFaceScanFrame(video)
          if (cancelled) return

          const hasFace = metrics.hasFace || basicFace
          const enriched = hasFace && !metrics.hasFace
            ? { ...metrics, hasFace: true, poseHint: 'front' as const }
            : metrics
          const matched = faceReadyForAutoSlot(enriched, slot)
          const approach = hasFace ? poseApproachProgress(enriched, slot) : 0

          setFaceDetected(hasFace)
          setPoseMatched(matched)
          setApproachProgress(matched ? 0 : Math.max(approach, basicFace ? 0.15 : 0))

          if (!hasFace) {
            bumpMismatch()
            poseReadyRef.current = false
            applyHint(enriched, slot, 'no_face')
            return
          }

          if (!matched) {
            bumpMismatch()
            poseReadyRef.current = false
            applyHint(enriched, slot, 'approach')
            return
          }

          mismatchStreakRef.current = 0
          poseReadyRef.current = true
          setApproachProgress(0)
          applyHint(enriched, slot, 'hold')
        } finally {
          analyzingRef.current = false
        }
      })()
    }

    analyze()
    const timer = window.setInterval(analyze, ANALYZE_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [
    applyHint,
    bumpMismatch,
    complete,
    scanActive,
    enrollment,
    resetHold,
    resolveModelStatus,
    captureMode,
    videoRef,
  ])

  useEffect(() => {
    if (!scanActive || complete || !enrollment || captureMode !== 'auto') return

    let raf = 0
    const loop = () => {
      tickHold(Date.now())
      raf = window.requestAnimationFrame(loop)
    }
    raf = window.requestAnimationFrame(loop)
    return () => window.cancelAnimationFrame(raf)
  }, [captureMode, complete, scanActive, enrollment, tickHold])

  const retry = useCallback(() => {
    setError(null)
    resetHold()
    poseReadyRef.current = false
    modelLoadStartedRef.current = Date.now()
    preloadPatrolFaceScanModels()
  }, [resetHold])

  return {
    activeSlot,
    guidance,
    subGuidance,
    liveHint,
    ringProgress,
    holdProgress: holdProgressClamped,
    approachProgress: approachProgressClamped,
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
