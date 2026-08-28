/** Phát hiện video “đứng hình” — currentTime không tiến dù vẫn có khung decode. */

export const PLAYBACK_STALL_CHECK_MS = 4000
export const PLAYBACK_STALL_STRIKES = 2
/** WHEP `disconnected` quá lâu → reconnect thay vì chờ ICE tự hồi. */
export const WHEP_DISCONNECTED_RECOVER_MS = 8000
/** Không có frame mới (rVFC) → reconnect WHEP. */
export const WHEP_NO_FRAME_RECOVER_MS = 6000
/** Số lần reconnect WHEP trước khi rơi HLS. */
export const WHEP_RECONNECT_BEFORE_HLS = 2

const MIN_ADVANCE_SEC = 0.012

/** HAVE_CURRENT_DATA — tránh phụ thuộc HTMLMediaElement trong unit test Node. */
const HAVE_CURRENT_DATA = 2

export function hasDecodedVideoFrame(video: HTMLVideoElement): boolean {
  return video.videoWidth > 0 && video.readyState >= HAVE_CURRENT_DATA
}

export interface PlaybackStallChecker {
  tick: (video: HTMLVideoElement, playing: boolean) => 'ok' | 'stall' | 'skip'
  reset: () => void
}

/** Theo dõi currentTime — bắt cả trường hợp dính khung cuối (readyState vẫn OK). */
export function createPlaybackStallChecker(): PlaybackStallChecker {
  let lastMediaTime = -1
  let lastChangeAt = 0
  let stallStrikes = 0

  return {
    reset() {
      lastMediaTime = -1
      lastChangeAt = 0
      stallStrikes = 0
    },
    tick(video, playing) {
      if (!playing) {
        stallStrikes = 0
        return 'skip'
      }
      if (!hasDecodedVideoFrame(video)) {
        stallStrikes = 0
        return 'skip'
      }
      if (video.paused || video.ended) {
        return 'skip'
      }

      const now = performance.now()
      const mediaTime = video.currentTime

      if (lastMediaTime < 0) {
        lastMediaTime = mediaTime
        lastChangeAt = now
        return 'ok'
      }

      if (Math.abs(mediaTime - lastMediaTime) >= MIN_ADVANCE_SEC) {
        lastMediaTime = mediaTime
        lastChangeAt = now
        stallStrikes = 0
        return 'ok'
      }

      if (now - lastChangeAt < PLAYBACK_STALL_CHECK_MS) {
        return 'ok'
      }

      stallStrikes += 1
      lastChangeAt = now
      if (stallStrikes >= PLAYBACK_STALL_STRIKES) {
        stallStrikes = 0
        lastMediaTime = -1
        return 'stall'
      }
      return 'ok'
    },
  }
}

type VideoFrameCallbackMetadata = { mediaTime: number; presentedFrames: number }

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: number, metadata: VideoFrameCallbackMetadata) => void,
  ) => number
  cancelVideoFrameCallback?: (handle: number) => void
}

/** rVFC — chỉ fire khi có khung mới (chính xác hơn currentTime với WHEP). */
export function watchVideoFrameAdvance(
  video: HTMLVideoElement,
  onFrame: () => void,
): () => void {
  const el = video as VideoWithFrameCallback
  if (typeof el.requestVideoFrameCallback !== 'function') {
    return () => {}
  }

  let cancelled = false
  let handle = 0

  const loop = (_now: number, _meta: VideoFrameCallbackMetadata) => {
    if (cancelled) return
    onFrame()
    handle = el.requestVideoFrameCallback!(loop)
  }

  handle = el.requestVideoFrameCallback(loop)

  return () => {
    cancelled = true
    el.cancelVideoFrameCallback?.(handle)
  }
}
