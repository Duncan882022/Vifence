/**
 * PatrolGeoHeatmap — Leaflet satellite map with:
 *  • Layer 1: site boundary + zone polygons
 *  • Layer 2: detection dots (clipped to site boundary)
 *  • Layer 3: canvas heatmap — loang màu liên tục, clip trong polygon đỏ
 *  • Layer 4: patrol route + helmet markers
 * HQCV §12–16
 */
import 'leaflet/dist/leaflet.css'
import { CircleMarker, GeoJSON, MapContainer, Marker, Pane, Polygon, Polyline, TileLayer, Tooltip, ZoomControl, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { Feature, FeatureCollection, Polygon as GeoJsonPolygon } from 'geojson'
import { useEffect, useMemo, useRef, useState } from 'react'
import { PATROL_SITE_CLIP_RING, clampPointToSiteInterior, isPointInSiteBoundary } from '../data/patrolSiteGeometry'
import type { PatrolZone } from '../data/patrolMockData'
import {
  PATROL_GPS_ZONES,
  PATROL_MAP_ACTIVE_HELMET_PINS,
  PATROL_SITE_BOUNDARY,
  PATROL_SITE_CENTER,
  PATROL_SITE_FOCUS_BOUNDS,
  PATROL_SITE_MAX_ZOOM,
  PATROL_SITE_MIN_ZOOM,
  getPatrolHelmetZoneName,
  type PatrolHelmetPin,
} from '../data/patrolSiteMap'
import {
  DETECTION_DOT_STYLE,
  type DetectionDot,
} from '../data/patrolDetectionData'
import type { RouteHistory } from '../services/usePatrolWebSocket'
import type { CameraPositions } from '../services/usePatrolWebSocket'
import {
  formatDisplayValue,
  resolveCount,
  type PatrolCountMode,
  type PatrolDensityLayer,
  type PatrolDisplayMode,
} from '../services/patrolHeatmap.service'
import { PatrolDensityCanvasLayer } from './PatrolDensityCanvasLayer'

/* ── ESRI satellite tile ────────────────────────────────────── */
const ESRI_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

/* ── GeoJSON builder ────────────────────────────────────────── */
interface ZoneProperties {
  id: string
  name: string
  shortName: string
  count: number
  maxCount: number
  visited: boolean
  borderColor: string
  tier: 'primary' | 'secondary'
}

function buildFeatureCollection(
  zones: PatrolZone[],
  layer: PatrolDensityLayer,
  countMode: PatrolCountMode,
): FeatureCollection<GeoJsonPolygon, ZoneProperties> {
  const zoneMap = new Map(zones.map(z => [z.id, z]))
  const maxCount = Math.max(
    ...zones.map(z => resolveCount(z, layer, countMode)),
    1,
  )

  return {
    type: 'FeatureCollection',
    features: PATROL_GPS_ZONES.map(gpsZone => {
      const zone = zoneMap.get(gpsZone.zone_id)
      const visited = zone?.coverage === 'VISITED'
      const count = zone ? resolveCount(zone, layer, countMode) : 0

      return {
        type: 'Feature' as const,
        properties: {
          id: gpsZone.zone_id,
          name: gpsZone.name,
          shortName: gpsZone.shortName,
          count,
          maxCount,
          visited,
          borderColor: gpsZone.borderColor,
          tier: gpsZone.tier,
        },
        geometry: {
          type: 'Polygon' as const,
          /* GeoJSON coords = [lng, lat]; polygon = [lat, lng] → swap */
          coordinates: [gpsZone.polygon.map(([lat, lng]) => [lng, lat])],
        },
      }
    }),
  }
}

/* ── Zone polygon styles (layer Khu vực only) ───────────────── */
function zoneTierStyle(feature?: Feature<GeoJsonPolygon, ZoneProperties>) {
  if (!feature) return {}
  const { visited, borderColor, tier } = feature.properties
  return {
    fillColor: visited ? borderColor : '#334155',
    fillOpacity: visited ? 0.18 : 0.07,
    color: visited ? borderColor : '#475569',
    weight: tier === 'primary' ? 2 : 1.5,
    dashArray: '8 5',
    opacity: visited ? 0.92 : 0.5,
  }
}

const PATROL_DIV_ICON_CLASS = 'patrol-map-div-icon'

function divIconOpts(
  html: string,
  iconSize: [number, number],
  iconAnchor: [number, number],
): L.DivIconOptions {
  return {
    html,
    className: PATROL_DIV_ICON_CLASS,
    iconSize,
    iconAnchor,
  }
}

/* ── Zone stat card — collapsed label / expanded stats on click ─ */
function createZoneStatIcon(
  shortName: string,
  borderColor: string,
  visited: boolean,
  peopleCurrent: number,
  vehiclesCurrent: number,
  expanded: boolean,
): L.DivIcon {
  const interactive = 'pointer-events:auto;cursor:pointer;'

  if (!expanded) {
    const html = `
      <div style="
        background:rgba(8,11,18,0.88);
        border:1px solid ${borderColor};
        border-radius:4px;
        padding:2px 6px;
        font-family:system-ui,-apple-system,sans-serif;
        ${interactive}
        box-shadow:0 1px 4px rgba(0,0,0,0.5);
        white-space:nowrap;
      ">
        <div style="color:${borderColor};font-weight:700;font-size:8px;letter-spacing:0.4px;">${shortName}</div>
      </div>`
    return L.divIcon(divIconOpts(html, [44, 18], [22, 9]))
  }

  const html = `
    <div style="
      background:rgba(8,11,18,0.95);
      border:1.5px solid ${borderColor};
      border-radius:6px;
      padding:4px 8px 5px;
      font-family:system-ui,-apple-system,sans-serif;
      ${interactive}
      min-width:72px;
      text-align:left;
      box-shadow:0 2px 10px rgba(0,0,0,0.7);
    ">
      <div style="color:${borderColor};font-weight:700;font-size:9px;letter-spacing:0.6px;margin-bottom:2px;">${shortName}</div>
      ${visited
        ? `<div style="color:#e2e8f0;font-size:10px;line-height:1.35;">👤 ${peopleCurrent} người</div>
           <div style="color:#e2e8f0;font-size:10px;line-height:1.35;">🚛 ${vehiclesCurrent} máy</div>`
        : '<div style="color:#475569;font-size:9px;margin-top:1px;">Chưa đến</div>'
      }
    </div>`
  const h = visited ? 60 : 42
  return L.divIcon(divIconOpts(html, [96, h], [48, h / 2]))
}

/* ── Detection dot — nhỏ; trong FOV nhấp nháy, ngoài FOV mờ ── */
function createDetectionDotIcon(
  inCameraView: boolean,
  verified: boolean,
  type: DetectionDot['type'],
): L.DivIcon {
  const style = DETECTION_DOT_STYLE[type]
  const color = verified && type === 'person' ? '#a78bfa' : style.color
  const size = 7
  const anim = inCameraView ? 'animation:patrol-dot-blink 1.15s ease-in-out infinite;' : ''
  const opacity = inCameraView ? 0.95 : 0.32
  const html = `
    <div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};
      border:1px solid rgba(255,255,255,${inCameraView ? 0.85 : 0.35});
      box-shadow:0 0 ${inCameraView ? 3 : 1}px ${color}${inCameraView ? '99' : '44'};
      opacity:${opacity};
      ${anim}
    "></div>`
  return L.divIcon(divIconOpts(html, [size, size], [size / 2, size / 2]))
}

/* ── Helmet marker icon ─────────────────────────────────────── */
function createHelmetIcon(pin: PatrolHelmetPin, isActive: boolean) {
  const num = String(parseInt(pin.id.replace('HC-', ''), 10))
  const anim = isActive ? 'animation:patrol-helmet-glow 1.6s ease-out infinite;' : ''
  const bg = isActive ? pin.color : '#64748b'
  const border = isActive ? 'rgba(255,255,255,0.85)' : 'rgba(203,213,225,0.75)'
  const html = `
    <div style="
      background:${bg};
      border:1.5px solid ${border};
      border-radius:50%;
      width:16px;height:16px;
      display:flex;align-items:center;justify-content:center;
      font-size:6.5px;font-weight:800;color:#fff;
      font-family:system-ui,sans-serif;
      box-shadow:0 1px 5px rgba(0,0,0,0.55);
      ${anim}
    ">${num}</div>`
  return L.divIcon(divIconOpts(html, [16, 16], [8, 8]))
}

/** Heading cone tip ~18m ahead, ±22° FOV wedge (MD §7.1 layer Mũ). */
function headingConePositions(
  lat: number,
  lng: number,
  headingDeg: number,
  distM = 18,
  halfFovDeg = 22,
): [number, number][] {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dest = (bearing: number): [number, number] => {
    const br = toRad(bearing)
    const dLat = (distM * Math.cos(br)) / 111_320
    const dLng = (distM * Math.sin(br)) / (111_320 * Math.cos(toRad(lat)))
    return [lat + dLat, lng + dLng]
  }
  return [
    [lat, lng],
    dest(headingDeg - halfFovDeg),
    dest(headingDeg + halfFovDeg),
  ]
}

/* ── Fix Leaflet tile grid on mobile (iOS flex height = 0) ──── */
function MapInvalidator() {
  const map = useMap()

  useEffect(() => {
    const invalidate = () => map.invalidateSize({ animate: false, pan: false })
    invalidate()
    const t1 = window.setTimeout(invalidate, 120)
    const t2 = window.setTimeout(invalidate, 600)

    window.addEventListener('resize', invalidate)
    window.addEventListener('orientationchange', invalidate)
    window.visualViewport?.addEventListener('resize', invalidate)
    window.visualViewport?.addEventListener('scroll', invalidate)

    const container = map.getContainer().parentElement
    const observer = container ? new ResizeObserver(invalidate) : null
    if (container && observer) observer.observe(container)

    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.removeEventListener('resize', invalidate)
      window.removeEventListener('orientationchange', invalidate)
      window.visualViewport?.removeEventListener('resize', invalidate)
      window.visualViewport?.removeEventListener('scroll', invalidate)
      observer?.disconnect()
    }
  }, [map])

  return null
}

