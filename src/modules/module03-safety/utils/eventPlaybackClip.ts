import type { SafetyViolationRecord } from '../types/safety.types'
import { getCameraAiModel } from '@/modules/module02-training/data/cameraAiModelCatalog'
import { getViolationClipMarker } from '../data/safetyViolationFeeds'
import { groupIdToViolationType } from './groupToViolationType'
import { resolveTrainingCameraId } from './safetyCameraBridge'
import { isLiveSafetyRecord } from '../services/safetyAiEvents.service'

export const EVENT_PLAYBACK_CLIP_SEC = 3

export type ViolationBbox = [number, number, number, number]

/** Giây vào clip demo — giữa segment model hoặc marker clip cũ. */
const SCENARIO_SEEK_SEC: Record<string, number> = {
  'BPTC-007': 5,
  'BPTC-008': 5,
  'BPTC-009': 5,
  'ATGT-002': 5,
  'ATGT-004': 12,
  'PPE-001': 8,
  'PPE-002': 10,
  'PPE-003': 12,
  'PCCC-001': 16,
  'PCCC-002': 17,
  'WAH-001': 22,
  'DZ-003': 5,
}

const CAMERA_FRAME_SIZE: Record<string, { width: number; height: number }> = {
  'A-03': { width: 640, height: 640 },
  'A-04': { width: 1024, height: 976 },
}

const MODEL_BY_SCENARIO: Partial<Record<string, string>> = {
  'BPTC-007': 'road_material',
  'BPTC-008': 'road_material',
  'BPTC-009': 'road_material',
  'ATGT-002': 'atgt_traffic',
  'ATGT-004': 'atgt_traffic',
  'PPE-001': 'ppe',
  'PPE-002': 'ppe',
  'PPE-003': 'ppe',
  'PCCC-001': 'pccc',
  'PCCC-002': 'pccc',
  'WAH-001': 'wah',
  'DZ-003': 'crane_proximity',
}

export function inferCameraFrameSize(cameraId?: string): { width: number; height: number } {
  if (cameraId && CAMERA_FRAME_SIZE[cameraId]) return CAMERA_FRAME_SIZE[cameraId]
  return { width: 1280, height: 720 }
}

export function resolvePlaybackSeekSec(record: Pick<SafetyViolationRecord, 'scenarioId' | 'groupId' | 'playbackSeekSec'>): number {
  if (record.playbackSeekSec != null) return record.playbackSeekSec
  const fromScenario = SCENARIO_SEEK_SEC[record.scenarioId]
  if (fromScenario != null) return fromScenario
  const violationType = groupIdToViolationType(record.groupId)
  if (violationType) return getViolationClipMarker(violationType)
  return 0
}

export function resolveViolationBbox(
  record: Pick<SafetyViolationRecord, 'scenarioId' | 'bbox' | 'subjectBbox' | 'sourceDeviceId' | 'sourceType'>,
): ViolationBbox | undefined {
  const raw = record.subjectBbox ?? record.bbox
  if (raw && raw.length >= 4) {
    const [x1, y1, x2, y2] = raw
    if (x2 > x1 && y2 > y1) {
      return [x1, y1, x2, y2]
    }
  }
  return undefined
}

export function resolveFrameSize(
  record: Pick<SafetyViolationRecord, 'frameWidth' | 'frameHeight' | 'sourceDeviceId' | 'sourceType'>,
): { width: number; height: number } {
  if (record.frameWidth && record.frameHeight) {
    return { width: record.frameWidth, height: record.frameHeight }
  }
  const cameraId = resolveTrainingCameraId(record.sourceDeviceId, record.sourceType)
  return inferCameraFrameSize(cameraId)
}

export function buildEventClipWindow(
  seekSec: number,
  videoDuration: number,
  clipDurationSec = EVENT_PLAYBACK_CLIP_SEC,
): { start: number; end: number; duration: number } {
  const half = clipDurationSec / 2
  let start = seekSec - half
  let end = seekSec + half

  if (start < 0) {
    end = Math.min(videoDuration, end - start)
    start = 0
  }
  if (end > videoDuration) {
    start = Math.max(0, start - (end - videoDuration))
    end = videoDuration
  }
  if (end - start < 0.5) {
    start = Math.max(0, seekSec - 0.5)
    end = Math.min(videoDuration, start + clipDurationSec)
  }

  return { start, end, duration: Math.max(end - start, 0.5) }
}

export function computeBboxZoomStyle(
  bbox: ViolationBbox,
  frameWidth: number,
  frameHeight: number,
  maxScale = 2.6,
): { transformOrigin: string; transform: string } {
  const [x1, y1, x2, y2] = bbox
  const cx = ((x1 + x2) / 2 / frameWidth) * 100
  const cy = ((y1 + y2) / 2 / frameHeight) * 100
  const boxW = Math.max((x2 - x1) / frameWidth, 0.08)
  const boxH = Math.max((y2 - y1) / frameHeight, 0.08)
  const scale = Math.min(0.88 / boxW, 0.88 / boxH, maxScale)

  return {
    transformOrigin: `${cx}% ${cy}%`,
    transform: `scale(${scale})`,
  }
}

export function bboxOverlayStyle(
  bbox: ViolationBbox,
  frameWidth: number,
  frameHeight: number,
): { left: string; top: string; width: string; height: string } {
  const [x1, y1, x2, y2] = bbox
  return {
    left: `${(x1 / frameWidth) * 100}%`,
    top: `${(y1 / frameHeight) * 100}%`,
    width: `${((x2 - x1) / frameWidth) * 100}%`,
    height: `${((y2 - y1) / frameHeight) * 100}%`,
  }
}

export function resolveLiveFeedSeekSec(record: SafetyViolationRecord): number | null {
  if (!isLiveSafetyRecord(record)) return null
  const modelId = MODEL_BY_SCENARIO[record.scenarioId]
  if (!modelId) return SCENARIO_SEEK_SEC[record.scenarioId] ?? null
  const model = getCameraAiModel(modelId as never)
  const segment = model?.videoSegments?.[0]
  if (!segment) return SCENARIO_SEEK_SEC[record.scenarioId] ?? null
  const mid = (segment.startSec + Math.min(segment.endSec, segment.startSec + 30)) / 2
  return SCENARIO_SEEK_SEC[record.scenarioId] ?? mid
}

export function buildEventPlaybackMeta(record: SafetyViolationRecord) {
  const seekSec = resolveLiveFeedSeekSec(record) ?? resolvePlaybackSeekSec(record)
  const bbox = resolveViolationBbox(record)
  const frame = resolveFrameSize(record)
  return { seekSec, bbox, frameWidth: frame.width, frameHeight: frame.height }
}
