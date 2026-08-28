import { describe, expect, it } from 'vitest'
import { PATROL_SITE_CENTER } from '../data/patrolSiteMap'
import { createDefaultPublisherGps, formatPublisherGpsLabel } from './publisherGpsDefaults'

describe('publisherGpsDefaults', () => {
  it('tạo GPS mặc định tại tâm công trường', () => {
    const gps = createDefaultPublisherGps(1_000)
    expect(gps.lat).toBe(PATROL_SITE_CENTER[0])
    expect(gps.lng).toBe(PATROL_SITE_CENTER[1])
    expect(gps.isDefault).toBe(true)
    expect(gps.updatedAt).toBe(1_000)
  })

  it('format nhãn mặc định', () => {
    const label = formatPublisherGpsLabel(createDefaultPublisherGps())
    expect(label).toContain('mặc định')
    expect(label).toContain(PATROL_SITE_CENTER[0].toFixed(5))
  })
})