/** Giới hạn pan/zoom — tắt khi theo GPS live (có thể ngoài công trường mock). */
function MapSiteBoundsConfig({ followLiveGps }: { followLiveGps?: boolean }) {
  const map = useMap()

  useEffect(() => {
    if (followLiveGps) {
      map.setMaxBounds([[-85, -180], [85, 180]])
      map.setMinZoom(3)
      map.setMaxZoom(20)
    } else {
      map.setMaxBounds(L.latLngBounds(PATROL_SITE_FOCUS_BOUNDS))
      map.setMinZoom(PATROL_SITE_MIN_ZOOM)
      map.setMaxZoom(PATROL_SITE_MAX_ZOOM)
    }
    map.dragging.enable()
    map.scrollWheelZoom.enable()
    map.touchZoom.enable()
  }, [map, followLiveGps])

  return null
}

/** Theo dõi GPS HC-02 — fly tới vị trí khi mới có GPS hoặc điểm ngoài viewport. */
function MapFollowLiveGps({
  enabled,
  lat,
  lng,
}: {
  enabled: boolean
  lat: number | null
  lng: number | null
}) {
  const map = useMap()
  const acquiredRef = useRef(false)

  useEffect(() => {
    if (!enabled || lat == null || lng == null) return
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

    const target = L.latLng(lat, lng)
    if (!acquiredRef.current) {
      acquiredRef.current = true
      map.setView(target, Math.max(map.getZoom(), 18), { animate: true })
      return
    }

    if (!map.getBounds().pad(0.15).contains(target)) {
      map.panTo(target, { animate: true })
    }
  }, [map, enabled, lat, lng])

  useEffect(() => {
    if (!enabled) acquiredRef.current = false
  }, [enabled])

  return null
}

