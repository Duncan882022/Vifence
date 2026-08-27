import { invalidateVideoFrameCapture } from '@/modules/module02-training/utils/videoFrameCapture'

/**
 * Chụp khung quét mặt đăng ký — mirror ngang khớp preview, chất lượng cao.
 * Backend YuNet/SFace cần ảnh selfie toàn khung (không crop patrol live).
 */
export function captureFaceEnrollmentFrameBase64(
  video: HTMLVideoElement,
  maxWidth = 960,
  quality = 0.88,
): string | null {
  invalidateVideoFrameCapture(video)

  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh || video.readyState < 2) return null

  const scale = vw > maxWidth ? maxWidth / vw : 1
  const cw = Math.max(1, Math.round(vw * scale))
  const ch = Math.max(1, Math.round(vh * scale))

  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.translate(cw, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(video, 0, 0, cw, ch)

  const dataUrl = canvas.toDataURL('image/jpeg', quality)
  const comma = dataUrl.indexOf(',')
  return comma >= 0 ? dataUrl.slice(comma + 1) : null
}
