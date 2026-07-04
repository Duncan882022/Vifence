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
  gridCol: number   // 0-based column index
  gridRow: number   // 0-based row index
  x: number
  y: number
  isReal: boolean
}

/* ─────────────────────────────────────────────────────────
   Drawing constants (viewBox 1200 × 860)
───────────────────────────────────────────────────────── */
const DWG = {
  vw: 1200, vh: 860,
  /* Border frames */
  outerX: 8, outerY: 8, outerW: 1184, outerH: 844,
  innerX: 22, innerY: 22, innerW: 1156, innerH: 812,
  /* Title block (bottom strip) */
  tbY: 776,  tbH: 58,
  /* Pile grid area */
  pgX: 75,  pgY: 60,  pgW: 1105, pgH: 690,
}

/* CAD colours */
const C = {
  bg:       '#06080e',
  paper:    '#080c14',
  line:     '#b0b8cc',
  center:   '#2e6fa8',
  dim:      '#7a8290',
  text:     '#c8ccd4',
  textSub:  '#7a8290',
  bubble:   '#112233',
  bubbleTxt:'#93b4d4',
  tbBg:     '#04060c',
  tbLine:   '#2a3550',
}

/* Pile fill + stroke per status */
const PC: Record<PileStatus, { fill: string; stroke: string; glow: string }> = {
  'completed':   { fill: '#22c55e26', stroke: '#22c55e', glow: '#4ade80' },
  'in-progress': { fill: '#38bdf826', stroke: '#38bdf8', glow: '#7dd3fc' },
  'delayed':     { fill: '#f59e0b26', stroke: '#f59e0b', glow: '#fcd34d' },
  'blocked':     { fill: '#ef444426', stroke: '#ef4444', glow: '#fca5a5' },
  'not-started': { fill: '#1c2638',   stroke: '#2a3a55', glow: '#334155' },
}

/* ─────────────────────────────────────────────────────────
   Grid layout computation
───────────────────────────────────────────────────────── */
function calcGrid(n: number) {
  const ratio = DWG.pgW / DWG.pgH
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * ratio)))
  const rows = Math.ceil(n / cols)
  const colSpacing = DWG.pgW / cols
  const rowSpacing = DWG.pgH / rows
  return { cols, rows, colSpacing, rowSpacing }
}

function dotXY(col: number, row: number, colSpacing: number, rowSpacing: number) {
  return {
    x: DWG.pgX + colSpacing / 2 + col * colSpacing,
    y: DWG.pgY + rowSpacing / 2 + row * rowSpacing,
  }
}

/* ─────────────────────────────────────────────────────────
   Build pile dots for a worksite
───────────────────────────────────────────────────────── */
function buildDots(ws: Worksite): PileDot[] {
  const { cols, rows: _rows, colSpacing, rowSpacing } = calcGrid(ws.plannedPiles)
  const machineMap = Object.fromEntries(MACHINES.map(m => [m.id, m]))
  const real = PILE_ASSIGNMENTS.filter(p => p.worksiteId === ws.id)

  /* tally statuses remaining after real piles */
  let remDone = ws.completedPiles
  let remIP   = ws.inProgressPiles
  let remDly  = ws.delayedPiles
  let remBlk  = ws.blockedPiles
  for (const rp of real) {
    if (rp.status === 'completed')   remDone--
    if (rp.status === 'in-progress') remIP--
    if (rp.status === 'delayed')     remDly--
    if (rp.status === 'blocked')     remBlk--
  }
  remDone = Math.max(0, remDone)
  remIP   = Math.max(0, remIP)
  remDly  = Math.max(0, remDly)
  remBlk  = Math.max(0, remBlk)

  const dots: PileDot[] = []

  for (let i = 0; i < ws.plannedPiles; i++) {
    const gridCol = i % cols
    const gridRow = Math.floor(i / cols)
    const { x, y } = dotXY(gridCol, gridRow, colSpacing, rowSpacing)

    if (i < real.length) {
      const rp = real[i]
      const m = machineMap[rp.machineId]
      dots.push({
        pileCode: rp.pileCode,
        status: rp.status,
        diameterMm: rp.diameterMm,
        depthM: rp.depthM,
        machineCode: m?.code,
        machineType: m?.type,
        delayReason: rp.delayReason,
        plannedStart: rp.plannedStart,
        plannedEnd: rp.plannedEnd,
        actualStart: rp.actualStart,
        actualEnd: rp.actualEnd,
        actualDurationH: rp.actualDurationH,
        delayHours: rp.delayHours > 0 ? rp.delayHours : undefined,
        fuelUsedLitres: rp.fuelUsedLitres,
        gridCol, gridRow, x, y, isReal: true,
      })
    } else {
      let status: PileStatus
      if (remDone > 0)  { status = 'completed';   remDone-- }
      else if (remIP > 0)   { status = 'in-progress'; remIP-- }
      else if (remDly > 0)  { status = 'delayed';     remDly-- }
      else if (remBlk > 0)  { status = 'blocked';     remBlk-- }
      else                  { status = 'not-started' }

      const synIdx = i - real.length + 1
      dots.push({
        pileCode: `${ws.id.toUpperCase()}-${String(synIdx).padStart(3, '0')}`,
        status,
        diameterMm: [800, 800, 900, 1000][i % 4],
        depthM:     [25, 28, 30, 32, 35][i % 5],
        gridCol, gridRow, x, y, isReal: false,
      })
    }
  }
  return dots
}

