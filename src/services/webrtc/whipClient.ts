/**
 * WHIP publisher (RFC 9725) — đẩy MediaStream lên MediaMTX qua WebRTC.
 *
 * Thay thế luồng cũ "chụp JPEG → POST /analyze/frame": thiết bị phát luồng
 * liên tục có timestamp RTP, backend pull RTSP từ MediaMTX để chạy AI.
 *
 * Tối ưu cho bodycam công trường:
 * - Ưu tiên H.264 (encode phần cứng → đỡ tốn pin, độ trễ thấp hơn VP8/VP9)
 * - `maintain-resolution`: mạng yếu thì giảm FPS, giữ độ phân giải cho AI detect
 * - Trần bitrate cấu hình được — tránh nghẽn uplink 4G
 */

export type WhipConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'closed'

export interface WhipPublishStats {
  /** Bitrate video đang gửi (kbps) — tính từ delta giữa 2 lần lấy stats. */
  bitrateKbps: number
  /** Round-trip time tới server (ms) — null khi chưa có mẫu. */
  rttMs: number | null
  frameWidth: number
  frameHeight: number
  framesPerSecond: number
  packetsLost: number
  /** Chất lượng bị giới hạn bởi gì: cpu / bandwidth / none. */
  qualityLimitation: string
}

export const EMPTY_WHIP_STATS: WhipPublishStats = {
  bitrateKbps: 0,
  rttMs: null,
  frameWidth: 0,
  frameHeight: 0,
  framesPerSecond: 0,
  packetsLost: 0,
  qualityLimitation: 'none',
}

export interface WhipPublisherOptions {
  endpoint: string
  stream: MediaStream
  /** Trần bitrate video (bps). Mặc định 2.5 Mbps — đủ 720p công trường. */
  maxBitrateBps?: number
  iceServers?: RTCIceServer[]
  onStateChange?: (state: WhipConnectionState, message?: string) => void
  onStats?: (stats: WhipPublishStats) => void
  /** Chu kỳ lấy stats (ms). 0 = tắt. */
  statsIntervalMs?: number
}

export interface WhipPublisher {
  /** Đổi track video khi lật cam trước/sau — không cần đàm phán lại SDP. */
  replaceVideoTrack: (track: MediaStreamTrack) => Promise<void>
  stop: () => Promise<void>
  getState: () => WhipConnectionState
}

const DEFAULT_MAX_BITRATE = 2_500_000
const ICE_GATHER_TIMEOUT_MS = 3000

/** Chờ ICE gathering xong (non-trickle) — MediaMTX chấp nhận offer đầy đủ. */
function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()

  return new Promise(resolve => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      pc.removeEventListener('icegatheringstatechange', onChange)
      resolve()
    }
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') finish()
    }
    // Mạng chậm có thể không bao giờ "complete" — chốt sau timeout với candidate đã có.
    const timer = window.setTimeout(finish, ICE_GATHER_TIMEOUT_MS)
    pc.addEventListener('icegatheringstatechange', onChange)
  })
}

/** Ưu tiên H.264 nếu trình duyệt hỗ trợ — encode phần cứng trên iOS/Android. */
function preferH264(transceiver: RTCRtpTransceiver): void {
  const capabilities = RTCRtpSender.getCapabilities('video')
  if (!capabilities?.codecs || typeof transceiver.setCodecPreferences !== 'function') return

  const h264 = capabilities.codecs.filter(c => /h264/i.test(c.mimeType))
  const others = capabilities.codecs.filter(c => !/h264/i.test(c.mimeType))
  if (h264.length === 0) return

  try {
    transceiver.setCodecPreferences([...h264, ...others])
  } catch {
    // Trình duyệt cũ không cho set — dùng thứ tự mặc định.
  }
}

async function applySenderTuning(
  sender: RTCRtpSender,
  maxBitrateBps: number,
): Promise<void> {
  const params = sender.getParameters()
  if (!params.encodings || params.encodings.length === 0) {
    params.encodings = [{}]
  }
  params.encodings[0].maxBitrate = maxBitrateBps
  // Giữ độ phân giải để AI detect chính xác; mạng yếu thì giảm FPS.
  params.degradationPreference = 'maintain-resolution'

  try {
    await sender.setParameters(params)
  } catch {
    // Safari cũ chưa hỗ trợ đầy đủ — bỏ qua, vẫn publish được.
  }
}

interface StatsSample {
  bytesSent: number
  timestamp: number
}

/** lib.dom chưa khai báo remote-inbound-rtp — mô tả các trường thực sự dùng. */
interface RemoteInboundVideoStats {
  roundTripTime?: number
  packetsLost?: number
}

