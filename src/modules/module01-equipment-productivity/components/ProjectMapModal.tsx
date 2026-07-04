import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  X, AlertTriangle, CheckCircle2, Clock, Wrench, MapPin, HardHat, Fuel,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import type { Project, Worksite, PileStatus, DelayReason } from '../types'
import { PILE_ASSIGNMENTS, MACHINES } from '../data/mockProductivity'

/* ─────────────────────────────────────────────────────────
   Label maps
───────────────────────────────────────────────────────── */
const DELAY_LABELS: Record<DelayReason, string> = {
  'machine-breakdown':  'Máy hỏng',
  'lack-worker':        'Thiếu nhân công',
  'lack-cement':        'Thiếu xi măng',
  'lack-bentonite':     'Thiếu bentonite',
  'lack-concrete':      'Thiếu bê tông',
  'lack-steel-cage':    'Thiếu thép lồng',
  'site-not-ready':     'Mặt bằng chưa sẵn',
  'weather':            'Thời tiết',
  'inspection-waiting': 'Chờ nghiệm thu',
}
const STATUS_LABEL: Record<PileStatus, string> = {
  'completed':   'Hoàn thành',
  'in-progress': 'Đang thi công',
  'delayed':     'Chậm tiến độ',
  'blocked':     'Bị chặn',
  'not-started': 'Chưa bắt đầu',
}

/* ─────────────────────────────────────────────────────────
   Pile dot model
───────────────────────────────────────────────────────── */
interface PileDot {
  pileCode: string
  capId: string
  status: PileStatus
  diameterMm: number
  depthM: number
  machineCode?: string
  machineType?: string
  delayReason?: DelayReason
  plannedStart?: string
  plannedEnd?: string
  actualStart?: string
  actualEnd?: string
  actualDurationH?: number
  delayHours?: number
  fuelUsedLitres?: number
  x: number
  y: number
  isReal: boolean
}

/* ─────────────────────────────────────────────────────────
   Pile cap layout model
───────────────────────────────────────────────────────── */
type CapType = 'D1' | 'D2' | 'D3' | 'D4'

interface CapLayout {
  id: string
  cx: number
  cy: number
  type: CapType
  capW: number
  capH: number
  offsets: { lx: number; ly: number }[]
}

interface BuildingLayout {
  caps:        CapLayout[]
  ncols:       number
  nrows:       number
  bldgX:       number
  bldgY:       number
  bldgW:       number
  bldgH:       number
  colSpacing:  number
  rowSpacing:  number
  colXs:       number[]
  rowYs:       number[]
  totalPiles:  number
}

/* ─────────────────────────────────────────────────────────
   Drawing constants  (viewBox 1200 × 860)
───────────────────────────────────────────────────────── */
const DWG = {
  vw: 1200, vh: 860,
  outerX: 8,  outerY: 8,  outerW: 1184, outerH: 844,
  innerX: 22, innerY: 22, innerW: 1156, innerH: 812,
  tbY: 776,   tbH: 58,
  /* area where building sits */
  pgX: 75,  pgY: 60,  pgW: 1105, pgH: 690,
}

/* CAD colours */
const C = {
  bg:        '#06080e',
  paper:     '#080c14',
  line:      '#b0b8cc',
  axis:      '#2e6fa8',
  dim:       '#7a8290',
  text:      '#c8ccd4',
  textSub:   '#7a8290',
  bubble:    '#112233',
  bubbleTxt: '#93b4d4',
  tbBg:      '#04060c',
  tbLine:    '#2a3550',
  bldgEdge:  '#2e4a70',
  capFill:   '#0b1525',
  capStroke: '#2e4a70',
  beam:      '#1d3555',
}

const PC: Record<PileStatus, { fill: string; stroke: string; glow: string }> = {
  'completed':   { fill: '#22c55e26', stroke: '#22c55e', glow: '#4ade80' },
  'in-progress': { fill: '#38bdf826', stroke: '#38bdf8', glow: '#7dd3fc' },
  'delayed':     { fill: '#f59e0b26', stroke: '#f59e0b', glow: '#fcd34d' },
  'blocked':     { fill: '#ef444426', stroke: '#ef4444', glow: '#fca5a5' },
  'not-started': { fill: '#1c2638',   stroke: '#2a3a55', glow: '#334155' },
}

/* Pile cap sizes for each type */
const CAP_SIZE: Record<CapType, { w: number; h: number }> = {
  D1: { w: 18, h: 18 },
  D2: { w: 32, h: 20 },
  D3: { w: 32, h: 30 },
  D4: { w: 32, h: 32 },
}

/* Pile offsets within cap (from cap centre) */
const CAP_OFFSETS: Record<CapType, { lx: number; ly: number }[]> = {
  D1: [{ lx: 0, ly: 0 }],
  D2: [{ lx: -10, ly: 0 }, { lx: 10, ly: 0 }],
  D3: [{ lx: 0, ly: -10 }, { lx: -9, ly: 6 }, { lx: 9, ly: 6 }],
  D4: [{ lx: -10, ly: -10 }, { lx: 10, ly: -10 }, { lx: -10, ly: 10 }, { lx: 10, ly: 10 }],
}

