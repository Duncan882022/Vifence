import { describe, expect, it } from 'vitest'
import {
  faceScanCameraErrorMessage,
  isFaceScanStreamLive,
} from './patrolFaceScanCamera'

describe('patrolFaceScanCamera', () => {
  it('detects live camera tracks', () => {
    const live = { getVideoTracks: () => [{ readyState: 'live' as const }] } as MediaStream
    const dead = { getVideoTracks: () => [{ readyState: 'ended' as const }] } as MediaStream
    expect(isFaceScanStreamLive(live)).toBe(true)
    expect(isFaceScanStreamLive(dead)).toBe(false)
  })

  it('maps error codes to Vietnamese instructions', () => {
    expect(faceScanCameraErrorMessage('denied')).toContain('iPhone')
    expect(faceScanCameraErrorMessage('unsupported')).toContain('Trình duyệt')
  })
})
