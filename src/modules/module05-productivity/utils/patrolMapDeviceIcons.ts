/**
 * SVG markers thiết bị trên heatmap — mũ (1,2) và drone (3).
 * Icon nhỏ gọn, số thiết bị nằm bên trong silhouette icon.
 */
import L from 'leaflet'

const PIN_W = 28
const PIN_H = 34
const DIV_CLASS = 'patrol-map-div-icon'
const ICON_CX = PIN_W / 2
const ICON_CY = 12

function divIconOpts(html: string, iconSize: [number, number], iconAnchor: [number, number]) {
  return {
    className: DIV_CLASS,
    html,
    iconSize,
    iconAnchor,
  }
}

function markerPalette(isActive: boolean, accent: string) {
  return {
    fill: isActive ? accent : '#64748b',
    ring: '#ffffff',
    iconFill: '#ffffff',
    numberFill: isActive ? accent : '#334155',
    pulse: isActive
      ? 'animation:patrol-device-pin-pulse 2s ease-out infinite;'
      : '',
    shadow: 'filter:drop-shadow(0 2px 4px rgba(0,0,0,0.45));',
  }
}

function numberInsideIcon(num: string, numberFill: string): string {
  return `
    <text
      x="${ICON_CX}" y="${ICON_CY + 0.5}"
      text-anchor="middle" dominant-baseline="middle"
      font-size="7.5" font-weight="900" fill="${numberFill}"
      font-family="system-ui,-apple-system,sans-serif"
    >${num}</text>`
}

/** Mũ bảo hộ nhỏ — số nằm giữa phần vòm. */
function helmetGlyph(iconFill: string, badgeNum: string, numberFill: string): string {
  return `
    <g transform="translate(${ICON_CX - 7}, ${ICON_CY - 6})">
      <path
        fill="${iconFill}"
        d="M4.8 6.8V4.6a0.65 0.65 0 0 1 0.65-0.65h1.05a0.65 0.65 0 0 1 0.65 0.65v2.2c1.2 0.25 2.1 1.1 2.4 2.3H2.4c0.3-1.2 1.2-2.05 2.4-2.3z"
      />
      <rect x="0.9" y="9" width="12.2" height="1.8" rx="0.55" fill="${iconFill}"/>
    </g>
    ${numberInsideIcon(badgeNum, numberFill)}`
}

/** Drone nhỏ — số nằm giữa thân. */
function droneGlyph(iconFill: string, badgeNum: string, numberFill: string): string {
  return `
    <g fill="none" stroke="${iconFill}" stroke-width="1.05" stroke-linecap="round">
      <line x1="${ICON_CX - 5.5}" y1="${ICON_CY - 4.5}" x2="${ICON_CX + 5.5}" y2="${ICON_CY + 4.5}"/>
      <line x1="${ICON_CX + 5.5}" y1="${ICON_CY - 4.5}" x2="${ICON_CX - 5.5}" y2="${ICON_CY + 4.5}"/>
      <circle cx="${ICON_CX - 5.5}" cy="${ICON_CY - 4.5}" r="1.7" fill="${iconFill}" stroke="none"/>
      <circle cx="${ICON_CX + 5.5}" cy="${ICON_CY - 4.5}" r="1.7" fill="${iconFill}" stroke="none"/>
      <circle cx="${ICON_CX - 5.5}" cy="${ICON_CY + 4.5}" r="1.7" fill="${iconFill}" stroke="none"/>
      <circle cx="${ICON_CX + 5.5}" cy="${ICON_CY + 4.5}" r="1.7" fill="${iconFill}" stroke="none"/>
      <rect x="${ICON_CX - 2.2}" y="${ICON_CY - 1.6}" width="4.4" height="3" rx="0.7" fill="${iconFill}" stroke="none"/>
    </g>
    ${numberInsideIcon(badgeNum, numberFill)}`
}

function createDevicePinSvg(
  kind: 'helmet' | 'drone',
  badgeNum: string,
  isActive: boolean,
  accent: string,
): string {
  const p = markerPalette(isActive, accent)
  const glyph = kind === 'helmet'
    ? helmetGlyph(p.iconFill, badgeNum, p.numberFill)
    : droneGlyph(p.iconFill, badgeNum, p.numberFill)
  const cx = ICON_CX
  const headR = 11
  const headCy = ICON_CY + 1

  return `
    <svg viewBox="0 0 ${PIN_W} ${PIN_H}" width="${PIN_W}" height="${PIN_H}" aria-hidden="true" style="${p.shadow}${p.pulse}">
      ${isActive ? `<circle cx="${cx}" cy="${headCy}" r="${headR + 1.5}" fill="none" stroke="${accent}" stroke-width="1.2" opacity="0.25"/>` : ''}
      <circle cx="${cx}" cy="${headCy}" r="${headR}" fill="${p.fill}" stroke="${p.ring}" stroke-width="1.6"/>
      ${glyph}
      <path d="M${cx} ${headCy + headR} L${cx - 3.5} ${PIN_H - 1} L${cx + 3.5} ${PIN_H - 1} Z" fill="${p.fill}" stroke="${p.ring}" stroke-width="1.2" stroke-linejoin="round"/>
    </svg>`
}

export function createPatrolHelmetMapIcon(
  badgeNum: string,
  isActive: boolean,
  accent: string,
): L.DivIcon {
  const html = `<div style="width:${PIN_W}px;height:${PIN_H}px;line-height:0;">${createDevicePinSvg('helmet', badgeNum, isActive, accent)}</div>`
  return L.divIcon(divIconOpts(html, [PIN_W, PIN_H], [PIN_W / 2, PIN_H]))
}

export function createPatrolDroneMapIcon(
  badgeNum: string,
  isActive: boolean,
  accent: string,
): L.DivIcon {
  const html = `<div style="width:${PIN_W}px;height:${PIN_H}px;line-height:0;">${createDevicePinSvg('drone', badgeNum, isActive, accent)}</div>`
  return L.divIcon(divIconOpts(html, [PIN_W, PIN_H], [PIN_W / 2, PIN_H]))
}

export const PATROL_MAP_DEVICE_PIN_STYLES = `
  @keyframes patrol-device-pin-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.94; transform: scale(1.03); }
  }
`
