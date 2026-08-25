import { describe, expect, it } from 'vitest'

import { canReuseOpenCamera } from './cameraReuse'

describe('phát sóng lại sau khi rớt WebRTC', () => {
  it('camera đang chạy thì dùng lại, không mở lại', () => {
    expect(canReuseOpenCamera({ readyState: 'live' }, 'environment', 'environment')).toBe(true)
  })

  it('track đã chết thì phải mở lại camera', () => {
    expect(canReuseOpenCamera({ readyState: 'ended' }, 'environment', 'environment')).toBe(false)
  })

  it('chưa có camera nào thì mở mới', () => {
    expect(canReuseOpenCamera(undefined, 'environment', 'environment')).toBe(false)
    expect(canReuseOpenCamera(null, 'environment', 'environment')).toBe(false)
  })

  it('đổi mặt trước/sau thì phải mở lại đúng camera được yêu cầu', () => {
    expect(canReuseOpenCamera({ readyState: 'live' }, 'user', 'environment')).toBe(false)
    expect(canReuseOpenCamera({ readyState: 'live' }, 'environment', 'user')).toBe(false)
  })
})
