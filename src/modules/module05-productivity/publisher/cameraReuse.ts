import type { CameraFacing } from '@/modules/module02-training/services/deviceCamera.service'

/** Chỉ cần đọc trạng thái track — tách interface để test không cần WebRTC thật. */
export interface ReusableVideoTrack {
  readyState: MediaStreamTrack['readyState']
}

/**
 * Có được dùng lại camera đang mở khi phát sóng lại hay không.
 *
 * Rớt WebRTC là lỗi đường truyền: camera vẫn chạy. Mở lại camera trong lúc đó
 * làm đèn camera nháy tắt/bật và cắt luồng mà tile CMS trên cùng máy đang dùng,
 * nên chỉ mở lại khi track thật sự chết hoặc người dùng đổi mặt trước/sau.
 */
export function canReuseOpenCamera(
  track: ReusableVideoTrack | undefined | null,
  requestedFacing: CameraFacing,
  currentFacing: CameraFacing,
): boolean {
  if (!track || track.readyState !== 'live') return false
  return requestedFacing === currentFacing
}
