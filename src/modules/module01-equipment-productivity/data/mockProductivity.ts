import type {
  Project, Worksite, Machine, PileAssignment, AiAlert,
  MachineStatus, DispatchStatus,
} from '../types'

/* ── Seeded RNG ── */
let _seed = 20260701
function seededRandom(): number {
  _seed = (_seed * 1664525 + 1013904223) % 4294967296
  return _seed / 4294967296
}
function rand(min: number, max: number, decimals = 0): number {
  const v = seededRandom() * (max - min) + min
  return decimals > 0 ? Math.round(v * 10 ** decimals) / 10 ** decimals : Math.round(v)
}
function pickFrom<T>(arr: T[]): T {
  return arr[Math.floor(seededRandom() * arr.length)]
}

/* ═══════════════════════════════════════════════
   PROJECTS
═══════════════════════════════════════════════ */
export const PROJECTS: Project[] = [
  {
    id: 'ocp1', code: 'OCP1', name: 'OCP1 (Hà Long Xanh)', region: 'Quảng Ninh',
    plannedOutputM: 48000, actualOutputM: 31250,
    startDate: '2026-01-10', endDate: '2026-12-31',
  },
  {
    id: 'hnx', code: 'HNX', name: 'Hạ Long Xanh', region: 'Quảng Ninh',
    plannedOutputM: 36000, actualOutputM: 28640,
    startDate: '2026-02-01', endDate: '2026-11-30',
  },
  {
    id: 'cg', code: 'CG', name: 'Cần Giờ', region: 'TP. Hồ Chí Minh',
    plannedOutputM: 28000, actualOutputM: 12660,
    startDate: '2026-03-15', endDate: '2027-03-14',
  },
  {
    id: 'hvb', code: 'HVB', name: 'Hải Vân Bay', region: 'Đà Nẵng',
    plannedOutputM: 42000, actualOutputM: 38100,
    startDate: '2026-01-05', endDate: '2026-10-31',
  },
  {
    id: 'va', code: 'VA', name: 'Điện gió Vũng Áng', region: 'Hà Tĩnh',
    plannedOutputM: 22000, actualOutputM: 17920,
    startDate: '2026-04-01', endDate: '2027-01-31',
  },
  {
    id: 'olp', code: 'OLP', name: 'Làng Olympic', region: 'Hà Nội',
    plannedOutputM: 31000, actualOutputM: 22180,
    startDate: '2026-02-20', endDate: '2026-12-20',
  },
]