/* ─────────────────────────────────────────────────────────
   Building layout calculator
───────────────────────────────────────────────────────── */
function calcBuildingLayout(targetPiles: number): BuildingLayout {
  /* Find best ncols × nrows grid */
  let bestNc = 7, bestNr = 5, bestDiff = Infinity

  for (let nc = 4; nc <= 12; nc++) {
    for (let nr = 3; nr <= 9; nr++) {
      const corners   = 4
      const edges     = 2 * (nc - 2) + 2 * (nr - 2)
      const interior  = (nc - 2) * (nr - 2)
      const total     = corners * 4 + edges * 3 + interior * 2
      const diff      = Math.abs(total - targetPiles)
      if (diff < bestDiff || (diff === bestDiff && nc + nr < bestNc + bestNr)) {
        bestDiff = diff; bestNc = nc; bestNr = nr
      }
    }
  }

  const MARGIN_X = 70
  const MARGIN_Y = 58
  const bldgX = DWG.pgX + MARGIN_X
  const bldgY = DWG.pgY + MARGIN_Y
  const bldgW = DWG.pgW - MARGIN_X * 2
  const bldgH = DWG.pgH - MARGIN_Y * 2
  const colSpacing = bldgW / (bestNc - 1)
  const rowSpacing = bldgH / (bestNr - 1)
  const colXs = Array.from({ length: bestNc }, (_, c) => bldgX + c * colSpacing)
  const rowYs = Array.from({ length: bestNr }, (_, r) => bldgY + r * rowSpacing)

  const caps: CapLayout[] = []
  let totalPiles = 0

  for (let r = 0; r < bestNr; r++) {
    for (let c = 0; c < bestNc; c++) {
      const isCorner  = (c === 0 || c === bestNc - 1) && (r === 0 || r === bestNr - 1)
      const isEdge    = !isCorner && (c === 0 || c === bestNc - 1 || r === 0 || r === bestNr - 1)
      const type: CapType = isCorner ? 'D4' : isEdge ? 'D3' : 'D2'
      const { w, h }  = CAP_SIZE[type]
      const offsets   = CAP_OFFSETS[type]

      caps.push({
        id: `${c}-${r}`,
        cx: colXs[c], cy: rowYs[r],
        type, capW: w, capH: h, offsets,
      })
      totalPiles += offsets.length
    }
  }

  return { caps, ncols: bestNc, nrows: bestNr, bldgX, bldgY, bldgW, bldgH, colSpacing, rowSpacing, colXs, rowYs, totalPiles }
}

/* ─────────────────────────────────────────────────────────
   Build pile dots from worksite data + building layout
───────────────────────────────────────────────────────── */
function buildDots(ws: Worksite, layout: BuildingLayout): PileDot[] {
  const real       = PILE_ASSIGNMENTS.filter(p => p.worksiteId === ws.id)
  const machineMap = Object.fromEntries(MACHINES.map(m => [m.id, m]))

  /* Remaining synthetic statuses after accounting for real piles */
  let remDone = Math.max(0, ws.completedPiles   - real.filter(p => p.status === 'completed').length)
  let remIP   = Math.max(0, ws.inProgressPiles  - real.filter(p => p.status === 'in-progress').length)
  let remDly  = Math.max(0, ws.delayedPiles     - real.filter(p => p.status === 'delayed').length)
  let remBlk  = Math.max(0, ws.blockedPiles     - real.filter(p => p.status === 'blocked').length)

  /* Flatten all pile positions from layout caps */
  const positions: { x: number; y: number; capId: string }[] = []
  for (const cap of layout.caps) {
    for (const off of cap.offsets) {
      positions.push({ x: cap.cx + off.lx, y: cap.cy + off.ly, capId: cap.id })
    }
  }

  const dots: PileDot[] = []
  const limit = Math.min(positions.length, ws.plannedPiles)

  for (let i = 0; i < limit; i++) {
    const pos = positions[i]

    if (i < real.length) {
      const rp = real[i]
      const m  = machineMap[rp.machineId]
      dots.push({
        pileCode: rp.pileCode, capId: pos.capId,
        status: rp.status,
        diameterMm: rp.diameterMm, depthM: rp.depthM,
        machineCode: m?.code, machineType: m?.type,
        delayReason: rp.delayReason,
        plannedStart: rp.plannedStart, plannedEnd: rp.plannedEnd,
        actualStart: rp.actualStart, actualEnd: rp.actualEnd,
        actualDurationH: rp.actualDurationH,
        delayHours: rp.delayHours > 0 ? rp.delayHours : undefined,
        fuelUsedLitres: rp.fuelUsedLitres,
        x: pos.x, y: pos.y, isReal: true,
      })
    } else {
      let status: PileStatus
      if      (remDone > 0) { status = 'completed';   remDone-- }
      else if (remIP   > 0) { status = 'in-progress'; remIP-- }
      else if (remDly  > 0) { status = 'delayed';     remDly-- }
      else if (remBlk  > 0) { status = 'blocked';     remBlk-- }
      else                  { status = 'not-started' }

      dots.push({
        pileCode: `${ws.code}-${String(i + 1).padStart(3, '0')}`,
        capId: pos.capId, status,
        diameterMm: [800, 800, 900, 1000][i % 4],
        depthM:     [25, 28, 30, 32, 35][i % 5],
        x: pos.x, y: pos.y, isReal: false,
      })
    }
  }
  return dots
}

