/**
 * PatrolGeoHeatmap — Leaflet satellite map with:
 *  • Layer 1: site boundary + zone polygons
 *  • Layer 2: detection dots (clipped to site boundary)
 *  • Layer 3: canvas heatmap — loang màu liên tục, clip trong polygon đỏ
 *  • Layer 4: patrol route + helmet markers
 * HQCV §12–16
 */
import 'leaflet/dist/leaflet.css'
import { CircleMarker, GeoJSON, MapContainer, Marker, Pane, Polygon, Polyline, TileLayer, Tooltip, ZoomControl, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import type { Feature, FeatureCollection, Polygon as GeoJsonPolygon } from 'geojson'
import { useEffect, useMemo, useRef, useState } from 'react'
import { PATROL_SITE_CLIP_RING, clampPointToSiteInterior, isPointInSiteBoundary } from '../data/patrolSiteGeometry'
import type { PatrolZone } from '../data/patrolTypes'
import {
  PATROL_GPS_ZONES,
  PATROL_MAP_ACTIVE_DRONE_PINS,
  PATROL_MAP_ACTIVE_HELMET_PINS,
  PATROL_SITE_BOUNDARY,
  PATROL_SITE_CENTER,
  PATROL_SITE_DEFAULT_ZOOM,
  PATROL_SITE_FOCUS_BOUNDS,
  PATROL_SITE_MAX_ZOOM,
  PATROL_SITE_MIN_ZOOM,
  PATROL_ZONE_DIVIDER_LINES,
  getPatrolHelmetZoneName,
  getPatrolMapDeviceBadgeNum,
} from '../data/patrolSiteMap'
import {
  DETECTION_DOT_OPACITY_OUT_OF_VIEW,
  DETECTION_DOT_STYLE,
  type DetectionDot,
} from '../data/patrolDetectionData'
import {
  PATROL_HEATMAP_DOT_HEX,
  resolveDetectionDotTier,
} from '../utils/patrolDetectionDotUi'
import { patrolTierToken } from '../utils/patrolTierTokens'
import type { PatrolFlightMode } from '../utils/patrolFlightMode'
import { patrolDroneMapAccent } from '../data/patrolDrones'
import type { CameraPositions, RouteHistory } from '../hooks/usePatrolLiveMapState'
import {
  formatDisplayValue,
  resolveCount,
  type PatrolCountMode,
  type PatrolDensityLayer,
  type PatrolDisplayMode,
} from '../services/patrolHeatmap.service'
import { PatrolDensityCanvasLayer } from './PatrolDensityCanvasLayer'
import {
  createPatrolDroneMapIcon,
  createPatrolHelmetMapIcon,
  PATROL_MAP_DEVICE_PIN_STYLES,
} from '../utils/patrolMapDeviceIcons'

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
    fillColor: borderColor,
    fillOpacity: visited ? 0.18 : 0.12,
    color: borderColor,
    weight: tier === 'primary' ? 2.5 : 2,
    opacity: visited ? 0.95 : 0.82,
  }
}