/* ═══════════════════════════════════════════════
   WORKSITES  (2 per project)
═══════════════════════════════════════════════ */
export const WORKSITES: Worksite[] = [
  // OCP1
  {
    id: 'ocp1-1', projectId: 'ocp1', code: 'OCP1-Khu 1', name: 'OCP1 Khu 1',
    plannedPiles: 120, completedPiles: 78, inProgressPiles: 12, delayedPiles: 8, blockedPiles: 2,
    materialReadiness: { laborPct: 92, cementPct: 88, bentonitePct: 85, steelCagePct: 90, concretePct: 87 },
  },
  {
    id: 'ocp1-2', projectId: 'ocp1', code: 'OCP1-Khu 2', name: 'OCP1 Khu 2',
    plannedPiles: 95, completedPiles: 52, inProgressPiles: 10, delayedPiles: 14, blockedPiles: 3,
    materialReadiness: { laborPct: 80, cementPct: 75, bentonitePct: 72, steelCagePct: 82, concretePct: 78 },
  },
  // HNX
  {
    id: 'hnx-1', projectId: 'hnx', code: 'HNX-Khu 1', name: 'Hạ Long Xanh Khu 1',
    plannedPiles: 88, completedPiles: 62, inProgressPiles: 8, delayedPiles: 5, blockedPiles: 1,
    materialReadiness: { laborPct: 95, cementPct: 92, bentonitePct: 90, steelCagePct: 94, concretePct: 91 },
  },
  {
    id: 'hnx-2', projectId: 'hnx', code: 'HNX-Khu 2', name: 'Hạ Long Xanh Khu 2',
    plannedPiles: 76, completedPiles: 44, inProgressPiles: 9, delayedPiles: 10, blockedPiles: 4,
    materialReadiness: { laborPct: 78, cementPct: 70, bentonitePct: 68, steelCagePct: 75, concretePct: 72 },
  },
  // CG
  {
    id: 'cg-1', projectId: 'cg', code: 'CG-Khu 1', name: 'Cần Giờ Khu 1',
    plannedPiles: 110, completedPiles: 38, inProgressPiles: 6, delayedPiles: 44, blockedPiles: 8,
    materialReadiness: { laborPct: 65, cementPct: 60, bentonitePct: 58, steelCagePct: 63, concretePct: 61 },
  },
  {
    id: 'cg-2', projectId: 'cg', code: 'CG-Khu 2', name: 'Cần Giờ Khu 2',
    plannedPiles: 85, completedPiles: 30, inProgressPiles: 4, delayedPiles: 28, blockedPiles: 6,
    materialReadiness: { laborPct: 70, cementPct: 66, bentonitePct: 63, steelCagePct: 68, concretePct: 65 },
  },
  // HVB
  {
    id: 'hvb-1', projectId: 'hvb', code: 'HVB-Khu 1', name: 'Hải Vân Bay Khu 1',
    plannedPiles: 130, completedPiles: 108, inProgressPiles: 14, delayedPiles: 4, blockedPiles: 0,
    materialReadiness: { laborPct: 98, cementPct: 96, bentonitePct: 95, steelCagePct: 97, concretePct: 96 },
  },
  {
    id: 'hvb-2', projectId: 'hvb', code: 'HVB-Khu 2', name: 'Hải Vân Bay Khu 2',
    plannedPiles: 100, completedPiles: 82, inProgressPiles: 10, delayedPiles: 5, blockedPiles: 1,
    materialReadiness: { laborPct: 90, cementPct: 88, bentonitePct: 86, steelCagePct: 89, concretePct: 87 },
  },
  // VA
  {
    id: 'va-1', projectId: 'va', code: 'VA-Khu 1', name: 'Vũng Áng Khu 1',
    plannedPiles: 72, completedPiles: 48, inProgressPiles: 6, delayedPiles: 10, blockedPiles: 2,
    materialReadiness: { laborPct: 82, cementPct: 80, bentonitePct: 77, steelCagePct: 83, concretePct: 79 },
  },
  {
    id: 'va-2', projectId: 'va', code: 'VA-Khu 2', name: 'Vũng Áng Khu 2',
    plannedPiles: 65, completedPiles: 40, inProgressPiles: 5, delayedPiles: 14, blockedPiles: 3,
    materialReadiness: { laborPct: 74, cementPct: 72, bentonitePct: 70, steelCagePct: 76, concretePct: 71 },
  },
  // OLP
  {
    id: 'olp-1', projectId: 'olp', code: 'OLP-Khu 1', name: 'Làng Olympic Khu 1',
    plannedPiles: 90, completedPiles: 64, inProgressPiles: 8, delayedPiles: 7, blockedPiles: 1,
    materialReadiness: { laborPct: 88, cementPct: 86, bentonitePct: 84, steelCagePct: 87, concretePct: 85 },
  },
  {
    id: 'olp-2', projectId: 'olp', code: 'OLP-Khu 2', name: 'Làng Olympic Khu 2',
    plannedPiles: 80, completedPiles: 50, inProgressPiles: 7, delayedPiles: 12, blockedPiles: 4,
    materialReadiness: { laborPct: 79, cementPct: 76, bentonitePct: 74, steelCagePct: 80, concretePct: 75 },
  },
]

/* ═══════════════════════════════════════════════
   MACHINES  (50 total)
═══════════════════════════════════════════════ */

const TYPE_MAP: Record<string, string> = {
  SANY: 'Máy ép cọc SANY SR285R',
  XCMG: 'Máy ép cọc XCMG XG500E',
  CCX:  'Cần trục bánh xích SCC800',
  PC3:  'Máy đào PC300',
  D9T:  'Máy ủi D9T',
  TRK:  'Xe tải 20T',
}

const WORKSITES_BY_PROJECT: Record<string, string[]> = {
  ocp1: ['ocp1-1', 'ocp1-2'],
  hnx:  ['hnx-1',  'hnx-2'],
  cg:   ['cg-1',   'cg-2'],
  hvb:  ['hvb-1',  'hvb-2'],
  va:   ['va-1',   'va-2'],
  olp:  ['olp-1',  'olp-2'],
}

const PROJECT_IDS = ['ocp1', 'hnx', 'cg', 'hvb', 'va', 'olp']

/**
 * STATUS distribution designed to match Module 2 fleet:
 * 16-slot pool → 62.5% working, 18.75% idle, 6.25% breakdown, 12.5% stored
 * 1000 machines → ~625 working, ~187 idle, ~63 breakdown, ~125 stored
 */
