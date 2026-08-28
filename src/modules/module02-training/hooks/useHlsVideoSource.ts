import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { createPlaybackStallChecker } from './videoPlaybackStall'

/** Trình phát cần đọc được wallclock khung hình đang hiển thị để đồng bộ overlay. */
export interface VideoClockSource {
  /**
   * Wallclock (ms) của khung hình đang phát, lấy từ EXT-X-PROGRAM-DATE-TIME.
   * Trả null khi playlist không có PDT (backend cũ) — caller rơi về snapshot mới nhất.
   */
  getDisplayWallclockMs: () => number | null
}

interface HlsInstance {
  destroy: () => void
  startLoad: () => void
  recoverMediaError: () => void
  playingDate: Date | null
}

/** Chu kỳ kiểm tra luồng đã ra khung hình chưa. */
const WATCHDOG_MS = 5000
/**
 * Số nhịp liên tiếp không có khung hình thì gắn lại nguồn.
 *
 * hls.js đã tự thử lại phân đoạn, nên watchdog chỉ là lưới an toàn cuối. Ra tay
 * sớm sẽ huỷ và dựng lại trình phát ngay giữa lúc bodycam đang nối lại sóng —
 * biến một khoảng trống vài giây thành cú khựng dài hơn hẳn.
 */
const WATCHDOG_STRIKES = 3

/** Thời gian chờ tín hiệu (retry HLS) trước khi tile chuyển Offline. */
export const STREAM_SIGNAL_WAIT_MS = 8000

export type StreamSignalPhase = 'idle' | 'waiting' | 'ready' | 'offline'

/**
 * Trạng thái chờ tín hiệu remote — sau vài giây không có khung hình thì Offline,
 * thay vì spinner vô hạn. Retry nền vẫn chạy; có hình là tự lên lại.
 */
export function useStreamSignalPhase(
  framesReady: boolean,
  playing: boolean,
  /** Chỉ áp dụng cho luồng remote đang chờ (HLS/WHEP), không dùng cho MP4 loop. */
  waitingEnabled: boolean,
  resetKey: string,
  waitMs: number = STREAM_SIGNAL_WAIT_MS,
): StreamSignalPhase {
  const [phase, setPhase] = useState<StreamSignalPhase>('idle')

  useEffect(() => {
    if (!playing || !waitingEnabled) {
      setPhase('idle')
      return
    }
    if (framesReady) {
      setPhase('ready')
      return
    }

    setPhase('waiting')
    const timer = window.setTimeout(() => {
      setPhase(prev => (prev === 'waiting' ? 'offline' : prev))
    }, waitMs)

    return () => window.clearTimeout(timer)
  }, [playing, waitingEnabled, framesReady, waitMs, resetKey])

  return phase
}

/** MediaMTX LL-HLS — có EXT-X-PART, segment 1s. */
function isLowLatencyHlsUrl(url: string): boolean {
  return url.includes('/mediamtx/hls/')
}

/** VMS relay HLS — re-encode backend, không có PART nhưng vẫn giảm buffer. */
function isVmsRelayHlsUrl(url: string): boolean {
  return url.includes('/stream/') && url.includes('.m3u8')
}

/**
 * Buffer theo loại nguồn.
 *
 * Bodycam 4G và flycam có bitrate dao động mạnh: buffer 1 segment nghe thì độ
 * trễ đẹp nhưng chỉ cần một nhịp mạng xấu là hết dữ liệu và khựng. Giữ 2 segment
 * đổi thêm ~1s độ trễ lấy hình liên tục — đúng ưu tiên xem live.
 */
