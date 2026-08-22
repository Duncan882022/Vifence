/** Flip cam trước/sau cho MobileCameraFeed (HC-02 / MOB-*). */
const FLIP_EVENT = 'vifence-mobile-camera-flip'

export function requestMobileCameraFlip(cameraId: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(FLIP_EVENT, { detail: { cameraId } }))
}

export function subscribeMobileCameraFlip(
  cameraId: string,
  onFlip: () => void,
): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ cameraId?: string }>).detail
    if (detail?.cameraId !== cameraId) return
    onFlip()
  }
  window.addEventListener(FLIP_EVENT, handler)
  return () => window.removeEventListener(FLIP_EVENT, handler)
}
