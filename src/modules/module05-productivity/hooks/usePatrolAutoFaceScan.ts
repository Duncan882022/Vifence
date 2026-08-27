import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { captureVideoFrameBase64 } from '@/modules/module02-training/services/mobileAiBackend.service'
import type { PatrolScanEnrollment } from '../services/patrolWorkerProfile.service'
import {
  analyzeFaceScanFrame,
  guidanceForHint,
  guidanceForSlot,
  poseHintMatchesSlot,
  preloadPatrolFaceScanModels,
  type ScanPoseSlot,
} from '../utils/patrolFaceScanGuide'

const TICK_MS = 280
const STABLE_FRAMES = 5
const CAPTURE_COOLDOWN_MS = 2200

export type PatrolFaceScanSubmit = (
  imageB64: string,
  slot: ScanPoseSlot,
) => Promise<{ face_added: boolean; enrollment: PatrolScanEnrollment; message?: string }>

export interface PatrolAutoFaceScanState {
  activeSlot: ScanPoseSlot
  guidance: string
  ringProgress: number
  faceDetected: boolean
  poseMatched: boolean
  capturing: boolean
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
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successFlash, setSuccessFlash] = useState<string | null>(null)

  const stableCountRef = useRef(0)
  const lastCaptureAtRef = useRef(0)
  const capturingRef = useRef(false)

  const capturedCount = enrollment?.faces_captured ?? 0
  const required = enrollment?.faces_required ?? 3
  const complete = enrollment?.complete ?? false
  const ringProgress = complete ? 1 : capturedCount / required

  useEffect(() => {
    if (!enrollment) return
    const pending = enrollment.poses.find(p => !p.captured)
    const slot = (pending?.slot ?? 1) as ScanPoseSlot
    setActiveSlot(slot)
    setGuidance(enrollment.complete ? 'Hoàn thành! Đủ 3 góc mặt rồi.' : guidanceForSlot(slot))
  }, [enrollment?.pers_id, enrollment?.session_id, enrollment?.faces_captured, enrollment?.complete])

  const runCapture = useCallback(async (slot: ScanPoseSlot) => {
    const video = videoRef.current
    if (!video || capturingRef.current || complete) return
    capturingRef.current = true
    setCapturing(true)
    setError(null)
    setSuccessFlash(null)

    const imageB64 = captureVideoFrameBase64(video, 640, 0.82)
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

      if (result.message === 'duplicate_angle') {
        setSuccessFlash('Góc này giống ảnh trước — quay thêm một chút.')
      } else if (result.face_added) {
        setSuccessFlash('Đã lưu!')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lưu vector thất bại.')
      stableCountRef.current = 0
    } finally {
      capturingRef.current = false
      setCapturing(false)
    }
  }, [complete, onEnrollmentChange, submitScan, videoRef])

  useEffect(() => {
    preloadPatrolFaceScanModels()
  }, [])

  useEffect(() => {
    if (!enabled || complete || !enrollment) return

    let cancelled = false
    const timer = window.setInterval(() => {
      void (async () => {
        if (cancelled || capturingRef.current) return
        const video = videoRef.current
        if (!video || video.readyState < 2) return

        const now = Date.now()
        if (now - lastCaptureAtRef.current < CAPTURE_COOLDOWN_MS) return

        const slot = activeSlot
        const metrics = await analyzeFaceScanFrame(video)
        if (cancelled) return

        setFaceDetected(metrics.hasFace)
        const matched = metrics.hasFace && poseHintMatchesSlot(metrics.poseHint, slot)
        setPoseMatched(matched)

        if (capturingRef.current) {
          setGuidance('Đang lưu… giữ yên')
          return
        }

        if (!metrics.hasFace || !matched) {
          stableCountRef.current = 0
          setGuidance(
            metrics.hasFace
              ? guidanceForHint(metrics.poseHint, slot)
              : guidanceForSlot(slot),
          )
          return
        }

        stableCountRef.current += 1
        setGuidance('Giữ yên… sắp xong')

        if (stableCountRef.current >= STABLE_FRAMES) {
          await runCapture(slot)
        }
      })()
    }, TICK_MS)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [activeSlot, complete, enabled, enrollment, runCapture, videoRef])

  const retry = useCallback(() => {
    setError(null)
    stableCountRef.current = 0
  }, [])

  return {
    activeSlot,
    guidance,
    ringProgress,
    faceDetected,
    poseMatched,
    capturing,
    error,
    successFlash,
    retry,
  }
}
