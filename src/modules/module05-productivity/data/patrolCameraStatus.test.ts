import { describe, expect, it } from 'vitest'
import { applyPatrolCameraStreamStatus } from './patrolCameras'
import type { TrainingCamera } from '@/modules/module02-training/data/trainingCameras'
import type { PatrolHelmetCameraMetricsSlice } from '../services/patrolLiveEvents.service'

function cam(id: string): TrainingCamera {
  return {
    id,
    name: id,
    location: 'Cầu Sông Hốt',
    zone: 'ZONE_SITE',
    status: 'offline',
    streamType: 'bodycam',
  }
}

function slice(id: string, online: boolean): PatrolHelmetCameraMetricsSlice {
  return {
    camera_id: id,
    stream_online: online,
    person_count: 0,
    identified_workers: 0,
    person_events_today: 0,
  }
}

describe('applyPatrolCameraStreamStatus', () => {
  it('backend báo online → tile phát', () => {
    const [row] = applyPatrolCameraStreamStatus([cam('HC-01')], [slice('HC-01', true)])
    expect(row.status).toBe('online')
    expect(row.streamOfflineConfirmed).toBe(false)
  })

  it('backend khẳng định offline → đánh dấu để tile ngừng gọi HLS', () => {
    const [row] = applyPatrolCameraStreamStatus([cam('HC-01')], [slice('HC-01', false)])
    expect(row.status).toBe('offline')
    expect(row.streamOfflineConfirmed).toBe(true)
  })

  it('chưa hỏi được backend → không khẳng định, tile vẫn được thử', () => {
    const [row] = applyPatrolCameraStreamStatus([cam('HC-01')], [])
    expect(row.status).toBe('offline')
    expect(row.streamOfflineConfirmed).toBe(false)
  })

  it('backend sập giữa chừng không được làm cả lưới câm', () => {
    const rows = applyPatrolCameraStreamStatus(
      [cam('HC-01'), cam('HC-02'), cam('DR-03')],
      [],
    )
    expect(rows.every(r => r.streamOfflineConfirmed === false)).toBe(true)
  })

  it('HC-02 phát từ điện thoại cùng tab vẫn tính là online', () => {
    const [row] = applyPatrolCameraStreamStatus(
      [cam('HC-02')],
      [slice('HC-02', false)],
      true,
    )
    expect(row.status).toBe('online')
    expect(row.streamOfflineConfirmed).toBe(false)
  })
})
