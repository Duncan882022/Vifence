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
    id: 'ocp1', code: 'OCP1', name: 'OCP1', region: 'Quảng Ninh',
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
    plannedOutputM: 42000, actualOutputM: 46200,
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
  // HVB — vượt kế hoạch
  {
    id: 'hvb-1', projectId: 'hvb', code: 'HVB-Khu 1', name: 'Hải Vân Bay Khu 1',
    plannedPiles: 130, completedPiles: 144, inProgressPiles: 8, delayedPiles: 0, blockedPiles: 0,
    materialReadiness: { laborPct: 99, cementPct: 98, bentonitePct: 97, steelCagePct: 99, concretePct: 98 },
  },
  {
    id: 'hvb-2', projectId: 'hvb', code: 'HVB-Khu 2', name: 'Hải Vân Bay Khu 2',
    plannedPiles: 100, completedPiles: 107, inProgressPiles: 6, delayedPiles: 0, blockedPiles: 0,
    materialReadiness: { laborPct: 96, cementPct: 94, bentonitePct: 93, steelCagePct: 96, concretePct: 95 },
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
    plannedPiles: 90, completedPiles: 93, inProgressPiles: 5, delayedPiles: 0, blockedPiles: 0,
    materialReadiness: { laborPct: 94, cementPct: 92, bentonitePct: 91, steelCagePct: 93, concretePct: 92 },
  },
  {
    id: 'olp-2', projectId: 'olp', code: 'OLP-Khu 2', name: 'Làng Olympic Khu 2',
    plannedPiles: 80, completedPiles: 50, inProgressPiles: 7, delayedPiles: 12, blockedPiles: 4,
    materialReadiness: { laborPct: 79, cementPct: 76, bentonitePct: 74, steelCagePct: 80, concretePct: 75 },
  },
]

/* ═══════════════════════════════════════════════
   MACHINES  (100 total — diverse fleet)
═══════════════════════════════════════════════ */

const OPERATOR_NAMES: string[] = [
  'Nguyễn Văn Hùng', 'Trần Minh Tuấn', 'Lê Quốc Bảo', 'Phạm Văn Đức',
  'Hoàng Anh Tuấn', 'Vũ Đình Mạnh', 'Đặng Văn Long', 'Bùi Tiến Thành',
  'Đinh Văn Kiên', 'Ngô Đức Hải', 'Cao Xuân Lâm', 'Lý Văn Phúc',
  'Trịnh Quang Sơn', 'Dương Hữu Nghĩa', 'Phan Văn Tài', 'Võ Thành Trung',
  'Lưu Đức Thắng', 'Tô Văn Minh', 'Chu Đình Khoa', 'Hà Văn Dũng',
]

const WORKSITES_BY_PROJECT: Record<string, string[]> = {
  ocp1: ['ocp1-1', 'ocp1-2'],
  hnx:  ['hnx-1',  'hnx-2'],
  cg:   ['cg-1',   'cg-2'],
  hvb:  ['hvb-1',  'hvb-2'],
  va:   ['va-1',   'va-2'],
  olp:  ['olp-1',  'olp-2'],
}

/**
 * Status pool: 60% working / 20% idle / 10% breakdown / 10% stored
 * Covers planned_idle as idle — no new status types needed.
 */
const STATUS_POOL: MachineStatus[] = [
  'working', 'working', 'working', 'working', 'working', 'working',  // 6
  'idle', 'idle',                                                      // 2
  'breakdown',                                                          // 1
  'stored',                                                             // 1
]
const DISPATCH_POOL: DispatchStatus[] = [
  'on-time', 'on-time', 'on-time', 'on-time',
  'delayed', 'delayed',
  'pending',
]

interface MachineSpec {
  code: string
  prefix: string
  type: string
  projectId: string
  worksiteId: string
  status: MachineStatus
}

function getMachineCategory(prefix: string): 'drilling' | 'piledriver' | 'excavator' | 'pump' | 'roller' {
  if (prefix === 'SANY' || prefix === 'BAUER' || prefix === 'XCMG') return 'drilling'
  if (prefix === 'SWDM' || prefix === 'PM26') return 'piledriver'
  if (prefix === 'PC3' || prefix === 'ZX3' || prefix === 'C336') return 'excavator'
  if (prefix === 'S34S' || prefix === 'BSF3') return 'pump'
  return 'roller'  // BW21, CA25
}

/**
 * 100 machines total across 6 projects:
 *   OCP1 25 | HNX 20 | CG 20 | HVB 15 | VA 12 | OLP 8
 *
 * Fleet composition:
 *   Drilling (SANY SR285R/SR235C, BAUER BG28, XCMG XR280D):  40
 *   Excavator (Komatsu PC300, Hitachi ZX350, CAT 336):        20
 *   Pile driver (Sunward SWDM22, Junttan PM26):               15
 *   Concrete pump (Schwing S34SX, Putzmeister BSF36):         15
 *   Roller / compactor (Bomag BW213, Dynapac CA250):          10
 */
