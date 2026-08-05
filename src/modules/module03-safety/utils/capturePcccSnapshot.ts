export const PCCC_SMOKING_VIOLATION_TEXT = 'Hút thuốc trong khu vực cấm'

export const PCCC_FIRE_VIOLATION_TEXT = 'Phát hiện cháy nổ'

function drawViolationBox(
  ctx: CanvasRenderingContext2D,
  bbox: [number, number, number, number],
  options: {
    stroke: string
    lineWidth: number
    label: string
    labelBg: string
  },
): void {
  const [x1, y1, x2, y2] = bbox
  const w = x2 - x1
  const h = y2 - y1
  if (w <= 0 || h <= 0) return

  ctx.strokeStyle = options.stroke
  ctx.lineWidth = options.lineWidth
  ctx.strokeRect(x1, y1, w, h)

  const fontSize = Math.max(11, Math.min(16, Math.round(w / 18)))
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`
  const pad = 4
  const textW = ctx.measureText(options.label).width
  const textH = fontSize + pad * 2
  const labelTop = Math.max(pad, y1 - textH - 2)
  ctx.fillStyle = options.labelBg
  ctx.fillRect(x1, labelTop, textW + pad * 2, textH)
  ctx.fillStyle = '#fff'
  ctx.fillText(options.label, x1 + pad, labelTop + fontSize + 1)
}

/** Chụp khung video + bbox hút thuốc cho snapshot sự kiện PCCC demo. */
export function capturePcccSmokingSnapshot(
  video: HTMLVideoElement,
  personBbox: [number, number, number, number],
  violationText = PCCC_SMOKING_VIOLATION_TEXT,
): string | null {
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) return null

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.drawImage(video, 0, 0, w, h)
  drawViolationBox(ctx, personBbox, {
    stroke: 'rgba(251,146,60,0.95)',
    lineWidth: 2,
    label: violationText,
    labelBg: 'rgba(234,88,12,0.88)',
  })

  return canvas.toDataURL('image/jpeg', 0.84)
}

/** Chụp khung video + bbox cháy nổ cho snapshot sự kiện PCCC demo. */
export function capturePcccFireSnapshot(
  video: HTMLVideoElement,
  fireBbox: [number, number, number, number],
  violationText = PCCC_FIRE_VIOLATION_TEXT,
): string | null {
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) return null

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.drawImage(video, 0, 0, w, h)
  drawViolationBox(ctx, fireBbox, {
    stroke: 'rgba(248,113,113,0.95)',
    lineWidth: 2,
    label: violationText,
    labelBg: 'rgba(220,38,38,0.88)',
  })

  return canvas.toDataURL('image/jpeg', 0.84)
}
