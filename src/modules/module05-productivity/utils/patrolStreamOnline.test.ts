import { describe, expect, it } from 'vitest'
import type { PatrolHelmetCameraMetricsSlice } from '../services/patrolLiveEvents.service'
import {
  buildPatrolHelmetOnlineById,
  resolvePatrolCameraOnlineState,
} from './patrolStreamOnline'

function slice(id: string, online: boolean): PatrolHelmetCameraMetricsSlice {
  return {
    camera_id: id,
    stream_online: online,
    person_count: 0,
    identified_workers: 0,
    person_events_today: 0,
  }
}

describe('patrolStreamOnline', () => {
  it('backend online → online', () => {
    const state = resolvePatrolCameraOnlineState('HC-01', [slice('HC-01', true)])
    expect(state.online).toBe(true)
    expect(state.streamOfflineConfirmed).toBe(false)
  })

  it('backend khẳng định offline → streamOfflineConfirmed', () => {
    const state = resolvePatrolCameraOnlineState('HC-01', [slice('HC-01', false)])
    expect(state.online).toBe(false)
    expect(state.streamOfflineConfirmed).toBe(true)
  })

  it('framesLive thắng backend offline', () => {
    const frames = new Map([['HC-01', true]])
    const state = resolvePatrolCameraOnlineState('HC-01', [slice('HC-01', false)], {
      framesLiveById: frames,
    })
    expect(state.online).toBe(true)
    expect(state.framesLive).toBe(true)
    expect(state.streamOfflineConfirmed).toBe(false)
  })

  it('HC-02 mobile cùng tab → online', () => {
    const state = resolvePatrolCameraOnlineState('HC-02', [slice('HC-02', false)], {
      hc02MobileOnline: true,
    })
    expect(state.online).toBe(true)
    expect(state.streamOfflineConfirmed).toBe(false)
  })

  it('buildPatrolHelmetOnlineById — map đủ camera', () => {
    const map = buildPatrolHelmetOnlineById(
      ['HC-01', 'HC-02', 'DR-03'],
      [slice('HC-01', true), slice('DR-03', false)],
    )
    expect(map['HC-01']).toBe(true)
    expect(map['HC-02']).toBe(false)
    expect(map['DR-03']).toBe(false)
  })
})