/* ─────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────── */
function fmtTime(iso?: string) {
  return iso ? iso.slice(11, 16) : '—'
}
function fmtDate(iso?: string) {
  if (!iso) return '—'
  const d = iso.slice(8, 10), mo = iso.slice(5, 7), yr = iso.slice(0, 4)
  return `${d}/${mo}/${yr}`
}
function colLabel(i: number) {
  return String.fromCharCode(65 + i)  // A, B, C, ...
}

/* ─────────────────────────────────────────────────────────
   AutoCAD-style SVG drawing
───────────────────────────────────────────────────────── */
function CadDrawing({
  ws, dots, selectedDot, onSelect,
  dwgNo, uid,
}: {
  ws: Worksite
  dots: PileDot[]
  selectedDot: PileDot | null
  onSelect: (d: PileDot) => void
  dwgNo: string
  uid: string
}) {
  const { cols, rows, colSpacing, rowSpacing } = calcGrid(ws.plannedPiles)
  const arrowEndId = `arrowEnd-${uid}`
  const arrowStartId = `arrowStart-${uid}`
  const completedPct = ws.plannedPiles > 0
    ? Math.round((ws.completedPiles / ws.plannedPiles) * 100)
    : 0

  /* Typical pile spacing label (rounded to nearest 100mm on 3000mm basis) */
  const typSpacingH = Math.round(colSpacing * 200 / 100) * 100   // 1px ≈ 200mm at 1:200
  const typSpacingV = Math.round(rowSpacing * 200 / 100) * 100

  /* Grid lines x positions (through pile column centers) */
  const colXs = Array.from({ length: cols }, (_, c) =>
    DWG.pgX + colSpacing / 2 + c * colSpacing,
  )
  /* Grid lines y positions */
  const rowYs = Array.from({ length: rows }, (_, r) =>
    DWG.pgY + rowSpacing / 2 + r * rowSpacing,
  )

  const pileR = Math.max(5, Math.min(9, Math.min(colSpacing, rowSpacing) * 0.38))

  return (
    <svg
      viewBox={`0 0 ${DWG.vw} ${DWG.vh}`}
      className="w-full h-full"
      style={{ fontFamily: "'Courier New', 'Consolas', monospace" }}
    >
      {/* ── Defs (must come first) ── */}
      <defs>
        <marker id={arrowEndId} markerWidth="6" markerHeight="6"
          refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={C.dim} />
        </marker>
        <marker id={arrowStartId} markerWidth="6" markerHeight="6"
          refX="3" refY="3" orient="auto-start-reverse">
          <path d="M0,0 L6,3 L0,6 Z" fill={C.dim} />
        </marker>
      </defs>

      {/* ── Background ── */}
      <rect width={DWG.vw} height={DWG.vh} fill={C.bg} />
      <rect
        x={DWG.innerX} y={DWG.innerY}
        width={DWG.innerW} height={DWG.innerH}
        fill={C.paper}
      />

      {/* ── Outer frame ── */}
      <rect
        x={DWG.outerX} y={DWG.outerY}
        width={DWG.outerW} height={DWG.outerH}
        fill="none" stroke={C.line} strokeWidth="2.5"
      />
      {/* Inner frame */}
      <rect
        x={DWG.innerX} y={DWG.innerY}
        width={DWG.innerW} height={DWG.innerH}
        fill="none" stroke={C.line} strokeWidth="1"
      />

      {/* ── Title block separator ── */}
      <line
        x1={DWG.innerX} y1={DWG.tbY}
        x2={DWG.innerX + DWG.innerW} y2={DWG.tbY}
        stroke={C.line} strokeWidth="1.5"
      />
      <rect
        x={DWG.innerX} y={DWG.tbY}
        width={DWG.innerW} height={DWG.tbH}
        fill={C.tbBg}
      />

      {/* Title block vertical dividers */}
      {[320, 640, 860, 1000].map(dx => (
        <line key={dx}
          x1={DWG.innerX + dx} y1={DWG.tbY}
          x2={DWG.innerX + dx} y2={DWG.tbY + DWG.tbH}
          stroke={C.tbLine} strokeWidth="0.8"
        />
      ))}
      {/* Title block horizontal mid-line */}
      <line
        x1={DWG.innerX} y1={DWG.tbY + DWG.tbH / 2}
        x2={DWG.innerX + 860} y2={DWG.tbY + DWG.tbH / 2}
        stroke={C.tbLine} strokeWidth="0.6"
      />

      {/* Title block content */}
      {/* Cell 1: Company */}
      <text x={DWG.innerX + 8} y={DWG.tbY + 14} fontSize="8" fill={C.textSub} letterSpacing="1">CÔNG TY</text>
      <text x={DWG.innerX + 8} y={DWG.tbY + 26} fontSize="10" fontWeight="bold" fill={C.text}>VIFENCE CORP.</text>
      <text x={DWG.innerX + 8} y={DWG.tbY + 40} fontSize="8" fill={C.textSub}>Hệ thống giám sát thi công</text>
      <text x={DWG.innerX + 8} y={DWG.tbY + 52} fontSize="8" fill={C.textSub}>vifence.com.vn</text>

      {/* Cell 2: Drawing title */}
      <text x={DWG.innerX + 328} y={DWG.tbY + 14} fontSize="8" fill={C.textSub} letterSpacing="1">TÊN BẢN VẼ</text>
      <text x={DWG.innerX + 328} y={DWG.tbY + 28} fontSize="11" fontWeight="bold" fill={C.text}>BẢN VẼ BỐ TRÍ CỌC NHỒI</text>
      <text x={DWG.innerX + 328} y={DWG.tbY + 42} fontSize="10" fill="#7dd3fc">{ws.name}</text>
      <text x={DWG.innerX + 328} y={DWG.tbY + 56} fontSize="8" fill={C.textSub}>
        {ws.completedPiles}/{ws.plannedPiles} cọc · {completedPct}% hoàn thành
      </text>

      {/* Cell 3: Scale / DWG No */}
      <text x={DWG.innerX + 648} y={DWG.tbY + 14} fontSize="8" fill={C.textSub}>TỈ LỆ</text>
      <text x={DWG.innerX + 648} y={DWG.tbY + 28} fontSize="11" fontWeight="bold" fill={C.text}>1:200</text>
      <text x={DWG.innerX + 648} y={DWG.tbY + 42} fontSize="8" fill={C.textSub}>SỐ BẢN VẼ</text>
      <text x={DWG.innerX + 648} y={DWG.tbY + 56} fontSize="10" fontWeight="bold" fill={C.text}>{dwgNo}</text>

      {/* Cell 4: Date / Rev */}
      <text x={DWG.innerX + 868} y={DWG.tbY + 14} fontSize="8" fill={C.textSub}>NGÀY</text>
      <text x={DWG.innerX + 868} y={DWG.tbY + 27} fontSize="9" fill={C.text}>04/07/2026</text>
      <text x={DWG.innerX + 868} y={DWG.tbY + 43} fontSize="8" fill={C.textSub}>PHIÊN BẢN</text>
      <text x={DWG.innerX + 868} y={DWG.tbY + 56} fontSize="9" fill={C.text}>Rev. A</text>

      {/* Cell 5: Drawn by */}
      <text x={DWG.innerX + 1008} y={DWG.tbY + 14} fontSize="8" fill={C.textSub}>LẬP</text>
      <text x={DWG.innerX + 1008} y={DWG.tbY + 27} fontSize="9" fill={C.text}>Vifence AI</text>
      <text x={DWG.innerX + 1008} y={DWG.tbY + 43} fontSize="8" fill={C.textSub}>KIỂM TRA</text>
      <text x={DWG.innerX + 1008} y={DWG.tbY + 56} fontSize="9" fill={C.text}>PM / CĐT</text>

      {/* ── Structural grid center lines ── */}
      {colXs.map((cx, ci) => (
        <line key={`cl${ci}`}
          x1={cx} y1={DWG.innerY + 2}
          x2={cx} y2={DWG.tbY - 2}
          stroke={C.center} strokeWidth="0.6"
          strokeDasharray="8,4,2,4"
          opacity="0.5"
        />
      ))}
      {rowYs.map((ry, ri) => (
        <line key={`rl${ri}`}
          x1={DWG.innerX + 2} y1={ry}
          x2={DWG.innerX + DWG.innerW - 2} y2={ry}
          stroke={C.center} strokeWidth="0.6"
          strokeDasharray="8,4,2,4"
          opacity="0.5"
        />
      ))}

      {/* ── Column grid bubbles (top) ── */}
      {colXs.map((cx, ci) => (
        <g key={`cb${ci}`}>
          {/* Top bubble */}
          <circle cx={cx} cy={DWG.pgY - 18} r={10}
            fill={C.bubble} stroke={C.center} strokeWidth="0.8" />
          <text x={cx} y={DWG.pgY - 14} textAnchor="middle"
            fontSize="9" fontWeight="bold" fill={C.bubbleTxt}>
            {colLabel(ci)}
          </text>
          {/* Bottom bubble */}
          <circle cx={cx} cy={DWG.tbY - 14} r={10}
            fill={C.bubble} stroke={C.center} strokeWidth="0.8" />
          <text x={cx} y={DWG.tbY - 10} textAnchor="middle"
            fontSize="9" fontWeight="bold" fill={C.bubbleTxt}>
            {colLabel(ci)}
          </text>
        </g>
      ))}

      {/* ── Row grid bubbles (left + right) ── */}
      {rowYs.map((ry, ri) => (
        <g key={`rb${ri}`}>
          {/* Left bubble */}
          <circle cx={DWG.pgX - 22} cy={ry} r={10}
            fill={C.bubble} stroke={C.center} strokeWidth="0.8" />
          <text x={DWG.pgX - 22} y={ry + 4} textAnchor="middle"
            fontSize="9" fontWeight="bold" fill={C.bubbleTxt}>
            {ri + 1}
          </text>
          {/* Right bubble */}
          <circle cx={DWG.innerX + DWG.innerW - 18} cy={ry} r={10}
            fill={C.bubble} stroke={C.center} strokeWidth="0.8" />
          <text x={DWG.innerX + DWG.innerW - 18} y={ry + 4} textAnchor="middle"
            fontSize="9" fontWeight="bold" fill={C.bubbleTxt}>
            {ri + 1}
          </text>
        </g>
      ))}

      {/* ── Dimension lines (top: typical column spacing) ── */}
      {colXs.length >= 2 && (
        <g>
          {/* Horizontal dim line */}
          <line
            x1={colXs[0]} y1={DWG.pgY - 34}
            x2={colXs[1]} y2={DWG.pgY - 34}
            stroke={C.dim} strokeWidth="0.8"
            markerEnd={`url(#${arrowEndId})`} markerStart={`url(#${arrowStartId})`}
          />
          {/* Tick marks */}
          <line x1={colXs[0]} y1={DWG.pgY - 38} x2={colXs[0]} y2={DWG.pgY - 30}
            stroke={C.dim} strokeWidth="0.8" />
          <line x1={colXs[1]} y1={DWG.pgY - 38} x2={colXs[1]} y2={DWG.pgY - 30}
            stroke={C.dim} strokeWidth="0.8" />
          <text
            x={(colXs[0] + colXs[1]) / 2} y={DWG.pgY - 37}
            textAnchor="middle" fontSize="8" fill={C.dim}
          >
            {typSpacingH.toLocaleString()} (TYP.)
          </text>
        </g>
      )}

      {/* ── Vertical dim line (left side) ── */}
      {rowYs.length >= 2 && (
        <g>
          <line
            x1={DWG.pgX - 40} y1={rowYs[0]}
            x2={DWG.pgX - 40} y2={rowYs[1]}
            stroke={C.dim} strokeWidth="0.8"
          />
          <line x1={DWG.pgX - 44} y1={rowYs[0]} x2={DWG.pgX - 36} y2={rowYs[0]}
            stroke={C.dim} strokeWidth="0.8" />
          <line x1={DWG.pgX - 44} y1={rowYs[1]} x2={DWG.pgX - 36} y2={rowYs[1]}
            stroke={C.dim} strokeWidth="0.8" />
          <text
            x={DWG.pgX - 52} y={(rowYs[0] + rowYs[1]) / 2 + 4}
            textAnchor="middle" fontSize="8" fill={C.dim}
            transform={`rotate(-90,${DWG.pgX - 52},${(rowYs[0] + rowYs[1]) / 2})`}
          >
            {typSpacingV.toLocaleString()} (TYP.)
          </text>
        </g>
      )}

      {/* ── North arrow ── */}
      <g transform={`translate(${DWG.innerX + DWG.innerW - 50}, ${DWG.pgY + 50})`}>
        <circle r="22" fill="#0a1020" stroke={C.line} strokeWidth="1" />
        <polygon points="0,-16 4,4 0,0 -4,4" fill={C.line} />
        <polygon points="0,16 4,-4 0,0 -4,-4" fill={C.dim} />
        <text y="-19" textAnchor="middle" fontSize="9" fontWeight="bold" fill={C.text}>N</text>
        <circle cx="0" cy="0" r="3" fill={C.line} />
      </g>

      {/* ── Legend block ── */}
      <g transform={`translate(${DWG.innerX + DWG.innerW - 50}, ${DWG.pgY + 110})`}>
        {(
          [
            ['completed',   'Hoàn thành'],
            ['in-progress', 'Đang t/c'],
            ['delayed',     'Chậm t/độ'],
            ['blocked',     'Bị chặn'],
            ['not-started', 'Chưa bắt đầu'],
          ] as [PileStatus, string][]
        ).map(([s, lbl], li) => (
          <g key={s} transform={`translate(0, ${li * 20})`}>
            <circle cx="-30" cy="0" r={pileR * 0.8}
              fill={PC[s].fill} stroke={PC[s].stroke} strokeWidth="1" />
            <line x1={-30 - pileR} y1="0" x2={-30 + pileR} y2="0"
              stroke={PC[s].stroke} strokeWidth="0.6" />
            <line x1={-30} y1={-pileR} x2={-30} y2={pileR}
              stroke={PC[s].stroke} strokeWidth="0.6" />
            <text x="-16" y="4" fontSize="7" fill={C.textSub}>{lbl}</text>
          </g>
        ))}
        <text x="-44" y="-12" fontSize="7" fontWeight="bold" fill={C.dim} letterSpacing="1">
          CHÚ GIẢI
        </text>
      </g>

      {/* ── Pile symbols ── */}
      {dots.map(dot => {
        const pc = PC[dot.status]
        const isSel = selectedDot?.pileCode === dot.pileCode
        const isIP = dot.status === 'in-progress'
        const r = pileR

        return (
          <g key={dot.pileCode} style={{ cursor: 'pointer' }} onClick={() => onSelect(dot)}>
            {/* Hover / selection ring */}
            {isSel && (
              <circle cx={dot.x} cy={dot.y} r={r + 6}
                fill="none" stroke={pc.glow} strokeWidth="1.5" opacity="0.7" />
            )}
            {/* Animated pulse for in-progress */}
            {isIP && !isSel && (
              <circle cx={dot.x} cy={dot.y} r={r + 3}
                fill="none" stroke={pc.stroke} strokeWidth="0.8" opacity="0.3">
                <animate attributeName="r" values={`${r + 2};${r + 8};${r + 2}`} dur="2.5s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.4;0;0.4" dur="2.5s" repeatCount="indefinite" />
              </circle>
            )}
            {/* Center cross (extends ±4px beyond circle) */}
            <line
              x1={dot.x - r - 4} y1={dot.y}
              x2={dot.x + r + 4} y2={dot.y}
              stroke={pc.stroke} strokeWidth={isSel ? 1 : 0.7}
            />
            <line
              x1={dot.x} y1={dot.y - r - 4}
              x2={dot.x} y2={dot.y + r + 4}
              stroke={pc.stroke} strokeWidth={isSel ? 1 : 0.7}
            />
            {/* Pile circle */}
            <circle
              cx={dot.x} cy={dot.y} r={r}
              fill={isSel ? pc.stroke + '55' : pc.fill}
              stroke={pc.stroke}
              strokeWidth={isSel ? 2 : 1.2}
            />
            {/* Pile code label */}
            {(isSel || dot.isReal) && (
              <text
                x={dot.x} y={dot.y + r + 10}
                textAnchor="middle"
                fontSize={isSel ? 7.5 : 6}
                fontWeight={isSel ? 'bold' : 'normal'}
                fill={isSel ? pc.glow : C.textSub}
              >
                {dot.pileCode}
              </text>
            )}
          </g>
        )
      })}

      {/* ── Pile count annotation ── */}
      <text
        x={DWG.pgX} y={DWG.tbY - 8}
        fontSize="8" fill={C.textSub}
      >
        TỔNG SỐ CỌC: {ws.plannedPiles}  ·  XONG: {ws.completedPiles}  ·  TỈ LỆ: {completedPct}%
      </text>
    </svg>
  )
}

