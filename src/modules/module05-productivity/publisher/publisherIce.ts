/** ICE/STUN/TURN cho WHIP publish — STUN mặc định + TURN tùy chọn qua env. */
const DEFAULT_STUN: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
]

function readEnv(key: string): string | undefined {
  const raw = import.meta.env[key as keyof ImportMetaEnv]
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined
}

/** STUN luôn bật; thêm TURN khi cấu hình (4G symmetric NAT). */
export function buildPublisherIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [...DEFAULT_STUN]

  const turnUrl = readEnv('VITE_WHIP_TURN_URL')
  const turnUser = readEnv('VITE_WHIP_TURN_USER')
  const turnPass = readEnv('VITE_WHIP_TURN_PASS')
  if (turnUrl && turnUser && turnPass) {
    servers.push({
      urls: turnUrl.split(',').map(s => s.trim()).filter(Boolean),
      username: turnUser,
      credential: turnPass,
    })
  }

  return servers
}