function readVideoStats(
  report: RTCStatsReport,
  previous: StatsSample | null,
): { stats: WhipPublishStats; sample: StatsSample | null } {
  let sample: StatsSample | null = null
  let rttMs: number | null = null
  const stats: WhipPublishStats = { ...EMPTY_WHIP_STATS }

  report.forEach(entry => {
    if (entry.type === 'outbound-rtp' && entry.kind === 'video') {
      const outbound = entry as RTCOutboundRtpStreamStats & {
        framesPerSecond?: number
        frameWidth?: number
        frameHeight?: number
        qualityLimitationReason?: string
      }
      sample = {
        bytesSent: outbound.bytesSent ?? 0,
        timestamp: outbound.timestamp,
      }
      stats.frameWidth = outbound.frameWidth ?? 0
      stats.frameHeight = outbound.frameHeight ?? 0
      stats.framesPerSecond = Math.round(outbound.framesPerSecond ?? 0)
      stats.qualityLimitation = outbound.qualityLimitationReason ?? 'none'
    }
    if (entry.type === 'remote-inbound-rtp' && entry.kind === 'video') {
      const remote = entry as RemoteInboundVideoStats
      if (typeof remote.roundTripTime === 'number') {
        rttMs = Math.round(remote.roundTripTime * 1000)
      }
      stats.packetsLost = remote.packetsLost ?? 0
    }
  })

  stats.rttMs = rttMs

  if (sample && previous) {
    const current: StatsSample = sample
    const deltaMs = current.timestamp - previous.timestamp
    const deltaBytes = current.bytesSent - previous.bytesSent
    if (deltaMs > 0 && deltaBytes >= 0) {
      stats.bitrateKbps = Math.round((deltaBytes * 8) / deltaMs)
    }
  }

  return { stats, sample }
}

/** Bóc URL tài nguyên WHIP từ header Location (tuyệt đối hoặc tương đối). */
function resolveResourceUrl(endpoint: string, location: string | null): string | null {
  if (!location) return null
  try {
    return new URL(location, endpoint).toString()
  } catch {
    return null
  }
}

export async function startWhipPublisher(
  options: WhipPublisherOptions,
): Promise<WhipPublisher> {
  const {
    endpoint,
    stream,
    maxBitrateBps = DEFAULT_MAX_BITRATE,
    iceServers = [],
    onStateChange,
    onStats,
    statsIntervalMs = 2000,
  } = options

  let state: WhipConnectionState = 'idle'
  const setState = (next: WhipConnectionState, message?: string) => {
    if (state === next) return
    state = next
    onStateChange?.(next, message)
  }

  setState('connecting')

  const pc = new RTCPeerConnection({
    iceServers,
    bundlePolicy: 'max-bundle',
  })

  let resourceUrl: string | null = null
  let statsTimer = 0
  let lastSample: StatsSample | null = null
  let stopped = false

  const videoTrack = stream.getVideoTracks()[0]
  if (!videoTrack) {
    pc.close()
    setState('failed', 'Không có track video.')
    throw new Error('MediaStream không có track video.')
  }

  // 'detail' → encoder giữ nét cho cảnh tĩnh, quan trọng khi detect người ở xa.
  if ('contentHint' in videoTrack) videoTrack.contentHint = 'detail'

  const transceiver = pc.addTransceiver(videoTrack, {
    direction: 'sendonly',
    streams: [stream],
  })
  preferH264(transceiver)

  pc.addEventListener('connectionstatechange', () => {
    if (stopped) return
    if (pc.connectionState === 'connected') setState('connected')
    else if (pc.connectionState === 'disconnected') setState('reconnecting', 'Mất kết nối tạm thời.')
    else if (pc.connectionState === 'failed') setState('failed', 'Kết nối WebRTC thất bại.')
  })

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  await waitForIceGathering(pc)

  const localSdp = pc.localDescription?.sdp
  if (!localSdp) {
    pc.close()
    setState('failed', 'Không tạo được SDP offer.')
    throw new Error('Không tạo được SDP offer.')
  }

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: localSdp,
    })
  } catch (err) {
    pc.close()
    const msg = err instanceof Error ? err.message : 'Không gọi được endpoint WHIP.'
    setState('failed', msg)
    throw new Error(msg)
  }

  if (!response.ok) {
    pc.close()
    const msg = `WHIP trả về HTTP ${response.status}`
    setState('failed', msg)
    throw new Error(msg)
  }

  resourceUrl = resolveResourceUrl(endpoint, response.headers.get('Location'))
  const answerSdp = await response.text()
  await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })

  await applySenderTuning(transceiver.sender, maxBitrateBps)

  if (statsIntervalMs > 0 && onStats) {
    const pollStats = async () => {
      if (stopped) return
      try {
        const report = await pc.getStats()
        const { stats, sample } = readVideoStats(report, lastSample)
        lastSample = sample
        onStats(stats)
      } catch {
        // getStats lỗi không ảnh hưởng luồng phát.
      }
    }
    statsTimer = window.setInterval(() => { void pollStats() }, statsIntervalMs)
  }

  const stop = async (): Promise<void> => {
    if (stopped) return
    stopped = true
    window.clearInterval(statsTimer)

    if (resourceUrl) {
      try {
        // keepalive: kịp báo server dừng ngay cả khi tab đang đóng.
        await fetch(resourceUrl, { method: 'DELETE', keepalive: true })
      } catch {
        // Server tự dọn session khi ICE timeout.
      }
    }

    pc.getSenders().forEach(sender => sender.track?.stop())
    pc.close()
    setState('closed')
  }

  return {
    replaceVideoTrack: async (track: MediaStreamTrack) => {
      if ('contentHint' in track) track.contentHint = 'detail'
      await transceiver.sender.replaceTrack(track)
      await applySenderTuning(transceiver.sender, maxBitrateBps)
    },
    stop,
    getState: () => state,
  }
}