const STATUS_POOL: MachineStatus[] = [
  'working', 'working', 'working', 'working', 'working',
  'working', 'working', 'working', 'working', 'working',  // 10
  'idle', 'idle', 'idle',                                  // 3
  'breakdown',                                              // 1
  'stored', 'stored',                                       // 2
]
const DISPATCH_POOL: DispatchStatus[] = [
  'on-time', 'on-time', 'on-time', 'on-time',
  'delayed', 'delayed',
  'pending',
]

interface MachineSpec {
  code: string
  prefix: string
  projectId: string
  worksiteId: string
  status: MachineStatus
}

/**
 * 1000 machines total — same fleet size as Module 2 (Equipment Reliability)
 * Distribution: SANY 600 / XCMG 160 / CCX 80 / PC3 80 / D9T 40 / TRK 40
 */
function buildSpecs(): MachineSpec[] {
  const specs: MachineSpec[] = []
  const groups: { prefix: string; count: number }[] = [
    { prefix: 'SANY', count: 600 },
    { prefix: 'XCMG', count: 160 },
    { prefix: 'CCX',  count: 80  },
    { prefix: 'PC3',  count: 80  },
    { prefix: 'D9T',  count: 40  },
    { prefix: 'TRK',  count: 40  },
  ]
  let idx = 0
  for (const g of groups) {
    for (let i = 0; i < g.count; i++) {
      const code = `${g.prefix}-${String(i + 1).padStart(3, '0')}`
      const projId = PROJECT_IDS[idx % PROJECT_IDS.length]
      const wsArr = WORKSITES_BY_PROJECT[projId]
      const wsId = wsArr[i % wsArr.length]
      specs.push({ code, prefix: g.prefix, projectId: projId, worksiteId: wsId, status: pickFrom(STATUS_POOL) })
      idx++
    }
  }
  return specs
}

const SPECS = buildSpecs()

/**
 * All hour values represent TODAY's working hours (max 12h shift).
 * Utilization = workingHours / 12h (shift capacity) × 100
 *
 * Fuel waste formula (transparent):
 *   wasteVnd = max(0, fuelActual − fuelBaseline) × workingHours × fuelCostVndPerLitre
 * This is "excess fuel cost today" per machine.
 */
function makeMachine(spec: MachineSpec, index: number): Machine {
  const isEps = spec.prefix === 'SANY' || spec.prefix === 'XCMG'
  const SHIFT_H = 12  // full shift capacity

  let workingH: number, idleH: number, downtimeH: number
  switch (spec.status) {
    case 'stored':
      workingH = 0; idleH = 0; downtimeH = 0
      break
    case 'breakdown':
      workingH = 0; idleH = rand(0, 2); downtimeH = rand(6, 12)
      break
    case 'idle':
      workingH = rand(0, 2); idleH = rand(5, 9); downtimeH = 0
      break
    default: // working
      workingH = rand(7, 11); idleH = rand(0, 2); downtimeH = rand(0, 1)
  }

  // utilization = % of shift capacity actually working
  const util = Math.round((workingH / SHIFT_H) * 100)

  const outputPerHour = isEps
    ? rand(18, 34, 1)
    : spec.prefix === 'CCX' ? rand(8, 15, 1) : rand(3, 10, 1)
  const plannedOutput = Math.round(outputPerHour * 8)
  const actualOutput = spec.status === 'working'
    ? Math.round(plannedOutput * (rand(75, 108) / 100))
    : Math.round(plannedOutput * (rand(20, 50) / 100))

  const fuelBase = isEps ? rand(18, 24, 1) : rand(10, 18, 1)
  // variance: mostly near-baseline, ~10% machines exceed, ~10% save
  const varianceBias = index % 10 === 0 ? rand(1, 3, 1)     // over baseline
    : index % 10 === 1  ? -rand(1, 2, 1)   // under baseline (saving)
    : rand(-1, 1, 1)                         // near baseline
  const fuelActual = Math.round((fuelBase + varianceBias) * 10) / 10
  const fuelCost = rand(22000, 28000)

  return {
    id: `m-${index}`,
    code: spec.code,
    type: TYPE_MAP[spec.prefix] ?? 'Thiết bị thi công',
    projectId: spec.projectId,
    worksiteId: spec.worksiteId,
    status: spec.status,
    workingHours: workingH,
    idleHours: idleH,
    downtimeHours: downtimeH,
    utilizationPct: util,
    outputPerHour,
    plannedOutputToday: plannedOutput,
    actualOutputToday: actualOutput,
    fuelLitresPerHour: fuelActual,
    fuelBaselineLitresPerHour: fuelBase,
    fuelCostVndPerLitre: fuelCost,
    dispatchStatus: pickFrom(DISPATCH_POOL),
  }
}