/* ─────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────── */
function fmtTime(iso?: string)  { return iso ? iso.slice(11, 16) : '—' }
function fmtDate(iso?: string) {
  if (!iso) return '—'
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}
function colLabel(i: number)    { return String.fromCharCode(65 + i) }

/* ─────────────────────────────────────────────────────────
   AutoCAD-style SVG drawing
───────────────────────────────────────────────────────── */
function CadDrawing({
  ws, dots, layout, selectedDot, onSelect, dwgNo, uid,
}: {
  ws:           Worksite
  dots:         PileDot[]
  layout:       BuildingLayout
  selectedDot:  PileDot | null
  onSelect:     (d: PileDot) => void
  dwgNo:        string
  uid:          string
}) {
  const completedPct = ws.plannedPiles > 0
    ? Math.round((ws.completedPiles / ws.plannedPiles) * 100)
    : 0

  const arrowE = `ae-${uid}`
  const arrowS = `as-${uid}`

  /* Axis extension beyond building edge */
  const AX = 30
  const BUBBLE_OFFSET = 44  /* distance from building edge to bubble centre */

  /* Real mm spacing (1:100 scale → 1px=100mm) */
  const realColMm = Math.round(layout.colSpacing * 100 / 100) * 100
  const realRowMm = Math.round(layout.rowSpacing * 100 / 100) * 100

  const PILE_R = 4

  return (
    <svg
      viewBox={`0 0 ${DWG.vw} ${DWG.vh}`}
      className="w-full h-full"
      style={{ fontFamily: "'Courier New', Consolas, monospace" }}
    >
      {/* ── Defs first ── */}
      <defs>
        <marker id={arrowE} markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={C.dim} />
        </marker>
        <marker id={arrowS} markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto-start-reverse">
          <path d="M0,0 L6,3 L0,6 Z" fill={C.dim} />
        </marker>
        {/* Hatch pattern for pile cap fill */}
        <pattern id={`hatch-${uid}`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="4" stroke="#1a2d4a" strokeWidth="1" />
        </pattern>
      </defs>

      {/* ── Background + paper ── */}
      <rect width={DWG.vw} height={DWG.vh} fill={C.bg} />
      <rect x={DWG.innerX} y={DWG.innerY} width={DWG.innerW} height={DWG.innerH} fill={C.paper} />

      {/* ── Drawing frames ── */}
      <rect x={DWG.outerX} y={DWG.outerY} width={DWG.outerW} height={DWG.outerH}
        fill="none" stroke={C.line} strokeWidth="2.5" />
      <rect x={DWG.innerX} y={DWG.innerY} width={DWG.innerW} height={DWG.innerH}
        fill="none" stroke={C.line} strokeWidth="1" />

      {/* ── Title block ── */}
      <line x1={DWG.innerX} y1={DWG.tbY} x2={DWG.innerX + DWG.innerW} y2={DWG.tbY}
        stroke={C.line} strokeWidth="1.5" />
      <rect x={DWG.innerX} y={DWG.tbY} width={DWG.innerW} height={DWG.tbH} fill={C.tbBg} />
      {[320, 640, 860, 1000].map(dx => (
        <line key={dx}
          x1={DWG.innerX + dx} y1={DWG.tbY}
          x2={DWG.innerX + dx} y2={DWG.tbY + DWG.tbH}
          stroke={C.tbLine} strokeWidth="0.8" />
      ))}
      <line x1={DWG.innerX} y1={DWG.tbY + DWG.tbH / 2}
        x2={DWG.innerX + 860} y2={DWG.tbY + DWG.tbH / 2}
        stroke={C.tbLine} strokeWidth="0.6" />

      {/* Title block text */}
      <text x={DWG.innerX + 8} y={DWG.tbY + 13} fontSize="8" fill={C.textSub} letterSpacing="1">CÔNG TY</text>
      <text x={DWG.innerX + 8} y={DWG.tbY + 25} fontSize="10" fontWeight="bold" fill={C.text}>VIFENCE CORP.</text>
      <text x={DWG.innerX + 8} y={DWG.tbY + 38} fontSize="8" fill={C.textSub}>Hệ thống giám sát thi công</text>
      <text x={DWG.innerX + 8} y={DWG.tbY + 51} fontSize="8" fill={C.textSub}>vifence.com.vn</text>

      <text x={DWG.innerX + 328} y={DWG.tbY + 13} fontSize="8" fill={C.textSub} letterSpacing="1">TÊN BẢN VẼ</text>
      <text x={DWG.innerX + 328} y={DWG.tbY + 27} fontSize="11" fontWeight="bold" fill={C.text}>BẢN VẼ BỐ TRÍ CỌC NHỒI</text>
      <text x={DWG.innerX + 328} y={DWG.tbY + 41} fontSize="10" fill="#7dd3fc">{ws.name}</text>
      <text x={DWG.innerX + 328} y={DWG.tbY + 55} fontSize="8" fill={C.textSub}>
        {ws.completedPiles}/{ws.plannedPiles} cọc · {completedPct}% hoàn thành
      </text>

      <text x={DWG.innerX + 648} y={DWG.tbY + 13} fontSize="8" fill={C.textSub}>TỈ LỆ</text>
      <text x={DWG.innerX + 648} y={DWG.tbY + 27} fontSize="11" fontWeight="bold" fill={C.text}>1:100</text>
      <text x={DWG.innerX + 648} y={DWG.tbY + 41} fontSize="8" fill={C.textSub}>SỐ BẢN VẼ</text>
      <text x={DWG.innerX + 648} y={DWG.tbY + 55} fontSize="10" fontWeight="bold" fill={C.text}>{dwgNo}</text>

      <text x={DWG.innerX + 868} y={DWG.tbY + 13} fontSize="8" fill={C.textSub}>NGÀY</text>
      <text x={DWG.innerX + 868} y={DWG.tbY + 26} fontSize="9" fill={C.text}>04/07/2026</text>
      <text x={DWG.innerX + 868} y={DWG.tbY + 41} fontSize="8" fill={C.textSub}>PHIÊN BẢN</text>
      <text x={DWG.innerX + 868} y={DWG.tbY + 54} fontSize="9" fill={C.text}>Rev. A</text>

      <text x={DWG.innerX + 1008} y={DWG.tbY + 13} fontSize="8" fill={C.textSub}>LẬP</text>
      <text x={DWG.innerX + 1008} y={DWG.tbY + 26} fontSize="9" fill={C.text}>Vifence AI</text>
      <text x={DWG.innerX + 1008} y={DWG.tbY + 41} fontSize="8" fill={C.textSub}>KIỂM TRA</text>
      <text x={DWG.innerX + 1008} y={DWG.tbY + 54} fontSize="9" fill={C.text}>PM / CĐT</text>

      {/* ── Building outline (dashed) ── */}
      <rect
        x={layout.bldgX - 18} y={layout.bldgY - 18}
        width={layout.bldgW + 36} height={layout.bldgH + 36}
        fill="none" stroke={C.bldgEdge} strokeWidth="1.2" strokeDasharray="12,5"
      />

      {/* ── Structural axis lines ── */}
      {/* Vertical (column) axes */}
      {layout.colXs.map((cx, ci) => (
        <line key={`va${ci}`}
          x1={cx} y1={layout.bldgY - AX}
          x2={cx} y2={layout.bldgY + layout.bldgH + AX}
          stroke={C.axis} strokeWidth="0.6" strokeDasharray="10,4,2,4" opacity="0.6"
        />
      ))}
      {/* Horizontal (row) axes */}
      {layout.rowYs.map((ry, ri) => (
        <line key={`ha${ri}`}
          x1={layout.bldgX - AX} y1={ry}
          x2={layout.bldgX + layout.bldgW + AX} y2={ry}
          stroke={C.axis} strokeWidth="0.6" strokeDasharray="10,4,2,4" opacity="0.6"
        />
      ))}

      {/* ── Axis bubbles — columns ── */}
      {layout.colXs.map((cx, ci) => (
        <g key={`cb${ci}`}>
          {/* Top */}
          <line x1={cx} y1={layout.bldgY - AX} x2={cx} y2={layout.bldgY - BUBBLE_OFFSET + 12}
            stroke={C.axis} strokeWidth="0.6" />
          <circle cx={cx} cy={layout.bldgY - BUBBLE_OFFSET} r={12}
            fill={C.bubble} stroke={C.axis} strokeWidth="0.8" />
          <text x={cx} y={layout.bldgY - BUBBLE_OFFSET + 4} textAnchor="middle"
            fontSize="9" fontWeight="bold" fill={C.bubbleTxt}>
            {colLabel(ci)}
          </text>
          {/* Bottom */}
          <line x1={cx} y1={layout.bldgY + layout.bldgH + AX} x2={cx} y2={layout.bldgY + layout.bldgH + BUBBLE_OFFSET - 12}
            stroke={C.axis} strokeWidth="0.6" />
          <circle cx={cx} cy={layout.bldgY + layout.bldgH + BUBBLE_OFFSET} r={12}
            fill={C.bubble} stroke={C.axis} strokeWidth="0.8" />
          <text x={cx} y={layout.bldgY + layout.bldgH + BUBBLE_OFFSET + 4} textAnchor="middle"
            fontSize="9" fontWeight="bold" fill={C.bubbleTxt}>
            {colLabel(ci)}
          </text>
        </g>
      ))}

      {/* ── Axis bubbles — rows ── */}
      {layout.rowYs.map((ry, ri) => (
        <g key={`rb${ri}`}>
          {/* Left */}
          <line x1={layout.bldgX - AX} y1={ry} x2={layout.bldgX - BUBBLE_OFFSET + 12} y2={ry}
            stroke={C.axis} strokeWidth="0.6" />
          <circle cx={layout.bldgX - BUBBLE_OFFSET} cy={ry} r={12}
            fill={C.bubble} stroke={C.axis} strokeWidth="0.8" />
          <text x={layout.bldgX - BUBBLE_OFFSET} y={ry + 4} textAnchor="middle"
            fontSize="9" fontWeight="bold" fill={C.bubbleTxt}>
            {ri + 1}
          </text>
          {/* Right */}
          <line x1={layout.bldgX + layout.bldgW + AX} y1={ry} x2={layout.bldgX + layout.bldgW + BUBBLE_OFFSET - 12} y2={ry}
            stroke={C.axis} strokeWidth="0.6" />
          <circle cx={layout.bldgX + layout.bldgW + BUBBLE_OFFSET} cy={ry} r={12}
            fill={C.bubble} stroke={C.axis} strokeWidth="0.8" />
          <text x={layout.bldgX + layout.bldgW + BUBBLE_OFFSET} y={ry + 4} textAnchor="middle"
            fontSize="9" fontWeight="bold" fill={C.bubbleTxt}>
            {ri + 1}
          </text>
        </g>
      ))}

      {/* ── Foundation beams (dầm móng) between adjacent caps ── */}
      {layout.caps.map(cap => {
        const [c, r] = cap.id.split('-').map(Number)
        const nextH = layout.caps.find(x => x.id === `${c + 1}-${r}`)
        const nextV = layout.caps.find(x => x.id === `${c}-${r + 1}`)
        return (
          <g key={`bm-${cap.id}`}>
            {nextH && (
              <line
                x1={cap.cx + cap.capW / 2} y1={cap.cy}
                x2={nextH.cx - nextH.capW / 2} y2={nextH.cy}
                stroke={C.beam} strokeWidth="6" opacity="0.35"
              />
            )}
            {nextV && (
              <line
                x1={cap.cx} y1={cap.cy + cap.capH / 2}
                x2={nextV.cx} y2={nextV.cy - nextV.capH / 2}
                stroke={C.beam} strokeWidth="6" opacity="0.35"
              />
            )}
          </g>
        )
      })}

      {/* ── Pile caps (đài cọc) ── */}
      {layout.caps.map(cap => (
        <g key={`cap-${cap.id}`}>
          <rect
            x={cap.cx - cap.capW / 2} y={cap.cy - cap.capH / 2}
            width={cap.capW} height={cap.capH}
            fill={`url(#hatch-${uid})`} stroke={C.capStroke} strokeWidth="1.2"
          />
          {/* Cap type label */}
          <text x={cap.cx} y={cap.cy - cap.capH / 2 - 3}
            textAnchor="middle" fontSize="6" fill={C.dim}>
            {cap.type}
          </text>
        </g>
      ))}

      {/* ── Pile symbols ── */}
      {dots.map(dot => {
        const pc    = PC[dot.status]
        const isSel = selectedDot?.pileCode === dot.pileCode
        const isIP  = dot.status === 'in-progress'
        const r     = PILE_R

        return (
          <g key={dot.pileCode} style={{ cursor: 'pointer' }} onClick={() => onSelect(dot)}>
            {/* Selection ring */}
            {isSel && (
              <circle cx={dot.x} cy={dot.y} r={r + 6}
                fill="none" stroke={pc.glow} strokeWidth="1.5" opacity="0.75" />
            )}
            {/* In-progress pulse */}
            {isIP && !isSel && (
              <circle cx={dot.x} cy={dot.y} r={r + 3}
                fill="none" stroke={pc.stroke} strokeWidth="0.8" opacity="0.3">
                <animate attributeName="r" values={`${r+2};${r+8};${r+2}`} dur="2.5s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.4;0;0.4" dur="2.5s" repeatCount="indefinite" />
              </circle>
            )}
            {/* Center cross */}
            <line x1={dot.x - r - 3} y1={dot.y} x2={dot.x + r + 3} y2={dot.y}
              stroke={pc.stroke} strokeWidth={isSel ? 1 : 0.7} />
            <line x1={dot.x} y1={dot.y - r - 3} x2={dot.x} y2={dot.y + r + 3}
              stroke={pc.stroke} strokeWidth={isSel ? 1 : 0.7} />
            {/* Pile circle */}
            <circle cx={dot.x} cy={dot.y} r={r}
              fill={isSel ? pc.stroke + '55' : pc.fill}
              stroke={pc.stroke} strokeWidth={isSel ? 2 : 1.5} />
            {/* Label (only for selected or real data piles) */}
            {(isSel || dot.isReal) && (
              <text x={dot.x} y={dot.y + r + 9}
                textAnchor="middle"
                fontSize={isSel ? 7 : 5.5}
                fontWeight={isSel ? 'bold' : 'normal'}
                fill={isSel ? pc.glow : C.textSub}>
                {dot.pileCode}
              </text>
            )}
          </g>
        )
      })}

      {/* ── Dimension lines ── */}
      {layout.colXs.length >= 2 && (
        <g>
          {/* Horizontal dim (top) */}
          <line
            x1={layout.colXs[0]} y1={layout.bldgY - AX - 12}
            x2={layout.colXs[1]} y2={layout.bldgY - AX - 12}
            stroke={C.dim} strokeWidth="0.8"
            markerEnd={`url(#${arrowE})`} markerStart={`url(#${arrowS})`}
          />
          <line x1={layout.colXs[0]} y1={layout.bldgY - AX - 16} x2={layout.colXs[0]} y2={layout.bldgY - AX - 8}
            stroke={C.dim} strokeWidth="0.8" />
          <line x1={layout.colXs[1]} y1={layout.bldgY - AX - 16} x2={layout.colXs[1]} y2={layout.bldgY - AX - 8}
            stroke={C.dim} strokeWidth="0.8" />
          <text
            x={(layout.colXs[0] + layout.colXs[1]) / 2} y={layout.bldgY - AX - 17}
            textAnchor="middle" fontSize="7.5" fill={C.dim}>
            {realColMm.toLocaleString()} mm (TYP.)
          </text>
        </g>
      )}
      {layout.rowYs.length >= 2 && (
        <g>
          {/* Vertical dim (left) */}
          <line
            x1={layout.bldgX - AX - 12} y1={layout.rowYs[0]}
            x2={layout.bldgX - AX - 12} y2={layout.rowYs[1]}
            stroke={C.dim} strokeWidth="0.8"
            markerEnd={`url(#${arrowE})`} markerStart={`url(#${arrowS})`}
          />
          <line x1={layout.bldgX - AX - 16} y1={layout.rowYs[0]} x2={layout.bldgX - AX - 8} y2={layout.rowYs[0]}
            stroke={C.dim} strokeWidth="0.8" />
          <line x1={layout.bldgX - AX - 16} y1={layout.rowYs[1]} x2={layout.bldgX - AX - 8} y2={layout.rowYs[1]}
            stroke={C.dim} strokeWidth="0.8" />
          <text
            x={layout.bldgX - AX - 22}
            y={(layout.rowYs[0] + layout.rowYs[1]) / 2 + 4}
            textAnchor="middle" fontSize="7.5" fill={C.dim}
            transform={`rotate(-90,${layout.bldgX - AX - 22},${(layout.rowYs[0] + layout.rowYs[1]) / 2})`}>
            {realRowMm.toLocaleString()} mm (TYP.)
          </text>
        </g>
      )}

      {/* ── North arrow ── */}
      <g transform={`translate(${DWG.innerX + DWG.innerW - 48}, ${DWG.pgY + 52})`}>
        <circle r="22" fill="#0a1020" stroke={C.line} strokeWidth="1" />
        <polygon points="0,-16 4,4 0,0 -4,4" fill={C.line} />
        <polygon points="0,16 4,-4 0,0 -4,-4" fill={C.dim} />
        <text y="-19" textAnchor="middle" fontSize="9" fontWeight="bold" fill={C.text}>N</text>
        <circle cx="0" cy="0" r="3" fill={C.line} />
      </g>

      {/* ── Legend ── */}
      <g transform={`translate(${DWG.innerX + DWG.innerW - 48}, ${DWG.pgY + 116})`}>
        <text x="-42" y="-12" fontSize="7" fontWeight="bold" fill={C.dim} letterSpacing="1">CHÚ GIẢI</text>
        {(
          [
            ['completed',   'Hoàn thành'],
            ['in-progress', 'Đang t/c'],
            ['delayed',     'Chậm'],
            ['blocked',     'Bị chặn'],
            ['not-started', 'Chưa thi công'],
          ] as [PileStatus, string][]
        ).map(([s, lbl], li) => (
          <g key={s} transform={`translate(0,${li * 20})`}>
            <circle cx="-32" cy="0" r={PILE_R}
              fill={PC[s].fill} stroke={PC[s].stroke} strokeWidth="1" />
            <line x1={-32 - PILE_R} y1="0" x2={-32 + PILE_R} y2="0"
              stroke={PC[s].stroke} strokeWidth="0.7" />
            <line x1={-32} y1={-PILE_R} x2={-32} y2={PILE_R}
              stroke={PC[s].stroke} strokeWidth="0.7" />
            <text x="-20" y="4" fontSize="7" fill={C.textSub}>{lbl}</text>
          </g>
        ))}
        {/* Pile cap legend */}
        <g transform={`translate(0,115)`}>
          <rect x="-42" y="-10" width="22" height="16"
            fill={`url(#hatch-${uid})`} stroke={C.capStroke} strokeWidth="1" />
          <text x="-14" y="4" fontSize="7" fill={C.textSub}>Đài cọc</text>
        </g>
        <g transform={`translate(0,135)`}>
          <line x1="-42" y1="0" x2="-20" y2="0"
            stroke={C.beam} strokeWidth="5" opacity="0.5" />
          <text x="-14" y="4" fontSize="7" fill={C.textSub}>Dầm móng</text>
        </g>
      </g>

      {/* ── Pile count annotation ── */}
      <text x={DWG.pgX} y={DWG.tbY - 8} fontSize="8" fill={C.textSub}>
        TỔNG SỐ CỌC: {ws.plannedPiles}  ·  XONG: {ws.completedPiles}  ·  TỈ LỆ: {completedPct}%  ·  LƯỚI TRỤC: {layout.ncols}×{layout.nrows}
      </text>
    </svg>
  )
}

/* ─────────────────────────────────────────────────────────
   Pile detail panel
───────────────────────────────────────────────────────── */
function PileDetail({ dot }: { dot: PileDot }) {
  const pc = PC[dot.status]
  return (
    <motion.div
      key={dot.pileCode}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16 }}
      className="flex flex-col gap-2.5"
    >
      {/* Header */}
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: pc.stroke + '22', border: `1px solid ${pc.stroke}44` }}>
          <Wrench className="w-4 h-4" style={{ color: pc.stroke }} />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground leading-tight">{dot.pileCode}</p>
          <p className="text-[10px] text-muted-foreground">
            Ø{dot.diameterMm} mm · sâu {dot.depthM} m · {dot.capId ? `Đài ${dot.capId}` : ''}
          </p>
        </div>
      </div>

      {/* Status */}
      <span className="inline-flex items-center gap-1.5 self-start text-[10px] font-semibold px-2.5 py-1 rounded-full"
        style={{ background: pc.stroke + '22', color: pc.stroke, border: `1px solid ${pc.stroke}44` }}>
        {dot.status === 'completed'   && <CheckCircle2 className="w-3 h-3" />}
        {dot.status === 'in-progress' && <Clock className="w-3 h-3" />}
        {(dot.status === 'delayed' || dot.status === 'blocked') && <AlertTriangle className="w-3 h-3" />}
        {STATUS_LABEL[dot.status]}
      </span>

      {/* Schedule */}
      <div className="bg-[#0a0e15] border border-[#1e2433] rounded-lg p-2.5 flex flex-col gap-1.5">
        <p className="text-[8px] uppercase font-semibold text-muted-foreground tracking-wide flex items-center gap-1">
          <MapPin className="w-2.5 h-2.5" /> Lịch thi công
        </p>
        <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
          <span className="text-[9px] text-muted-foreground/70">Ngày thi công</span>
          <span className="text-[9px] font-semibold text-foreground/90">
            {fmtDate(dot.actualStart ?? dot.plannedStart)}
          </span>
          <span className="text-[9px] text-muted-foreground/70">KH bắt đầu</span>
          <span className="text-[9px] tabular-nums text-foreground/80">{fmtTime(dot.plannedStart)}</span>
          <span className="text-[9px] text-muted-foreground/70">KH kết thúc</span>
          <span className="text-[9px] tabular-nums text-foreground/80">{fmtTime(dot.plannedEnd)}</span>
          {dot.actualStart && <>
            <span className="text-[9px] text-muted-foreground/70">Bắt đầu TT</span>
            <span className="text-[9px] font-semibold text-sky-400 tabular-nums">{fmtTime(dot.actualStart)}</span>
          </>}
          {dot.actualEnd && <>
            <span className="text-[9px] text-muted-foreground/70">Kết thúc TT</span>
            <span className="text-[9px] font-semibold text-sky-400 tabular-nums">{fmtTime(dot.actualEnd)}</span>
          </>}
          {dot.actualDurationH !== undefined && <>
            <span className="text-[9px] text-muted-foreground/70">Thời gian</span>
            <span className="text-[9px] font-semibold text-emerald-400 tabular-nums">{dot.actualDurationH}h</span>
          </>}
          {dot.delayHours !== undefined && <>
            <span className="text-[9px] text-muted-foreground/70">Trễ</span>
            <span className="text-[9px] font-semibold text-amber-400 tabular-nums">{dot.delayHours}h</span>
          </>}
        </div>
      </div>

      {/* Machine */}
      <div className="bg-[#0a0e15] border border-[#1e2433] rounded-lg p-2.5 flex flex-col gap-1.5">
        <p className="text-[8px] uppercase font-semibold text-muted-foreground tracking-wide flex items-center gap-1">
          <Wrench className="w-2.5 h-2.5" /> Thiết bị thi công
        </p>
        {dot.machineCode ? (
          <>
            <p className="text-xs font-bold text-sky-400">{dot.machineCode}</p>
            {dot.machineType && (
              <p className="text-[9px] text-muted-foreground/60 leading-snug">{dot.machineType}</p>
            )}
          </>
        ) : (
          <p className="text-[10px] text-muted-foreground/40 italic">Chưa phân công</p>
        )}
        {dot.fuelUsedLitres !== undefined && (
          <p className="flex items-center gap-1 text-[9px] text-amber-400/70 mt-0.5">
            <Fuel className="w-2.5 h-2.5" /> Nhiên liệu: {dot.fuelUsedLitres} lít
          </p>
        )}
      </div>

      {/* Delay reason */}
      {dot.delayReason ? (
        <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-2.5 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-[8px] uppercase font-semibold text-red-400/60 tracking-wide">Nguyên nhân chậm</p>
            <p className="text-[11px] font-bold text-red-400 mt-0.5">{DELAY_LABELS[dot.delayReason]}</p>
          </div>
        </div>
      ) : dot.status !== 'not-started' ? (
        <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-2 flex items-center gap-2">
          <CheckCircle2 className="w-3 h-3 text-green-400/60" />
          <p className="text-[9px] text-green-400/60">Không có sự cố</p>
        </div>
      ) : null}

      {!dot.isReal && (
        <p className="text-[8px] text-muted-foreground/30 text-center italic mt-1">
          Dữ liệu kế hoạch tổng hợp
        </p>
      )}
    </motion.div>
  )
}