/** Fill rất nhạt theo màu khu khi được chọn — viền giữ màu zone. */
function zoneInteractiveStyle(
  feature?: Feature<GeoJsonPolygon, ZoneProperties>,
  selectedZoneId?: string | null,
  hoveredZoneId?: string | null,
) {
  if (!feature) return {}
  const { visited, borderColor, tier, id: zoneId } = feature.properties
  const selected = zoneId === selectedZoneId
  const hovered = zoneId === hoveredZoneId && !selected

  return {
    fillColor: borderColor,
    fillOpacity: selected ? 0.14 : hovered ? 0.09 : (visited ? 0.08 : 0.05),
    color: borderColor,
    weight: selected ? 2.5 : (tier === 'primary' ? 2.5 : 2),
    opacity: selected ? 0.98 : 0.85,
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

/* ── Detection dot — tier color; active (FOV) nhấp nháy opacity nhẹ ── */
function createDetectionDotIcon(
  inCameraView: boolean,
  tier: ReturnType<typeof resolveDetectionDotTier>,
  colorOverride?: string,
): L.DivIcon {
  const color = colorOverride ?? PATROL_HEATMAP_DOT_HEX[tier]
  const size = 7
  const innerClass = inCameraView ? 'patrol-dot-live-inner' : 'patrol-dot-hist-inner'
  const html = `
    <div
      class="${innerClass}"
      style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:none;"
    ></div>`
  // Leaflet cache divIcon theo className — mỗi tier/view phải class riêng.
  return L.divIcon({
    html,
    className: `${PATROL_DIV_ICON_CLASS} patrol-dot-${tier}-${inCameraView ? 'live' : 'hist'}`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

type PatrolMapDeviceKind = 'helmet' | 'drone'

interface PatrolMapDevicePin {
  id: string
  label: string
  color: string
  position: [number, number]
  kind: PatrolMapDeviceKind
}

function createPatrolMapDeviceIcon(
  kind: PatrolMapDeviceKind,
  badgeNum: string,
  isActive: boolean,
  accent: string,
): L.DivIcon {
  return kind === 'drone'
    ? createPatrolDroneMapIcon(badgeNum, isActive, accent)
    : createPatrolHelmetMapIcon(badgeNum, isActive, accent)
}

type PatrolDeviceDetectCounts = { person: number; identity: number; total: number }

function PatrolDeviceTooltipBody({
  label,
  isActive,
  zoneName,
  detect,
  heading,
  aerial,
}: {
  label: string
  isActive: boolean
  zoneName: string
  detect?: PatrolDeviceDetectCounts
  heading?: number | null
  aerial?: boolean
}) {
  return (
    <span style={{ fontSize: 10, fontFamily: 'system-ui, sans-serif' }}>
      <strong>{label}</strong>
      {' · '}
      <span style={{ color: isActive ? '#4ade80' : '#94a3b8' }}>
        {isActive ? 'ONLINE' : 'OFFLINE'}
      </span>
      {heading != null && Number.isFinite(heading) && (
        <>
          <br />
          Hướng: {Math.round(heading)}°
        </>
      )}
      <br />
      Phụ trách: {zoneName}
      {detect != null && (
        <>
          <br />
          <span style={{ color: '#38bdf8' }}>
            {aerial
              ? `Detect: ${detect.total} người (góc trên cao)`
              : `Detect: ${detect.total} người`}
          </span>
          <br />
          <span style={{ color: '#64748b', fontSize: 9 }}>
            {detect.person} nhân sự · {detect.identity} định danh
          </span>
        </>
      )}
    </span>
  )
}

function DismissDeviceTooltipOnMapClick({
  openId,
  onDismiss,
  onBackgroundClick,
}: {
  openId: string | null
  onDismiss: () => void
  onBackgroundClick?: () => void
}) {
  useMapEvents({
    click: () => {
      if (openId) onDismiss()
      onBackgroundClick?.()
    },
  })
  return null
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
    if (typeof window === 'undefined') return PATROL_SITE_DEFAULT_ZOOM
    return window.innerWidth < 1024
      ? PATROL_SITE_DEFAULT_ZOOM - 1
      : PATROL_SITE_DEFAULT_ZOOM
  })

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth
      setZoom(w < 1024 ? PATROL_SITE_DEFAULT_ZOOM - 1 : PATROL_SITE_DEFAULT_ZOOM)
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
  /** 6 đường nét đứt chia 7 khu bên trong viền dự án. */
  showZoneDividers?: boolean
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
  /** Nhãn thống kê khu vực trên map — gắn layer Khu vực. */
  showZoneStatLabels?: boolean
  /* Layer 4 — Patrol route (mũ) + markers */
  showRoute: boolean
  /** Marker mũ HC-* — luôn hiện kể cả offline (tách khỏi layer route). */
  showHelmetMarkers?: boolean
  /** Marker flycam DR-* — tách khỏi mũ. */
  showDroneMarkers?: boolean
  showCameras: boolean
  /** Online theo stream live (HC-01 VMS / HC-02 mobile). */
  helmetOnlineById?: Record<string, boolean>
  /** Heading degrees 0–360 per helmet — cone FOV on map. */
  helmetHeadingById?: Record<string, number | null | undefined>
  helmetDetectCountsById?: Record<string, PatrolDeviceDetectCounts>
  /** Click Object / detection with objectId → bottom sheet. */
  onDetectionClick?: (dot: DetectionDot) => void
  /** HC-02 luôn hiện marker (off = xám); false = ẩn khi chưa GPS. */
  requireLiveGpsForHc02?: boolean
  hasHc02LiveGps?: boolean
  /** Override zoom — từ usePatrolHeatmapViewport */
  mapZoom?: number
  /** Mobile/tablet — zoom góc trên, safe-area */
  compactControls?: boolean
  /** Flymap — một màu chấm (không phân tier). */
  uniformDotColor?: string
  /** Tooltip chấm rút gọn — không hiện loại định danh. */
  simpleDotTooltip?: boolean
  /** Thiết bị vẽ polyline GPS — mặc định chỉ mũ HC-*. */
  routeDeviceIds?: string[]
  /** Chế độ bay flycam — accent pin/route tầm cao sky. */
  flightModeByCamera?: Record<string, PatrolFlightMode>
  /** Click chọn khu — fill nhạt + stats overlay theo khu. */
  interactiveZones?: boolean
  selectedZoneId?: string | null
  onZoneSelect?: (zoneId: string | null) => void
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
  showZoneDividers = false,
  showDetections,
  liveDetectionDots,
  followLiveGps = false,
  liveGpsLat = null,
  liveGpsLng = null,
  showDensity,
  showZoneStatLabels,
  showRoute,
  showHelmetMarkers = true,
  showDroneMarkers = false,
  showCameras,
  helmetOnlineById,
  helmetHeadingById,
  helmetDetectCountsById,
  onDetectionClick,
  requireLiveGpsForHc02 = false,
  hasHc02LiveGps = false,
  mapZoom: mapZoomProp,
  compactControls = false,
  uniformDotColor,
  simpleDotTooltip = false,
  routeDeviceIds,
  flightModeByCamera,
  interactiveZones = false,
  selectedZoneId = null,
  onZoneSelect,
}: PatrolGeoHeatmapProps) {
  const [expandedZoneId, setExpandedZoneId] = useState<string | null>(null)
  const [openHelmetTipId, setOpenHelmetTipId] = useState<string | null>(null)
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null)
  const geoJsonRef = useRef<L.GeoJSON | null>(null)

  const zoneStatLabelsVisible = showZoneStatLabels ?? showDensity
  const zonePolygonsVisible = showZonePolygons || interactiveZones

  useEffect(() => {
    if (!zoneStatLabelsVisible) setExpandedZoneId(null)
  }, [zoneStatLabelsVisible])

  useEffect(() => {
    if (!interactiveZones) setHoveredZoneId(null)
  }, [interactiveZones])

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

  useEffect(() => {
    if (!geoJsonRef.current || !interactiveZones) return
    geoJsonRef.current.eachLayer(layer => {
      const path = layer as L.Path & { feature?: Feature<GeoJsonPolygon, ZoneProperties> }
      if (!path.feature) return
      path.setStyle(zoneInteractiveStyle(path.feature, selectedZoneId, hoveredZoneId))
    })
  }, [interactiveZones, selectedZoneId, hoveredZoneId, geoJsonKey])

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

  /** Offline vẽ trước, online vẽ sau + z-index cao hơn — mũ online luôn nằm trên. */
  const sortedHelmetPins = useMemo(() => {
    return [...PATROL_MAP_ACTIVE_HELMET_PINS].sort((a, b) => {
      const aOnline = Boolean(helmetOnlineById?.[a.id])
      const bOnline = Boolean(helmetOnlineById?.[b.id])
      if (aOnline === bOnline) return a.id.localeCompare(b.id)
      return aOnline ? 1 : -1
    })
  }, [helmetOnlineById])

  const sortedDronePins = useMemo(() => {
    return [...PATROL_MAP_ACTIVE_DRONE_PINS].sort((a, b) => {
      const aOnline = Boolean(helmetOnlineById?.[a.id])
      const bOnline = Boolean(helmetOnlineById?.[b.id])
      if (aOnline === bOnline) return a.id.localeCompare(b.id)
      return aOnline ? 1 : -1
    })
  }, [helmetOnlineById])

  const routePins = useMemo(() => {
    const ids = routeDeviceIds ?? PATROL_MAP_ACTIVE_HELMET_PINS.map(p => p.id)
    return ids.flatMap(id => {
      const helmet = PATROL_MAP_ACTIVE_HELMET_PINS.find(p => p.id === id)
      if (helmet) return [helmet]
      const drone = PATROL_MAP_ACTIVE_DRONE_PINS.find(p => p.id === id)
      return drone ? [drone] : []
    })
  }, [routeDeviceIds])

  const visibleDevicePins = useMemo((): PatrolMapDevicePin[] => {
    const pins: PatrolMapDevicePin[] = []
    if (showHelmetMarkers || showCameras) {
      for (const pin of sortedHelmetPins) {
        pins.push({ ...pin, kind: 'helmet' })
      }
    }
    if (showDroneMarkers || showCameras) {
      for (const pin of sortedDronePins) {
        pins.push({ ...pin, kind: 'drone' })
      }
    }
    return pins.sort((a, b) => {
      const aOnline = Boolean(helmetOnlineById?.[a.id])
      const bOnline = Boolean(helmetOnlineById?.[b.id])
      if (aOnline === bOnline) return a.id.localeCompare(b.id)
      return aOnline ? 1 : -1
    })
  }, [showHelmetMarkers, showDroneMarkers, showCameras, sortedHelmetPins, sortedDronePins, helmetOnlineById])
  const mapZoomFallback = usePatrolMapZoom()
  const mapZoom = mapZoomProp ?? mapZoomFallback
  const clipOverlays = !followLiveGps && showDetections
  const zoomControlPosition = compactControls ? 'topleft' as const : 'bottomright' as const

  return (
    <div className="relative w-full h-full min-h-[200px] overflow-hidden isolate max-lg:min-h-[220px] supports-[height:100dvh]:min-h-[min(220px,38dvh)]">
      <style>{`
        @keyframes patrol-map-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .patrol-dot-live-inner {
          animation: patrol-map-blink 1.75s ease-in-out infinite;
        }
        .patrol-dot-hist-inner {
          opacity: ${DETECTION_DOT_OPACITY_OUT_OF_VIEW};
        }
        /* Chỉ nhấp nháy silhouette SVG — không animate khung div vuông Leaflet. */
        .patrol-device-live svg {
          animation: patrol-map-blink 1.75s ease-in-out infinite;
        }
        .patrol-device-marker {
          background: transparent !important;
          line-height: 0;
        }
        ${PATROL_MAP_DEVICE_PIN_STYLES}
        .leaflet-marker-icon { transition: transform 260ms linear !important; }
        .leaflet-container { background:#080b12 !important; touch-action: manipulation; }
        .${PATROL_DIV_ICON_CLASS}, .patrol-device-map-icon {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          overflow: visible !important;
          pointer-events: auto !important;
          cursor: pointer !important;
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
        .patrol-zone-interactive path.leaflet-interactive {
          cursor: pointer !important;
        }
        .leaflet-patrol-site-boundary-pane { z-index: 450 !important; }
        .leaflet-patrol-zone-dividers-pane { z-index: 451 !important; }
        .leaflet-patrol-zone-hit-pane { z-index: 455 !important; }
        .leaflet-patrol-site-boundary-stroke-pane { z-index: 456 !important; }
        .leaflet-marker-pane { z-index: 620 !important; }
        .leaflet-tooltip-pane { z-index: 680 !important; }
        .leaflet-popup-pane { z-index: 700 !important; }
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
          <DismissDeviceTooltipOnMapClick
            openId={openHelmetTipId}
            onDismiss={() => setOpenHelmetTipId(null)}
            onBackgroundClick={
              interactiveZones && onZoneSelect
                ? () => onZoneSelect(null)
                : undefined
            }
          />
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
                  opacity: 0.98,
                  fillColor: '#ef4444',
                  fillOpacity: 0.06,
                  interactive: !interactiveZones,
                }}
              />
            </Pane>
          )}

          {showSiteBoundary && interactiveZones && onZoneSelect && (
            <Pane name="patrol-site-boundary-stroke" style={{ zIndex: 456 }}>
              <Polyline
                positions={PATROL_SITE_BOUNDARY}
                pathOptions={{
                  color: '#ef4444',
                  weight: 14,
                  opacity: 0.001,
                  interactive: true,
                }}
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stopPropagation(e)
                    onZoneSelect(null)
                  },
                }}
              />
            </Pane>
          )}

          {/* ── LAYER 1B: Zone dividers — nét đứt chia 7 khu ── */}
          {showZoneDividers && (
            <Pane name="patrol-zone-dividers" style={{ zIndex: 451 }}>
              {PATROL_ZONE_DIVIDER_LINES.map((line, idx) => (
                <Polyline
                  key={`zone-div-${idx}`}
                  positions={line}
                  pathOptions={{
                    color: '#f87171',
                    weight: 2,
                    opacity: 0.88,
                    dashArray: '7 6',
                    interactive: !interactiveZones,
                  }}
                />
              ))}
            </Pane>
          )}

          {/* ── LAYER 1C: Zone polygons (fill KPI — tùy chọn) ── */}
          {zonePolygonsVisible && (
            <Pane name="patrol-zone-hit" style={{ zIndex: 455 }}>
              <GeoJSON
                ref={geoJsonRef}
                key={geoJsonKey}
                data={featureCollection}
                pathOptions={interactiveZones ? { className: 'patrol-zone-interactive' } : undefined}
                style={
                  (interactiveZones
                    ? (feature) => zoneInteractiveStyle(
                      feature as Feature<GeoJsonPolygon, ZoneProperties>,
                      selectedZoneId,
                      hoveredZoneId,
                    )
                    : zoneTierStyle) as Parameters<typeof GeoJSON>[0]['style']
                }
                onEachFeature={(feature, lyr) => {
                  const zoneFeature = feature as Feature<GeoJsonPolygon, ZoneProperties>
                  const props = zoneFeature.properties
                  if (interactiveZones && onZoneSelect) {
                    ;(lyr as L.Path).options.interactive = true
                    lyr.on({
                      mouseover: (e) => {
                        setHoveredZoneId(props.id)
                        const layer = e.target as L.Path
                        layer.setStyle(zoneInteractiveStyle(zoneFeature, selectedZoneId, props.id))
                        layer.bringToFront()
                      },
                      mouseout: (e) => {
                        setHoveredZoneId(null)
                        const layer = e.target as L.Path
                        layer.setStyle(zoneInteractiveStyle(zoneFeature, selectedZoneId, null))
                      },
                      click: (e) => {
                        L.DomEvent.stopPropagation(e)
                        onZoneSelect(props.id)
                      },
                    })
                    return
                  }
                  lyr.bindTooltip(props.name, {
                    permanent: false,
                    sticky: true,
                    className: 'patrol-zone-tip',
                  })
                }}
              />
            </Pane>
          )}

          {/* ── LAYER 2: Detection / Object Dots — nhỏ, FOV blink ── */}
          {showDetections && visibleDetectionDots.map(dot => {
            const inView = dot.inCameraView ?? false
            const dotTier = resolveDetectionDotTier(dot)
            const tierLabel = patrolTierToken(dotTier).label
            const dotColor = uniformDotColor
            const dotZ = !showHelmetMarkers && !showDroneMarkers && !showCameras
              ? (inView ? 820 : 780)
              : (inView ? 420 : 380)
            if (dot.type === 'person') {
              return (
                <Marker
                  key={dot.id}
                  position={dot.position}
                  icon={createDetectionDotIcon(inView, dotTier, dotColor)}
                  zIndexOffset={dotZ}
                  eventHandlers={
                    !simpleDotTooltip && onDetectionClick && (dot.objectId || dot.type === 'person')
                      ? { click: () => onDetectionClick(dot) }
                      : undefined
                  }
                >
                  <Tooltip sticky className="patrol-zone-tip">
                    <span style={{ fontSize: 10 }}>
                      {simpleDotTooltip ? (
                        <>
                          {dot.cameraId}
                          <br />
                          {inView ? 'Trong FOV drone' : 'Lịch sử'}
                        </>
                      ) : (
                        <>
                          {`${tierLabel}${dot.label ? ` · ${dot.label}` : ''}`}
                          <br />
                          Camera: {dot.cameraId}
                          {dot.objectId ? ` · ${dot.objectId}` : ''}
                          <br />
                          {inView ? 'Đang trong FOV' : 'Ngoài FOV / lịch sử'}
                        </>
                      )}
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
          {zoneStatLabelsVisible && PATROL_GPS_ZONES.map(gpsZone => {
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
                zIndexOffset={expanded ? 900 : 300}
                eventHandlers={{
                  click: () => toggleZoneExpand(gpsZone.zone_id),
                }}
              />
            )
          })}

          {/* ── LAYER 4A: Patrol Route (accumulated history) ─── */}
          {showRoute && routePins.map(pin => {
            const hist = routeHistory[pin.id]
            if (!hist?.length) return null
            if (pin.id === 'HC-02' && requireLiveGpsForHc02 && !hasHc02LiveGps) return null
            const isActive = Boolean(helmetOnlineById?.[pin.id])
            const routeColor = patrolDroneMapAccent(
              pin.id,
              isActive,
              flightModeByCamera?.[pin.id],
              pin.color,
            )
            return (
              <Polyline
                key={`route-hist-${pin.id}`}
                positions={hist}
                color={routeColor}
                weight={2}
                opacity={0.75}
              />
            )
          })}

          {/* ── LAYER 4B: Thiết bị — mũ + flycam, tooltip thống nhất ─── */}
          {visibleDevicePins.map(pin => {
            const fallback = pin.position
            const rawPos = cameraPositions[pin.id] ?? fallback
            const livePos = clampPointToSiteInterior(rawPos[0], rawPos[1])
            const zoneName = getPatrolHelmetZoneName(pin.id)
            const isActive = Boolean(helmetOnlineById?.[pin.id])
            const heading = helmetHeadingById?.[pin.id]
            const markerOpacity = isActive ? 1 : 0.88
            const detect = helmetDetectCountsById?.[pin.id]
            const tipOpen = openHelmetTipId === pin.id
            const pinAccent = patrolDroneMapAccent(
              pin.id,
              isActive,
              flightModeByCamera?.[pin.id],
              pin.color,
            )
            const zBase = pin.kind === 'drone' ? 720 : 700
            const zIdle = pin.kind === 'drone' ? 420 : 400
            return (
              <Marker
                key={`${pin.kind}-${pin.id}-${isActive ? 'on' : 'off'}`}
                position={livePos}
                icon={createPatrolMapDeviceIcon(
                  pin.kind,
                  getPatrolMapDeviceBadgeNum(pin.id),
                  isActive,
                  pinAccent,
                )}
                zIndexOffset={isActive ? zBase : zIdle}
                opacity={markerOpacity}
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stopPropagation(e)
                    setOpenHelmetTipId(prev => (prev === pin.id ? null : pin.id))
                  },
                }}
              >
                {tipOpen && (
                  <Tooltip
                    permanent
                    direction="top"
                    offset={[0, -20]}
                    opacity={0.95}
                    className="patrol-zone-tip"
                  >
                    <PatrolDeviceTooltipBody
                      label={pin.label}
                      isActive={isActive}
                      zoneName={zoneName}
                      detect={detect}
                      heading={pin.kind === 'helmet' ? heading : undefined}
                      aerial={pin.kind === 'drone'}
                    />
                  </Tooltip>
                )}
              </Marker>
            )
          })}
        </MapContainer>
      </div>
    </div>
  )
}
