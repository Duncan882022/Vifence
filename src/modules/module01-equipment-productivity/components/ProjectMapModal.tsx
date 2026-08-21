import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, AlertTriangle, HardHat,
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
  'blocked':     'Đình trệ',
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
  delayReason?: DelayReason
  plannedStart?: string
  plannedEnd?: string
  actualStart?: string
  actualEnd?: string
  actualDurationH?: number
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
  tbY: 796,   tbH: 28,
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
/* ─────────────────────────────────────────────────────────
   Pile mock helpers
───────────────────────────────────────────────────────── */
const PILE_DIAMETERS = [800, 800, 900, 1000] as const
const PILE_DEPTHS = [24, 26, 28, 30, 32, 35, 38] as const
const MOCK_DAY = '2026-07-06'

function pileCodeFor(ws: Worksite, index: number): string {
  const [proj, khu] = ws.id.split('-')
  return `${proj.toUpperCase()}-K${khu}-${String(index + 1).padStart(3, '0')}`
}

function pileIso(h: number, m = 0): string {
  return `${MOCK_DAY}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

function drillMachinesFor(ws: Worksite) {
  return MACHINES.filter(
    m => m.worksiteId === ws.id && /^(SANY|XCMG|BAUER)-/.test(m.code),
  )
}

function delayReasonFor(ws: Worksite, index: number): DelayReason {
  const r = ws.materialReadiness
  const pool: DelayReason[] = []
  if (r.bentonitePct < 70) pool.push('lack-bentonite')
  if (r.concretePct < 75) pool.push('lack-concrete')
  if (r.steelCagePct < 75) pool.push('lack-steel-cage')
  if (r.laborPct < 75) pool.push('lack-worker')
  if (pool.length === 0) pool.push('site-not-ready', 'weather')
  return pool[index % pool.length]
}

function synthPilePlan(ws: Worksite, index: number, status: PileStatus) {
  const diameterMm = PILE_DIAMETERS[index % PILE_DIAMETERS.length]
  const depthM = PILE_DEPTHS[(index * 3 + ws.plannedPiles) % PILE_DEPTHS.length]
  const durationH = Math.round((2.2 + (diameterMm / 800) * 1.8) * 10) / 10
  const shiftStart = 6 + Math.floor(index / 3) * 4
  const plannedStart = pileIso(shiftStart, (index % 3) * 15)
  const endH = shiftStart + Math.floor(durationH)
  const endM = Math.round((durationH % 1) * 60)
  const plannedEnd = pileIso(endH, endM)

  const drills = drillMachinesFor(ws)
  const machine = drills[index % Math.max(drills.length, 1)]

  if (status === 'not-started') {
    return { diameterMm, depthM, plannedStart, plannedEnd, machineCode: machine?.code }
  }

  const actualStart = plannedStart
  if (status === 'completed') {
    const actualEnd = plannedEnd
    return {
      diameterMm, depthM, plannedStart, plannedEnd, actualStart, actualEnd,
      actualDurationH: durationH, machineCode: machine?.code,
    }
  }
  if (status === 'in-progress') {
    return {
      diameterMm, depthM, plannedStart, plannedEnd, actualStart,
      machineCode: machine?.code,
    }
  }
  return {
    diameterMm, depthM, plannedStart, plannedEnd, actualStart,
    machineCode: machine?.code,
    delayReason: status === 'blocked' ? 'machine-breakdown' as DelayReason : delayReasonFor(ws, index),
  }
}

function buildDots(ws: Worksite, layout: BuildingLayout): PileDot[] {
  const real = PILE_ASSIGNMENTS
    .filter(p => p.worksiteId === ws.id)
    .sort((a, b) => a.pileCode.localeCompare(b.pileCode, 'vi'))
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
        machineCode: m?.code,
        delayReason: rp.delayReason,
        plannedStart: rp.plannedStart, plannedEnd: rp.plannedEnd,
        actualStart: rp.actualStart, actualEnd: rp.actualEnd,
        actualDurationH: rp.actualDurationH,
        x: pos.x, y: pos.y, isReal: true,
      })
    } else {
      let status: PileStatus
      if      (remDone > 0) { status = 'completed';   remDone-- }
      else if (remIP   > 0) { status = 'in-progress'; remIP-- }
      else if (remDly  > 0) { status = 'delayed';     remDly-- }
      else if (remBlk  > 0) { status = 'blocked';     remBlk-- }
      else                  { status = 'not-started' }

      const plan = synthPilePlan(ws, i, status)
      dots.push({
        pileCode: pileCodeFor(ws, i),
        capId: pos.capId, status,
        ...plan,
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

  const AX = 30
  const BUBBLE_OFFSET = 44
  const PILE_R = 4

  return (
    <svg
      viewBox={`0 0 ${DWG.vw} ${DWG.vh}`}
      width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', fontFamily: "'Courier New', Consolas, monospace" }}
    >
      {/* ── Defs first ── */}
      <defs>
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

      {/* ── Title strip (gọn) ── */}
      <line x1={DWG.innerX} y1={DWG.tbY} x2={DWG.innerX + DWG.innerW} y2={DWG.tbY}
        stroke={C.line} strokeWidth="1" />
      <rect x={DWG.innerX} y={DWG.tbY} width={DWG.innerW} height={DWG.tbH} fill={C.tbBg} />
      <text x={DWG.innerX + 12} y={DWG.tbY + 18} fontSize="9" fill={C.text}>
        {ws.code} · 1:100 · {ws.completedPiles}/{ws.plannedPiles} cọc ({completedPct}%)
      </text>
      <text x={DWG.innerX + DWG.innerW - 12} y={DWG.tbY + 18} textAnchor="end" fontSize="8" fill={C.textSub}>
        {dwgNo}
      </text>

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
            {/* Label — chỉ cọc đang chọn */}
            {isSel && (
              <text x={dot.x} y={dot.y + r + 9}
                textAnchor="middle" fontSize="7" fontWeight="bold" fill={pc.glow}>
                {dot.pileCode}
              </text>
            )}
          </g>
        )
      })}

    </svg>
  )
}

function buildScheduleLine(dot: PileDot): string {
  const khStart = fmtTime(dot.plannedStart)
  const khEnd = fmtTime(dot.plannedEnd)

  if (dot.status === 'not-started') {
    return `KH ${khStart}–${khEnd}`
  }
  if (dot.status === 'in-progress') {
    return dot.actualStart
      ? `Bắt đầu ${fmtTime(dot.actualStart)} · KH xong ${khEnd}`
      : `KH ${khStart}–${khEnd}`
  }
  if (dot.actualStart && dot.actualEnd) {
    const dur = dot.actualDurationH !== undefined ? ` · ${dot.actualDurationH}h` : ''
    return `${fmtTime(dot.actualStart)}–${fmtTime(dot.actualEnd)}${dur}`
  }
  return `KH ${khStart}–${khEnd}`
}

/* ─────────────────────────────────────────────────────────
   Pile detail panel
───────────────────────────────────────────────────────── */
function PileDetail({ dot }: { dot: PileDot }) {
  const pc = PC[dot.status]
  const showDelay = (dot.status === 'delayed' || dot.status === 'blocked') && Boolean(dot.delayReason)
  const showMachine = Boolean(dot.machineCode) && dot.status !== 'not-started'

  return (
    <motion.div
      key={dot.pileCode}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14 }}
      className="rounded-lg border border-[#1e2433] bg-[#060b14] overflow-hidden"
    >
      <div
        className="h-0.5"
        style={{ background: pc.stroke }}
      />
      <div className="px-3 py-2.5 space-y-2">
        <div>
          <p className="text-xs font-bold text-foreground leading-tight">{dot.pileCode}</p>
          <p className="text-[9px] font-semibold mt-1 flex items-center gap-1.5" style={{ color: pc.stroke }}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: pc.stroke }} />
            {STATUS_LABEL[dot.status]}
          </p>
        </div>

        <p className="text-[10px] text-muted-foreground/75 tabular-nums">
          Ø{dot.diameterMm} mm · sâu {dot.depthM} m
        </p>

        {showMachine && (
          <p className="text-[10px] text-muted-foreground">
            Máy <span className="text-sky-400 font-semibold">{dot.machineCode}</span>
          </p>
        )}

        <p className="text-[10px] tabular-nums text-foreground/85 leading-snug">
          {buildScheduleLine(dot)}
        </p>

        {showDelay && (
          <p className="text-[10px] text-red-400 font-medium flex items-start gap-1.5 leading-snug">
            <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
            {DELAY_LABELS[dot.delayReason!]}
          </p>
        )}

        {dot.isReal && (
          <p className="text-[8px] text-primary/50">Log thi công thực tế</p>
        )}
      </div>
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

  return createPortal(
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[9998] bg-black/80 backdrop-blur-sm"
      />

      {/* Modal wrapper — flex centering avoids framer-motion overriding CSS translate */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
      <motion.div
        key="modal"
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          'pointer-events-auto',
          'w-full max-w-6xl h-[88vh]',
          'flex flex-col bg-[#0b0f18] border border-[#1e2433] rounded-xl shadow-2xl overflow-hidden',
        )}
      >
        {/* ── Header ── */}
        <div className="shrink-0 border-b border-[#1e2433] px-4 py-2 flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0 shrink">
            <HardHat className="w-3.5 h-3.5 text-violet-400 shrink-0" />
            <span className="font-bold text-sm text-foreground truncate">{project.name}</span>
          </div>

          <div className="flex gap-1 overflow-x-auto flex-nowrap flex-1 min-w-0">
            {worksites.map(ws => {
              const pct = ws.plannedPiles > 0
                ? Math.round(ws.completedPiles / ws.plannedPiles * 100) : 0
              return (
                <button key={ws.id} onClick={() => switchWs(ws.id)}
                  className={cn(
                    'flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors shrink-0',
                    activeWsId === ws.id
                      ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent',
                  )}>
                  {ws.code.replace(/ Khu /, '-K')}
                  <span className={cn('text-[9px] tabular-nums',
                    pct >= 70 ? 'text-green-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400')}>
                    {pct}%
                  </span>
                </button>
              )
            })}
          </div>

          <div className="hidden sm:flex items-center gap-2 shrink-0">
            {(
              [
                ['completed', 'Xong'],
                ['in-progress', 'TC'],
                ['delayed', 'Chậm'],
                ['blocked', 'Trệ'],
                ['not-started', 'Chưa'],
              ] as [PileStatus, string][]
            ).map(([s, lbl]) => (
              <span key={s} className="flex items-center gap-1 text-[8px] text-muted-foreground/60" title={STATUS_LABEL[s]}>
                <span className="w-2 h-2 rounded-full" style={{ background: PC[s].stroke }} />
                {lbl}
              </span>
            ))}
          </div>

          <button
            onClick={onClose}
            className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* CAD drawing — relative wrapper so SVG fills exactly */}
          <div className="relative flex-1 min-w-0 overflow-hidden bg-[#060a10]">
            {activeWs && (
              <div className="absolute inset-0 p-1">
                <CadDrawing
                  key={activeWs.id}
                  ws={activeWs} dots={dots} layout={layout}
                  selectedDot={selectedDot} onSelect={setSelectedDot}
                  dwgNo={dwgNumber(activeWs.id)} uid={activeWs.id}
                />
              </div>
            )}
          </div>

          {/* Detail panel */}
          <div className="w-48 sm:w-52 shrink-0 border-l border-[#1e2433] flex flex-col min-h-0 bg-[#0b0f18]">
            <div className="px-3 py-2 border-b border-[#1e2433] shrink-0 flex items-center justify-between">
              <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Chi tiết cọc</p>
              {selectedDot && (
                <button type="button" onClick={() => setSelectedDot(null)}
                  className="text-[9px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                  ✕
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {selectedDot ? (
                <PileDetail dot={selectedDot} />
              ) : (
                <p className="text-[10px] text-muted-foreground/45 text-center pt-8 px-2 leading-relaxed">
                  Chọn cọc trên bản vẽ
                </p>
              )}
            </div>
          </div>
        </div>
      </motion.div>
      </div>
    </AnimatePresence>,
    document.body,
  )
}