/* ─────────────────────────────────────────────────────────
   Main modal
───────────────────────────────────────────────────────── */
interface Props {
  project:   Project
  worksites: Worksite[]
  onClose:   () => void
}

export function ProjectMapModal({ project, worksites, onClose }: Props) {
  const [activeWsId, setActiveWsId] = useState(worksites[0]?.id ?? '')
  const [selectedDot, setSelectedDot] = useState<PileDot | null>(null)

  const activeWs = useMemo(
    () => worksites.find(w => w.id === activeWsId) ?? worksites[0],
    [activeWsId, worksites],
  )

  const layout = useMemo(
    () => activeWs ? calcBuildingLayout(activeWs.plannedPiles) : calcBuildingLayout(100),
    [activeWs],
  )

  const dots = useMemo(
    () => activeWs ? buildDots(activeWs, layout) : [],
    [activeWs, layout],
  )

  function switchWs(id: string) {
    setActiveWsId(id)
    setSelectedDot(null)
  }

  function dwgNumber(wsId: string) {
    const idx = worksites.findIndex(w => w.id === wsId)
    return `DWG-${project.code.toUpperCase()}-K${idx >= 0 ? idx + 1 : 1}-P001`
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          'fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
          'w-[98vw] max-w-6xl max-h-[95vh]',
          'flex flex-col bg-[#0b0f18] border border-[#1e2433] rounded-xl shadow-2xl overflow-hidden',
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#1e2433] shrink-0">
          <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
            <HardHat className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm text-foreground">{project.name}</span>
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">
              {project.code}
            </span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <MapPin className="w-3 h-3" />{project.region}
            </span>
          </div>

          {/* Worksite tabs */}
          <div className="flex gap-1 shrink-0">
            {worksites.map(ws => {
              const pct = ws.plannedPiles > 0
                ? Math.round(ws.completedPiles / ws.plannedPiles * 100) : 0
              return (
                <button key={ws.id} onClick={() => switchWs(ws.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-colors',
                    activeWsId === ws.id
                      ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent',
                  )}>
                  {ws.code}
                  <span className={cn('text-[9px] font-bold',
                    pct >= 70 ? 'text-green-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400')}>
                    {pct}%
                  </span>
                </button>
              )
            })}
          </div>

          <button onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* CAD drawing */}
          <div className="flex-1 min-w-0 overflow-hidden bg-[#060a10] p-1">
            {activeWs && (
              <CadDrawing
                key={activeWs.id}
                ws={activeWs} dots={dots} layout={layout}
                selectedDot={selectedDot} onSelect={setSelectedDot}
                dwgNo={dwgNumber(activeWs.id)} uid={activeWs.id}
              />
            )}
          </div>

          {/* Detail panel */}
          <div className="w-56 sm:w-64 shrink-0 border-l border-[#1e2433] flex flex-col">
            <div className="px-3 py-2 border-b border-[#1e2433] shrink-0 flex items-center justify-between">
              <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Chi tiết cọc</p>
              {selectedDot && (
                <button onClick={() => setSelectedDot(null)}
                  className="text-[9px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                  Đóng ✕
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {selectedDot ? (
                <PileDetail dot={selectedDot} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3 py-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-[#1e2433] flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
                      <circle cx="12" cy="12" r="6" stroke="#374151" strokeWidth="1.5" />
                      <line x1="6" y1="12" x2="18" y2="12" stroke="#374151" strokeWidth="1" />
                      <line x1="12" y1="6" x2="12" y2="18" stroke="#374151" strokeWidth="1" />
                    </svg>
                  </div>
                  <p className="text-[10px] text-muted-foreground/50 leading-snug">
                    Click vào ký hiệu cọc trên bản vẽ để xem chi tiết
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </>
  )
}
