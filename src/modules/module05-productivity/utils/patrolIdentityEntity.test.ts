import { describe, expect, it } from 'vitest'
import { resolveEventGalleryWorkerId } from './patrolIdentityEntity'

describe('resolveEventGalleryWorkerId', () => {
  it('preserves gallery worker id case for API lookup', () => {
    const id = resolveEventGalleryWorkerId({
      objectId: 'p-SGC-6688',
      trackWorkerId: null,
      objectLabel: 'Duncan',
    })
    expect(id).toBe('p-SGC-6688')
  })

  it('maps employee code to gallery id without uppercasing prefix path', () => {
    const id = resolveEventGalleryWorkerId(
      { objectId: 'pers-0007', objectLabel: 'Duncan', employeeCode: 'SGC-6688' },
      null,
    )
    expect(id).toBe('p-SGC-6688')
  })

  it('does not treat pers-* as employee code', () => {
    const id = resolveEventGalleryWorkerId(
      { objectId: 'pers-0007', objectLabel: 'Duncan' },
      'pers-0007',
    )
    expect(id).toBeNull()
  })

  it('prefers employeeCode when fallback worker id is pers-*', () => {
    const id = resolveEventGalleryWorkerId(
      { objectId: 'pers-0007', objectLabel: 'Duncan', employeeCode: 'SGC-6688' },
      'pers-0007',
    )
    expect(id).toBe('p-SGC-6688')
  })

  it('does not treat tk-* track id as employee code', () => {
    const id = resolveEventGalleryWorkerId(
      { objectId: 'pers-0007', objectLabel: 'Duncan' },
      'tk-6688',
    )
    expect(id).toBeNull()
  })

  it('does not treat legacy sgc-* track id as employee code', () => {
    const id = resolveEventGalleryWorkerId(
      { objectId: 'pers-0007', objectLabel: 'Duncan' },
      'sgc-6688',
    )
    expect(id).toBeNull()
  })
})
