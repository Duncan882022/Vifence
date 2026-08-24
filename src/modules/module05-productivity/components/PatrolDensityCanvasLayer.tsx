/**
 * Canvas density heatmap — 2-pass: intensity splats → blur → color ramp (lam→đỏ).
 * Nguồn mật độ người: patrolHeatGrid (tích lũy ca) + zone fallback.
 */
import L from 'leaflet'
import { useMap } from 'react-leaflet'
import { useEffect, useState } from 'react'
import type { PatrolZone } from '../data/patrolMockData'
import { PATROL_DETECTION_DOTS } from '../data/patrolDetectionData'
import { isPointInSiteBoundary, PATROL_SITE_CLIP_RING } from '../data/patrolSiteGeometry'
import { PATROL_GPS_ZONES, patrolZoneInteriorPoint } from '../data/patrolSiteMap'
import {
  getPatrolHeatmapRampRgb,
  resolveCount,
  type PatrolCountMode,
  type PatrolDensityLayer,
} from '../services/patrolHeatmap.service'
import {
  getPatrolHeatSources,
  subscribePatrolHeatGrid,
  type PatrolHeatSource,
} from '@/services/patrolHeatGrid'
import { heatmapWindowMs, type HeatmapTimeWindow } from '../utils/workforceHeatmapUi'

export const PATROL_DENSITY_PANE = 'patrolDensityPane'

interface HeatSource {
  lat: number
  lng: number
  intensity: number
  radius: number
}

function heatRadiusForZoom(zoom: number): number {
  return 22 * 1.28 ** (zoom - 16)
}

function pushSource(
  sources: HeatSource[],
  lat: number,
  lng: number,
  intensity: number,
  radius: number,
): void {
  if (!isPointInSiteBoundary(lat, lng)) return
  sources.push({ lat, lng, intensity, radius })
}

function mergeGridSources(
  sources: HeatSource[],
  gridSources: PatrolHeatSource[],
): void {
  for (const src of gridSources) {
    pushSource(sources, src.lat, src.lng, src.intensity, src.radius)
  }
}

function buildHeatSources(
  zones: PatrolZone[],
  layer: PatrolDensityLayer,
  countMode: PatrolCountMode,
  zoom: number,
  heatWindowMs: number,
): HeatSource[] {
  const zoneMap = new Map(zones.map(z => [z.id, z]))
  const maxCount = Math.max(...zones.map(z => resolveCount(z, layer, countMode)), 1)
  const baseR = heatRadiusForZoom(zoom)
  const sources: HeatSource[] = []

  if (layer === 'people' || layer === 'combined') {
    mergeGridSources(sources, getPatrolHeatSources(heatWindowMs, zoom))
  }

  if (sources.length === 0) {
    for (const dot of PATROL_DETECTION_DOTS) {
      const zone = zoneMap.get(dot.zoneId)
      if (!zone || zone.coverage !== 'VISITED') continue
      const count = resolveCount(zone, layer, countMode)
      if (count === 0) continue
      const zoneT = count / maxCount
      const typeW = dot.type === 'vehicle' ? 0.85 : dot.type === 'person' ? 0.55 : 0.4
      pushSource(
        sources,
        dot.position[0],
        dot.position[1],
        (0.18 + zoneT * 0.55) * typeW,
        baseR * (0.75 + typeW * 0.45),
      )
    }
  }

  const gridSteps = [0.25, 0.5, 0.75]

  for (const gpsZone of PATROL_GPS_ZONES) {
    const zone = zoneMap.get(gpsZone.zone_id)
    if (!zone || zone.coverage !== 'VISITED') continue
    if (gpsZone.polygon.length < 3) continue
    const count = resolveCount(zone, layer, countMode)
    if (count === 0) continue
    const zoneT = count / maxCount
    const peak = 0.28 + zoneT * 0.42

    pushSource(
      sources,
      gpsZone.center[0],
      gpsZone.center[1],
      peak * (sources.length > 0 ? 0.45 : 1),
      baseR * (1.15 + zoneT * 0.65),
    )

    for (const u of gridSteps) {
      for (const v of gridSteps) {
        if (gpsZone.polygon.length < 4) continue
        const [lat, lng] = patrolZoneInteriorPoint(gpsZone.polygon, u, v)
        const edgeFalloff = 1 - Math.abs(u - 0.5) * 0.4 - Math.abs(v - 0.5) * 0.4
        pushSource(
          sources,
          lat,
          lng,
          peak * 0.32 * edgeFalloff * (sources.length > 0 ? 0.45 : 1),
          baseR * (0.85 + zoneT * 0.45),
        )
      }
    }
  }

  return sources
}

function fillSiteMaskPath(ctx: CanvasRenderingContext2D, map: L.Map): void {
  ctx.beginPath()
  PATROL_SITE_CLIP_RING.forEach(([lat, lng], i) => {
    const p = map.latLngToContainerPoint(L.latLng(lat, lng))
    if (i === 0) ctx.moveTo(p.x, p.y)
    else ctx.lineTo(p.x, p.y)
  })
  ctx.closePath()
}