export const MACHINES: Machine[] = SPECS.map((s, i) => makeMachine(s, i))

/* ── Pin story machines ── */
const sany021 = MACHINES.find(m => m.code === 'SANY-021')
if (sany021) {
  sany021.projectId = 'cg'
  sany021.worksiteId = 'cg-1'
  sany021.status = 'idle'
  sany021.idleHours = 23
  sany021.workingHours = 8
  sany021.downtimeHours = 0
  sany021.utilizationPct = 26
  sany021.plannedOutputToday = 216
  sany021.actualOutputToday = 56
  sany021.dispatchStatus = 'delayed'
}

const xcmg007 = MACHINES.find(m => m.code === 'XCMG-007')
if (xcmg007) {
  xcmg007.fuelLitresPerHour = 24.8
  xcmg007.fuelBaselineLitresPerHour = 22.8
  xcmg007.status = 'breakdown'
  xcmg007.dispatchStatus = 'delayed'
}

const sany030 = MACHINES.find(m => m.code === 'SANY-030')
if (sany030) {
  sany030.projectId = 'hvb'
  sany030.worksiteId = 'hvb-1'
  sany030.outputPerHour = 42.3
  sany030.utilizationPct = 94
  sany030.status = 'working'
  sany030.dispatchStatus = 'on-time'
  sany030.plannedOutputToday = 280
  sany030.actualOutputToday = 338
}

/* ═══════════════════════════════════════════════
   PILE ASSIGNMENTS  (20 for today)
═══════════════════════════════════════════════ */

const TODAY = '2026-07-04'

