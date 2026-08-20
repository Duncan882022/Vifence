/**
 * PatrolGeoHeatmap — Leaflet satellite map with:
 *  • Heat blob radial gradients per zone (no polygon fill)
 *  • Dashed zone borders only (fillOpacity = 0)
 *  • Zone stat cards showing both 👤 people + 🚛 vehicles
 *  • Multi-color patrol route segments (HC-i → HC-(i+1) in HC-i's colour)
 * HQCV §12–16
 */
import 'leaflet/dist/leaflet.css'
import { GeoJSON, MapContainer, Marker, Polyline, TileLayer, Tooltip, ZoomControl, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { Feature, FeatureCollection, Polygon } from 'geojson'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PatrolZone } from '../data/patrolMockData'
import {
  PATROL_GPS_ZONES,
  PATROL_HELMET_GPS_PINS,
  PATROL_HELMET_ZONE_ASSIGNMENTS,
  PATROL_HELMET_ZONE_TRAILS,
  PATROL_SITE_CENTER,
  PATROL_SITE_FOCUS_BOUNDS,
  PATROL_SITE_MAX_ZOOM,
  PATROL_SITE_MIN_ZOOM,
  getPatrolHelmetZoneName,
  type PatrolHelmetPin,
} from '../data/patrolSiteMap'
import {
  formatDisplayValue,
  getPatrolHeatBlobColor,
  resolveCount,
  type PatrolCountMode,
  type PatrolDensityLayer,
  type PatrolDisplayMode,
} from '../services/patrolHeatmap.service'
import type { CameraPositions } from '../services/usePatrolWebSocket'

