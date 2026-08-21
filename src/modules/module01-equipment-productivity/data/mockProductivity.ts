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
 * Baseline tiêu hao nhiên liệu (L/giờ) theo dòng máy — nguồn sự thật cho mock.
 */
const FUEL_BASELINE_BY_PREFIX: Record<string, number> = {
  SANY: 22.0,
  BAUER: 26.0,
  XCMG: 22.8,
  PC3: 16.5,
  ZX3: 17.0,
  C336: 18.0,
  SWDM: 19.5,
  PM26: 18.8,
  S34S: 9.5,
  BSF3: 10.2,
  BW21: 7.5,
  CA25: 8.0,
}

const FUEL_COST_VND_PER_LITRE = 24_500

type FuelProfile = 'waste-high' | 'waste-mid' | 'on-target' | 'saving-mid' | 'saving-high'

function roundFuel(v: number): number {
  return Math.round(v * 10) / 10
}

function baselineForPrefix(prefix: string): number {
  return FUEL_BASELINE_BY_PREFIX[prefix] ?? 15.0
}

/** Phân bổ cố định ~30% lãng phí · ~25% tiết kiệm · ~45% đúng định mức (máy có giờ chạy). */
function fuelProfileForIndex(index: number, workingHours: number): FuelProfile {
  if (workingHours <= 0) return 'on-target'
  const bucket = index % 20
  if (bucket <= 5) return 'waste-high'
  if (bucket <= 11) return 'waste-mid'
  if (bucket <= 16) return 'on-target'
  if (bucket <= 18) return 'saving-mid'
  return 'saving-high'
}

function actualFromProfile(baseline: number, profile: FuelProfile): number {
  switch (profile) {
    case 'waste-high': return roundFuel(baseline * 1.14)
    case 'waste-mid': return roundFuel(baseline * 1.06)
    case 'saving-mid': return roundFuel(baseline * 0.94)
    case 'saving-high': return roundFuel(baseline * 0.87)
    default: return baseline
  }
}

/**
 * Công thức hiển thị (L):
 *   lãng phí  = max(0, actual − baseline) × workingHours
 *   tiết kiệm = max(0, baseline − actual) × workingHours
 */
function applyFuelEfficiencyMock(machines: Machine[], specs: MachineSpec[]): void {
  for (let i = 0; i < machines.length; i++) {
    const machine = machines[i]
    const spec = specs[i]
    const baseline = baselineForPrefix(spec.prefix)
    const profile = fuelProfileForIndex(i, machine.workingHours)

    machine.fuelBaselineLitresPerHour = baseline
    machine.fuelLitresPerHour = actualFromProfile(baseline, profile)
    machine.fuelCostVndPerLitre = FUEL_COST_VND_PER_LITRE
  }
}
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

  const fuelBase = baselineForPrefix(spec.prefix)
  const fuelActual = fuelBase

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
    fuelCostVndPerLitre: FUEL_COST_VND_PER_LITRE,
    dispatchStatus: pickFrom(DISPATCH_POOL),
  }
}

export const MACHINES: Machine[] = SPECS.map((s, i) => makeMachine(s, i))
applyFuelEfficiencyMock(MACHINES, SPECS)

/* ── Pin story machines (ghi đè sau mock nhiên liệu) ── */
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
  sany021.fuelBaselineLitresPerHour = 22.0
  sany021.fuelLitresPerHour = 25.2
}

