/**
 * SVG markers thiết bị trên heatmap — mũ (1,2) và drone (3).
 * Bản gốc PR #29: icon nhỏ, số nằm trong silhouette.
 */
import L from 'leaflet'

const ICON_W = 22
const ICON_H = 26
const DIV_CLASS = 'patrol-map-div-icon'

function divIconOpts(html: string, iconSize: [number, number], iconAnchor: [number, number]) {
  return {
    className: DIV_CLASS,
    html,
    iconSize,
    iconAnchor,
  }
}

function deviceMarkerColors(isActive: boolean, accent: string) {
  return {
    fill: isActive ? accent : '#64748b',
    stroke: isActive ? 'rgba(255,255,255,0.9)' : 'rgba(203,213,225,0.8)',
    glow: isActive ? 'animation:patrol-helmet-glow 1.6s ease-out infinite;' : '',
  }
}

function createHelmetSvg(badgeNum: string, isActive: boolean, accent: string): string {
  const { fill, stroke, glow } = deviceMarkerColors(isActive, accent)
  return `
    <div style="width:${ICON_W}px;height:${ICON_H}px;${glow}">
      <svg viewBox="0 0 24 28" width="${ICON_W}" height="${ICON_H}" aria-hidden="true">
        <path
          d="M4 15v-2.2c0-3.4 2.8-6.2 6.2-6.2h3.6c3.4 0 6.2 2.8 6.2 6.2V15"
          fill="${fill}" stroke="${stroke}" stroke-width="1.4" stroke-linejoin="round"
        />
        <path
          d="M2.5 15.2h19v2.4a1.2 1.2 0 0 1-1.2 1.2H3.7a1.2 1.2 0 0 1-1.2-1.2v-2.4z"
          fill="${fill}" stroke="${stroke}" stroke-width="1.2"
        />
        <rect x="10.2" y="7.2" width="3.6" height="2.2" rx="0.6" fill="${stroke}" opacity="0.85"/>
        <text
          x="12" y="11.2" text-anchor="middle" dominant-baseline="middle"
          font-size="8" font-weight="800" fill="#fff"
          font-family="system-ui,sans-serif"
        >${badgeNum}</text>
      </svg>
    </div>`
}

function createDroneSvg(badgeNum: string, isActive: boolean, accent: string): string {
  const { fill, stroke, glow } = deviceMarkerColors(isActive, accent)
  return `
    <div style="width:${ICON_W}px;height:${ICON_H}px;${glow}">
      <svg viewBox="0 0 24 28" width="${ICON_W}" height="${ICON_H}" aria-hidden="true">
        <line x1="6" y1="8" x2="18" y2="20" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round"/>
        <line x1="18" y1="8" x2="6" y2="20" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round"/>
        <circle cx="6" cy="8" r="2.6" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>
        <circle cx="18" cy="8" r="2.6" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>
        <circle cx="6" cy="20" r="2.6" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>
        <circle cx="18" cy="20" r="2.6" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>
        <rect x="9.2" y="12.2" width="5.6" height="3.6" rx="1" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>
        <text
          x="12" y="15.1" text-anchor="middle"
          font-size="7.5" font-weight="800" fill="#fff"
          font-family="system-ui,sans-serif"
        >${badgeNum}</text>
      </svg>
    </div>`
}

export function createPatrolHelmetMapIcon(
  badgeNum: string,
  isActive: boolean,
  accent: string,
): L.DivIcon {
  const html = createHelmetSvg(badgeNum, isActive, accent)
  return L.divIcon(divIconOpts(html, [ICON_W, ICON_H], [ICON_W / 2, ICON_H / 2]))
}

export function createPatrolDroneMapIcon(
  badgeNum: string,
  isActive: boolean,
  accent: string,
): L.DivIcon {
  const html = createDroneSvg(badgeNum, isActive, accent)
  return L.divIcon(divIconOpts(html, [ICON_W, ICON_H], [ICON_W / 2, ICON_H / 2]))
}

export const PATROL_MAP_DEVICE_PIN_STYLES = ''