function drawIntensitySplats(
  ctx: CanvasRenderingContext2D,
  map: L.Map,
  sources: HeatSource[],
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height)
  ctx.globalCompositeOperation = 'source-over'

  for (const src of sources) {
    const pt = map.latLngToContainerPoint(L.latLng(src.lat, src.lng))
    const grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, src.radius)
    const a = Math.min(0.38, src.intensity * 0.34)
    grad.addColorStop(0, `rgba(255,255,255,${a})`)
    grad.addColorStop(0.4, `rgba(255,255,255,${a * 0.45})`)
    grad.addColorStop(0.72, `rgba(255,255,255,${a * 0.12})`)
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, src.radius, 0, Math.PI * 2)
    ctx.fill()
  }
}

function colorizeIntensity(
  intensityCtx: CanvasRenderingContext2D,
  width: number,
  height: number,
): ImageData {
  const raw = intensityCtx.getImageData(0, 0, width, height)
  const out = intensityCtx.createImageData(width, height)
  const src = raw.data
  const dst = out.data

  let maxVal = 0
  for (let i = 0; i < src.length; i += 4) {
    const v = Math.max(src[i], src[i + 1], src[i + 2])
    if (v > maxVal) maxVal = v
  }
  const norm = maxVal > 8 ? 255 / maxVal : 1

  for (let i = 0; i < src.length; i += 4) {
    const rawVal = Math.max(src[i], src[i + 1], src[i + 2]) * norm
    const alpha = rawVal / 255
    if (alpha < 0.025) continue

    const t = Math.min(1, alpha * 0.95)
    const [r, g, b] = getPatrolHeatmapRampRgb(t)
    dst[i] = r
    dst[i + 1] = g
    dst[i + 2] = b
    dst[i + 3] = Math.round(Math.min(210, 50 + t * 155))
  }

  return out
}

function renderHeatCanvas(
  map: L.Map,
  canvas: HTMLCanvasElement,
  sources: HeatSource[],
): void {
  const size = map.getSize()
  if (size.x <= 0 || size.y <= 0) return

  const w = size.x
  const h = size.y
  canvas.width = w
  canvas.height = h
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`

  const intensity = document.createElement('canvas')
  intensity.width = w
  intensity.height = h
  const iCtx = intensity.getContext('2d', { willReadFrequently: true })
  const blurred = document.createElement('canvas')
  blurred.width = w
  blurred.height = h
  const bCtx = blurred.getContext('2d')
  const ctx = canvas.getContext('2d')
  if (!iCtx || !bCtx || !ctx) return

  drawIntensitySplats(iCtx, map, sources, w, h)

  const blurPx = Math.max(10, 8 + map.getZoom() * 0.85)
  bCtx.filter = `blur(${blurPx}px)`
  bCtx.drawImage(intensity, 0, 0)
  bCtx.filter = 'none'

  const colored = colorizeIntensity(bCtx, w, h)

  ctx.clearRect(0, 0, w, h)
  ctx.putImageData(colored, 0, 0)
  ctx.globalCompositeOperation = 'destination-in'
  fillSiteMaskPath(ctx, map)
  ctx.fillStyle = '#fff'
  ctx.fill()
  ctx.globalCompositeOperation = 'source-over'
}

export interface PatrolDensityCanvasLayerProps {
  enabled: boolean
  zones: PatrolZone[]
  layer: PatrolDensityLayer
  countMode: PatrolCountMode
  heatWindow?: HeatmapTimeWindow
}

export function PatrolDensityCanvasLayer({
  enabled,
  zones,
  layer,
  countMode,
  heatWindow = 'shift',
}: PatrolDensityCanvasLayerProps) {
  const map = useMap()
  const [heatTick, setHeatTick] = useState(0)
  const heatWindowMs = heatmapWindowMs(heatWindow)

  useEffect(() => subscribePatrolHeatGrid(() => {
    setHeatTick(t => t + 1)
  }), [])

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
        const c = canvas!.getContext('2d')
        if (c) c.clearRect(0, 0, canvas!.width, canvas!.height)
        return
      }
      const src = buildHeatSources(zones, layer, countMode, map.getZoom(), heatWindowMs)
      if (src.length === 0) {
        const c = canvas!.getContext('2d')
        if (c) c.clearRect(0, 0, canvas!.width, canvas!.height)
        return
      }
      renderHeatCanvas(map, canvas!, src)
    }

    const schedule = () => requestAnimationFrame(draw)
    schedule()
    map.on('move zoom moveend zoomend viewreset resize load', schedule)
    const t1 = window.setTimeout(schedule, 80)
    const t2 = window.setTimeout(schedule, 400)
    const t3 = window.setInterval(schedule, 4_000)

    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearInterval(t3)
      map.off('move zoom moveend zoomend viewreset resize load', schedule)
      const c = canvas?.getContext('2d')
      if (c && canvas) c.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [map, enabled, zones, layer, countMode, heatWindowMs, heatTick])

  return null
}
