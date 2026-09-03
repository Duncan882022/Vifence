import { useEffect, useRef, useState } from 'react'
import { videoRectToOverlayPercent } from '@/modules/module02-training/utils/videoOverlayCoords'

interface Detection {
  bbox: [number, number, number, number]
  class: string
  confidence: number
}

/**
 * Khung nguồn cuối cùng còn biết được, khi cả metadata lẫn canvas đều chưa nói
 * gì. Server Vision cũ phát ở cỡ này; đoán sai còn hơn không vẽ được gì.
 */
const LEGACY_FRAME_WIDTH = 720
const LEGACY_FRAME_HEIGHT = 480

const CLASS_COLORS: Record<string, { stroke: string; fill: string }> = {
  person:  { stroke: '#4ade80', fill: 'rgba(74,222,128,0.1)' },
  car:     { stroke: '#fb923c', fill: 'rgba(251,146,60,0.1)' },
  moto:    { stroke: '#a78bfa', fill: 'rgba(167,139,250,0.1)' },
  bus:     { stroke: '#fbbf24', fill: 'rgba(251,191,36,0.1)' },
  truck:   { stroke: '#f87171', fill: 'rgba(248,113,113,0.1)' },
}

interface CameraJsmpegFeedProps {
  wsUrl: string
  cameraId: string
}

class CustomSource {
  destination: unknown = null
  completed = false
  established = true
  progress = 1
  connect(destination: unknown) { this.destination = destination }
  start() {}
  resume() {}
  destroy() {}
  feed(arrayBuffer: ArrayBuffer) {
    if (this.destination) (this.destination as { write(b: ArrayBuffer): void }).write(arrayBuffer)
  }
}

