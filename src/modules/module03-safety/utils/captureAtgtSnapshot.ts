export const ATGT_SPEEDING_VIOLATION_TEXT = 'Phương tiện vượt quá tốc độ quy định'

export const ATGT_LANE_VIOLATION_TEXT = 'Không tổ chức phân làn, luồng giao thông'

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

/** Chụp khung video + bbox vi phạm ATGT cho snapshot sự kiện demo. */
export function captureAtgtSpeedingSnapshot(
  video: HTMLVideoElement,
  vehicleBbox: [number, number, number, number],
  options?: {
    violationText?: string
    vehiclePlate?: string
  },
): string | null {
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h || video.readyState < 2) return null

  const violationText = options?.violationText ?? ATGT_SPEEDING_VIOLATION_TEXT
  const vehicleLabel = options?.vehiclePlate?.trim()
    ? `Ô tô · ${options.vehiclePlate.trim()}`
    : 'Ô tô'

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  try {
    ctx.drawImage(video, 0, 0, w, h)
  } catch {
    return null
  }

  drawViolationBox(ctx, vehicleBbox, {
    stroke: 'rgba(180,180,180,0.85)',
    lineWidth: 1,
    label: vehicleLabel,
    labelBg: 'rgba(75,85,99,0.82)',
  })
  drawViolationBox(ctx, vehicleBbox, {
    stroke: 'rgba(34,211,238,0.95)',
    lineWidth: 2,
    label: violationText,
    labelBg: 'rgba(8,145,178,0.88)',
  })

  return canvas.toDataURL('image/jpeg', 0.84)
}

export function captureAtgtLaneSnapshot(
  video: HTMLVideoElement,
  laneBbox: [number, number, number, number],
  violationText = ATGT_LANE_VIOLATION_TEXT,
): string | null {
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h || video.readyState < 2) return null

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  try {
    ctx.drawImage(video, 0, 0, w, h)
  } catch {
    return null
  }
  drawViolationBox(ctx, laneBbox, {
    stroke: 'rgba(192,132,252,0.95)',
    lineWidth: 2,
    label: violationText,
    labelBg: 'rgba(126,34,206,0.88)',
  })

  return canvas.toDataURL('image/jpeg', 0.84)
}
