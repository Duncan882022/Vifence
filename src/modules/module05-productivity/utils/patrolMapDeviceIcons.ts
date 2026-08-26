/**
 * SVG markers thiết bị trên heatmap — mũ (1,2) và drone (3).
 * Icon + số nằm gọn trong đầu pin tròn (không badge góc).
 */
import L from 'leaflet'

const PIN_W = 34
const PIN_H = 42
const DIV_CLASS = 'patrol-map-div-icon'

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
    numberFill: '#ffffff',
    pulse: isActive
      ? 'animation:patrol-device-pin-pulse 2s ease-out infinite;'
      : '',
    shadow: 'filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));',
  }
}

/** Mũ bảo hộ — silhouette gọn, nằm nửa trên đầu pin. */
function helmetGlyph(iconFill: string): string {
  return `
    <g transform="translate(10.5, 4.5)">
      <path
        fill="${iconFill}"
        d="M6.5 9.2V6.1a0.85 0.85 0 0 1 0.85-0.85h1.35a0.85 0.85 0 0 1 0.85 0.85v3.1c1.55 0.35 2.75 1.45 3.1 3H3.4c0.35-1.55 1.55-2.65 3.1-3z"
      />
      <rect x="1.2" y="12.1" width="11.6" height="2.2" rx="0.7" fill="${iconFill}"/>
    </g>`
}

/** Drone quadcopter — gọn, nằm nửa trên đầu pin. */
function droneGlyph(iconFill: string): string {
  return `
    <g fill="none" stroke="${iconFill}" stroke-width="1.35" stroke-linecap="round">
      <line x1="11.5" y1="9.5" x2="22.5" y2="20.5"/>
      <line x1="22.5" y1="9.5" x2="11.5" y2="20.5"/>
      <circle cx="11.5" cy="9.5" r="2.4" fill="${iconFill}" stroke="none"/>
      <circle cx="22.5" cy="9.5" r="2.4" fill="${iconFill}" stroke="none"/>
      <circle cx="11.5" cy="20.5" r="2.4" fill="${iconFill}" stroke="none"/>
      <circle cx="22.5" cy="20.5" r="2.4" fill="${iconFill}" stroke="none"/>
      <rect x="14.8" y="13.2" width="4.4" height="3.2" rx="0.9" fill="${iconFill}" stroke="none"/>
    </g>`
}

function createDevicePinSvg(
  kind: 'helmet' | 'drone',
  badgeNum: string,
  isActive: boolean,
  accent: string,
): string {
  const p = markerPalette(isActive, accent)
  const glyph = kind === 'helmet' ? helmetGlyph(p.iconFill) : droneGlyph(p.iconFill)
  const cx = PIN_W / 2

  return `
    <svg viewBox="0 0 ${PIN_W} ${PIN_H}" width="${PIN_W}" height="${PIN_H}" aria-hidden="true" style="${p.shadow}${p.pulse}">
      ${isActive ? `<circle cx="${cx}" cy="15" r="16" fill="none" stroke="${accent}" stroke-width="1.4" opacity="0.28"/>` : ''}
      <circle cx="${cx}" cy="15" r="14" fill="${p.fill}" stroke="${p.ring}" stroke-width="2"/>
      ${glyph}
      <text
        x="${cx}" y="24.5"
        text-anchor="middle" dominant-baseline="middle"
        font-size="10.5" font-weight="800" fill="${p.numberFill}"
        font-family="system-ui,-apple-system,sans-serif"
      >${badgeNum}</text>
      <path d="M${cx} 29 L${cx - 4.5} ${PIN_H - 1} L${cx + 4.5} ${PIN_H - 1} Z" fill="${p.fill}" stroke="${p.ring}" stroke-width="1.4" stroke-linejoin="round"/>
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
