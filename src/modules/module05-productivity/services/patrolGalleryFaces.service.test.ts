import { describe, expect, it, vi } from 'vitest'

vi.mock('@/services/patrolApiClient', () => ({
  patrolBackendBase: () => 'https://backend.example',
  fetchPatrol: vi.fn(),
}))

import { absolutizeGalleryFaceUrl } from './patrolGalleryFaces.service'

describe('patrolGalleryFaces.service', () => {
  it('absolutizes relative gallery face URLs for img src', () => {
    expect(absolutizeGalleryFaceUrl(null)).toBeNull()
    expect(absolutizeGalleryFaceUrl('')).toBeNull()
    expect(absolutizeGalleryFaceUrl('https://cdn.test/a.jpg')).toBe('https://cdn.test/a.jpg')
    expect(absolutizeGalleryFaceUrl('/patrol/gallery/face?worker_id=p-1&slot=1&token=x'))
      .toBe('https://backend.example/patrol/gallery/face?worker_id=p-1&slot=1&token=x')
  })
})
