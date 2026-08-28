import { describe, expect, it } from 'vitest'
import type { VmsDetectionSnapshot } from '@/modules/module03-safety/services/vmsDetections.service'
import { gateVmsPatrolPersonDetections } from './patrolVmsRoiSync'

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
          worker_id: 'sgc-00000430',
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
    expect(result[0]?.worker_id).toBe('sgc-00000430')
    expect(result[0]?.worker_name).toBe('Duncan')
  })

  it('DR-03 proximity dùng gate bodycam-like từ metrics', () => {
    const result = gateVmsPatrolPersonDetections(
      snapshot(
        [
          {
            behavior: 'person',
            label: 'person',
            bbox: [300, 180, 420, 520],
            subject_bbox: [300, 180, 420, 520],
            confidence: 0.65,
            track_id: 'ptk0002',
          },
        ],
        { patrol: { flight_mode: 'proximity' } },
      ),
      'DR-03',
    )
    expect(result).toHaveLength(1)
    expect(result[0]?.behavior).toBe('person')
  })
})