function resolveHlsLatencyProfile(url: string): {
  lowLatencyMode: boolean
  liveSyncDurationCount?: number
  liveMaxLatencyDurationCount: number
  maxBufferLength: number
  maxMaxBufferLength: number
} {
  if (isLowLatencyHlsUrl(url)) {
    return {
      lowLatencyMode: true,
      // Cố ý **không** đặt liveSyncDurationCount.
      //
      // MediaMTX chia segment 1s thành part 200ms và công bố PART-HOLD-BACK
      // trong playlist — đó mới là mốc live của LL-HLS, thường ~600ms. Đặt
      // liveSyncDurationCount là ép hls.js lùi về *2 segment nguyên* tức 2 giây
      // và vô hiệu hoá toàn bộ phần low-latency. Để trống thì trình phát bám
      // theo mốc của máy chủ.
      liveMaxLatencyDurationCount: 6,
      maxBufferLength: 6,
      maxMaxBufferLength: 8,
    }
  }
  if (isVmsRelayHlsUrl(url)) {
    return {
      lowLatencyMode: false,
      liveSyncDurationCount: 2,
      liveMaxLatencyDurationCount: 5,
      maxBufferLength: 6,
      maxMaxBufferLength: 8,
    }
  }
  return {
    lowLatencyMode: false,
    liveSyncDurationCount: 3,
    liveMaxLatencyDurationCount: 6,
    maxBufferLength: 10,
    maxMaxBufferLength: 12,
  }
}

/** Safari phát HLS native — getStartDate() cho mốc PDT của đầu luồng. */
function nativeStartDateMs(video: HTMLVideoElement): number | null {
  const withStartDate = video as HTMLVideoElement & { getStartDate?: () => Date }
  if (typeof withStartDate.getStartDate !== 'function') return null
  const start = withStartDate.getStartDate()
  const ms = start?.getTime?.()
  return typeof ms === 'number' && Number.isFinite(ms) ? ms : null
}

function tryPlayVideo(video: HTMLVideoElement): void {
  video.muted = true
  video.defaultMuted = true
  video.setAttribute('playsinline', 'true')
  video.setAttribute('webkit-playsinline', 'true')
  void video.play().catch(() => {})
}

/** Luồng đã decode được khung hình chưa — dùng cho watchdog và overlay chờ tín hiệu. */
function hasDecodedFrame(video: HTMLVideoElement): boolean {
  return video.videoWidth > 0 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
}

/**
 * Theo dõi tile đã có hình chưa — để hiện trạng thái chờ thay vì ô đen im lặng.
 */
export function useVideoFramesReady(
  videoRef: RefObject<HTMLVideoElement | null>,
  playing: boolean,
): boolean {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!playing) {
      setReady(false)
      return
    }
    const timer = window.setInterval(() => {
      const video = videoRef.current
      setReady(Boolean(video && hasDecodedFrame(video)))
    }, 700)
    return () => window.clearInterval(timer)
  }, [videoRef, playing])

  return ready
}

export interface HlsVideoSourceHandle {
  clock: VideoClockSource
  /** Gắn lại nguồn HLS — dùng khi đứng hình hoặc nút làm mới luồng. */
  recover: () => void
}

