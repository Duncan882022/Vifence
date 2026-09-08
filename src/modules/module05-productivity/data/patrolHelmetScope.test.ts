import { describe, expect, it } from 'vitest'
import { resolvePatrolPersonRoiConfig } from '../personRoi/patrolPersonRoi.config'
import {
  isPatrolMetricsCameraId,
  PATROL_LIVE_ROI_DELAY_MS,
  WHEP_DISPLAY_WALLCLOCK_LAG_MS,
  WHEP_MAX_ALIGNED_DRIFT_MS,
} from './patrolHelmetScope'

describe('patrolHelmetScope ROI buffer', () => {
  it('PATROL_LIVE_ROI_DELAY_MS ~350ms cho ROI real-time', () => {
    expect(PATROL_LIVE_ROI_DELAY_MS).toBe(350)
  })

  it('WHEP_DISPLAY_WALLCLOCK_LAG_MS ~280ms cho at_ms backend', () => {
    expect(WHEP_DISPLAY_WALLCLOCK_LAG_MS).toBe(280)
  })

  it('HC-01, HC-02, DR-* đều là camera metrics tuần tra', () => {
    expect(isPatrolMetricsCameraId('HC-01')).toBe(true)
    expect(isPatrolMetricsCameraId('HC-02')).toBe(true)
    expect(isPatrolMetricsCameraId('DR-03')).toBe(true)
    expect(isPatrolMetricsCameraId('A-03')).toBe(false)
  })

  it('WHEP_MAX_ALIGNED_DRIFT_MS ~320ms cho sync guard', () => {
    expect(WHEP_MAX_ALIGNED_DRIFT_MS).toBe(320)
  })

  it('HC-02 local publisher — cùng profile cover-or-hide bodycam VMS', () => {
    const local = resolvePatrolPersonRoiConfig('HC-02', null, { localPublisher: true })
    const vms = resolvePatrolPersonRoiConfig('HC-02', null)
    expect(local.displayCoastMaxMiss).toBe(1)
    expect(vms.displayCoastMaxMiss).toBe(1)
    expect(local.maxPredictMs).toBe(0)
    expect(vms.maxPredictMs).toBe(0)
  })
})