const xcmg007 = MACHINES.find(m => m.code === 'XCMG-007')
if (xcmg007) {
  xcmg007.projectId = 'cg'
  xcmg007.worksiteId = 'cg-1'
  xcmg007.fuelBaselineLitresPerHour = 22.8
  xcmg007.fuelLitresPerHour = 29.4
  xcmg007.status = 'breakdown'
  xcmg007.workingHours = 6
  xcmg007.downtimeHours = 4
  xcmg007.idleHours = 0
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
  sany030.workingHours = 10
  sany030.fuelBaselineLitresPerHour = 22.0
  sany030.fuelLitresPerHour = 19.2
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
    id: 'p-084', pileCode: 'CG-K1-002', machineId: 'm-39', worksiteId: 'cg-1',
    diameterMm: 1000, depthM: 38, plannedStart: makeIso(6), plannedEnd: makeIso(11),
    plannedDurationH: 5.0,
    status: 'blocked', delayHours: 5.0, delayReason: 'machine-breakdown',
  },
  {
    id: 'p-085', pileCode: 'CG-K1-003', machineId: 'm-20', worksiteId: 'cg-1',
    diameterMm: 800, depthM: 24, plannedStart: makeIso(5), plannedEnd: makeIso(7, 30),
    plannedDurationH: 2.5, actualStart: makeIso(5), actualEnd: makeIso(7, 20),
    actualDurationH: 2.33, status: 'completed', delayHours: 0, fuelUsedLitres: 52,
  },
  {
    id: 'p-086', pileCode: 'CG-K1-004', machineId: 'm-20', worksiteId: 'cg-1',
    diameterMm: 900, depthM: 28, plannedStart: makeIso(7, 30), plannedEnd: makeIso(10, 30),
    plannedDurationH: 3.0, actualStart: makeIso(7, 45),
    status: 'in-progress', delayHours: 0, fuelUsedLitres: 38,
  },
  {
    id: 'p-087', pileCode: 'CG-K1-005', machineId: 'm-20', worksiteId: 'cg-1',
    diameterMm: 800, depthM: 26, plannedStart: makeIso(6), plannedEnd: makeIso(9),
    plannedDurationH: 3.0, actualStart: makeIso(7, 0),
    status: 'delayed', delayHours: 1.5, delayReason: 'lack-bentonite', fuelUsedLitres: 28,
  },
  {
    id: 'p-088', pileCode: 'CG-K1-006', machineId: 'm-20', worksiteId: 'cg-1',
    diameterMm: 1000, depthM: 32, plannedStart: makeIso(4), plannedEnd: makeIso(8),
    plannedDurationH: 4.0, actualStart: makeIso(4), actualEnd: makeIso(7, 50),
    actualDurationH: 3.83, status: 'completed', delayHours: 0, fuelUsedLitres: 78,
  },
  {
    id: 'p-089', pileCode: 'CG-K1-007', machineId: 'm-39', worksiteId: 'cg-1',
    diameterMm: 900, depthM: 30, plannedStart: makeIso(6), plannedEnd: makeIso(9, 30),
    plannedDurationH: 3.5,
    status: 'not-started', delayHours: 0,
  },
  {
    id: 'p-090', pileCode: 'CG-K1-008', machineId: 'm-20', worksiteId: 'cg-1',
    diameterMm: 800, depthM: 25, plannedStart: makeIso(5), plannedEnd: makeIso(8),
    plannedDurationH: 3.0, actualStart: makeIso(5), actualEnd: makeIso(8, 10),
    actualDurationH: 3.17, status: 'completed', delayHours: 0, fuelUsedLitres: 62,
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

/* Đồng bộ mock cọc ↔ máy story (fuel, gán máy) */
function pileOperatingHours(p: PileAssignment): number {
  if (p.actualDurationH !== undefined) return p.actualDurationH
  if (p.status === 'in-progress' || p.status === 'delayed') {
    return (p.plannedDurationH ?? 0) * 0.65
  }
  if (p.status === 'completed') return p.plannedDurationH ?? 0
  return 0
}

function syncPileDemoData() {
  const machineMap = Object.fromEntries(MACHINES.map(m => [m.id, m]))

  for (const p of PILE_ASSIGNMENTS) {
    if (p.status === 'not-started' || p.status === 'blocked') {
      p.fuelUsedLitres = undefined
      continue
    }
    const m = machineMap[p.machineId]
    if (!m) continue
    const hours = pileOperatingHours(p)
    if (hours > 0) {
      p.fuelUsedLitres = Math.round(m.fuelLitresPerHour * hours)
    }
  }
}

syncPileDemoData()

/* pin story pile ids */
const p083 = PILE_ASSIGNMENTS.find(p => p.id === 'p-083')
const p084 = PILE_ASSIGNMENTS.find(p => p.id === 'p-084')
if (sany021 && p083) sany021.currentPileId = p083.id
if (xcmg007 && p084) xcmg007.currentPileId = p084.id

/* ═══════════════════════════════════════════════
   AI ALERTS
═══════════════════════════════════════════════ */
export const AI_ALERTS: AiAlert[] = [
  /* ── Critical: dừng thi công ngay hoặc trong ca ── */
  {
    id: 'ai-001',
    severity: 'critical',
    riskType: 'machine-breakdown',
    category: 'machine',
    subject: 'CG – XCMG-007',
    title: 'XCMG-007 hỏng bơm thủy lực — cọc CG-K1-002 không thể tiếp tục',
    summary: 'Máy báo lỗi áp suất thủy lực, dừng tại cọc CG-K1-002 từ 07:15 — chưa có lịch sửa',
    impactForecast: '1 cọc đình trệ, chậm 1–2 cọc kế tiếp trong ngày',
    reasoning: 'XCMG-007 tại CG-Khu 1 dừng đột ngột lúc 07:15 khi đang xử lý cọc CG-K1-002 (Ø1000, sâu 38m). Đội vận hành báo áp suất cụm bơm chính không lên trên 120 bar (ngưỡng vận hành ≥ 220 bar). Cọc đã khoan được ~12m — không thể rút cần an toàn nếu không có bơm dự phòng. Khu CG-K1 hiện chỉ còn 2 máy khoan khả dụng cho 8 cọc trong ca.',
    evidence: [
      { label: 'Áp suất thủy lực', actual: '118 bar', expected: '≥ 220 bar' },
      { label: 'Cọc đang xử lý', actual: 'CG-K1-002 (12/38m)', expected: 'Hoàn thành theo KH' },
      { label: 'Thời gian dừng', actual: '2h 15p', expected: '0' },
      { label: 'Máy khoan còn lại CG-K1', actual: '2/5 máy', expected: '≥ 4 máy' },
    ],
    recommendations: [
      'Cử thợ bảo dưỡng kiểm tra bơm thủy lực và van áp trước 10:00.',
      'Giữ bentonite tuần hoàn ổn định cho hố CG-K1-002 để tránh sụt thành.',
      'Điều 1 máy dự phòng từ CG-Khu 2 sang nếu sửa chữa kéo dài quá ca trưa.',
      'Cập nhật lại lịch cọc chiều nay — ưu tiên cọc Ø800 tiêu thụ ít bentonite hơn.',
    ],
    benefit: 'Tránh hỏng cọc dở dang và giảm thời gian chờ máy tại CG-Khu 1.',
    costSavingEstimate: 'Giảm ~1 ngày chậm tiến độ khu vực và chi phí xử lý cọc hỏng.',
    createdAt: '2026-07-06T07:20:00',
    read: false,
  },
  {
    id: 'ai-002',
    severity: 'critical',
    riskType: 'material-shortage',
    category: 'material',
    subject: 'CG – CG-Khu 1',
    title: 'Bentonite CG-K1 sắp hết — SANY-021 không thể khoan tiếp',
    summary: 'Tồn kho 9m³, 4 máy đang tiêu thụ ~2,4m³/h — hết trước 11:30 nếu không bổ sung',
    impactForecast: 'Dừng 3–4 máy ~3h, chậm 6–8 cọc trong ngày',
    reasoning: 'CG-Khu 1 đang thi công cọc đất yếu, bentonite tuần hoàn bắt buộc. Tồn kho thực tế còn 9m³ trong bể trộn, trong khi SANY-021 (cọc CG-K1-001) và 3 máy khác tiêu thụ trung bình 2,4m³/h. Cọc CG-K1-001 đã trễ 2,5h vì chờ bù bentonite sau ca đêm. Nhà cung cấp gần nhất mất ~2h vận chuyển từ kho Long An — cần đặt hàng trước 09:00.',
    evidence: [
      { label: 'Tồn bentonite', actual: '9 m³', expected: '≥ 25 m³' },
      { label: 'Tiêu thụ hiện tại', actual: '2,4 m³/h', expected: '≤ 1,8 m³/h' },
      { label: 'Cọc chờ (CG-K1-001)', actual: '2,5h', expected: '≤ 30 phút' },
      { label: 'Mức sẵn sàng vật tư', actual: '58%', expected: '≥ 80%' },
    ],
    recommendations: [
      'Đặt gấp 40m³ bentonite, yêu cầu giao trước 10:30.',
      'Tạm dừng 1 máy khoan cọc lớn để kéo dài thời gian tồn kho.',
      'Kiểm tra hệ thống tuần hoàn bentonite — rò rỉ có thể làm tăng tiêu thụ.',
      'Báo PMC và điều chỉnh KH ca chiều cho CG-Khu 1.',
    ],
    benefit: 'Tránh dừng đồng loạt máy khoan tại khu có tiến độ chậm nhất dự án CG.',
    costSavingEstimate: 'Bảo toàn ~6–8 cọc/ngày, tránh phạt chậm tiến độ giai đoạn 1.',
    createdAt: '2026-07-06T06:05:00',
    read: false,
  },
  {
    id: 'ai-003',
    severity: 'critical',
    riskType: 'material-shortage',
    category: 'material',
    subject: 'HNX – HNX-Khu 2',
    title: '7 cọc khoan xong chờ bê tông quá 5h — nguy cơ sụt hố',
    summary: 'Xe bồn BT trễ 2,5h do tắc QL18; hố đã mở quá thời gian cho phép tại địa chất mềm',
    impactForecast: 'Phải khoan lại 2–3 cọc nếu sụt, chậm 1–2 ngày',
    reasoning: 'HNX-Khu 2 có 7 cọc Ø800 đã khoan xong từ 05:30–08:00 nhưng chưa đổ bê tông. Quy trình dự án cho phép hố mở tối đa 4h tại lớp đất mềm phía trên. Xe bồn từ trạm trộn Hạ Long trễ 2,5h do ùn tại QL18. BAUER-003 vẫn đang khoan cọc mới — đội đổ BT không đủ người xử lý đồng thời 7 hố.',
    evidence: [
      { label: 'Cọc chờ đổ BT', actual: '7 cọc', expected: '≤ 2 cọc' },
      { label: 'Thời gian hố mở max', actual: '5h 20p (cọc cũ nhất)', expected: '≤ 4h' },
      { label: 'Delay xe bồn', actual: '2,5h', expected: '≤ 30 phút' },
      { label: 'Sẵn sàng bê tông khu', actual: '72%', expected: '≥ 85%' },
    ],
    recommendations: [
      'Ưu tiên đổ bê tông cho 3 cọc mở lâu nhất trước 10:00.',
      'Bơm bentonite gia cố tạm các hố còn lại trong khi chờ xe.',
      'Liên hệ trạm trộn dự phòng tại Uông Bí để chia tải 2 xe bồn.',
      'Giảm 1 máy khoan mới cho đến khi backlog đổ BT < 3 cọc.',
    ],
    benefit: 'Tránh hỏng hố khoan và thi công lại — tiết kiệm 12–18h/cọc.',
    costSavingEstimate: 'Tránh chi phí khoan lại và gia cố hố hỏng tại HNX-Khu 2.',
    createdAt: '2026-07-06T08:35:00',
    read: false,
  },

  /* ── High: ảnh hưởng tiến độ trong 24h ── */
  {
    id: 'ai-004',
    severity: 'high',
    riskType: 'material-shortage',
    category: 'material',
    subject: 'OLP – OLP-Khu 2',
    title: 'Thiếu lồng thép D1000 — cọc OLP-K2-002 dừng giữa ca',
    summary: 'Kho còn 2 bộ lồng D1000; cọc OLP-K2-002 đã khoan xong, chờ lồng từ 08:00',
    impactForecast: 'Chậm 1 cọc hôm nay, dồn 2 cọc sang ca mai',
    reasoning: 'OLP-Khu 2 đang thi công cọc Ø1000 sâu 40m. Cọc OLP-K2-002 hoàn thành giai đoạn khoan lúc 08:00 nhưng xưởng gia công lồng thép báo trễ 3h do thiếu thép D32. Kho hiện còn 2 bộ lồng D1000 — đủ cho cọc đang chờ nhưng không đủ cho 2 cọc kế hoạch chiều nay. Mức sẵn sàng lồng thép khu chỉ 80%.',
    evidence: [
      { label: 'Lồng D1000 tồn kho', actual: '2 bộ', expected: '≥ 5 bộ' },
      { label: 'Cọc chờ lồng', actual: 'OLP-K2-002', expected: '0 cọc' },
      { label: 'Thời gian chờ', actual: '1h 30p', expected: '≤ 45 phút' },
      { label: 'Lead time xưởng', actual: '3h', expected: '≤ 1,5h' },
    ],
    recommendations: [
      'Điều 2 bộ lồng từ OLP-Khu 1 sang ngay (kho dư 4 bộ).',
      'Hoãn khoan 2 cọc D1000 chiều nay, chuyển sang cọc Ø800 có lồng sẵn.',
      'Xác nhận lại lịch giao thép D32 với xưởng gia công trước 11:00.',
      'Cập nhật ngưỡng cảnh báo tồn kho lồng lên 4 bộ/khu.',
    ],
    benefit: 'Giữ nhịp đổ bê tông, tránh hố mở quá hạn tại OLP-Khu 2.',
    costSavingEstimate: 'Tránh dồn ca và chi phí làm thêm giờ đội lắp lồng.',
    createdAt: '2026-07-06T08:10:00',
    read: false,
  },
  {
    id: 'ai-005',
    severity: 'high',
    riskType: 'material-shortage',
    category: 'material',
    subject: 'CG – CG-Khu 2',
    title: 'Bê tông CG-K2 không đáp ứng — cọc CG-K2-001 đình trệ',
    summary: 'Trạm trộn giảm công suất 40% sáng nay; cọc CG-K2-001 blocked từ 06:30',
    impactForecast: 'Chậm 3–4 cọc trong ngày tại CG-Khu 2',
    reasoning: 'CG-Khu 2 có 28 cọc chậm tiến độ và 6 cọc đình trệ. Cọc CG-K2-001 bị chặn từ 06:30 vì không có bê tông — trạm trộn tại hiện trường báo giảm công suất 40% do bảo dưỡng máy trộn số 2. Mức sẵn sàng bê tông khu 65%, thấp hơn mức an toàn 80% cho cọc Ø900 đang dồn ca.',
    evidence: [
      { label: 'Công suất trạm trộn', actual: '60%', expected: '≥ 90%' },
      { label: 'Cọc blocked', actual: 'CG-K2-001', expected: '0 cọc' },
      { label: 'Cọc chậm tiến độ khu', actual: '28 cọc', expected: '≤ 10 cọc' },
      { label: 'Sẵn sàng bê tông', actual: '65%', expected: '≥ 80%' },
    ],
    recommendations: [
      'Điều 1 xe bồn từ CG-Khu 1 sang hỗ trợ sau khi bentonite ổn định.',
      'Hoàn tất bảo dưỡng máy trộn số 2 trước 13:00.',
      'Giảm tốc khoan 1 máy cho đến khi backlog đổ BT < 4 cọc.',
      'Thông báo CĐT về rủi ro chậm tuần này tại CG-Khu 2.',
    ],
    benefit: 'Giảm dồn cọc blocked và tránh lan sang CG-Khu 1.',
    costSavingEstimate: 'Tránh mất thêm 2–3 ngày tiến độ giai đoạn 2 CG.',
    createdAt: '2026-07-06T06:40:00',
    read: false,
  },
  {
    id: 'ai-006',
    severity: 'high',
    riskType: 'geology',
    category: 'project',
    subject: 'HNX – BAUER-003',
    title: 'BAUER-003 khoan chậm ở tầng 22–28m — nghi gặp lớp đá',
    summary: 'Tốc độ giảm từ 2,4m/h xuống 0,8m/h; chưa có trong báo cáo địa chất ban đầu',
    impactForecast: 'Mỗi cọc chậm thêm 3–4h; ảnh hưởng ~12 cọc còn lại khu',
    reasoning: 'BAUER-003 tại HNX-Khu 2 ghi nhận momen xoắn và áp lực khoan tăng đột biến ở độ sâu 22–28m. Tốc độ khoan thực tế 0,8m/h so với 2,4m/h ở các cọc trước cùng khu. Đội trưởng báo tiếng rung bất thường và mùi đất đá — dấu hiệu gặp lớp đá phong hóa yếu không ghi trong hồ sơ khảo sát 2025. Nếu không điều chỉnh thông số, nguy cơ gãy cần khoan Ø800.',
    evidence: [
      { label: 'Tốc độ khoan (22–28m)', actual: '0,8 m/h', expected: '2,0–2,5 m/h' },
      { label: 'Momen xoắn', actual: '+45%', expected: '± 10%' },
      { label: 'Độ sâu gặp bất thường', actual: '22–28 m', expected: 'Không ghi nhận' },
      { label: 'Cọc cùng pattern dự kiến', actual: '~12 cọc', expected: '0' },
    ],
    recommendations: [
      'Giảm tốc quay, tăng lực ép nhẹ — tránh gãy cần.',
      'Yêu cầu đơn vị địa chất kiểm tra mẫu đất đá trong 24h.',
      'Chuẩn bị mũi khoan đá phong hóa dự phòng trên công trường.',
      'Cập nhật KH tiến độ HNX-Khu 2 (+2 ngày dự phòng).',
    ],
    benefit: 'Tránh gãy cần khoan và dừng máy không kế hoạch.',
    costSavingEstimate: 'Giảm chi phí thay cần và thời gian chờ sửa chữa.',
    createdAt: '2026-07-06T05:50:00',
    read: false,
  },
  {
    id: 'ai-007',
    severity: 'high',
    riskType: 'machine-breakdown',
    category: 'dispatch',
    subject: 'OCP1 – SANY-008',
    title: 'SANY-008 hỏng tại OCP1-K2 — thiếu máy cho 3 cọc ca chiều',
    summary: 'Máy dừng từ 06:00, lỗi hộp số quay; khu OCP1-K2 còn 4/6 máy khoan',
    impactForecast: 'Chậm 3 cọc ca chiều, 1 cọc chuyển sang ca đêm',
    reasoning: 'SANY-008 tại OCP1-Khu 2 báo lỗi hộp số quay (code E-204) lúc 06:00, chuyển trạng thái breakdown. Khu đang có 14 cọc chậm tiến độ và kế hoạch 3 cọc ca chiều gán cho SANY-008. Hiện còn 4 máy khoan hoạt động — đủ cho 2 cọc song song nhưng không đủ giữ nhịp 3 cọc/ca như KH.',
    evidence: [
      { label: 'Máy breakdown', actual: 'SANY-008', expected: '0 máy' },
      { label: 'Máy khoan khả dụng OCP1-K2', actual: '4/6', expected: '6/6' },
      { label: 'Cọc KH ca chiều', actual: '3 cọc', expected: 'Đủ máy' },
      { label: 'Thời gian sửa ước tính', actual: '6–8h', expected: '≤ 2h' },
    ],
    recommendations: [
      'Chia 3 cọc ca chiều cho SANY-002 và SANY-004 (đang chạy tốt).',
      'Điều SANY-007 từ OCP1-K1 sang hỗ trợ nếu sửa SANY-008 kéo dài.',
      'Cập nhật lịch bảo dưỡng định kỳ — SANY-008 vượt 480h chưa bảo dưỡng.',
      'Thông báo điều phối viên điều chỉnh KH ngày OCP1-K2.',
    ],
    benefit: 'Giữ tiến độ ca chiều, tránh dồn cọc sang ca đêm.',
    costSavingEstimate: 'Tránh làm thêm giờ và phạt chậm gói OCP1 giai đoạn 2.',
    createdAt: '2026-07-06T06:15:00',
    read: false,
  },

  /* ── Medium: theo dõi, can thiệp trong ngày ── */
  {
    id: 'ai-008',
    severity: 'medium',
    riskType: 'weather',
    category: 'project',
    subject: 'VA – VA-Khu 1',
    title: 'Gió cấp 6 chiều nay — tạm dừng 3 cọc móng trên sà lan',
    summary: 'Dự báo gió 45–52 km/h từ 14:00; quy định dừng thi công khi gió ≥ cấp 6',
    impactForecast: 'Mất 4–6h thi công ngoài khơi, chậm 2 cọc móng tuabin',
    reasoning: 'VA-Khu 1 (Điện gió Vũng Áng) có 3 cọc móng tuabin đang thi công trên sà lan cách bờ ~800m. Trung tâm Dự báo KTTV dự báo gió Đông-Nam cấp 6 (45–52 km/h) từ 14:00–20:00. Quy chuẩn an toàn dự án yêu cầu neo sà lan và dừng khoan khi gió vượt 40 km/h. Ca sáng cần tận dụng tối đa trước 13:30.',
    evidence: [
      { label: 'Gió dự báo (14–20h)', actual: '45–52 km/h', expected: '< 40 km/h' },
      { label: 'Cọc trên sà lan', actual: '3 cọc', expected: 'Hoàn thành ca sáng' },
      { label: 'Thời gian dừng ước tính', actual: '4–6h', expected: '0' },
      { label: 'Cọc móng còn lại giai đoạn', actual: '8 cọc', expected: 'Theo KH' },
    ],
    recommendations: [
      'Hoàn tất tối đa 1 cọc trước 13:30; chuẩn bị neo sà lan lúc 13:45.',
      'Chuyển nhân lực sang thi công cọc bờ trong ca chiều.',
      'Theo dõi cập nhật dự báo mỗi 2h — có thể rút ngắn thời gian dừng.',
      'Ghi nhận vào nhật ký thi công để đối chiếu claim thời tiết.',
    ],
    benefit: 'An toàn thiết bị và nhân sự; tối ưu ca sáng trước gió mạnh.',
    costSavingEstimate: 'Tránh rủi ro tai nạn và hư hỏng thiết bị trên biển.',
    createdAt: '2026-07-06T07:00:00',
    read: true,
  },
  {
    id: 'ai-009',
    severity: 'medium',
    riskType: 'labor',
    category: 'project',
    subject: 'OCP1 – OCP1-Khu 1',
    title: '5 cọc chờ PIT test — chưa thi công phần trên',
    summary: 'Đơn vị kiểm tra chỉ có 1 đội; backlog 5 cọc hoàn thành từ hôm qua',
    impactForecast: 'Trễ 1 ngày phần đục đầu cọc cho 5 vị trí',
    reasoning: 'OCP1-Khu 1 có 5 cọc hoàn thành đổ bê tông hôm qua nhưng chưa được PIT test theo yêu cầu hợp đồng. Chỉ có 1 đội kiểm tra (Vilas) phụ trách cả OCP1-K1 và K2 — lịch hôm nay ưu tiên K2. Không có kết quả PIT thì không được phép đục đầu cọc và chuyển sang giai đoạn tiếp theo. Đây là nút thắt quy trình, không phải thiếu máy khoan.',
    evidence: [
      { label: 'Cọc chờ PIT', actual: '5 cọc', expected: '≤ 2 cọc' },
      { label: 'Đội kiểm tra có mặt', actual: '1 đội / 2 khu', expected: '1 đội / khu' },
      { label: 'Thời gian chờ max', actual: '18h', expected: '≤ 8h' },
      { label: 'Cọc bị chặn giai đoạn sau', actual: '5 vị trí', expected: '0' },
    ],
    recommendations: [
      'Điều đội PIT sang OCP1-K1 sáng nay — xử lý 3 cọc ưu tiên trước 12:00.',
      'Đặt lịch dự phòng chiều nay cho 2 cọc còn lại.',
      'Phối hợp PMC để tách lịch kiểm tra K1/K2 theo tuần.',
      'Cập nhật SOP: không để backlog PIT vượt 3 cọc.',
    ],
    benefit: 'Giải phóng 5 vị trí sang giai đoạn tiếp theo, tránh dồn cuối tuần.',
    costSavingEstimate: 'Tránh trễ hạng mục liên kề và chi phí lưu máy chờ.',
    createdAt: '2026-07-06T07:30:00',
    read: true,
  },
  {
    id: 'ai-010',
    severity: 'medium',
    riskType: 'machine-breakdown',
    category: 'fuel',
    subject: 'CG – CG-Khu 1',
    title: 'Máy chờ bentonite tiêu thụ cao — SANY-021 25,2 L/h',
    summary: '3 máy idle nhưng máy nổ suốt; tiêu thụ vượt baseline 14% trong ca sáng',
    impactForecast: 'Lãng phí ~180 L/ca nếu không tắt máy khi chờ vật tư',
    reasoning: 'CG-Khu 1 có 3 máy khoan đang chờ bentonite nhưng vẫn để máy nổ để duy trì hệ thống tuần hoàn và điều hòa cabin. SANY-021 ghi nhận 25,2 L/h so với baseline 22 L/h — cao hơn 14%. Trong 3h chờ bentonite sáng nay, 3 máy có thể tiêu thụ thêm ~180 L không tạo sản lượng. Đây là rủi ro chi phí vận hành, không phải hỏng máy.',
    evidence: [
      { label: 'SANY-021 tiêu thụ', actual: '25,2 L/h', expected: '≤ 22 L/h' },
      { label: 'Máy idle có nổ máy', actual: '3 máy', expected: 'Tắt khi chờ > 1h' },
      { label: 'Thời gian chờ bentonite', actual: '3h', expected: '≤ 30 phút' },
      { label: 'Lít lãng phí ước tính', actual: '~180 L/ca', expected: '< 50 L/ca' },
    ],
    recommendations: [
      'Tắt máy khi chờ bentonite > 45 phút; chỉ giữ 1 máy tuần hoàn bentonite.',
      'Chuyển SANY-021 sang chế độ idle thấp nhiệt nếu phải chờ.',
      'Đối chiếu log nhiên liệu với ca trưởng cuối ca.',
      'Bổ sung quy trình tắt/mở máy trong SOP chờ vật tư.',
    ],
    benefit: 'Giảm chi phí nhiên liệu ca sáng mà không ảnh hưởng tiến độ khi bentonite về.',
    costSavingEstimate: 'Tiết kiệm ~180 L/ca × 3 ca/ngày nếu áp dụng đồng loạt.',
    createdAt: '2026-07-06T08:50:00',
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