/** Gắn HLS (.m3u8) hoặc MP4 thuần vào <video>. Safari native HLS; Chrome dùng hls.js. */
export function useHlsVideoSource(
  videoRef: RefObject<HTMLVideoElement | null>,
  src: string,
  playing: boolean,
  fallbackSrc?: string,
): HlsVideoSourceHandle {
  /**
   * Mũ chưa phát thì backend trả 503; Safari native HLS gặp lỗi là bỏ hẳn, không
   * thử lại. Nên phải tự luân phiên nguồn và gắn lại cho tới khi có khung hình.
   */
  const candidates = useMemo(() => {
    const list = [src]
    if (fallbackSrc && fallbackSrc !== src) list.push(fallbackSrc)
    return list
  }, [src, fallbackSrc])

  const [attempt, setAttempt] = useState(0)
  const strikesRef = useRef(0)
  const stallCheckerRef = useRef(createPlaybackStallChecker())

  useEffect(() => {
    setAttempt(0)
    strikesRef.current = 0
    stallCheckerRef.current.reset()
  }, [candidates])

  const activeSrc = candidates[attempt % candidates.length] ?? src
  const isHls = activeSrc.includes('.m3u8')
  const hlsRef = useRef<HlsInstance | null>(null)

  const retry = useCallback(() => {
    strikesRef.current = 0
    setAttempt(a => a + 1)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeSrc) return

    let destroyed = false

    const attachMp4 = () => {
      video.src = activeSrc
      video.load()
      if (playing) tryPlayVideo(video)
    }

    const attachHls = async (): Promise<(() => void) | undefined> => {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = activeSrc
        video.load()
        const onCanPlay = () => {
          if (destroyed || !playing) return
          tryPlayVideo(video)
        }
        video.addEventListener('canplay', onCanPlay)
        video.addEventListener('loadeddata', onCanPlay)
        return () => {
          video.removeEventListener('canplay', onCanPlay)
          video.removeEventListener('loadeddata', onCanPlay)
        }
      }

      try {
        const { default: Hls } = await import('hls.js')
        if (destroyed || !Hls.isSupported()) {
          attachMp4()
          return undefined
        }
        const latency = resolveHlsLatencyProfile(activeSrc)
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: latency.lowLatencyMode,
          // Bỏ hẳn khoá này khi profile không đặt — truyền `undefined` vẫn bị
          // hls.js coi là "đã cấu hình" và ghi đè PART-HOLD-BACK của máy chủ.
          ...(latency.liveSyncDurationCount != null
            ? { liveSyncDurationCount: latency.liveSyncDurationCount }
            : {}),
          liveMaxLatencyDurationCount: latency.liveMaxLatencyDurationCount,
          maxLiveSyncPlaybackRate: 1.5,
          maxBufferLength: latency.maxBufferLength,
          maxMaxBufferLength: latency.maxMaxBufferLength,
          backBufferLength: 0,
          liveBackBufferLength: 0,
          manifestLoadingMaxRetry: 4,
          manifestLoadingRetryDelay: 800,
          levelLoadingMaxRetry: 4,
          fragLoadingMaxRetry: 6,
          fragLoadingRetryDelay: 600,
        })
        hls.loadSource(activeSrc)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!destroyed && playing) tryPlayVideo(video)
        })
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (destroyed || !data.fatal) return
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError()
            return
          }
          // Nguồn hỏng — để watchdog luân phiên sang URL còn lại.
          hls.startLoad()
        })
        hlsRef.current = hls as unknown as HlsInstance
        return undefined
      } catch {
        attachMp4()
        return undefined
      }
    }

    let cleanupNative: (() => void) | undefined
    void (async () => {
      if (isHls) {
        cleanupNative = await attachHls()
      } else {
        attachMp4()
      }
    })()

    return () => {
      destroyed = true
      cleanupNative?.()
      hlsRef.current?.destroy()
      hlsRef.current = null
    }
  }, [videoRef, activeSrc, isHls, attempt, playing])

  /**
   * Watchdog: không có khung hình HOẶC currentTime không tiến (dính khung cuối)
   * → gắn lại nguồn / đổi URL dự phòng.
   */
  useEffect(() => {
    if (!playing || !isHls) return

    const timer = window.setInterval(() => {
      const video = videoRef.current
      if (!video) return

      if (!hasDecodedFrame(video)) {
        strikesRef.current += 1
        if (strikesRef.current >= WATCHDOG_STRIKES) retry()
        return
      }

      strikesRef.current = 0
      const stall = stallCheckerRef.current.tick(video, playing)
      if (stall === 'stall') retry()
    }, WATCHDOG_MS)

    return () => window.clearInterval(timer)
  }, [playing, isHls, videoRef, retry])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (playing) {
      tryPlayVideo(video)
    } else {
      video.pause()
    }
  }, [playing, videoRef, activeSrc])

  const getDisplayWallclockMs = useCallback((): number | null => {
    if (!isHls) return null

    const playingDate = hlsRef.current?.playingDate
    if (playingDate) {
      const ms = playingDate.getTime()
      if (Number.isFinite(ms)) return ms
    }

    const video = videoRef.current
    if (!video) return null
    const startMs = nativeStartDateMs(video)
    if (startMs === null) return null
    return startMs + video.currentTime * 1000
  }, [isHls, videoRef])

  return useMemo(
    () => ({
      clock: { getDisplayWallclockMs },
      recover: retry,
    }),
    [getDisplayWallclockMs, retry],
  )
}

export function isHlsStreamUrl(src: string): boolean {
  return src.includes('.m3u8')
}