const PATROL_SITE_CLIP_ID = 'patrol-site-boundary-clip'

/**
 * SVG clip-path theo polygon đỏ — mọi fill/ stroke trên overlayPane
 * (zone, mật độ, detection) không thể hiển thị ngoài ranh giới.
 */
function MapSiteOverlayClip({ enabled }: { enabled: boolean }) {
  const map = useMap()

  useEffect(() => {
    const overlayPane = map.getPanes().overlayPane

    const clearClip = () => {
      overlayPane.querySelectorAll('svg').forEach(svg => {
        svg.querySelectorAll('g').forEach(g => g.removeAttribute('clip-path'))
        svg.removeAttribute('clip-path')
      })
    }

    if (!enabled) {
      clearClip()
      return undefined
    }

    const applyClip = () => {
      const ring = PATROL_SITE_CLIP_RING
      const d = `M ${ring
        .map(([lat, lng]) => {
          const p = map.latLngToLayerPoint(L.latLng(lat, lng))
          return `${p.x},${p.y}`
        })
        .join(' L ')} Z`

      overlayPane.querySelectorAll('svg').forEach(svg => {
        let defs = svg.querySelector('defs')
        if (!defs) {
          defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
          svg.insertBefore(defs, svg.firstChild)
        }

        let clip = defs.querySelector(`#${PATROL_SITE_CLIP_ID}`) as SVGClipPathElement | null
        if (!clip) {
          clip = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath')
          clip.id = PATROL_SITE_CLIP_ID
          clip.setAttribute('clipPathUnits', 'userSpaceOnUse')
          const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path')
          clip.appendChild(pathEl)
          defs.appendChild(clip)
        }

        const pathEl = clip.querySelector('path')
        pathEl?.setAttribute('d', d)

        const target = svg.querySelector('g.leaflet-zoom-animated') ?? svg.querySelector('g') ?? svg
        target.setAttribute('clip-path', `url(#${PATROL_SITE_CLIP_ID})`)
      })
    }

    const schedule = () => requestAnimationFrame(applyClip)
    map.on('move zoom moveend zoomend viewreset resize load', schedule)
    const t1 = window.setTimeout(schedule, 60)
    const t2 = window.setTimeout(schedule, 350)

    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      map.off('move zoom moveend zoomend viewreset resize load', schedule)
      clearClip()
    }
  }, [map, enabled])

  return null
}

