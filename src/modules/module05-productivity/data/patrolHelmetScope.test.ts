import { describe, expect, it } from 'vitest'
import { resolvePatrolPersonRoiConfig } from '../personRoi/patrolPersonRoi.config'
import {
  isPatrolMetricsCameraId,
  PATROL_LIVE_ROI_DELAY_MS,
  WHEP_DISPLAY_WALLCLOCK_LAG_MS,
} from './patrolHelmetScope'

describe('patrolHelmetScope ROI buffer', () => {
  it('PATROL_LIVE_ROI_DELAY_MS = 5s cho backend xử lý ROI', () => {
    expect(PATROL_LIVE_ROI_DELAY_MS).toBe(5000)
  })

  it('WHEP_DISPLAY_WALLCLOCK_LAG_MS ~400ms cho at_ms backend', () => {
    expect(WHEP_DISPLAY_WALLCLOCK_LAG_MS).toBe(400)
  })

  it('HC-01, HC-02, DR-* đều là camera metrics tuần tra', () => {
    expect(isPatrolMetricsCameraId('HC-01')).toBe(true)
    expect(isPatrolMetricsCameraId('HC-02')).toBe(true)
    expect(isPatrolMetricsCameraId('DR-03')).toBe(true)
    expect(isPatrolMetricsCameraId('A-03')).toBe(false)
  })

  it('HC-02 local publisher — profile mượt hơn bodycam VMS', () => {
    const local = resolvePatrolPersonRoiConfig('HC-02', null, { localPublisher: true })
    const vms = resolvePatrolPersonRoiConfig('HC-02', null)
    expect(local.displayEmaAlpha).toBeLessThan(vms.displayEmaAlpha)
    expect(local.maxPredictMs).toBeLessThan(vms.maxPredictMs)
  })
})
