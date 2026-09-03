import { describe, expect, it } from 'vitest'
import { getPatrolPersonRoiEngine } from '@/modules/module05-productivity/personRoi/patrolPersonRoiEngine'
import {
  buildVmsOverlaySyncKey,
  bumpVmsOverlaySceneEpoch,
} from './liveOverlaySync'
import type { VmsDetectionSnapshot } from '../services/vmsDetections.service'

function sampleSnapshot(
  cameraId: string,
  overrides: Partial<VmsDetectionSnapshot> = {},
): VmsDetectionSnapshot {
  return {
    camera_id: cameraId,
    width: 720,
    height: 1280,
    updated_at: Date.now(),
    vms_ready: true,
    detections: [],
    roi_zones: [],
    metrics: {},
    ...overrides,
  }
}

describe('buildVmsOverlaySyncKey', () => {
  it('giữ nguyên key qua các frame liên tiếp — track lock không bị xoá mỗi nhịp', () => {
    const cameraId = 'HC-TEST-STABLE'

    const first = buildVmsOverlaySyncKey(sampleSnapshot(cameraId, { source_pts_sec: 10.0 }))
    const second = buildVmsOverlaySyncKey(sampleSnapshot(cameraId, { source_pts_sec: 10.1 }))
    const third = buildVmsOverlaySyncKey(sampleSnapshot(cameraId, { source_pts_sec: 10.2 }))

    expect(second).toBe(first)
    expect(third).toBe(first)
  })

  it('đổi key khi backend báo luồng dựng lại', () => {
    const cameraId = 'HC-TEST-EPOCH'

    const before = buildVmsOverlaySyncKey(sampleSnapshot(cameraId, { overlay_epoch: 4 }))
    const after = buildVmsOverlaySyncKey(sampleSnapshot(cameraId, { overlay_epoch: 5 }))

    expect(after).not.toBe(before)
  })

  it('đổi key khi MP4 quay vòng về đầu', () => {
    const cameraId = 'HC-TEST-LOOP'

    const before = buildVmsOverlaySyncKey(sampleSnapshot(cameraId, { source_pts_sec: 30.0 }))
    const after = buildVmsOverlaySyncKey(sampleSnapshot(cameraId, { source_pts_sec: 0.2 }))

    expect(after).not.toBe(before)
  })

  it('snapshot rỗng không sinh key', () => {
    expect(buildVmsOverlaySyncKey(null)).toBe('')
    expect(buildVmsOverlaySyncKey(undefined)).toBe('')
  })
})

describe('bumpVmsOverlaySceneEpoch', () => {
  it('đổi sync key overlay nhưng giữ patrol ROI engine (ingest tự cập nhật)', () => {
    const cameraId = 'HC-TEST-CLEAR'
    const engine = getPatrolPersonRoiEngine(cameraId)
    engine.ingest([
      {
        behavior: 'person',
        label: 'person',
        confidence: 0.9,
        bbox: [10, 20, 110, 220],
      },
    ])
    expect(engine.getDisplayTracks().length).toBeGreaterThan(0)

    const beforeKey = buildVmsOverlaySyncKey(sampleSnapshot(cameraId))
    bumpVmsOverlaySceneEpoch(cameraId)
    const afterKey = buildVmsOverlaySyncKey(sampleSnapshot(cameraId))

    expect(afterKey).not.toBe(beforeKey)
    expect(getPatrolPersonRoiEngine(cameraId).getDisplayTracks().length).toBeGreaterThan(0)
  })
})
