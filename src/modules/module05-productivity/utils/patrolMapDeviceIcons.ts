/**
 * SVG markers thiết bị trên heatmap — mũ (1,2) và drone (3).
 * Pin tròn + đuôi nhọn, icon trắng, badge số góc phải.
 */
import L from 'leaflet'

const PIN_W = 36
const PIN_H = 44
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
    fill: isActive ? accent : '#475569',
    ring: isActive ? '#ffffff' : '#cbd5e1',
    badgeBg: isActive ? '#0f172a' : '#1e293b',
    badgeText: '#ffffff',
    pulse: isActive
      ? 'animation:patrol-device-pin-pulse 2s ease-out infinite;'
      : '',
    shadow: 'filter:drop-shadow(0 2px 5px rgba(0,0,0,0.55));',
  }
}

/** Lucide HardHat — silhouette trắng, đọc rõ trên nền màu. */
function helmetGlyph(): string {
  return `
    <g transform="translate(9.5, 6.5)">
      <path
        fill="#fff"
        d="M9 10.5V6.2a1.1 1.1 0 0 1 1.1-1.1h1.8A1.1 1.1 0 0 1 13 6.2v4.3c2.4.5 4.3 2.2 4.8 4.5H4.2c.5-2.3 2.4-4 4.8-4.5z"
      />
      <rect x="1.5" y="14.8" width="15" height="3.8" rx="1" fill="#fff"/>
      <rect x="8.2" y="4.8" width="1.6" height="2.2" rx="0.4" fill="${'#ffffff99'}"/>
    </g>`
}

/** Quadcopter đối xứng — đọc rõ ở 36px. */
function droneGlyph(): string {
  return `
    <g fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round">
      <line x1="10" y1="10" x2="26" y2="26"/>
      <line x1="26" y1="10" x2="10" y2="26"/>
      <circle cx="10" cy="10" r="3.2" fill="#fff" stroke="none"/>
      <circle cx="26" cy="10" r="3.2" fill="#fff" stroke="none"/>
      <circle cx="10" cy="26" r="3.2" fill="#fff" stroke="none"/>
      <circle cx="26" cy="26" r="3.2" fill="#fff" stroke="none"/>
      <rect x="15" y="15.5" width="6" height="4.5" rx="1.2" fill="#fff" stroke="none"/>
    </g>`
}

function createDevicePinSvg(
  kind: 'helmet' | 'drone',
  badgeNum: string,
  isActive: boolean,
  accent: string,
): string {
  const p = markerPalette(isActive, accent)
  const glyph = kind === 'helmet' ? helmetGlyph() : droneGlyph()
  return `
    <svg viewBox="0 0 ${PIN_W} ${PIN_H}" width="${PIN_W}" height="${PIN_H}" aria-hidden="true" style="${p.shadow}${p.pulse}">
      ${isActive ? `<circle cx="18" cy="16" r="15.5" fill="none" stroke="${accent}" stroke-width="1.5" opacity="0.35"/>` : ''}
      <circle cx="18" cy="16" r="13.5" fill="${p.fill}" stroke="${p.ring}" stroke-width="2"/>
      ${glyph}
      <path d="M18 28.5 L13.5 36 L22.5 36 Z" fill="${p.fill}" stroke="${p.ring}" stroke-width="1.5" stroke-linejoin="round"/>
      <circle cx="28" cy="9" r="7" fill="${p.badgeBg}" stroke="${p.ring}" stroke-width="1.5"/>
      <text
        x="28" y="11.5"
        text-anchor="middle" dominant-baseline="middle"
        font-size="9" font-weight="800" fill="${p.badgeText}"
        font-family="system-ui,-apple-system,sans-serif"
      >${badgeNum}</text>
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
    50% { opacity: 0.92; transform: scale(1.04); }
  }
`