/* ── ESRI satellite tile ────────────────────────────────────── */
const ESRI_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const ESRI_ATTRIBUTION =
  'Tiles &copy; Esri &mdash; Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP'

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
): FeatureCollection<Polygon, ZoneProperties> {
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

/* ── Dashed zone border — NO fill ───────────────────────────── */
function zoneStyle(feature?: Feature<Polygon, ZoneProperties>) {
  if (!feature) return {}
  const { visited, borderColor, tier } = feature.properties
  return {
    fillOpacity: 0,
    fillColor: 'transparent',
    color: visited ? borderColor : '#334155',
    weight: tier === 'primary' ? 1.5 : 1,
    dashArray: '7 5',
    opacity: visited ? 0.85 : 0.45,
  }
}

/* ── Heat blob (radial gradient) icon ───────────────────────── */
function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

function createHeatBlobIcon(
  count: number,
  maxCount: number,
  visited: boolean,
): L.DivIcon {
  if (!visited || count === 0) {
    const size = 50
    return L.divIcon(divIconOpts(
      `<div style="width:${size}px;height:${size}px;background:radial-gradient(circle,rgba(100,116,139,0.12) 0%,transparent 70%);border-radius:50%;pointer-events:none;"></div>`,
      [size, size],
      [size / 2, size / 2],
    ))
  }
  const ratio = Math.min(1, count / maxCount)
  const size = Math.round(90 + ratio * 130)
  const color = getPatrolHeatBlobColor(count, true)
  const [r, g, b] = hexToRgb(color)
  const html = `
    <div style="
      width:${size}px;height:${size}px;
      background:radial-gradient(circle at 50% 50%,
        rgba(${r},${g},${b},0.72) 0%,
        rgba(${r},${g},${b},0.50) 28%,
        rgba(${r},${g},${b},0.28) 55%,
        rgba(${r},${g},${b},0.08) 78%,
        transparent 100%
      );
      border-radius:50%;
      pointer-events:none;
    "></div>`
  return L.divIcon(divIconOpts(html, [size, size], [size / 2, size / 2]))
}

const PATROL_DIV_ICON_CLASS = 'patrol-map-div-icon'

function divIconOpts(html: string, iconSize: [number, number], iconAnchor: [number, number]): L.DivIconOptions {
  return {
    html,
    className: PATROL_DIV_ICON_CLASS,
    iconSize,
    iconAnchor,
  }
}

/* ── Zone stat card: shows both 👤 people + 🚛 máy ─────────── */
function createZoneStatIcon(
  shortName: string,
  borderColor: string,
  visited: boolean,
  peopleCurrent: number,
  vehiclesCurrent: number,
  helmetId?: string,
): L.DivIcon {
  const helmetLine = helmetId
    ? `<div style="color:${borderColor};font-size:9px;line-height:1.35;margin-top:2px;font-weight:700;">⛑ Mũ ${helmetId.replace('HC-', '')}</div>`
    : ''
  const html = `
    <div style="
      background:rgba(8,11,18,0.93);
      border:1.5px solid ${borderColor};
      border-radius:6px;
      padding:4px 8px 5px;
      font-family:system-ui,-apple-system,sans-serif;
      pointer-events:none;
      min-width:72px;
      text-align:left;
      box-shadow:0 2px 8px rgba(0,0,0,0.6);
    ">
      <div style="color:${borderColor};font-weight:700;font-size:9px;letter-spacing:0.6px;margin-bottom:2px;">${shortName}</div>
      ${visited
        ? `<div style="color:#e2e8f0;font-size:10px;line-height:1.35;">👤 ${peopleCurrent} người</div>
           <div style="color:#e2e8f0;font-size:10px;line-height:1.35;">🚛 ${vehiclesCurrent} máy</div>
           ${helmetLine}`
        : '<div style="color:#475569;font-size:9px;margin-top:1px;">Chưa đến</div>'
      }
    </div>`
  const h = visited ? (helmetId ? 74 : 60) : 42
  return L.divIcon(divIconOpts(html, [96, h], [48, h / 2]))
}

/* ── Helmet marker icon ─────────────────────────────────────── */
function createHelmetIcon(pin: PatrolHelmetPin, isMoving: boolean) {
  const pulse = isMoving
    ? `<span style="
        position:absolute;top:-3px;right:-3px;
        width:8px;height:8px;
        background:#22d3ee;
        border-radius:50%;
        animation:patrol-pulse 1.2s infinite;
      "></span>`
    : ''
  const html = `
    <div style="position:relative;width:22px;height:22px;">
      <div style="
        background:${pin.color};
        border:2px solid #fff;
        border-radius:50%;
        width:22px;height:22px;
        display:flex;align-items:center;justify-content:center;
        font-size:7.5px;font-weight:800;color:#fff;
        font-family:system-ui,sans-serif;
        box-shadow:0 2px 8px rgba(0,0,0,0.6);
      ">${pin.id.replace('HC-', '')}</div>
      ${pulse}
    </div>`
  return L.divIcon(divIconOpts(html, [22, 22], [11, 11]))
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

    const container = map.getContainer().parentElement
    const observer = container ? new ResizeObserver(invalidate) : null
    if (container && observer) observer.observe(container)

    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.removeEventListener('resize', invalidate)
      window.removeEventListener('orientationchange', invalidate)
      observer?.disconnect()
    }
  }, [map])

  return null
}

/** Khóa tâm map tại công trường — chỉ zoom in/out, không kéo lệch focus. */
function MapSiteFocusLock({ center }: { center: [number, number] }) {
  const map = useMap()
  const lockingRef = useRef(false)

  useEffect(() => {
    map.setMaxBounds(L.latLngBounds(PATROL_SITE_FOCUS_BOUNDS))
    map.setMinZoom(PATROL_SITE_MIN_ZOOM)
    map.setMaxZoom(PATROL_SITE_MAX_ZOOM)
    map.dragging.disable()
    map.scrollWheelZoom.enable()

    const recenter = () => {
      if (lockingRef.current) return
      lockingRef.current = true
      map.setView(center, map.getZoom(), { animate: false })
      lockingRef.current = false
    }

    /* Chỉ lắng nghe zoomend — dragging đã tắt nên moveend không cần thiết
       và sẽ gây vòng lặp setView → moveend → setView → ... */
    map.on('zoomend', recenter)
    recenter()

    return () => {
      map.off('zoomend', recenter)
    }
  }, [map, center])

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
  layer: PatrolDensityLayer
  displayMode: PatrolDisplayMode
  countMode: PatrolCountMode
  showRoute: boolean
  showCameras: boolean
  showZoneStats: boolean
}