/* ─────────────────────────────────────────────────────────
   Pile detail panel
───────────────────────────────────────────────────────── */
function PileDetail({ dot }: { dot: PileDot }) {
  const pc = PC[dot.status]
  const workDate = fmtDate(dot.actualStart ?? dot.plannedStart)

  return (
    <motion.div
      key={dot.pileCode}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="flex flex-col gap-2.5"
    >
      {/* Header */}
      <div className="flex items-start gap-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: pc.stroke + '22', border: `1px solid ${pc.stroke}44` }}
        >
          <Wrench className="w-4 h-4" style={{ color: pc.stroke }} />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground leading-tight">{dot.pileCode}</p>
          <p className="text-[10px] text-muted-foreground">
            Ø{dot.diameterMm} mm · sâu {dot.depthM} m
          </p>
        </div>
      </div>

      {/* Status */}
      <span
        className="inline-flex items-center gap-1.5 self-start text-[10px] font-semibold px-2.5 py-1 rounded-full"
        style={{ background: pc.stroke + '22', color: pc.stroke, border: `1px solid ${pc.stroke}44` }}
      >
        {dot.status === 'completed'   && <CheckCircle2 className="w-3 h-3" />}
        {dot.status === 'in-progress' && <Clock className="w-3 h-3" />}
        {(dot.status === 'delayed' || dot.status === 'blocked') && <AlertTriangle className="w-3 h-3" />}
        {STATUS_LABEL[dot.status]}
      </span>

      {/* Dates */}
      <div className="bg-[#0a0e15] border border-[#1e2433] rounded-lg p-2.5 flex flex-col gap-1.5">
        <p className="text-[8px] uppercase font-semibold text-muted-foreground tracking-wide flex items-center gap-1">
          <MapPin className="w-2.5 h-2.5" /> Lịch thi công
        </p>
        <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
          <span className="text-[9px] text-muted-foreground/70">Ngày thi công</span>
          <span className="text-[9px] font-semibold text-foreground/90">{workDate}</span>
          <span className="text-[9px] text-muted-foreground/70">KH bắt đầu</span>
          <span className="text-[9px] text-foreground/80 tabular-nums">{fmtTime(dot.plannedStart)}</span>
          <span className="text-[9px] text-muted-foreground/70">KH kết thúc</span>
          <span className="text-[9px] text-foreground/80 tabular-nums">{fmtTime(dot.plannedEnd)}</span>
          {dot.actualStart && (
            <>
              <span className="text-[9px] text-muted-foreground/70">Bắt đầu TT</span>
              <span className="text-[9px] font-semibold text-sky-400 tabular-nums">{fmtTime(dot.actualStart)}</span>
            </>
          )}
          {dot.actualEnd && (
            <>
              <span className="text-[9px] text-muted-foreground/70">Kết thúc TT</span>
              <span className="text-[9px] font-semibold text-sky-400 tabular-nums">{fmtTime(dot.actualEnd)}</span>
            </>
          )}
          {dot.actualDurationH !== undefined && (
            <>
              <span className="text-[9px] text-muted-foreground/70">Thời gian</span>
              <span className="text-[9px] font-semibold text-emerald-400 tabular-nums">
                {dot.actualDurationH}h
              </span>
            </>
          )}
          {dot.delayHours !== undefined && (
            <>
              <span className="text-[9px] text-muted-foreground/70">Trễ</span>
              <span className="text-[9px] font-semibold text-amber-400 tabular-nums">{dot.delayHours}h</span>
            </>
          )}
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
            <Fuel className="w-2.5 h-2.5" />
            Nhiên liệu: {dot.fuelUsedLitres} lít
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
      ) : dot.status !== 'not-started' && (
        <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-2 flex items-center gap-2">
          <CheckCircle2 className="w-3 h-3 text-green-400/60" />
          <p className="text-[9px] text-green-400/60">Không có sự cố</p>
        </div>
      )}

      {!dot.isReal && (
        <p className="text-[8px] text-muted-foreground/30 text-center italic mt-1">
          Dữ liệu tổng hợp · chưa có log thực tế
        </p>
      )}
    </motion.div>
  )
}

