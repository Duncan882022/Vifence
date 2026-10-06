import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { CameraVideoFeed } from '@/modules/module02-training/components/CameraVideoFeed'
import type { StreamSignalPhase } from '@/modules/module02-training/hooks/useHlsVideoSource'
import { h1Endpoints } from '../../services/workflow/h1Device'
import type { LiveAxis } from '../../workflow.types'

interface Props {
  helmetId: string
  simulated: boolean
  /** POC: giả lập mất mạng để trình diễn LIVE LOST / RECORDING LOCAL. */
  forceLost?: boolean
  overlayText?: string
  onVideoElement?: (video: HTMLVideoElement | null) => void
  onLiveAxis?: (axis: LiveAxis) => void
}

const STALL_MS = 5000

/** Luồng canvas thay H1 khi mũ offline — gắn nhãn mô phỏng trên từng khung hình. */
function SimulatedFeed({ overlayText, onVideoElement }: Pick<Props, 'overlayText' | 'onVideoElement'>) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const textRef = useRef(overlayText)
  textRef.current = overlayText

  useEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1280
    canvas.height = 720
    const ctx = canvas.getContext('2d')
    const video = videoRef.current
    if (!ctx || !video) return
    let frame = 0
    const draw = () => {
      frame += 1
      const t = frame / 12
      const g = ctx.createLinearGradient(0, 0, 1280, 720)
      g.addColorStop(0, '#1f2937')
      g.addColorStop(1, '#0f172a')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 1280, 720)
      ctx.strokeStyle = '#fb923c'
      ctx.lineWidth = 6
      const drift = Math.sin(t / 3) * 40
      for (let i = 0; i < 14; i++) {
        const x = 90 + i * 80 + drift
        ctx.beginPath()
        ctx.moveTo(x, 120)
        ctx.lineTo(x + 30, 640)
        ctx.stroke()
      }
      ctx.lineWidth = 4
      ctx.strokeStyle = '#fdba74'
      for (let j = 0; j < 5; j++) {
        const y = 170 + j * 110
        ctx.beginPath()
        ctx.moveTo(60 + drift, y)
        ctx.lineTo(1220 + drift, y + 20)
        ctx.stroke()
      }
      ctx.fillStyle = '#fff'
      ctx.font = '20px monospace'
      ctx.fillText(`${textRef.current ?? ''}  ${new Date().toLocaleTimeString('vi-VN', { hour12: false })}`, 24, 700)
    }
    draw()
    const timer = window.setInterval(draw, 1000 / 12)
    const stream = canvas.captureStream(12)
    video.srcObject = stream
    void video.play().catch(() => {})
    onVideoElement?.(video)
    return () => {
      window.clearInterval(timer)
      stream.getTracks().forEach(tr => tr.stop())
      video.srcObject = null
      onVideoElement?.(null)
    }
  }, [onVideoElement])

  return <video ref={videoRef} muted playsInline autoPlay className="absolute inset-0 w-full h-full object-contain bg-black" />
}

/** Feed HC-01 dùng chung pipeline WHEP → LL-HLS của Module 05 (CameraVideoFeed). */
export const H1LiveFeed = memo(function H1LiveFeed({ helmetId, simulated, forceLost, overlayText, onVideoElement, onLiveAxis }: Props) {
  const { whepUrl, hlsUrl } = h1Endpoints(helmetId)
  const [phase, setPhase] = useState<StreamSignalPhase>('idle')
  const [stalled, setStalled] = useState(false)
  const everLive = useRef(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const handleVideo = useCallback((v: HTMLVideoElement | null) => {
    videoRef.current = v
    onVideoElement?.(v)
  }, [onVideoElement])

  useEffect(() => {
    if (simulated) return
    let lastTime = -1
    let lastChange = Date.now()
    const t = window.setInterval(() => {
      const v = videoRef.current
      if (!v) return
      if (v.currentTime !== lastTime) {
        lastTime = v.currentTime
        lastChange = Date.now()
        setStalled(false)
      } else if (Date.now() - lastChange > STALL_MS) {
        setStalled(true)
      }
    }, 1000)
    return () => window.clearInterval(t)
  }, [simulated])

  useEffect(() => {
    let axis: LiveAxis
    if (forceLost) axis = 'lost'
    else if (simulated) axis = 'live'
    else if (phase === 'ready' && !stalled) axis = 'live'
    else if (everLive.current && (phase === 'offline' || stalled)) axis = 'lost'
    else if (phase === 'offline') axis = 'off'
    else axis = 'connecting'
    if (axis === 'live') everLive.current = true
    onLiveAxis?.(axis)
  }, [phase, stalled, simulated, forceLost, onLiveAxis])

  return (
    <div className="absolute inset-0 bg-black">
      {simulated ? (
        <SimulatedFeed overlayText={overlayText} onVideoElement={handleVideo} />
      ) : (
        <CameraVideoFeed
          cameraId={helmetId}
          streamType="bodycam"
          src={hlsUrl ?? ''}
          whepUrl={whepUrl}
          playing
          onVideoElement={handleVideo}
          onSignalPhase={setPhase}
        />
      )}
      {forceLost && <div className="absolute inset-0 bg-black/70" />}
    </div>
  )
})