export function PatrolGeoHeatmap({
  zones,
  cameraPositions,
  layer,
  displayMode,
  countMode,
  showRoute,
  showCameras,
  showZoneStats,
}: PatrolGeoHeatmapProps) {
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
  const maxCount = useMemo(() => Math.max(...zones.map(z => resolveCount(z, layer, countMode)), 1), [zones, layer, countMode])
  const mapZoom = usePatrolMapZoom()

  return (
    <div className="relative w-full h-full min-h-[240px] max-lg:min-h-[280px]">
      <style>{`
        @keyframes patrol-pulse {
          0%,100%{opacity:1;transform:scale(1)}
          50%{opacity:.35;transform:scale(1.7)}
        }
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
        }
        .leaflet-control-attribution {
          background:rgba(8,11,18,.75) !important;
          color:#475569 !important;
          font-size:9px !important;
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
          maxBounds={PATROL_SITE_FOCUS_BOUNDS}
          maxBoundsViscosity={1.0}
          dragging={false}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          attributionControl
        >
          <MapInvalidator />
          <MapSiteFocusLock center={PATROL_SITE_CENTER} />
          <TileLayer url={ESRI_TILE_URL} attribution={ESRI_ATTRIBUTION} />
        <ZoomControl position="bottomright" />

        {/* Zone polygons — dashed borders, NO fill */}
        <GeoJSON
          key={geoJsonKey}
          data={featureCollection}
          style={zoneStyle as Parameters<typeof GeoJSON>[0]['style']}
          onEachFeature={(feature, lyr) => {
            const props = feature.properties as ZoneProperties
            lyr.bindTooltip(props.name, {
              permanent: false,
              sticky: true,
              className: 'patrol-zone-tip',
            })
          }}
        />

        {/* Heat blobs — radial gradient at each zone centre */}
        {PATROL_GPS_ZONES.map(gpsZone => {
          const zone = zoneMap.get(gpsZone.zone_id)
          const count = zone ? resolveCount(zone, layer, countMode) : 0
          const visited = zone?.coverage === 'VISITED'
          return (
            <Marker
              key={`blob-${gpsZone.zone_id}-${count}`}
              position={gpsZone.center}
              icon={createHeatBlobIcon(count, maxCount, visited)}
              zIndexOffset={-100}
            />
          )
        })}

        {/* Zone stat cards — mọi breakpoint */}
        {showZoneStats && PATROL_GPS_ZONES.map(gpsZone => {
          const zone = zoneMap.get(gpsZone.zone_id)
          const visited = zone?.coverage === 'VISITED'
          const displayVal = zone ? formatDisplayValue(zone, layer, countMode, displayMode) : '—'
          const helmetId = PATROL_HELMET_ZONE_ASSIGNMENTS.find(
            a => a.zoneId === gpsZone.zone_id,
          )?.helmetId
          return (
            <Marker
              key={`stat-${gpsZone.zone_id}-${displayVal}`}
              position={gpsZone.center}
              icon={createZoneStatIcon(
                gpsZone.shortName,
                gpsZone.borderColor,
                visited,
                zone?.peopleCurrent ?? 0,
                zone?.vehiclesCurrent ?? 0,
                helmetId,
              )}
              zIndexOffset={300}
            />
          )
        })}

        {/* Lộ trình tuần tra — mỗi mũ 1 vòng trong khu phụ trách */}
        {showRoute && PATROL_HELMET_GPS_PINS.map(pin => {
          const trail = PATROL_HELMET_ZONE_TRAILS[pin.id]
          if (!trail?.length) return null
          return (
            <Polyline
              key={`zone-route-${pin.id}`}
              positions={trail}
              color={pin.color}
              weight={2.5}
              opacity={0.85}
            />
          )
        })}

        {/* 5 mũ — vị trí realtime trong khu phụ trách */}
        {showCameras && PATROL_HELMET_GPS_PINS.map(pin => {
          const livePos = cameraPositions[pin.id] ?? pin.position
          const zoneName = getPatrolHelmetZoneName(pin.id)
          return (
            <Marker
              key={pin.id}
              position={livePos}
              icon={createHelmetIcon(pin, true)}
              zIndexOffset={500}
            >
              <Tooltip direction="top" offset={[0, -14]} opacity={0.95}>
                <span style={{ fontSize: 10, fontFamily: 'system-ui, sans-serif' }}>
                  <strong>{pin.label}</strong><br />
                  Phụ trách: {zoneName}
                </span>
              </Tooltip>
            </Marker>
          )
        })}
        </MapContainer>
      </div>
    </div>
  )
}