function buildSpecs(): MachineSpec[] {
  const specs: MachineSpec[] = []

  const groups: { prefix: string; type: string; count: number }[] = [
    { prefix: 'SANY',  type: 'Máy khoan cọc nhồi SANY SR285R',          count: 15 },
    { prefix: 'SANY',  type: 'Máy khoan cọc nhồi SANY SR235C',          count: 15 },
    { prefix: 'BAUER', type: 'Máy khoan cọc nhồi BAUER BG28',           count: 3  },
    { prefix: 'XCMG',  type: 'Máy khoan cọc nhồi XCMG XR280D',          count: 7  },
    { prefix: 'PC3',   type: 'Máy đào Komatsu PC300',                    count: 7  },
    { prefix: 'ZX3',   type: 'Máy đào Hitachi ZX350',                    count: 7  },
    { prefix: 'C336',  type: 'Máy đào CAT 336',                          count: 6  },
    { prefix: 'SWDM',  type: 'Máy ép cọc Sunward SWDM22',                count: 8  },
    { prefix: 'PM26',  type: 'Máy ép cọc Junttan PM26',                  count: 7  },
    { prefix: 'S34S',  type: 'Máy bơm bê tông Schwing S34SX',            count: 8  },
    { prefix: 'BSF3',  type: 'Máy bơm bê tông Putzmeister BSF36',        count: 7  },
    { prefix: 'BW21',  type: 'Máy lu Bomag BW213',                        count: 5  },
    { prefix: 'CA25',  type: 'Máy đầm Dynapac CA250',                    count: 5  },
  ]
  // Total: 15+15+3+7+7+7+6+8+7+8+7+5+5 = 100 ✓

  // Build a flat project+worksite queue: 25 OCP1 | 20 HNX | 20 CG | 15 HVB | 12 VA | 8 OLP
  const projectAlloc = [
    { projectId: 'ocp1', count: 25 },
    { projectId: 'hnx',  count: 20 },
    { projectId: 'cg',   count: 20 },
    { projectId: 'hvb',  count: 15 },
    { projectId: 'va',   count: 12 },
    { projectId: 'olp',  count: 8  },
  ]
  const queue: { projectId: string; worksiteId: string }[] = []
  for (const { projectId, count } of projectAlloc) {
    const wsArr = WORKSITES_BY_PROJECT[projectId]
    for (let i = 0; i < count; i++) {
      queue.push({ projectId, worksiteId: wsArr[i % wsArr.length] })
    }
  }

  const prefixCounters: Record<string, number> = {}
  let globalIdx = 0

  for (const g of groups) {
    const startNum = (prefixCounters[g.prefix] ?? 0) + 1
    for (let i = 0; i < g.count; i++) {
      const code = `${g.prefix}-${String(startNum + i).padStart(3, '0')}`
      const { projectId, worksiteId } = queue[globalIdx]
      specs.push({ code, prefix: g.prefix, type: g.type, projectId, worksiteId, status: pickFrom(STATUS_POOL) })
      globalIdx++
    }
    prefixCounters[g.prefix] = (prefixCounters[g.prefix] ?? 0) + g.count
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
  const category = getMachineCategory(spec.prefix)
  const SHIFT_H = 12

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

  const util = Math.round((workingH / SHIFT_H) * 100)

  const outputPerHour =
    category === 'drilling'   ? rand(18, 34, 1) :
    category === 'piledriver' ? rand(12, 25, 1) :
    category === 'excavator'  ? rand(35, 80, 1) :
    category === 'pump'       ? rand(30, 55, 1) :
    rand(5, 12, 1)  // roller

  const plannedOutput = Math.round(outputPerHour * 8)
  let actualOutput = spec.status === 'working'
    ? Math.round(plannedOutput * (rand(75, 108) / 100))
    : Math.round(plannedOutput * (rand(20, 50) / 100))

  const fuelBase =
    category === 'drilling'   ? rand(18, 28, 1) :
    category === 'piledriver' ? rand(15, 22, 1) :
    category === 'excavator'  ? rand(12, 20, 1) :
    category === 'pump'       ? rand(6, 12, 1) :
    rand(5, 10, 1)  // roller

  const varianceBias = index % 10 === 0 ? rand(1, 3, 1)
    : index % 10 === 1  ? -rand(1, 2, 1)
    : rand(-1, 1, 1)
  const fuelActual = Math.round((fuelBase + varianceBias) * 10) / 10
  if (index % 10 === 1 && spec.status === 'working') {
    actualOutput = Math.round(plannedOutput * (rand(100, 110) / 100))
  }
  const fuelCost = rand(22000, 28000)

  return {
    id: `m-${index}`,
    code: spec.code,
    type: spec.type,
    operator: OPERATOR_NAMES[index % OPERATOR_NAMES.length],
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

const TODAY = '2026-07-06'

function makeIso(h: number, m = 0): string {
  return `${TODAY}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

export const PILE_ASSIGNMENTS: PileAssignment[] = [
  // ── OCP1 – Khu 1 ─────────────────────────────────────
  {
    id: 'p-001', pileCode: 'OCP1-K1-001', machineId: 'm-0', worksiteId: 'ocp1-1',
    diameterMm: 800, depthM: 28, plannedStart: makeIso(6), plannedEnd: makeIso(9, 30),
    plannedDurationH: 3.5, actualStart: makeIso(6, 5), actualEnd: makeIso(9, 20),
    actualDurationH: 3.25, status: 'completed', delayHours: 0, fuelUsedLitres: 64,
  },
  {
    id: 'p-002', pileCode: 'OCP1-K1-002', machineId: 'm-1', worksiteId: 'ocp1-1',
    diameterMm: 800, depthM: 30, plannedStart: makeIso(7), plannedEnd: makeIso(11),
    plannedDurationH: 4.0, actualStart: makeIso(7, 10),
    status: 'in-progress', delayHours: 0, fuelUsedLitres: 48,
  },
  // ── OCP1 – Khu 2 ─────────────────────────────────────
  {
    id: 'p-003', pileCode: 'OCP1-K2-001', machineId: 'm-2', worksiteId: 'ocp1-2',
    diameterMm: 1000, depthM: 35, plannedStart: makeIso(6), plannedEnd: makeIso(10, 30),
    plannedDurationH: 4.5, actualStart: makeIso(6), actualEnd: makeIso(10, 45),
    actualDurationH: 4.75, status: 'completed', delayHours: 0.25, fuelUsedLitres: 88,
  },
  {
    id: 'p-004', pileCode: 'OCP1-K2-002', machineId: 'm-3', worksiteId: 'ocp1-2',
    diameterMm: 800, depthM: 25, plannedStart: makeIso(6), plannedEnd: makeIso(9),
    plannedDurationH: 3.0, actualStart: makeIso(8, 30),
    status: 'delayed', delayHours: 2.5, delayReason: 'lack-worker', fuelUsedLitres: 22,
  },
  // ── HNX – Khu 1 ──────────────────────────────────────
  {
    id: 'p-005', pileCode: 'HNX-K1-001', machineId: 'm-6', worksiteId: 'hnx-1',
    diameterMm: 900, depthM: 32, plannedStart: makeIso(6), plannedEnd: makeIso(10),
    plannedDurationH: 4.0, actualStart: makeIso(6, 2), actualEnd: makeIso(9, 50),
    actualDurationH: 3.8, status: 'completed', delayHours: 0, fuelUsedLitres: 72,
  },
  // Scheduled for afternoon shift — not yet started
  {
    id: 'p-006', pileCode: 'HNX-K1-002', machineId: 'm-7', worksiteId: 'hnx-1',
    diameterMm: 900, depthM: 28, plannedStart: makeIso(13), plannedEnd: makeIso(16, 30),
    plannedDurationH: 3.5,
    status: 'not-started', delayHours: 0,
  },
  // ── CG – Khu 1 (key story: bentonite shortage) ────────
  {
    id: 'p-083', pileCode: 'CG-K1-001', machineId: 'm-20', worksiteId: 'cg-1',
    diameterMm: 800, depthM: 26, plannedStart: makeIso(6), plannedEnd: makeIso(9, 30),
    plannedDurationH: 3.5, actualStart: makeIso(8, 30),
    status: 'delayed', delayHours: 2.5, delayReason: 'lack-bentonite', fuelUsedLitres: 12,
  },
  {
    id: 'p-084', pileCode: 'CG-K1-002', machineId: 'm-30', worksiteId: 'cg-1',
    diameterMm: 1000, depthM: 38, plannedStart: makeIso(6), plannedEnd: makeIso(11),
    plannedDurationH: 5.0,
    status: 'blocked', delayHours: 5.0, delayReason: 'machine-breakdown',
  },
  // ── HVB – Khu 1 (key story: SANY-030 star performer) ─
  {
    id: 'p-120', pileCode: 'HVB-K1-001', machineId: 'm-29', worksiteId: 'hvb-1',
    diameterMm: 800, depthM: 24, plannedStart: makeIso(6), plannedEnd: makeIso(8, 30),
    plannedDurationH: 2.5, actualStart: makeIso(6), actualEnd: makeIso(8, 5),
    actualDurationH: 2.08, status: 'completed', delayHours: 0, fuelUsedLitres: 38,
  },
  {
    id: 'p-121', pileCode: 'HVB-K1-002', machineId: 'm-29', worksiteId: 'hvb-1',
    diameterMm: 800, depthM: 24, plannedStart: makeIso(8, 30), plannedEnd: makeIso(11),
    plannedDurationH: 2.5, actualStart: makeIso(8, 10), actualEnd: makeIso(10, 15),
    actualDurationH: 2.08, status: 'completed', delayHours: 0, fuelUsedLitres: 36,
  },
  // Third pile — started after SANY-030 finished, now in-progress with different machine
  {
    id: 'p-122', pileCode: 'HVB-K1-003', machineId: 'm-33', worksiteId: 'hvb-1',
    diameterMm: 1000, depthM: 36, plannedStart: makeIso(11), plannedEnd: makeIso(15, 30),
    plannedDurationH: 4.5, actualStart: makeIso(11, 10),
    status: 'in-progress', delayHours: 0, fuelUsedLitres: 28,
  },
  // ── VA – Khu 1 ────────────────────────────────────────
  // Afternoon slot — site prep still underway
  {
    id: 'p-200', pileCode: 'VA-K1-001', machineId: 'm-36', worksiteId: 'va-1',
    diameterMm: 900, depthM: 30, plannedStart: makeIso(13), plannedEnd: makeIso(17),
    plannedDurationH: 4.0,
    status: 'not-started', delayHours: 0,
  },
  // ── VA – Khu 2 ────────────────────────────────────────
  {
    id: 'p-201', pileCode: 'VA-K2-001', machineId: 'm-37', worksiteId: 'va-2',
    diameterMm: 800, depthM: 28, plannedStart: makeIso(6), plannedEnd: makeIso(9, 30),
    plannedDurationH: 3.5,
    status: 'not-started', delayHours: 0,
  },
  // ── OLP – Khu 1 ──────────────────────────────────────
  {
    id: 'p-300', pileCode: 'OLP-K1-001', machineId: 'm-42', worksiteId: 'olp-1',
    diameterMm: 800, depthM: 25, plannedStart: makeIso(6), plannedEnd: makeIso(9),
    plannedDurationH: 3.0, actualStart: makeIso(6), actualEnd: makeIso(9, 10),
    actualDurationH: 3.17, status: 'completed', delayHours: 0, fuelUsedLitres: 58,
  },
  {
    id: 'p-301', pileCode: 'OLP-K1-002', machineId: 'm-43', worksiteId: 'olp-1',
    diameterMm: 900, depthM: 32, plannedStart: makeIso(7), plannedEnd: makeIso(11),
    plannedDurationH: 4.0, actualStart: makeIso(7, 5),
    status: 'in-progress', delayHours: 0, fuelUsedLitres: 55,
  },
  // ── OLP – Khu 2 ──────────────────────────────────────
  {
    id: 'p-302', pileCode: 'OLP-K2-001', machineId: 'm-44', worksiteId: 'olp-2',
    diameterMm: 800, depthM: 22, plannedStart: makeIso(6), plannedEnd: makeIso(8, 30),
    plannedDurationH: 2.5, actualStart: makeIso(6, 0), actualEnd: makeIso(8, 40),
    actualDurationH: 2.67, status: 'completed', delayHours: 0.17, fuelUsedLitres: 46,
  },
  {
    id: 'p-303', pileCode: 'OLP-K2-002', machineId: 'm-45', worksiteId: 'olp-2',
    diameterMm: 1000, depthM: 40, plannedStart: makeIso(6), plannedEnd: makeIso(12),
    plannedDurationH: 6.0, actualStart: makeIso(8, 0),
    status: 'delayed', delayHours: 2.0, delayReason: 'lack-steel-cage', fuelUsedLitres: 40,
  },
  // ── HNX – Khu 2 ──────────────────────────────────────
  {
    id: 'p-007', pileCode: 'HNX-K2-001', machineId: 'm-8', worksiteId: 'hnx-2',
    diameterMm: 800, depthM: 28, plannedStart: makeIso(6), plannedEnd: makeIso(9, 30),
    plannedDurationH: 3.5, actualStart: makeIso(6), actualEnd: makeIso(9, 30),
    actualDurationH: 3.5, status: 'completed', delayHours: 0, fuelUsedLitres: 62,
  },
  {
    id: 'p-008', pileCode: 'HNX-K2-002', machineId: 'm-9', worksiteId: 'hnx-2',
    diameterMm: 800, depthM: 24, plannedStart: makeIso(9, 30), plannedEnd: makeIso(12, 30),
    plannedDurationH: 3.0, actualStart: makeIso(9, 30),
    status: 'in-progress', delayHours: 0, fuelUsedLitres: 44,
  },
  // ── CG – Khu 2 ───────────────────────────────────────
  {
    id: 'p-009', pileCode: 'CG-K2-001', machineId: 'm-10', worksiteId: 'cg-2',
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
    riskType: 'machine-breakdown',
    category: 'machine',
    subject: 'OCP1 – SANY-021',
    title: 'SANY-021 có nguy cơ dừng đột ngột trong 2–4h tới',
    summary: 'Cảm biến nhiệt độ động cơ vượt ngưỡng 108°C liên tục 3h — nguy cơ hỏng cụm bơm thủy lực',
    impactForecast: 'Trễ 18–24 cọc, chậm tiến độ ~2 ngày',
    reasoning: 'SANY-021 tại OCP1-Khu 3 ghi nhận nhiệt độ động cơ leo thang từ 92°C lên 108°C trong 3 giờ liên tục. AI phân tích pattern: đây là dấu hiệu điển hình của tắc nghẽn hệ thống làm mát (coolant blockage) kết hợp tải trọng cao. Nếu không can thiệp, xác suất dừng đột ngột trong 4 giờ tới là 87%. Máy đang phụ trách 6 cọc đường kính 1.2m — nếu dừng giữa chừng sẽ phải xử lý cọc hỏng tốn thêm 12–18h.',
    evidence: [
      { label: 'Nhiệt độ động cơ', actual: '108°C', expected: '≤ 90°C' },
      { label: 'Áp suất làm mát', actual: '1.2 bar', expected: '≥ 2.5 bar' },
      { label: 'Thời gian bất thường', actual: '3h liên tục', expected: '0' },
      { label: 'Xác suất dừng đột ngột', actual: '87%', expected: '≤ 10%' },
    ],
    recommendations: [
      'Dừng máy ngay để kiểm tra và xả két làm mát trước khi thi công cọc tiếp theo.',
      'Cử kỹ thuật viên kiểm tra đường ống coolant và bơm nước làm mát.',
      'Điều chuyển SANY-019 sang OCP1-Khu 3 để bù tiến độ trong thời gian sửa chữa.',
      'Cập nhật lệnh dừng khẩn cấp vào hệ thống quản lý thiết bị.',
    ],
    benefit: 'Tránh hỏng cụm bơm thủy lực trị giá ~180 triệu VND. Bảo toàn tiến độ gói cọc OCP1.',
    costSavingEstimate: '~220 triệu VND từ tránh sửa chữa lớn và phạt chậm tiến độ.',
    createdAt: '2026-07-06T05:48:00',
    read: false,
  },
  {
    id: 'ai-002',
    severity: 'critical',
    riskType: 'material-shortage',
    category: 'material',
    subject: 'CG – CG-Khu 3',
    title: 'Bentonite CG-Khu 3 sẽ cạn trong 4h — 5 máy phải dừng',
    summary: 'Tồn kho chỉ còn 12m³, tiêu thụ 3.1m³/h — hết lúc 10:00 sáng nếu không bổ sung khẩn',
    impactForecast: 'Chậm ~8h, trễ 22–28 cọc',
    reasoning: 'Hệ thống giám sát kho vật liệu ghi nhận bentonite tại CG-Khu 3 còn 12m³, trong khi tốc độ tiêu thụ hiện tại là 3.1m³/h với 5 máy đang hoạt động. AI tính toán thời điểm hết tồn kho là khoảng 10:00 sáng hôm nay (sau ~4h). Nhà cung cấp gần nhất cách 2.5h vận chuyển — cần đặt hàng ngay bây giờ để tránh gián đoạn. Khu vực này đang trong giai đoạn thi công cọc đường kính lớn, tiêu thụ bentonite cao gấp đôi so với cọc thường.',
    evidence: [
      { label: 'Tồn kho bentonite', actual: '12 m³', expected: '≥ 40 m³' },
      { label: 'Tốc độ tiêu thụ', actual: '3.1 m³/h', expected: '2.0 m³/h (bình thường)' },
      { label: 'Thời gian còn lại', actual: '~3.9h', expected: '≥ 24h' },
      { label: 'Máy bị ảnh hưởng', actual: '5 máy', expected: '0 máy' },
    ],
    recommendations: [
      'Đặt hàng khẩn cấp 60m³ bentonite ngay lập tức, yêu cầu giao trước 09:30.',
      'Liên hệ nhà cung cấp dự phòng tại Bình Dương nếu nhà cung cấp chính không đáp ứng.',
      'Trong khi chờ, ưu tiên 2 máy cho cọc nhỏ <800mm tiêu thụ ít bentonite hơn.',
      'Cập nhật quy trình cảnh báo tồn kho tối thiểu lên 30m³ thay vì 20m³ hiện tại.',
    ],
    benefit: 'Tránh dừng toàn bộ 5 máy và mất ~8h thi công tại CG-Khu 3.',
    costSavingEstimate: '~78 triệu VND từ tránh gián đoạn sản xuất và phạt hợp đồng.',
    createdAt: '2026-07-06T06:02:00',
    read: false,
  },
  {
    id: 'ai-003',
    severity: 'critical',
    riskType: 'machine-breakdown',
    category: 'machine',
    subject: 'HVB – BAUER-003',
    title: 'BAUER-003 rò rỉ thủy lực — nguy cơ dừng máy khẩn cấp',
    summary: 'Áp suất hệ thống giảm 18% trong 2h — phát hiện vết rò ống dẫn số 4 cụm kelly bar',
    impactForecast: 'Dừng máy 6–10h, trễ 8–12 cọc',
    reasoning: 'BAUER-003 tại HVB-Khu 2 ghi nhận áp suất thủy lực giảm từ 280 bar xuống 229 bar trong 2 giờ (-18%). Camera IoT lắp trên máy phát hiện vết dầu thủy lực tại ống dẫn số 4 nối với cụm kelly bar. BAUER-003 đang xử lý cọc D1400mm sâu 52m — nếu dừng giữa cọc, chi phí xử lý cọc hỏng ước tính 45–60 triệu. Cần dừng máy kiểm soát ngay trước khi vào cọc tiếp theo.',
    evidence: [
      { label: 'Áp suất thủy lực', actual: '229 bar', expected: '≥ 260 bar' },
      { label: 'Tốc độ sụt áp', actual: '-18% / 2h', expected: '< 2% / ngày' },
      { label: 'Vị trí rò rỉ', actual: 'Ống số 4 – kelly bar', expected: 'Kín hoàn toàn' },
      { label: 'Thể tích dầu mất', actual: '~4.5 lít', expected: '0' },
    ],
    recommendations: [
      'Dừng BAUER-003 ngay sau khi hoàn thành cọc hiện tại, không bắt đầu cọc mới.',
      'Cử đội bảo dưỡng thay thế ống dẫn số 4 và kiểm tra toàn bộ hệ thống thủy lực.',
      'Điều chuyển BAUER-001 từ HVB-Khu 1 sang xử lý cọc ưu tiên tại HVB-Khu 2.',
      'Đặt hàng phụ tùng ống thủy lực BAUER dự phòng để giảm thời gian dừng máy.',
    ],
    benefit: 'Tránh hỏng hoàn toàn bơm thủy lực trị giá ~350 triệu VND và rủi ro an toàn lao động.',
    costSavingEstimate: '~410 triệu VND từ tránh sửa chữa lớn, cọc hỏng và tai nạn lao động.',
    createdAt: '2026-07-06T06:25:00',
    read: false,
  },
  {
    id: 'ai-004',
    severity: 'high',
    riskType: 'material-shortage',
    category: 'material',
    subject: 'HNX – HNX-Khu 1',
    title: 'Bê tông sẵn sàng chỉ 52% — nguy cơ gián đoạn đổ cọc',
    summary: 'Trạm trộn cung cấp chậm 3.2h so với kế hoạch — 14 cọc đang chờ đổ bê tông',
    impactForecast: 'Chậm 12–16h, trễ tiến độ 3–4 ngày',
    reasoning: 'HNX-Khu 1 đang có 14 cọc đã khoan xong đang chờ đổ bê tông. Trạm trộn VICEM Hà Nam báo cung cấp chậm do tắc đường QL1A từ 04:00 sáng. Mức độ sẵn sàng bê tông chỉ đạt 52%, thấp hơn ngưỡng an toàn 80%. Nếu bê tông không đến trong 4h, các hố khoan có nguy cơ sụt thành vách do áp lực đất tại khu vực địa chất yếu HNX-Khu 1.',
    evidence: [
      { label: 'Bê tông sẵn sàng', actual: '52%', expected: '≥ 80%' },
      { label: 'Cọc chờ đổ BT', actual: '14 cọc', expected: '≤ 3 cọc' },
      { label: 'Delay trạm trộn', actual: '3.2h', expected: '0' },
      { label: 'Nguy cơ sụt vách', actual: 'Cao (địa chất yếu)', expected: 'Thấp' },
    ],
    recommendations: [
      'Liên hệ trạm trộn VICEM dự phòng tại Phủ Lý để bổ sung bê tông trong vòng 2h.',
      'Bơm bentonite gia cố vào 14 hố đang chờ để giảm nguy cơ sụt vách.',
      'Ưu tiên đổ bê tông cho các cọc đã khoan quá 6h trước.',
      'Báo cáo tình trạng cho PMC và đề xuất điều chỉnh kế hoạch ca tối.',
    ],
    benefit: 'Tránh hỏng 14 cọc khoan sẵn, bảo toàn ~8h công thi công.',
    costSavingEstimate: '~92 triệu VND từ tránh hỏng cọc và thi công lại.',
    createdAt: '2026-07-06T05:30:00',
    read: false,
  },
  {
    id: 'ai-005',
    severity: 'high',
    riskType: 'geology',
    category: 'project',
    subject: 'CG – CG-Khu 3',
    title: 'Địa chất cứng bất ngờ tại CG-K3 làm chậm 30% tiến độ',
    summary: 'Phát hiện lớp đá cứng 18–24m không có trong báo cáo khảo sát địa chất ban đầu',
    impactForecast: 'Chậm 6–9 giờ/cọc, nguy cơ trễ tiến độ 5–7 ngày',
    reasoning: 'SANY-018 và XCMG-012 tại CG-Khu 3 ghi nhận tốc độ khoan giảm đột ngột từ 2.8m/h xuống 0.9m/h ở độ sâu 18–24m, tương ứng giảm 68% năng suất. Đây là dấu hiệu gặp lớp đá cứng (UCS >80 MPa) không xuất hiện trong hồ sơ địa chất khảo sát ban đầu. AI đối chiếu dữ liệu địa chấn vùng lân cận dự đoán lớp đá kéo dài 120–180m theo phương Đông-Tây, ảnh hưởng ít nhất 34 cọc còn lại.',
    evidence: [
      { label: 'Tốc độ khoan thực tế', actual: '0.9 m/h', expected: '2.8 m/h' },
      { label: 'Giảm năng suất', actual: '-68%', expected: '0' },
      { label: 'Độ sâu gặp đá', actual: '18–24m', expected: 'Không có trong khảo sát' },
      { label: 'Số cọc bị ảnh hưởng', actual: '~34 cọc', expected: '0' },
    ],
    recommendations: [
      'Điều chỉnh thông số khoan: giảm tốc độ quay, tăng lực ép để tránh gãy cần khoan.',
      'Yêu cầu đơn vị khảo sát địa chất bổ sung điều tra khu vực CG-Khu 3 trong 48h.',
      'Xem xét thay đổi thiết kế mũi khoan sang loại chuyên dụng cho đá cứng.',
      'Cập nhật kế hoạch tiến độ tổng thể và thông báo CĐT về rủi ro chậm tiến độ.',
    ],
    benefit: 'Giảm nguy cơ gãy cần khoan (~120 triệu/lần). Điều chỉnh kịp thời kế hoạch dự án.',
    costSavingEstimate: '~145 triệu VND từ tránh hư hỏng thiết bị và tối ưu lại lịch thi công.',
    createdAt: '2026-07-06T04:55:00',
    read: false,
  },
  {
    id: 'ai-006',
    severity: 'high',
    riskType: 'labor',
    category: 'project',
    subject: 'HNX – HNX-Khu 2',
    title: 'Thiếu nhân công ca đêm — chỉ đạt 62% công suất ca tối',
    summary: '13/21 công nhân vận hành đăng ký nghỉ phép trong tuần tới — nguy cơ dừng ca đêm',
    impactForecast: 'Mất 30–38% công suất ca đêm, chậm ~4 ngày tổng thể',
    reasoning: 'HNX-Khu 2 đang có 13/21 công nhân vận hành đăng ký nghỉ phép từ ngày 07–13/07, trùng với đỉnh điểm thi công cọc tầng hầm. Với 8 người còn lại, công suất vận hành ca đêm (22:00–06:00) chỉ đạt 62% — không đủ để vận hành 5 máy theo kế hoạch. AI ước tính mất 38% sản lượng ca đêm, tương đương chậm 4 ngày so với tiến độ tổng thể gói HNX-T2.',
    evidence: [
      { label: 'Nhân công ca đêm có mặt', actual: '8/21 người', expected: '21/21 người' },
      { label: 'Công suất dự báo', actual: '62%', expected: '100%' },
      { label: 'Thời gian thiếu hụt', actual: '7 ngày (07–13/07)', expected: '0 ngày' },
      { label: 'Máy không thể vận hành', actual: '2–3 máy', expected: '0 máy' },
    ],
    recommendations: [
      'Liên hệ ngay nhà thầu cung ứng lao động để bổ sung 8 công nhân thay thế cho tuần 07–13/07.',
      'Xem xét điều động nhân công từ VA-Khu 2 (đang dư thừa 4 người) sang HNX tạm thời.',
      'Ưu tiên ca ngày cho các cọc có deadline gấp, giảm khối lượng ca đêm.',
      'Cập nhật chính sách duyệt nghỉ phép để tránh tập trung vào giai đoạn cao điểm.',
    ],
    benefit: 'Duy trì công suất ca đêm ≥ 85%. Bảo toàn tiến độ gói HNX-T2 theo hợp đồng.',
    costSavingEstimate: '~55 triệu VND từ tránh phạt chậm tiến độ và làm thêm giờ bù sau.',
    createdAt: '2026-07-06T07:10:00',
    read: false,
  },
  {
    id: 'ai-007',
    severity: 'high',
    riskType: 'material-shortage',
    category: 'material',
    subject: 'OCP1 – OCP1-Khu 2',
    title: 'Thép lồng OCP1-Khu 2 sắp hết — thiếu hụt dự kiến sau 6h',
    summary: 'Tồn kho 42 lồng thép, tiêu thụ 8 lồng/h — cần đặt hàng ngay để tránh dừng dây chuyền',
    impactForecast: 'Dừng 4 máy ~5h, chậm 16–20 cọc',
    reasoning: 'OCP1-Khu 2 hiện có 42 lồng thép D1000 trong kho, tốc độ sử dụng 8 lồng/giờ với 4 máy đang hoạt động song song. Thời gian hết tồn kho ước tính vào lúc 14:30 hôm nay. Nhà cung cấp thép lồng (Cty Cơ khí Phú Thọ) cần 5h để xưởng gia công và vận chuyển đến công trường. Nếu không đặt hàng trước 09:30, dây chuyền thi công sẽ gián đoạn.',
    evidence: [
      { label: 'Tồn kho thép lồng', actual: '42 lồng', expected: '≥ 80 lồng' },
      { label: 'Tốc độ tiêu thụ', actual: '8 lồng/h', expected: '5 lồng/h (kế hoạch)' },
      { label: 'Thời gian còn lại', actual: '~5.3h', expected: '≥ 12h' },
      { label: 'Lead time đặt hàng', actual: '5h', expected: 'Đặt trước 09:30' },
    ],
    recommendations: [
      'Đặt hàng khẩn cấp 120 lồng thép D1000 từ Cty Cơ khí Phú Thọ trước 09:30.',
      'Liên hệ nhà cung cấp dự phòng Cty Cơ khí Vĩnh Phúc nếu Phú Thọ không đáp ứng.',
      'Giảm tạm số máy hoạt động song song xuống 2 để kéo dài thời gian tồn kho.',
      'Đề xuất tăng mức tồn kho tối thiểu lên 60 lồng cho giai đoạn cao điểm.',
    ],
    benefit: 'Duy trì liên tục dây chuyền thi công 4 máy tại OCP1-Khu 2.',
    costSavingEstimate: '~48 triệu VND từ tránh gián đoạn sản xuất và điều phối làm thêm giờ.',
    createdAt: '2026-07-06T07:45:00',
    read: false,
  },
  {
    id: 'ai-008',
    severity: 'medium',
    riskType: 'weather',
    category: 'project',
    subject: 'VA – VA-Khu 1',
    title: 'Dự báo gió cấp 6–7 từ 15:00 — nguy cơ phải dừng thi công cọc nước',
    summary: 'NCHMF dự báo gió mạnh từ chiều nay tại Vũng Áng — ảnh hưởng 4 cọc trên sà lan nổi',
    impactForecast: 'Dừng cưỡng bức 4–8h, trễ 3–5 cọc nước',
    reasoning: 'Dự báo thời tiết từ NCHMF và đài khí tượng thủy văn Hà Tĩnh ghi nhận hướng gió Đông-Đông Nam cấp 6–7 (50–61 km/h) dự kiến từ 15:00–23:00 tại khu vực Vũng Áng. VA-Khu 1 đang có 4 cọc thi công trên sà lan nổi ngoài khơi 1.2km — quy định an toàn bắt buộc dừng khi gió ≥ cấp 6. Đây là lần thứ 3 trong tháng 7, ảnh hưởng tích lũy đến tiến độ giai đoạn 1B.',
    evidence: [
      { label: 'Tốc độ gió dự báo', actual: '50–61 km/h (cấp 6–7)', expected: '< 39 km/h (cấp 5)' },
      { label: 'Thời gian ảnh hưởng', actual: '15:00–23:00', expected: 'Không có' },
      { label: 'Cọc nước bị ảnh hưởng', actual: '4 cọc trên sà lan', expected: '0 cọc' },
      { label: 'Số lần tháng 7', actual: '3 lần', expected: '≤ 1 lần/tuần' },
    ],
    recommendations: [
      'Lên kế hoạch hoàn thành tối đa cọc ngoài khơi trước 14:30 hôm nay.',
      'Di chuyển sà lan vào vị trí neo đậu an toàn trước khi gió mạnh đến.',
      'Tập trung nhân lực và máy vào thi công cọc bờ trong ca chiều và tối.',
      'Cập nhật kế hoạch dự phòng thời tiết xấu vào báo cáo tiến độ tuần.',
    ],
    benefit: 'Bảo toàn an toàn thiết bị và nhân công trên biển. Tối ưu ca thi công bờ.',
    costSavingEstimate: '~22 triệu VND từ tối ưu lịch thi công và tránh rủi ro an toàn.',
    createdAt: '2026-07-06T08:00:00',
    read: true,
  },
  {
    id: 'ai-009',
    severity: 'medium',
    riskType: 'labor',
    category: 'project',
    subject: 'HVB – HVB-Khu 3',
    title: 'Thiếu kỹ thuật viên kiểm tra chất lượng — 9 cọc chưa được nghiệm thu',
    summary: 'KTV chất lượng duy nhất tại HVB-Khu 3 đang ốm — 9 cọc hoàn thành đang chờ PIT test',
    impactForecast: 'Ách tắc nghiệm thu 2–3 ngày, không thể thi công phần trên',
    reasoning: 'HVB-Khu 3 chỉ có 1 kỹ thuật viên chất lượng được phân công (KTV Nguyễn Văn Minh) đang nghỉ ốm từ hôm qua. Hiện có 9 cọc hoàn thành đang chờ thực hiện PIT test (Pile Integrity Test) — yêu cầu bắt buộc trước khi thi công phần bê tông trên. Nếu không có KTV thay thế trong 24h, toàn bộ 4 máy tại HVB-Khu 3 sẽ không thể tiếp tục theo quy trình kiểm soát chất lượng hợp đồng.',
    evidence: [
      { label: 'KTV chất lượng có mặt', actual: '0/1 người', expected: '1 người' },
      { label: 'Cọc chờ PIT test', actual: '9 cọc', expected: '≤ 2 cọc' },
      { label: 'Thời gian ách tắc', actual: '> 24h nếu không can thiệp', expected: '< 4h' },
      { label: 'Máy bị gián đoạn', actual: '4 máy', expected: '0 máy' },
    ],
    recommendations: [
      'Điều động KTV chất lượng từ HVB-Khu 1 sang HVB-Khu 3 để thực hiện PIT test khẩn.',
      'Liên hệ đơn vị kiểm tra độc lập (Vilas 001) để hỗ trợ PIT test ngay hôm nay.',
      'Lên kế hoạch đào tạo ít nhất 2 KTV chất lượng/công trường để tránh rủi ro phụ thuộc 1 người.',
      'Cập nhật quy trình quản lý nguồn lực chất lượng vào SOP dự án.',
    ],
    benefit: 'Giải phóng ách tắc nghiệm thu, cho phép 4 máy tiếp tục thi công liên tục.',
    costSavingEstimate: '~38 triệu VND từ tránh ách tắc dây chuyền và chi phí lưu máy chờ.',
    createdAt: '2026-07-06T08:30:00',
    read: true,
  },
  {
    id: 'ai-010',
    severity: 'medium',
    riskType: 'machine-breakdown',
    category: 'machine',
    subject: 'OCP1 – XCMG-015',
    title: 'XCMG-015 đến hạn bảo dưỡng 500h — nguy cơ hỏng không lường trước',
    summary: 'Đồng hồ giờ máy đạt 498h, vượt 500h hôm nay — chưa lên lịch bảo dưỡng định kỳ',
    impactForecast: 'Nguy cơ hỏng bất ngờ trong 48h, dừng 12–24h nếu xảy ra',
    reasoning: 'XCMG-015 tại OCP1-Khu 1 đạt 498 giờ hoạt động tính đến sáng nay — vượt mốc bảo dưỡng 500h theo khuyến nghị nhà sản xuất mà chưa được lên lịch. Dữ liệu lịch sử cho thấy các máy XCMG cùng model không được bảo dưỡng đúng hạn có xác suất hỏng filter nhớt và bơm thủy lực tăng 340% trong 48h tiếp theo. Máy đang thực hiện gói cọc quan trọng nhất giai đoạn 1 tại OCP1.',
    evidence: [
      { label: 'Giờ hoạt động hiện tại', actual: '498h', expected: 'Bảo dưỡng ≤ 500h' },
      { label: 'Trạng thái lịch BT', actual: 'Chưa lên lịch', expected: 'Đã đặt lịch' },
      { label: 'Nguy cơ hỏng filter', actual: '+340% (48h tới)', expected: 'Ngưỡng bình thường' },
      { label: 'Thời gian bảo dưỡng', actual: '4–6h dự kiến', expected: 'Đã lên kế hoạch' },
    ],
    recommendations: [
      'Lên lịch bảo dưỡng 500h cho XCMG-015 vào ca nghỉ đêm nay (22:00–04:00).',
      'Chuẩn bị bộ phụ tùng bảo dưỡng: dầu nhớt 10W40, filter dầu, filter khí, dây curoa.',
      'Điều XCMG-011 sang trực ca trong thời gian XCMG-015 bảo dưỡng.',
      'Đăng ký cảnh báo tự động vào hệ thống khi máy đến 480h cho lần tiếp theo.',
    ],
    benefit: 'Phòng ngừa hỏng đột ngột giữa ca, bảo toàn tuổi thọ máy thêm 500–1000h.',
    costSavingEstimate: '~85 triệu VND từ tránh sửa chữa lớn và gián đoạn sản xuất không kế hoạch.',
    createdAt: '2026-07-06T09:00:00',
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
