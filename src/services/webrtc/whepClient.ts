/**
 * WHEP subscriber — nhận luồng WebRTC từ MediaMTX để xem live độ trễ thấp.
 *
 * Dùng cho tile camera trong CMS. Độ trễ điển hình 200–500ms so với 2–5s của
 * LL-HLS, nên bbox bám video sát hơn nhiều mà không cần coast dài.
 * Khi UDP bị chặn (firewall công ty), caller nên fallback sang HLS.
 */

export type WhepConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'closed'

export interface WhepSubscriberOptions {
  endpoint: string
  iceServers?: RTCIceServer[]
  onTrack: (stream: MediaStream) => void
  onStateChange?: (state: WhepConnectionState, message?: string) => void
  /** Thời gian chờ 'connected' trước khi coi là thất bại (ms). */
  connectTimeoutMs?: number
}

export interface WhepSubscriber {
  stop: () => Promise<void>
  getState: () => WhepConnectionState
  /** Độ trễ jitter buffer hiện tại (ms) — dùng để hiệu chỉnh overlay. */
  getPlayoutDelayMs: () => number | null
}

const ICE_GATHER_TIMEOUT_MS = 3000
const DEFAULT_CONNECT_TIMEOUT_MS = 8000

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
    const timer = window.setTimeout(finish, ICE_GATHER_TIMEOUT_MS)
    pc.addEventListener('icegatheringstatechange', onChange)
  })
}

function resolveResourceUrl(endpoint: string, location: string | null): string | null {
  if (!location) return null
  try {
    return new URL(location, endpoint).toString()
  } catch {
    return null
  }
}

export async function startWhepSubscriber(
  options: WhepSubscriberOptions,
): Promise<WhepSubscriber> {
  const {
    endpoint,
    iceServers = [],
    onTrack,
    onStateChange,
    connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS,
  } = options

  let state: WhepConnectionState = 'idle'
  const setState = (next: WhepConnectionState, message?: string) => {
    if (state === next) return
    state = next
    onStateChange?.(next, message)
  }

  setState('connecting')

  const pc = new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle' })
  let resourceUrl: string | null = null
  let stopped = false
  let connectTimer = 0

  const remoteStream = new MediaStream()

  pc.addEventListener('track', event => {
    event.streams[0]?.getTracks().forEach(track => {
      if (!remoteStream.getTracks().includes(track)) remoteStream.addTrack(track)
    })
    if (remoteStream.getTracks().length > 0) onTrack(remoteStream)
  })

  pc.addEventListener('connectionstatechange', () => {
    if (stopped) return
    if (pc.connectionState === 'connected') {
      window.clearTimeout(connectTimer)
      setState('connected')
    } else if (pc.connectionState === 'disconnected') {
      setState('reconnecting', 'Mất kết nối tạm thời.')
    } else if (pc.connectionState === 'failed') {
      setState('failed', 'Kết nối WebRTC thất bại.')
    }
  })

  const videoTransceiver = pc.addTransceiver('video', { direction: 'recvonly' })
  pc.addTransceiver('audio', { direction: 'recvonly' })

  // Giảm jitter buffer — ưu tiên độ trễ thấp cho giám sát realtime.
  const receiver = videoTransceiver.receiver as RTCRtpReceiver & { playoutDelayHint?: number }
  if ('playoutDelayHint' in receiver) receiver.playoutDelayHint = 0

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
    const msg = err instanceof Error ? err.message : 'Không gọi được endpoint WHEP.'
    setState('failed', msg)
    throw new Error(msg)
  }

  if (!response.ok) {
    pc.close()
    const msg = `WHEP trả về HTTP ${response.status}`
    setState('failed', msg)
    throw new Error(msg)
  }

  resourceUrl = resolveResourceUrl(endpoint, response.headers.get('Location'))
  const answerSdp = await response.text()
  await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })

  connectTimer = window.setTimeout(() => {
    if (!stopped && state !== 'connected') {
      setState('failed', 'Hết thời gian chờ kết nối WebRTC.')
    }
  }, connectTimeoutMs)

  const stop = async (): Promise<void> => {
    if (stopped) return
    stopped = true
    window.clearTimeout(connectTimer)

    if (resourceUrl) {
      try {
        await fetch(resourceUrl, { method: 'DELETE', keepalive: true })
      } catch {
        // Server tự dọn khi ICE timeout.
      }
    }

    remoteStream.getTracks().forEach(track => track.stop())
    pc.close()
    setState('closed')
  }

  return {
    stop,
    getState: () => state,
    getPlayoutDelayMs: () => {
      const hint = (videoTransceiver.receiver as RTCRtpReceiver & { playoutDelayHint?: number })
        .playoutDelayHint
      return typeof hint === 'number' ? hint * 1000 : null
    },
  }
}