export function CameraJsmpegFeed({ wsUrl }: CameraJsmpegFeedProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)

  // dùng useRef giống MonitorGrid để tránh stale closure trong interval callbacks
  const lastTimeRef = useRef<number>(-1)
  const stallTimerRef = useRef<number>(0)
  const lastDetectionsRef = useRef<Detection[]>([])
  const lastDetectTimeRef = useRef<number>(0)
  /** Khung nguồn bbox được tính trên đó — server gửi kèm thì tin server. */
  const frameSizeRef = useRef<{ width: number; height: number } | null>(null)

  const [status, setStatus] = useState<'connecting' | 'playing' | 'error'>('connecting')

  useEffect(() => {
    // Chỉ kết nối khi wsUrl là WebSocket URL hợp lệ (tránh resolve thành URL tương đối)
    if (!wsUrl || (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://'))) return

    // reset state giống MonitorGrid
    setStatus('connecting')
    lastTimeRef.current = -1
    stallTimerRef.current = 0
    lastDetectionsRef.current = []
    lastDetectTimeRef.current = 0
    frameSizeRef.current = null

    let ws: WebSocket | null = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let player: any = null
    let customSrc: CustomSource | null = null
    let checkInterval: ReturnType<typeof setInterval>
    let latencyCheckInterval: ReturnType<typeof setInterval>
    let connectTimeoutId: ReturnType<typeof setTimeout>
    let animFrameId: number
    let destroyed = false

    // Timeout 10s nếu ws không kết nối được
    connectTimeoutId = setTimeout(() => {
      if (!destroyed && status === 'connecting') setStatus('error')
    }, 10000)

    // Dynamic import để tránh JSMpeg access document ở module scope
    // Lấy token của hệ thống Vin trực tiếp từ localStorage (Tạm thời tắt để test không token)
    // const token = localStorage.getItem('vifence_access_token')
    void import('@cycjimmy/jsmpeg-player').then((mod) => {
      if (destroyed) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const JSMpeg = (mod as any).default ?? mod

      customSrc = new CustomSource()

      if (!canvasRef.current) return

      // 1. Khởi tạo JSMpeg player với CustomSource
      player = new JSMpeg.Player(null, {
        canvas: canvasRef.current,
        source: function () { return customSrc },
        autoplay: true,
        audio: false,
        disableGl: false,
        videoBufferSize: 256 * 1024,
        pauseWhenHidden: false,
      })

      // 2. Kết nối WebSocket thủ công — Tạm thời không gửi token để test
      // const urlWithToken = token ? `${wsUrl}?token=${token}` : wsUrl
      const urlWithToken = wsUrl
      ws = new WebSocket(urlWithToken)
      ws.binaryType = 'arraybuffer'



      ws.onopen = () => {
        if (destroyed) return
        clearTimeout(connectTimeoutId)
        // giống MonitorGrid: chỉ set playing trong onopen
        setStatus('playing')

        // 3. Catch-up layer: xóa buffer ứ đọng mỗi 500ms
        latencyCheckInterval = setInterval(() => {
          if (player && player.video) {
            const buffered = player.video.demuxer ? player.video.demuxer.buffer.length : 0
            if (buffered > 64 * 1024) {
              player.video.demuxer.buffer.evict(buffered - 16 * 1024)
            }
            if (player.video.source && player.video.source.destination) {
              if (player.video.currentTime > 0 && player.video.paused) {
                player.play()
              }
            }
          }
        }, 500)
      }

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data)
            if (msg.type === 'detections') {
              lastDetectionsRef.current = msg.detections || []
              lastDetectTimeRef.current = Date.now()
              if (Number(msg.width) > 0 && Number(msg.height) > 0) {
                frameSizeRef.current = {
                  width: Number(msg.width),
                  height: Number(msg.height),
                }
              }
            }
          } catch (e) {
            console.error('Lỗi phân tích JSON metadata:', e)
          }
        } else {
          if (customSrc) customSrc.feed(event.data)
        }
      }

      ws.onerror = () => { if (!destroyed) setStatus('error') }
      ws.onclose = () => { if (!destroyed) setStatus('error') }

      // 4. Stall detection: giống hệt MonitorGrid
      checkInterval = setInterval(() => {
        if (!player || destroyed) return
        const currentTime = player.currentTime
        if (currentTime === lastTimeRef.current) {
          stallTimerRef.current += 1
          if (stallTimerRef.current >= 4) setStatus('error')
        } else {
          lastTimeRef.current = currentTime
          stallTimerRef.current = 0
          setStatus('playing')
        }
      }, 1000)

      // 5. AI Bounding Box overlay loop
      const drawOverlayLoop = () => {
        if (destroyed) return
        const overlayCanvas = overlayRef.current
        if (!overlayCanvas) return
        const ctx = overlayCanvas.getContext('2d')
        if (!ctx) return
        const container = overlayCanvas.parentElement
        if (!container) return

        const cssWidth = container.clientWidth
        const cssHeight = container.clientHeight
        const dpr = window.devicePixelRatio || 1
        const pixelWidth = Math.round(cssWidth * dpr)
        const pixelHeight = Math.round(cssHeight * dpr)
        // Gán width/height là xoá canvas: chỉ đổi khi kích thước thật sự khác,
        // nếu không mỗi khung hình lại dựng lại bộ đệm vẽ.
        if (overlayCanvas.width !== pixelWidth || overlayCanvas.height !== pixelHeight) {
          overlayCanvas.width = pixelWidth
          overlayCanvas.height = pixelHeight
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, cssWidth, cssHeight)

        // Timeout 1.2s không có data YOLO → xóa overlay
        if (Date.now() - lastDetectTimeRef.current > 1200) {
          lastDetectionsRef.current = []
        }

        // Khung nguồn thật của luồng: JSMpeg đặt kích thước canvas theo đúng độ
        // phân giải giải mã được. Trước đây chỗ này cứng 720×480 nên mọi camera
        // khác tỉ lệ đó đều bị lệch hộp, càng lệch khi khung cao/rộng bất thường.
        const decoded = canvasRef.current
        const frame = frameSizeRef.current
        const frameWidth = frame?.width || decoded?.width || LEGACY_FRAME_WIDTH
        const frameHeight = frame?.height || decoded?.height || LEGACY_FRAME_HEIGHT

        if (lastDetectionsRef.current.length > 0 && cssWidth > 0 && cssHeight > 0) {
          lastDetectionsRef.current.forEach((d) => {
            const [x1, y1, x2, y2] = d.bbox
            // Video hiển thị object-contain nên có viền đen hai bên; dùng chung
            // phép chiếu với các overlay khác để hộp nằm đúng trong khung hình.
            const rect = videoRectToOverlayPercent(
              { x: x1, y: y1, width: x2 - x1, height: y2 - y1 },
              frameWidth,
              frameHeight,
              cssWidth,
              cssHeight,
              'contain',
            )
            const sx1 = (rect.x / 100) * cssWidth
            const sy1 = (rect.y / 100) * cssHeight
            const sw = (rect.w / 100) * cssWidth
            const sh = (rect.h / 100) * cssHeight
            const color = CLASS_COLORS[d.class] ?? { stroke: '#3b82f6', fill: 'rgba(59,130,246,0.1)' }

            ctx.globalAlpha = 1.0
            ctx.fillStyle = color.fill
            ctx.fillRect(sx1, sy1, sw, sh)
            ctx.strokeStyle = color.stroke
            ctx.lineWidth = 2
            ctx.strokeRect(sx1, sy1, sw, sh)

            const label = `${d.class} ${Math.round(d.confidence * 100)}%`
            ctx.font = 'bold 11px monospace'
            const textWidth = ctx.measureText(label).width + 6
            ctx.fillStyle = color.stroke
            ctx.fillRect(sx1, sy1 - 16, textWidth, 16)
            ctx.fillStyle = '#000'
            ctx.fillText(label, sx1 + 3, sy1 - 4)
          })
        }

        animFrameId = requestAnimationFrame(drawOverlayLoop)
      }
      animFrameId = requestAnimationFrame(drawOverlayLoop)
    }).catch(() => {
      if (!destroyed) setStatus('error')
    })

    return () => {
      destroyed = true
      clearTimeout(connectTimeoutId)
      clearInterval(checkInterval)
      clearInterval(latencyCheckInterval)
      cancelAnimationFrame(animFrameId)
      if (ws) { ws.onclose = null; ws.onerror = null; ws.close() }
      if (player) player.destroy()
      customSrc = null
    }
  }, [wsUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className={`w-full h-full object-contain transition-opacity duration-300 ${status === 'playing' ? 'opacity-100' : 'opacity-0'}`}
      />
      <canvas
        ref={overlayRef}
        className="absolute top-0 left-0 w-full h-full pointer-events-none z-10"
      />
      {status !== 'playing' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70 text-xs bg-black/80 z-10">
          {status === 'connecting' && (
            <>
              <div className="w-5 h-5 border-2 border-white/20 border-t-white/70 rounded-full animate-spin mb-2" />
              <span>Đang kết nối...</span>
            </>
          )}
          {status === 'error' && <span className="text-white font-medium">Không có tín hiệu</span>}
        </div>
      )}
    </div>
  )
}
