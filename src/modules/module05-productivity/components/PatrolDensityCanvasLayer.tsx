/**
 * Canvas density heatmap — loang màu liên tục giữa các vùng (blur + additive),
 * clip trong polygon đỏ. Giống hiệu ứng reference HQCV.
 */
import L from 'leaflet'
import { useMap } from 'react-leaflet'
import { useEffect } from 'react'
import type { PatrolZone } from '../data/patrolMockData'
import { PATROL_DETECTION_DOTS } from '../data/patrolDetectionData'
import { isPointInSiteBoundary, PATROL_SITE_BOUNDARY } from '../data/patrolSiteGeometry'
import { PATROL_GPS_ZONES, patrolZoneInteriorPoint } from '../data/patrolSiteMap'
import {
  getPatrolHeatBlobColor,
  resolveCount,
  type PatrolCountMode,
  type PatrolDensityLayer,
} from '../services/patrolHeatmap.service'

export const PATROL_DENSITY_PANE = 'patrolDensityPane'

interface HeatSource {
  lat: number
  lng: number
  color: string
  alpha: number
  radius: number
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function heatRadiusForZoom(zoom: number): number {
  return 26 * 1.32 ** (zoom - 16)
}

function buildHeatSources(
  zones: PatrolZone[],
  layer: PatrolDensityLayer,
  countMode: PatrolCountMode,
  zoom: number,
): HeatSource[] {
  const zoneMap = new Map(zones.map(z => [z.id, z]))
  const maxCount = Math.max(...zones.map(z => resolveCount(z, layer, countMode)), 1)
  const baseR = heatRadiusForZoom(zoom)
  const sources: HeatSource[] = []

  for (const dot of PATROL_DETECTION_DOTS) {
    if (!isPointInSiteBoundary(dot.position[0], dot.position[1])) continue
    const zone = zoneMap.get(dot.zoneId)
    if (!zone || zone.coverage !== 'VISITED') continue
    const count = resolveCount(zone, layer, countMode)
    if (count === 0) continue
    const t = count / maxCount
    const color = getPatrolHeatBlobColor(count, true)
    const typeW = dot.type === 'vehicle' ? 0.75 : dot.type === 'person' ? 0.5 : 0.35
    sources.push({
      lat: dot.position[0],
      lng: dot.position[1],
      color,
      alpha: 0.12 + t * 0.22 * typeW,
      radius: baseR * (0.9 + typeW * 0.5),
    })
  }

  const gridU = [0.22, 0.5, 0.78]
  const gridV = [0.22, 0.5, 0.78]

  for (const gpsZone of PATROL_GPS_ZONES) {
    const zone = zoneMap.get(gpsZone.zone_id)
    if (!zone || zone.coverage !== 'VISITED') continue
    const count = resolveCount(zone, layer, countMode)
    if (count === 0) continue
    const t = count / maxCount
    const color = getPatrolHeatBlobColor(count, true)

    sources.push({
      lat: gpsZone.center[0],
      lng: gpsZone.center[1],
      color,
      alpha: 0.16 + t * 0.28,
      radius: baseR * (1.6 + t * 1.4),
    })

    for (const u of gridU) {
      for (const v of gridV) {
        const [lat, lng] = patrolZoneInteriorPoint(gpsZone.polygon, u, v)
        if (!isPointInSiteBoundary(lat, lng)) continue
        sources.push({
          lat,
          lng,
          color,
          alpha: 0.08 + t * 0.16,
          radius: baseR * (1.1 + t * 0.9),
        })
      }
    }
  }

  return sources
}

function clipSiteOnCtx(ctx: CanvasRenderingContext2D, map: L.Map): void {
  const ring = PATROL_SITE_BOUNDARY.slice(0, 4)
  ctx.beginPath()
  ring.forEach(([lat, lng], i) => {
    const p = map.latLngToContainerPoint(L.latLng(lat, lng))
    if (i === 0) ctx.moveTo(p.x, p.y)
    else ctx.lineTo(p.x, p.y)
  })
  ctx.closePath()
}

function renderHeatCanvas(
  map: L.Map,
  canvas: HTMLCanvasElement,
  sources: HeatSource[],
): void {
  const size = map.getSize()
  if (size.x <= 0 || size.y <= 0) return

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(size.x * dpr)
  canvas.height = Math.round(size.y * dpr)
  canvas.style.width = `${size.x}px`
  canvas.style.height = `${size.y}px`

  const off = document.createElement('canvas')
  off.width = canvas.width
  off.height = canvas.height
  const octx = off.getContext('2d')
  const ctx = canvas.getContext('2d')
  if (!octx || !ctx) return

  octx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  octx.clearRect(0, 0, size.x, size.y)
  octx.globalCompositeOperation = 'lighter'

  for (const src of sources) {
    const pt = map.latLngToContainerPoint(L.latLng(src.lat, src.lng))
    const [r, g, b] = hexToRgb(src.color)
    const grad = octx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, src.radius)
    grad.addColorStop(0, `rgba(${r},${g},${b},${src.alpha * 0.85})`)
    grad.addColorStop(0.35, `rgba(${r},${g},${b},${src.alpha * 0.45})`)
    grad.addColorStop(0.65, `rgba(${r},${g},${b},${src.alpha * 0.15})`)
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
    octx.fillStyle = grad
    octx.beginPath()
    octx.arc(pt.x, pt.y, src.radius, 0, Math.PI * 2)
    octx.fill()
  }

