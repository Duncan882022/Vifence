import { memo, useEffect, useRef } from 'react'

interface Props {
  onChange: (dataUrl: string | null) => void
  className?: string
}

/** Ký tay bằng ngón tay / Apple Pencil trên iPad. */
export const SignaturePad = memo(function SignaturePad({ onChange, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const dirty = useRef(false)
  const changeRef = useRef(onChange)
  changeRef.current = onChange

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#e2e8f0'

    const point = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const down = (e: PointerEvent) => {
      drawing.current = true
      canvas.setPointerCapture(e.pointerId)
      const p = point(e)
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
    }
    const move = (e: PointerEvent) => {
      if (!drawing.current) return
      const p = point(e)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
      dirty.current = true
    }
    const up = () => {
      if (!drawing.current) return
      drawing.current = false
      if (dirty.current) changeRef.current(canvas.toDataURL('image/png'))
    }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    return () => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
    }
  }, [])

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    dirty.current = false
    onChange(null)
  }

  return (
    <div className={className}>
      <canvas ref={canvasRef} className="w-full h-28 rounded-lg border border-dashed border-white/20 bg-white/[0.03] touch-none" />
      <button type="button" onClick={clear} className="text-[10px] text-muted-foreground mt-1">Ký lại</button>
    </div>
  )
})