/* ── Responsive map zoom ────────────────────────────────────── */
function usePatrolMapZoom(): number {
  const [zoom, setZoom] = useState(() => {
    if (typeof window === 'undefined') return 17
    return window.innerWidth < 1024 ? 16 : 17
  })

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth
      setZoom(w < 1024 ? 16 : 17)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return Math.min(PATROL_SITE_MAX_ZOOM, Math.max(PATROL_SITE_MIN_ZOOM, zoom))
}

/* ── Component ──────────────────────────────────────────────── */
export interface PatrolGeoHeatmapProps {
  zones: PatrolZone[]
  cameraPositions: CameraPositions
  routeHistory: RouteHistory
  layer: PatrolDensityLayer
  displayMode: PatrolDisplayMode
  countMode: PatrolCountMode
  /* Layer 1 — Polygon */
  showSiteBoundary: boolean
  showZonePolygons: boolean
  /* Layer 2 — Detection dots */
  showDetections: boolean
  /** Live dots (HC-02 GPS) — thay mock PATROL_DETECTION_DOTS khi có. */
  liveDetectionDots?: DetectionDot[]
  /** Theo GPS live: mở bounds + flyTo. */
  followLiveGps?: boolean
  liveGpsLat?: number | null
  liveGpsLng?: number | null
  /* Layer 3 — Density heat blobs + zone stat cards */
  showDensity: boolean
  /* Layer 4 — Patrol route polyline + helmet markers */
  showRoute: boolean
  /** Marker mũ HC-* — luôn hiện kể cả offline (tách khỏi layer route). */
  showHelmetMarkers?: boolean
  showCameras: boolean
  /** Online theo stream live (HC-01 VMS / HC-02 mobile). */
  helmetOnlineById?: Record<string, boolean>
  /** Heading degrees 0–360 per helmet — cone FOV on map. */
  helmetHeadingById?: Record<string, number | null | undefined>
  /** Tổng hợp nhân lực công trường — hiển thị trên tooltip mũ. */
  siteHeadcount?: {
    observed: number
    identified: number
    objects: number
    persons: number
  }
  /** Click Object / detection with objectId → bottom sheet. */
  onDetectionClick?: (dot: DetectionDot) => void
  /** HC-02 luôn hiện marker (off = xám); false = ẩn khi chưa GPS. */
  requireLiveGpsForHc02?: boolean
  hasHc02LiveGps?: boolean
  /** Override zoom — từ usePatrolHeatmapViewport */
  mapZoom?: number
  /** Mobile/tablet — zoom góc trên, safe-area */
  compactControls?: boolean
}