  ctx.clearRect(0, 0, size.x, size.y)
  ctx.save()
  clipSiteOnCtx(ctx, map)
  ctx.clip()

  const blurPx = Math.max(10, 8 + map.getZoom() * 0.6)
  ctx.filter = `blur(${blurPx}px)`
  ctx.globalAlpha = 0.88
  ctx.drawImage(off, 0, 0, size.x, size.y)

  ctx.filter = 'none'
  ctx.globalAlpha = 0.35
  ctx.globalCompositeOperation = 'lighter'
  ctx.drawImage(off, 0, 0, size.x, size.y)

  ctx.restore()
}

export interface PatrolDensityCanvasLayerProps {
  enabled: boolean
  zones: PatrolZone[]
  layer: PatrolDensityLayer
  countMode: PatrolCountMode
}

export function PatrolDensityCanvasLayer({
  enabled,
  zones,
  layer,
  countMode,
}: PatrolDensityCanvasLayerProps) {
  const map = useMap()

  useEffect(() => {
    if (!map.getPane(PATROL_DENSITY_PANE)) {
      const pane = map.createPane(PATROL_DENSITY_PANE)
      pane.style.zIndex = '410'
      pane.style.pointerEvents = 'none'
    }
    const pane = map.getPane(PATROL_DENSITY_PANE)
    if (!pane) return undefined

    let canvas = pane.querySelector('canvas.patrol-density-heat') as HTMLCanvasElement | null
    if (!canvas) {
      canvas = document.createElement('canvas')
      canvas.className = 'patrol-density-heat'
      canvas.style.position = 'absolute'
      canvas.style.left = '0'
      canvas.style.top = '0'
      canvas.style.pointerEvents = 'none'
      pane.appendChild(canvas)
    }

    const draw = () => {
      if (!enabled) {
        const ctx = canvas!.getContext('2d')
        if (ctx) ctx.clearRect(0, 0, canvas!.width, canvas!.height)
        return
      }
      const src = buildHeatSources(zones, layer, countMode, map.getZoom())
      if (src.length === 0) {
        const ctx = canvas!.getContext('2d')
        if (ctx) ctx.clearRect(0, 0, canvas!.width, canvas!.height)
        return
      }
      renderHeatCanvas(map, canvas!, src)
    }

    const schedule = () => requestAnimationFrame(draw)
    schedule()
    map.on('move zoom moveend zoomend viewreset resize load', schedule)
    const t1 = window.setTimeout(schedule, 80)
    const t2 = window.setTimeout(schedule, 400)

    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      map.off('move zoom moveend zoomend viewreset resize load', schedule)
      const ctx = canvas?.getContext('2d')
      if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [map, enabled, zones, layer, countMode])

  return null
}