function makeIso(h: number, m = 0): string {
  return `${TODAY}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

export const PILE_ASSIGNMENTS: PileAssignment[] = [
  // SANY-001 — completed
  {
    id: 'p-001', pileCode: 'P-001', machineId: 'm-0', worksiteId: 'ocp1-1',
    diameterMm: 800, depthM: 28, plannedStart: makeIso(6), plannedEnd: makeIso(9, 30),
    plannedDurationH: 3.5, actualStart: makeIso(6, 5), actualEnd: makeIso(9, 20),
    actualDurationH: 3.25, status: 'completed', delayHours: 0, fuelUsedLitres: 64,
  },
  // SANY-002 — in-progress
  {
    id: 'p-002', pileCode: 'P-002', machineId: 'm-1', worksiteId: 'ocp1-1',
    diameterMm: 800, depthM: 30, plannedStart: makeIso(7), plannedEnd: makeIso(11),
    plannedDurationH: 4.0, actualStart: makeIso(7, 10),
    status: 'in-progress', delayHours: 0, fuelUsedLitres: 48,
  },
  // SANY-003 — completed
  {
    id: 'p-003', pileCode: 'P-003', machineId: 'm-2', worksiteId: 'ocp1-2',
    diameterMm: 1000, depthM: 35, plannedStart: makeIso(6), plannedEnd: makeIso(10, 30),
    plannedDurationH: 4.5, actualStart: makeIso(6), actualEnd: makeIso(10, 45),
    actualDurationH: 4.75, status: 'completed', delayHours: 0.25, fuelUsedLitres: 88,
  },
  // SANY-004 — delayed
  {
    id: 'p-004', pileCode: 'P-004', machineId: 'm-3', worksiteId: 'ocp1-2',
    diameterMm: 800, depthM: 25, plannedStart: makeIso(6), plannedEnd: makeIso(9),
    plannedDurationH: 3.0, actualStart: makeIso(8, 30),
    status: 'delayed', delayHours: 2.5, delayReason: 'lack-worker', fuelUsedLitres: 22,
  },
  // HNX machines — completed
  {
    id: 'p-005', pileCode: 'P-005', machineId: 'm-6', worksiteId: 'hnx-1',
    diameterMm: 900, depthM: 32, plannedStart: makeIso(6), plannedEnd: makeIso(10),
    plannedDurationH: 4.0, actualStart: makeIso(6, 2), actualEnd: makeIso(9, 50),
    actualDurationH: 3.8, status: 'completed', delayHours: 0, fuelUsedLitres: 72,
  },
  {
    id: 'p-006', pileCode: 'P-006', machineId: 'm-7', worksiteId: 'hnx-1',
    diameterMm: 900, depthM: 28, plannedStart: makeIso(7), plannedEnd: makeIso(10, 30),
    plannedDurationH: 3.5, actualStart: makeIso(7), actualEnd: makeIso(10, 40),
    actualDurationH: 3.67, status: 'completed', delayHours: 0, fuelUsedLitres: 66,
  },
  // CG — SANY-021 delayed (key story)
  {
    id: 'p-083', pileCode: 'P-083', machineId: 'm-20', worksiteId: 'cg-1',
    diameterMm: 800, depthM: 26, plannedStart: makeIso(6), plannedEnd: makeIso(9, 30),
    plannedDurationH: 3.5, actualStart: makeIso(8, 30),
    status: 'delayed', delayHours: 2.5, delayReason: 'lack-bentonite', fuelUsedLitres: 12,
  },
  // CG — XCMG-007 blocked (key story)
  {
    id: 'p-084', pileCode: 'P-084', machineId: 'm-30', worksiteId: 'cg-1',
    diameterMm: 1000, depthM: 38, plannedStart: makeIso(6), plannedEnd: makeIso(11),
    plannedDurationH: 5.0,
    status: 'blocked', delayHours: 5.0, delayReason: 'machine-breakdown',
  },
  // HVB — SANY-030 star performer
  {
    id: 'p-120', pileCode: 'P-120', machineId: 'm-29', worksiteId: 'hvb-1',
    diameterMm: 800, depthM: 24, plannedStart: makeIso(6), plannedEnd: makeIso(8, 30),
    plannedDurationH: 2.5, actualStart: makeIso(6), actualEnd: makeIso(8, 5),
    actualDurationH: 2.08, status: 'completed', delayHours: 0, fuelUsedLitres: 38,
  },
  {
    id: 'p-121', pileCode: 'P-121', machineId: 'm-29', worksiteId: 'hvb-1',
    diameterMm: 800, depthM: 24, plannedStart: makeIso(8, 30), plannedEnd: makeIso(11),
    plannedDurationH: 2.5, actualStart: makeIso(8, 10), actualEnd: makeIso(10, 15),
    actualDurationH: 2.08, status: 'completed', delayHours: 0, fuelUsedLitres: 36,
  },
  // HVB more
  {
    id: 'p-122', pileCode: 'P-122', machineId: 'm-33', worksiteId: 'hvb-1',
    diameterMm: 1000, depthM: 36, plannedStart: makeIso(6), plannedEnd: makeIso(10, 30),
    plannedDurationH: 4.5, actualStart: makeIso(6, 5), actualEnd: makeIso(10, 25),
    actualDurationH: 4.33, status: 'completed', delayHours: 0, fuelUsedLitres: 82,
  },
  // VA
  {
    id: 'p-200', pileCode: 'P-200', machineId: 'm-36', worksiteId: 'va-1',
    diameterMm: 900, depthM: 30, plannedStart: makeIso(6), plannedEnd: makeIso(10),
    plannedDurationH: 4.0, actualStart: makeIso(7, 15),
    status: 'delayed', delayHours: 1.25, delayReason: 'site-not-ready', fuelUsedLitres: 30,
  },
  {
    id: 'p-201', pileCode: 'P-201', machineId: 'm-37', worksiteId: 'va-2',
    diameterMm: 800, depthM: 28, plannedStart: makeIso(6), plannedEnd: makeIso(9, 30),
    plannedDurationH: 3.5,
    status: 'not-started', delayHours: 0, delayReason: 'inspection-waiting',
  },
  // OLP
  {
    id: 'p-300', pileCode: 'P-300', machineId: 'm-42', worksiteId: 'olp-1',
    diameterMm: 800, depthM: 25, plannedStart: makeIso(6), plannedEnd: makeIso(9),
    plannedDurationH: 3.0, actualStart: makeIso(6), actualEnd: makeIso(9, 10),
    actualDurationH: 3.17, status: 'completed', delayHours: 0, fuelUsedLitres: 58,
  },
  {
    id: 'p-301', pileCode: 'P-301', machineId: 'm-43', worksiteId: 'olp-1',
    diameterMm: 900, depthM: 32, plannedStart: makeIso(7), plannedEnd: makeIso(11),
    plannedDurationH: 4.0, actualStart: makeIso(7, 5),
    status: 'in-progress', delayHours: 0, fuelUsedLitres: 55,
  },
  {
    id: 'p-302', pileCode: 'P-302', machineId: 'm-44', worksiteId: 'olp-2',
    diameterMm: 800, depthM: 22, plannedStart: makeIso(6), plannedEnd: makeIso(8, 30),
    plannedDurationH: 2.5, actualStart: makeIso(6, 0), actualEnd: makeIso(8, 40),
    actualDurationH: 2.67, status: 'completed', delayHours: 0.17, fuelUsedLitres: 46,
  },
  {
    id: 'p-303', pileCode: 'P-303', machineId: 'm-45', worksiteId: 'olp-2',
    diameterMm: 1000, depthM: 40, plannedStart: makeIso(6), plannedEnd: makeIso(12),
    plannedDurationH: 6.0, actualStart: makeIso(8, 0),
    status: 'delayed', delayHours: 2.0, delayReason: 'lack-steel-cage', fuelUsedLitres: 40,
  },
  // More completed to fill
  {
    id: 'p-007', pileCode: 'P-007', machineId: 'm-8', worksiteId: 'hnx-2',
    diameterMm: 800, depthM: 28, plannedStart: makeIso(6), plannedEnd: makeIso(9, 30),
    plannedDurationH: 3.5, actualStart: makeIso(6), actualEnd: makeIso(9, 30),
    actualDurationH: 3.5, status: 'completed', delayHours: 0, fuelUsedLitres: 62,
  },
  {
    id: 'p-008', pileCode: 'P-008', machineId: 'm-9', worksiteId: 'hnx-2',
    diameterMm: 800, depthM: 24, plannedStart: makeIso(9, 30), plannedEnd: makeIso(12, 30),
    plannedDurationH: 3.0, actualStart: makeIso(9, 30),
    status: 'in-progress', delayHours: 0, fuelUsedLitres: 44,
  },
  {
    id: 'p-009', pileCode: 'P-009', machineId: 'm-10', worksiteId: 'cg-2',
    diameterMm: 900, depthM: 30, plannedStart: makeIso(6), plannedEnd: makeIso(10),
    plannedDurationH: 4.0,
    status: 'blocked', delayHours: 4.0, delayReason: 'lack-concrete',
  },
]

/* pin story pile ids */
const p083 = PILE_ASSIGNMENTS.find(p => p.id === 'p-083')
const p084 = PILE_ASSIGNMENTS.find(p => p.id === 'p-084')
if (sany021 && p083) sany021.currentPileId = p083.id
if (xcmg007 && p084) xcmg007.currentPileId = p084.id

/* ═══════════════════════════════════════════════
   AI ALERTS
═══════════════════════════════════════════════ */
export const AI_ALERTS: AiAlert[] = [
  {
    id: 'ai-001',
    severity: 'critical',
    category: 'machine',
    subject: 'SANY-021',
    title: 'Máy nhàn rỗi 23h liên tục tại Cần Giờ',
    summary: 'Đề xuất điều chuyển sang Hải Vân Bay để tối ưu khai thác đội máy',
    reasoning: 'SANY-021 đang ở trạng thái chờ việc trong 23 giờ liên tục tại CG-Khu 1. Dựa trên dữ liệu lịch thi công và khối lượng cọc còn lại, AI nhận định máy này không có kế hoạch sử dụng trong 72 giờ tới do thiếu bentonite và nhân công tại khu vực. Trong khi đó, dự án Hải Vân Bay đang thiếu 1 máy ép cọc SANY tương đương, ảnh hưởng trực tiếp đến tiến độ giai đoạn 2.',
    evidence: [
      { label: 'Giờ nhàn rỗi (hôm nay)', actual: '23h', expected: '≤ 4h' },
      { label: 'Utilization hiện tại', actual: '26%', expected: '≥ 75%' },
      { label: 'Nhu cầu Hải Vân Bay', actual: '+1 máy thiếu', expected: 'Đủ từ 28/06' },
      { label: 'Bentonite CG-Khu 1', actual: '58%', expected: '≥ 80%' },
    ],
    recommendations: [
      'Lên kế hoạch vận chuyển SANY-021 từ CG-Khu 1 → HVB-Khu 2 trong vòng 24h tới.',
      'Phối hợp điều phối viên dự án xác nhận slot cọc tại Hải Vân Bay.',
      'Cập nhật lịch thi công Cần Giờ để tránh thiếu hụt nếu khối lượng tăng đột biến.',
      'Theo dõi utilization sau khi chuyển, mục tiêu ≥ 80% trong 7 ngày đầu.',
    ],
    benefit: 'Tăng utilization fleet từ 72% → 78%. Đẩy nhanh tiến độ HVB giai đoạn 2 khoảng 3–4 ngày.',
    costSavingEstimate: '~42 triệu VND/tháng từ tăng năng suất và giảm chi phí chờ máy.',
    createdAt: '2026-07-04T07:15:00',
    read: false,
  },
  {
    id: 'ai-002',
    severity: 'high',
    category: 'fuel',
    subject: 'XCMG-007',
    title: 'Tiêu hao nhiên liệu vượt ngưỡng +8.5% so với định mức',
    summary: 'Mức tiêu thụ 24.8 lít/h cao hơn baseline 22.8 lít/h — cần kiểm tra injector',
    reasoning: 'XCMG-007 ghi nhận mức tiêu thụ 24.8 lít/h trong 7 ngày liên tiếp, vượt định mức 22.8 lít/h (+8.5%). Bất thường này không tương quan với tải trọng thi công — AI phát hiện pattern tiêu thụ cao kể cả khi máy chạy không tải. Nguyên nhân khả năng cao là vấn đề phun dầu (injector) hoặc rò rỉ hệ thống dẫn nhiên liệu.',
    evidence: [
      { label: 'Tiêu thụ thực tế', actual: '24.8 lít/h', expected: '22.8 lít/h' },
      { label: 'Fuel Variance', actual: '+8.5%', expected: '≤ 3%' },
      { label: 'Chi phí NL/ngày', actual: '4.960.000 VND', expected: '4.560.000 VND' },
      { label: 'Thời gian kéo dài', actual: '7 ngày', expected: '≤ 1 ngày' },
    ],
    recommendations: [
      'Dừng máy để kiểm tra tổng thể hệ thống nhiên liệu trong vòng 4h tới.',
      'Ưu tiên kiểm tra injector, seal cao su dẫn dầu và bộ lọc nhiên liệu.',
      'Đo lại mức tiêu thụ sau sửa chữa để xác nhận hiệu quả.',
      'Ghi nhận vào lịch sử bảo dưỡng để theo dõi xu hướng dài hạn.',
    ],
    benefit: 'Giảm tiêu hao về mức chuẩn 22.8 lít/h. Loại bỏ nguy cơ cháy nổ từ rò rỉ dầu.',
    costSavingEstimate: '~28 triệu VND/tháng nếu tiêu thụ về mức định mức.',
    createdAt: '2026-07-04T08:30:00',
    read: false,
  },
  {
    id: 'ai-003',
    severity: 'high',
    category: 'material',
    subject: 'CG-Khu 1',
    title: '40% cọc bị chậm — Bentonite chỉ đạt 58%',
    summary: 'Tình trạng thiếu bentonite đang ảnh hưởng nghiêm trọng đến tiến độ thi công Cần Giờ',
    reasoning: 'CG-Khu 1 đang có 44/110 cọc ở trạng thái trễ (40%), cao gấp đôi ngưỡng cho phép. AI phát hiện mức độ sẵn sàng bentonite chỉ đạt 58%, thấp nhất trong tất cả các công trường. Pattern trễ tập trung vào các cọc đường kính lớn (≥1000mm) — những cọc đòi hỏi lượng bentonite cao nhất. Nếu không bổ sung trong 24h, nguy cơ toàn bộ hoạt động bị đình chỉ.',
    evidence: [
      { label: 'Cọc chậm / tổng', actual: '44/110 (40%)', expected: '≤ 10%' },
      { label: 'Bentonite sẵn sàng', actual: '58%', expected: '≥ 80%' },
      { label: 'Máy đang chờ việc', actual: '3 máy', expected: '0 máy' },
      { label: 'Tác động tiến độ', actual: '-8 ngày ước tính', expected: '0' },
    ],
    recommendations: [
      'Đặt hàng khẩn cấp bentonite cho CG-Khu 1, mục tiêu giao trong 12h.',
      'Ưu tiên cọc nhỏ (<800mm) để duy trì nhịp thi công trong khi chờ vật liệu.',
      'Điều chuyển tạm 1 máy sang CG-Khu 2 để cân bằng tiến độ.',
      'Cập nhật báo cáo tiến độ hàng ngày cho PMC/CĐT.',
    ],
    benefit: 'Giảm cọc chậm từ 40% về <15%. Phục hồi nhịp thi công trong 3–5 ngày.',
    costSavingEstimate: '~65 triệu VND từ tránh phạt chậm tiến độ hợp đồng.',
    createdAt: '2026-07-04T06:45:00',
    read: false,
  },
  {
    id: 'ai-004',
    severity: 'medium',
    category: 'dispatch',
    subject: 'VA-Khu 2',
    title: 'Hiệu quả điều phối giảm 15% so với tháng trước',
    summary: 'On-time dispatch tại Vũng Áng giảm từ 85% xuống 70.2% trong 2 tuần qua',
    reasoning: 'VA-Khu 2 ghi nhận dispatch efficiency giảm liên tục từ ngày 17/06. Phân tích log cho thấy thời gian chờ xác nhận từ Site Manager tăng trung bình 2.3h/dispatch. Vào cao điểm gió ban đêm, các dispatch quan trọng thường bị trì hoãn do thiếu xác nhận real-time. Điều này dẫn đến mất 15% sản lượng ca đêm.',
    evidence: [
      { label: 'On-time dispatch hiện tại', actual: '70.2%', expected: '85%' },
      { label: 'Thời gian chờ xác nhận', actual: '3.8h', expected: '≤ 1.5h' },
      { label: 'Dispatch bị hủy/shift', actual: '12%', expected: '≤ 3%' },
      { label: 'Ảnh hưởng sản lượng', actual: '-15%', expected: '0' },
    ],
    recommendations: [
      'Cấu hình thông báo tự động khi có dispatch chờ xác nhận > 30 phút.',
      'Phân quyền xác nhận dispatch khẩn cấp cho Phó quản lý công trường.',
      'Họp review quy trình dispatch với đội Vũng Áng vào cuối tuần.',
    ],
    benefit: 'Khôi phục on-time dispatch về 85%+. Tăng sản lượng ca đêm 10–12%.',
    costSavingEstimate: '~35 triệu VND/tháng từ loại bỏ tổn thất do dispatch trễ.',
    createdAt: '2026-07-04T09:00:00',
    read: true,
  },
  {
    id: 'ai-005',
    severity: 'medium',
    category: 'machine',
    subject: 'SANY-030',
    title: 'Năng suất vượt trội — Mô hình điển hình cần nhân rộng',
    summary: 'SANY-030 đạt 42.3 m/giờ, vượt 65% so với TB đội máy — đề xuất chuẩn hóa quy trình',
    reasoning: 'SANY-030 tại HVB-Khu 1 đạt năng suất 42.3 m cọc/giờ trong 14 ngày liên tục, utilization 94%. AI phân tích pattern: ca đêm được tận dụng tối đa, thời gian setup cọc giảm 35% nhờ quy trình chuẩn hóa. Đây là mô hình vận hành xuất sắc có thể áp dụng cho toàn fleet SANY.',
    evidence: [
      { label: 'Năng suất SANY-030', actual: '42.3 m/h', expected: '25.6 m/h (TB)' },
      { label: 'Utilization', actual: '94%', expected: '78% (TB fleet)' },
      { label: 'Thời gian setup/cọc', actual: '3.2 phút', expected: '4.9 phút (TB)' },
      { label: 'Ca đêm được dùng', actual: '100%', expected: '64%' },
    ],
    recommendations: [
      'Document quy trình vận hành của tổ máy SANY-030 thành SOP chuẩn.',
      'Tổ chức buổi chia sẻ kỹ thuật với các đội máy SANY-001 → SANY-015.',
      'Thử nghiệm áp dụng tại 3 máy pilot trong tuần tới.',
      'Theo dõi KPI 30 ngày trước khi nhân rộng toàn fleet.',
    ],
    benefit: 'Nếu nhân rộng ra 10 máy SANY, sản lượng fleet tăng ước tính 18–22%.',
    costSavingEstimate: '~185 triệu VND/tháng từ tăng doanh thu sản lượng cọc.',
    createdAt: '2026-07-04T10:20:00',
    read: true,
  },
]

/* ═══════════════════════════════════════════════
   HELPER FUNCTIONS
═══════════════════════════════════════════════ */
export function getMachinesByWorksite(worksiteId: string): Machine[] {
  return MACHINES.filter(m => m.worksiteId === worksiteId)
}

export function getMachinesByProject(projectId: string): Machine[] {
  return MACHINES.filter(m => m.projectId === projectId)
}

export function getWorksitesByProject(projectId: string): Worksite[] {
  return WORKSITES.filter(w => w.projectId === projectId)
}

export function getPilesByMachine(machineId: string): PileAssignment[] {
  return PILE_ASSIGNMENTS.filter(p => p.machineId === machineId)
}

export function getProjectById(id: string): Project | undefined {
  return PROJECTS.find(p => p.id === id)
}

export function getWorksiteById(id: string): Worksite | undefined {
  return WORKSITES.find(w => w.id === id)
}
