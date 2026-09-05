import { describe, expect, it } from 'vitest'
import type { VmsDetectionSnapshot } from '@/modules/module03-safety/services/vmsDetections.service'
import { gateVmsPatrolPersonDetections, patrolVmsVelocityToPixelsPerSec } from './patrolVmsRoiSync'

function snapshot(
  detections: VmsDetectionSnapshot['detections'],
  metrics: Record<string, unknown> = {},
): VmsDetectionSnapshot {
  return {
    camera_id: 'HC-01',
    updated_at: Date.now(),
    width: 1280,
    height: 720,
    vms_ready: true,
    detections,
    roi_zones: [],
    metrics,
  }
}

describe('gateVmsPatrolPersonDetections', () => {
  it('giữ person đã định danh, loại object chồng', () => {
    const result = gateVmsPatrolPersonDetections(
      snapshot([
        {
          behavior: 'person',
          label: 'person',
          bbox: [400, 200, 520, 560],
          subject_bbox: [400, 200, 520, 560],
          confidence: 0.72,
          worker_id: 'tk-00000430',
          worker_name: 'Duncan',
          track_id: 'ptk0001',
          tier: 'identity',
        },
        {
          behavior: 'object',
          label: 'object',
          bbox: [410, 210, 510, 550],
          confidence: 0.55,
          track_id: 'obj0001',
        },
      ]),
      'HC-01',
    )
    expect(result).toHaveLength(1)
    expect(result[0]?.worker_id).toBe('tk-00000430')
    expect(result[0]?.worker_name).toBe('Duncan')
  })

  it('DR-03 aerial bbox nhỏ vẫn qua gate khi flight_mode proximity (cache lệch)', () => {
    const result = gateVmsPatrolPersonDetections(
      snapshot(
        [
          {
            behavior: 'person',
            label: 'person',
            bbox: [600, 320, 640, 330],
            subject_bbox: [600, 320, 640, 330],
            confidence: 0.55,
            track_id: 'ptk-aerial',
            tier: 'object',
          },
        ],
        { patrol: { flight_mode: 'proximity' } },
      ),
      'DR-03',
      'proximity',
    )
    expect(result).toHaveLength(1)
    expect(result[0]?.track_id).toBe('ptk-aerial')
  })

  it('DR-03 proximity bbox thật (normalized) vẫn qua gate', () => {
    const result = gateVmsPatrolPersonDetections(
      snapshot(
        [
          {
            behavior: 'person',
            label: 'CN',
            bbox: [0.281612, 0.244065, 0.45754, 1.0],
            subject_bbox: [0.281612, 0.244065, 0.45754, 0.722077],
            confidence: 0.512,
            worker_id: 'ptk0001:person',
            worker_name: 'CN',
            track_id: 'ptk0001:person',
            tier: 'object',
          },
        ],
        { patrol: { flight_mode: 'proximity' } },
      ),
      'DR-03',
      'proximity',
    )
    expect(result).toHaveLength(1)
    expect(result[0]?.track_id).toBe('ptk0001:person')
  })

  it('chuẩn hoá velocity VMS (norm/s) → px/s cho Kalman', () => {
    expect(patrolVmsVelocityToPixelsPerSec([0.05, -0.02], 1280, 720)).toEqual([64, -14.4])
    expect(patrolVmsVelocityToPixelsPerSec([240, -12], 1280, 720)).toEqual([240, -12])
  })

  it('gate giữ velocity đã convert px/s', () => {
    const result = gateVmsPatrolPersonDetections(
      snapshot([
        {
          behavior: 'person',
          label: 'person',
          bbox: [400, 200, 520, 560],
          subject_bbox: [400, 200, 520, 560],
          confidence: 0.72,
          track_id: 'ptk0001',
          velocity: [0.1, 0.05],
        },
      ]),
      'HC-01',
    )
    expect(result[0]?.velocity).toEqual([128, 36])
  })

  it('gate giữ face_eligible và promoted_from_object cho uptier ROI', () => {
    const result = gateVmsPatrolPersonDetections(
      snapshot([
        {
          behavior: 'person',
          label: 'Duncan',
          bbox: [400, 200, 520, 560],
          subject_bbox: [400, 200, 520, 560],
          confidence: 0.72,
          worker_id: 'tk-00000430',
          track_id: 'ptk0001',
          tier: 'person',
          face_eligible: true,
          promoted_from_object: true,
          promoted_from: ['obj-20260904-0002'],
        },
      ]),
      'HC-01',
    )
    expect(result[0]?.face_eligible).toBe(true)
    expect(result[0]?.promoted_from_object).toBe(true)
    expect(result[0]?.promoted_from).toEqual(['obj-20260904-0002'])
    expect(result[0]?.tier).toBe('person')
  })
})