/* ─────────────────────────────────────────────────────────
   Main modal
───────────────────────────────────────────────────────── */
interface Props {
  project: Project
  worksites: Worksite[]
  onClose: () => void
}

export function ProjectMapModal({ project, worksites, onClose }: Props) {
  const [activeWsId, setActiveWsId] = useState(worksites[0]?.id ?? '')
  const [selectedDot, setSelectedDot] = useState<PileDot | null>(null)

  const activeWs = useMemo(
    () => worksites.find(w => w.id === activeWsId) ?? worksites[0],
    [activeWsId, worksites],
  )

  const dots = useMemo(() => activeWs ? buildDots(activeWs) : [], [activeWs])

  /* reset selection when switching worksite */
  function switchWs(id: string) {
    setActiveWsId(id)
    setSelectedDot(null)
  }

  function dwgNumber(wsId: string) {
    const code = project.code.toUpperCase()
    const wsIdx = worksites.findIndex(w => w.id === wsId)
    return `DWG-${code}-K${wsIdx >= 0 ? wsIdx + 1 : 1}-P001`
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
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
        {/* ── Header ── */}
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
            {worksites.map((ws) => {
              const pct = ws.plannedPiles > 0
                ? Math.round((ws.completedPiles / ws.plannedPiles) * 100) : 0
              return (
                <button
                  key={ws.id}
                  onClick={() => switchWs(ws.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-colors',
                    activeWsId === ws.id
                      ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent',
                  )}
                >
                  {ws.code}
                  <span className={cn(
                    'text-[9px] font-bold',
                    pct >= 70 ? 'text-green-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400',
                  )}>
                    {pct}%
                  </span>
                </button>
              )
            })}
          </div>

          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 min-h-0">
          {/* CAD drawing */}
          <div className="flex-1 min-w-0 overflow-hidden bg-[#060a10] p-1">
            {activeWs && (
              <CadDrawing
                key={activeWs.id}
                ws={activeWs}
                dots={dots}
                selectedDot={selectedDot}
                onSelect={setSelectedDot}
                dwgNo={dwgNumber(activeWs.id)}
                uid={activeWs.id}
              />
            )}
          </div>

          {/* Detail panel */}
          <div className="w-56 sm:w-64 shrink-0 border-l border-[#1e2433] flex flex-col">
            <div className="px-3 py-2 border-b border-[#1e2433] shrink-0 flex items-center justify-between">
              <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">
                Chi tiết cọc
              </p>
              {selectedDot && (
                <button
                  onClick={() => setSelectedDot(null)}
                  className="text-[9px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                >
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
                    Click vào ký hiệu cọc trên bản vẽ để xem thông tin chi tiết
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
