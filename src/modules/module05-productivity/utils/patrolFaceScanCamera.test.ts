import { describe, expect, it, vi } from 'vitest'
import {
  faceScanCameraErrorMessage,
  shouldPromptFaceScanCameraOnTap,
} from './patrolFaceScanCamera'

describe('patrolFaceScanCamera', () => {
  it('prompts tap on handheld user agents', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    })
    expect(shouldPromptFaceScanCameraOnTap()).toBe(true)
    vi.unstubAllGlobals()
  })

  it('maps error codes to Vietnamese instructions', () => {
    expect(faceScanCameraErrorMessage('denied')).toContain('iPhone')
    expect(faceScanCameraErrorMessage('unsupported')).toContain('Trình duyệt')
  })
})