export function PatrolGeoHeatmap({
  zones,
  cameraPositions,
  routeHistory,
  layer,
  displayMode,
  countMode,
  showSiteBoundary,
  showZonePolygons,
  showDetections,
  liveDetectionDots,
  followLiveGps = false,
  liveGpsLat = null,
  liveGpsLng = null,
  showDensity,
  showRoute,
  showHelmetMarkers = true,
  showCameras,
  helmetOnlineById,
  helmetHeadingById,
  siteHeadcount,
  onDetectionClick,
  requireLiveGpsForHc02 = false,
  hasHc02LiveGps = false,
  mapZoom: mapZoomProp,
  compactControls = false,
}: PatrolGeoHeatmapProps) {
  const [expandedZoneId, setExpandedZoneId] = useState<string | null>(null)

  useEffect(() => {
    if (!showDensity) setExpandedZoneId(null)
  }, [showDensity])

  const toggleZoneExpand = (zoneId: string) => {
    setExpandedZoneId(prev => (prev === zoneId ? null : zoneId))
  }

  const featureCollection = useMemo(
    () => buildFeatureCollection(zones, layer, countMode),
    [zones, layer, countMode],
  )

  /* Key forces GeoJSON remount when live counts change */
  const geoJsonKey = useMemo(() => {
    const hash = zones.map(z => `${z.peopleCurrent}:${z.vehiclesCurrent}`).join('|')
    return `${layer}_${countMode}_${displayMode}_${hash}`
  }, [zones, layer, countMode, displayMode])

  const zoneMap = useMemo(() => new Map(zones.map(z => [z.id, z])), [zones])
  const visibleDetectionDots = useMemo(() => {
    const raw = liveDetectionDots && liveDetectionDots.length > 0
      ? liveDetectionDots
      : []
    return raw
      .map(dot => {
        const [lat, lng] = clampPointToSiteInterior(dot.position[0], dot.position[1])
        return { ...dot, position: [lat, lng] as [number, number] }
      })
      .filter(dot => isPointInSiteBoundary(dot.position[0], dot.position[1]))
  }, [liveDetectionDots])
  const mapZoomFallback = usePatrolMapZoom()
  const mapZoom = mapZoomProp ?? mapZoomFallback
  const clipOverlays = !followLiveGps && showDetections
  const zoomControlPosition = compactControls ? 'topleft' as const : 'bottomright' as const

  return (
    <div className="relative w-full h-full min-h-[200px] overflow-hidden isolate max-lg:min-h-[220px] supports-[height:100dvh]:min-h-[min(220px,38dvh)]">
      <style>{`
        @keyframes patrol-dot-blink {
          0%,100%{opacity:0.95;transform:scale(1)}
          50%{opacity:0.35;transform:scale(1.35)}
        }
        @keyframes patrol-pulse {
          0%,100%{opacity:1;transform:scale(1)}
          50%{opacity:.35;transform:scale(1.7)}
        }
        @keyframes patrol-helmet-glow {
          0%,100%{ box-shadow:0 1px 5px rgba(0,0,0,0.55),0 0 0 0px rgba(255,255,255,0.55); }
          55%    { box-shadow:0 1px 5px rgba(0,0,0,0.55),0 0 0 6px rgba(255,255,255,0); }
        }
        .leaflet-marker-icon { transition: transform 260ms linear !important; }
        .leaflet-container { background:#080b12 !important; touch-action: manipulation; }
        .${PATROL_DIV_ICON_CLASS} {
          background: transparent !important;
          border: none !important;
          overflow: visible !important;
        }
        .leaflet-control-zoom a {
          background:#111827 !important;
          color:#e2e8f0 !important;
          border-color:#334155 !important;
          ${compactControls ? 'width:34px !important;height:34px !important;line-height:34px !important;font-size:18px !important;' : ''}
        }
        .leaflet-top.leaflet-left {
          top: max(8px, env(safe-area-inset-top, 0px));
          left: max(8px, env(safe-area-inset-left, 0px));
        }
        .leaflet-bottom.leaflet-right {
          bottom: max(8px, env(safe-area-inset-bottom, 0px));
          right: max(8px, env(safe-area-inset-right, 0px));
        }
        .leaflet-bottom.leaflet-left {
          bottom: max(8px, env(safe-area-inset-bottom, 0px));
          left: max(8px, env(safe-area-inset-left, 0px));
        }
        .leaflet-control-attribution {
          display:none !important;
        }
        .patrol-zone-tip {
          background:#0a0e15 !important;
          border:1px solid #334155 !important;
          color:#e2e8f0 !important;
          font-size:10px !important;
          padding:3px 7px !important;
        }
        .patrol-zone-tip::before { display:none; }
      `}</style>

      <div className="absolute inset-0">
        <MapContainer
          center={PATROL_SITE_CENTER}
          zoom={mapZoom}
          minZoom={PATROL_SITE_MIN_ZOOM}
          maxZoom={PATROL_SITE_MAX_ZOOM}
          maxBounds={followLiveGps ? undefined : PATROL_SITE_FOCUS_BOUNDS}
          maxBoundsViscosity={followLiveGps ? 0 : 1.0}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          attributionControl={false}
        >
          <MapInvalidator />
          <MapSiteBoundsConfig followLiveGps={followLiveGps} />
          <MapFollowLiveGps enabled={followLiveGps} lat={liveGpsLat} lng={liveGpsLng} />
          <MapSiteOverlayClip enabled={clipOverlays} />
          <PatrolDensityCanvasLayer
            enabled={showDensity}
            zones={zones}
            layer={layer}
            countMode={countMode}
          />
          <TileLayer
            url={ESRI_TILE_URL}
            attribution=""
            maxNativeZoom={19}
            maxZoom={PATROL_SITE_MAX_ZOOM}
            crossOrigin=""
            keepBuffer={4}
          />
          <ZoomControl position={zoomControlPosition} />

          {/* ── LAYER 1A: Site Boundary (pane riêng — không bị SVG clip) ── */}
          {showSiteBoundary && (
            <Pane name="patrol-site-boundary" style={{ zIndex: 450 }}>
              <Polygon
                positions={PATROL_SITE_BOUNDARY}
                pathOptions={{
                  color: '#ef4444',
                  weight: 3,
                  dashArray: '10 6',
                  opacity: 0.95,
                  fillColor: '#ef4444',
                  fillOpacity: 0.07,
                }}
              />
            </Pane>
          )}

          {/* ── LAYER 1B: Zone polygons (viền khu — tách khỏi mật độ) ── */}
          {showZonePolygons && (
            <GeoJSON
              key={geoJsonKey}
              data={featureCollection}
              style={zoneTierStyle as Parameters<typeof GeoJSON>[0]['style']}
              onEachFeature={(feature, lyr) => {
                const props = feature.properties as ZoneProperties
                lyr.bindTooltip(props.name, {
                  permanent: false,
                  sticky: true,
                  className: 'patrol-zone-tip',
                })
              }}
            />
          )}

          {/* ── LAYER 2: Detection / Object Dots — nhỏ, FOV blink ── */}
          {showDetections && visibleDetectionDots.map(dot => {
            const inView = dot.inCameraView ?? false
            if (dot.type === 'person') {
              return (
                <Marker
                  key={dot.id}
                  position={dot.position}
                  icon={createDetectionDotIcon(inView, Boolean(dot.verified), dot.type)}
                  zIndexOffset={inView ? 420 : 380}
                  eventHandlers={
                    onDetectionClick && (dot.objectId || dot.type === 'person')
                      ? { click: () => onDetectionClick(dot) }
                      : undefined
                  }
                >
                  <Tooltip sticky className="patrol-zone-tip">
                    <span style={{ fontSize: 10 }}>
                      {dot.label ? dot.label : 'Người'}<br />
                      Camera: {dot.cameraId}
                      {dot.objectId ? ` · ${dot.objectId}` : ''}
                      <br />
                      {inView ? 'Đang trong FOV' : 'Ngoài FOV / lịch sử'}
                    </span>
                  </Tooltip>
                </Marker>
              )
            }
            const style = DETECTION_DOT_STYLE[dot.type]
            const fillOp = dot.opacity ?? (inView ? 0.85 : 0.3)
            return (
              <CircleMarker
                key={dot.id}
                center={dot.position}
                radius={style.radius}
                pathOptions={{
                  color: style.color,
                  fillColor: style.color,
                  fillOpacity: fillOp,
                  weight: style.weight,
                  opacity: fillOp,
                }}
                eventHandlers={
                  onDetectionClick
                    ? { click: () => onDetectionClick(dot) }
                    : undefined
                }
              >
                <Tooltip sticky className="patrol-zone-tip">
                  <span style={{ fontSize: 10 }}>
                    {dot.type === 'vehicle' ? '🚛 Máy' : '🔧 Thiết bị'}<br />
                    Camera: {dot.cameraId}
                  </span>
                </Tooltip>
              </CircleMarker>
            )
          })}

          {/* ── LAYER 3B: Zone labels — tap to expand stats ─────── */}
          {showDensity && PATROL_GPS_ZONES.map(gpsZone => {
            const zone = zoneMap.get(gpsZone.zone_id)
            const visited = zone?.coverage === 'VISITED'
            const expanded = expandedZoneId === gpsZone.zone_id
            const displayVal = zone ? formatDisplayValue(zone, layer, countMode, displayMode) : '—'
            return (
              <Marker
                key={`stat-${gpsZone.zone_id}-${expanded ? 'open' : 'closed'}-${displayVal}`}
                position={gpsZone.center}
                icon={createZoneStatIcon(
                  gpsZone.shortName,
                  gpsZone.borderColor,
                  visited,
                  zone?.peopleCurrent ?? 0,
                  zone?.vehiclesCurrent ?? 0,
                  expanded,
                )}
                zIndexOffset={expanded ? 400 : 300}
                eventHandlers={{
                  click: () => toggleZoneExpand(gpsZone.zone_id),
                }}
              />
            )
          })}

          {/* ── LAYER 4A: Patrol Route (accumulated history) ─── */}
          {showRoute && PATROL_MAP_ACTIVE_HELMET_PINS.map(pin => {
            const hist = routeHistory[pin.id]
            if (!hist?.length) return null
            if (pin.id === 'HC-02' && requireLiveGpsForHc02 && !hasHc02LiveGps) return null
            return (
              <Polyline
                key={`route-hist-${pin.id}`}
                positions={hist}
                color={pin.color}
                weight={2}
                opacity={0.75}
              />
            )
          })}

          {/* ── LAYER 4B: Helmet Markers — HC-01/02 luôn hiện (offline = xám) ─── */}
          {(showHelmetMarkers || showCameras) && PATROL_MAP_ACTIVE_HELMET_PINS.map(pin => {
            const fallback = pin.position
            const rawPos = cameraPositions[pin.id] ?? fallback
            const livePos = clampPointToSiteInterior(rawPos[0], rawPos[1])
            const zoneName = getPatrolHelmetZoneName(pin.id)
            const isActive = Boolean(helmetOnlineById?.[pin.id])
            const heading = helmetHeadingById?.[pin.id]
            const markerOpacity = isActive ? 1 : 0.88
            return (
              <>
                {heading != null && Number.isFinite(heading) && isActive && (
                  <Polygon
                    key={`cone-${pin.id}`}
                    positions={headingConePositions(livePos[0], livePos[1], heading)}
                    pathOptions={{
                      color: pin.color,
                      weight: 1,
                      opacity: 0.55,
                      fillColor: pin.color,
                      fillOpacity: 0.18,
                    }}
                  />
                )}
                <Marker
                  key={`${pin.id}-${isActive ? 'on' : 'off'}`}
                  position={livePos}
                  icon={createHelmetIcon(pin, isActive)}
                  zIndexOffset={500}
                  opacity={markerOpacity}
                >
                  <Tooltip direction="top" offset={[0, -14]} opacity={0.95}>
                    <span style={{ fontSize: 10, fontFamily: 'system-ui, sans-serif' }}>
                      <strong>{pin.label}</strong>
                      {' · '}
                      <span style={{ color: isActive ? '#4ade80' : '#94a3b8' }}>
                        {isActive ? 'ONLINE' : 'OFFLINE'}
                      </span>
                      {heading != null && Number.isFinite(heading) && (
                        <>
                          <br />
                          Heading: {Math.round(heading)}°
                        </>
                      )}
                      <br />
                      Phụ trách: {zoneName}
                      {siteHeadcount && (
                        <>
                          <br />
                          <span style={{ color: '#94a3b8' }}>
                            Công trường: {siteHeadcount.observed} quan sát
                            {' · '}{siteHeadcount.identified} định danh
                          </span>
                          <br />
                          <span style={{ color: '#64748b', fontSize: 9 }}>
                            Đối tượng {siteHeadcount.objects}
                            {' · '}Người {siteHeadcount.persons}
                            {' · '}Định danh {siteHeadcount.identified}
                          </span>
                        </>
                      )}
                    </span>
                  </Tooltip>
                </Marker>
              </>
            )
          })}
        </MapContainer>
      </div>
    </div>
  )
}
