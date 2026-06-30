/**
 * Enterprise-scale mock data generator for Equipment Intelligence Center.
 */

import {
  ANCHOR_DATE,
  HISTORY_DAYS,
  TELEMETRY_INTERVAL_MINUTES,
  TARGET_COUNTS,
  PROJECTS,
  ZONE_LABELS,
  SANY_MODELS,
  MACHINE_STATE_WEIGHTS,
  STATE_BUSINESS_PROFILES,
  CAMERA_AI_EVENT_TYPES,
  ALERT_SEVERITIES,
  ALERT_CATEGORIES,
  RECOMMENDATION_TYPES,
  WORKER_ROLES,
  CONTRACTORS,
  PILE_STATUSES,
  RNG_SEED,
} from './constants.js'

import {
  pickErrorCode,
  deriveCameraExpectations,
  validateTelemetryRow,
  scoreStateConsistency,
  stateToAlertCategory,
  pileProgressFromStatus,
  buildTimeSlots,
} from './calculations.js'

/** Seeded PRNG (mulberry32) for reproducible datasets */
function createRng(seed) {
  let t = seed >>> 0
  return () => {
    t += 0x6D2B79F5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * @param {() => number} random
 * @param {number} min
 * @param {number} max
 */
function randInt(random, min, max) {
  return Math.floor(random() * (max - min + 1)) + min
}

/**
 * @param {() => number} random
 * @param {{ min: number, max: number }} range
 */
function randRange(random, range) {
  return range.min + random() * (range.max - range.min)
}

/**
 * @param {() => number} random
 * @param {Record<string, number>} weights
 */
function weightedPick(random, weights) {
  const entries = Object.entries(weights)
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let roll = random() * total
  for (const [key, weight] of entries) {
    roll -= weight
    if (roll <= 0) return key
  }
  return entries[entries.length - 1][0]
}

/**
 * @param {() => number} random
 * @param {unknown[]} arr
 */
function pick(random, arr) {
  return arr[Math.floor(random() * arr.length)]
}

function pad(n, width = 3) {
  return String(n).padStart(width, '0')
}

function isoAt(date) {
  return new Date(date).toISOString()
}

function historyStart(anchorIso) {
  const end = new Date(anchorIso)
  const start = new Date(end)
  start.setDate(start.getDate() - (HISTORY_DAYS - 1))
  start.setHours(6, 0, 0, 0)
  return start
}

/** @param {() => number} random */
export function generateZones(random) {
  /** @type {Object[]} */
  const zones = []
  let idx = 1
  for (const project of PROJECTS) {
    for (let z = 1; z <= TARGET_COUNTS.zonesPerProject; z += 1) {
      zones.push({
        id: `zone-${pad(idx, 2)}`,
        projectId: project.id,
        code: `${project.code}-Z${z}`,
        name: `${ZONE_LABELS[z - 1]} · ${project.name}`,
        label: ZONE_LABELS[z - 1],
        indexInProject: z,
      })
      idx += 1
    }
  }
  return zones
}

/** @param {() => number} random @param {Object[]} zones */
export function generateMachines(random, zones) {
  /** @type {Object[]} */
  const machines = []
  const perZone = Math.floor(TARGET_COUNTS.machines / zones.length)
  let extra = TARGET_COUNTS.machines - perZone * zones.length
  let mIdx = 1

  for (const zone of zones) {
    const count = perZone + (extra > 0 ? 1 : 0)
    if (extra > 0) extra -= 1

    for (let i = 0; i < count; i += 1) {
      const model = pick(random, SANY_MODELS)
      machines.push({
        id: `sany-${pad(mIdx, 3)}`,
        assetTag: `SANY-${zone.code}-${pad(i + 1, 2)}`,
        projectId: zone.projectId,
        zoneId: zone.id,
        manufacturer: 'SANY',
        model: model.model,
        type: model.type,
        maxTorque: model.maxTorque,
        maxRpm: model.maxRpm,
        commissionedAt: isoAt(new Date(2025, randInt(random, 0, 11), randInt(random, 1, 28))),
      })
      mIdx += 1
    }
  }
  return machines
}

/** @param {() => number} random @param {Object[]} zones @param {Object[]} machines */
export function generateCameras(random, zones, machines) {
  /** @type {Object[]} */
  const cameras = []
  const perZone = Math.floor(TARGET_COUNTS.cameras / zones.length)
  let extra = TARGET_COUNTS.cameras - perZone * zones.length
  let cIdx = 1

  for (const zone of zones) {
    const count = perZone + (extra > 0 ? 1 : 0)
    if (extra > 0) extra -= 1
    const zoneMachines = machines.filter(m => m.zoneId === zone.id)

    for (let i = 0; i < count; i += 1) {
      const linkedMachine = zoneMachines[i % zoneMachines.length] ?? null
      cameras.push({
        id: `cam-ai-${pad(cIdx, 3)}`,
        projectId: zone.projectId,
        zoneId: zone.id,
        machineId: linkedMachine?.id ?? null,
        name: `AI Cam ${zone.code}-${pad(i + 1, 2)}`,
        streamType: i % 5 === 0 ? 'ptz' : 'fixed',
        aiEnabled: true,
        coverage: pick(random, ['pile_row', 'machine_cab', 'danger_zone', 'access_road', 'batching']),
      })
      cIdx += 1
    }
  }
  return cameras
}

/** @param {() => number} random @param {Object[]} zones @param {Object[]} machines */
export function generatePiles(random, zones, machines) {
  /** @type {Object[]} */
  const piles = []
  const perZone = Math.floor(TARGET_COUNTS.piles / zones.length)
  let extra = TARGET_COUNTS.piles - perZone * zones.length
  let pIdx = 1

  for (const zone of zones) {
    const count = perZone + (extra > 0 ? 1 : 0)
    if (extra > 0) extra -= 1
    const zoneMachines = machines.filter(m => m.zoneId === zone.id)

    for (let i = 0; i < count; i += 1) {
      const status = pick(random, PILE_STATUSES)
      const assignedMachine = pick(random, zoneMachines)
      piles.push({
        id: `pile-${pad(pIdx, 4)}`,
        projectId: zone.projectId,
        zoneId: zone.id,
        code: `${zone.code}-P${pad(i + 1, 3)}`,
        diameterMm: pick(random, [600, 800, 1000, 1200]),
        designDepthM: randInt(random, 18, 42),
        actualDepthM: status === 'planned' ? 0 : randRange(random, { min: 8, max: 40 }),
        status,
        progressPct: pileProgressFromStatus(status),
        assignedMachineId: assignedMachine?.id ?? null,
        plannedDate: isoAt(new Date(2026, 5, randInt(random, 17, 24))),
      })
      pIdx += 1
    }
  }
  return piles
}

/** @param {() => number} random @param {Object[]} zones */
export function generateWorkers(random, zones) {
  /** @type {Object[]} */
  const workers = []
  const perZone = Math.floor(TARGET_COUNTS.workers / zones.length)
  let extra = TARGET_COUNTS.workers - perZone * zones.length
  let wIdx = 1

  for (const zone of zones) {
    const count = perZone + (extra > 0 ? 1 : 0)
    if (extra > 0) extra -= 1
    const teamId = `team-${zone.code}`

    for (let i = 0; i < count; i += 1) {
      const contractor = pick(random, CONTRACTORS)
      workers.push({
        id: `wrk-${pad(wIdx, 3)}`,
        projectId: zone.projectId,
        zoneId: zone.id,
        teamId,
        employeeCode: `${contractor.code}-${pad(wIdx, 4)}`,
        name: `NV-${zone.code}-${pad(i + 1, 2)}`,
        role: pick(random, WORKER_ROLES),
        contractorId: contractor.id,
        contractorName: contractor.name,
        shift: pick(random, ['Ca 1', 'Ca 2', 'Ca 3']),
      })
      wIdx += 1
    }
  }
  return workers
}

/**
 * Build one telemetry snapshot respecting state business profile.
 * @param {() => number} random
 * @param {Object} machine
 * @param {Date} timestamp
 * @param {string} state
 * @param {Object} context
 */
function buildTelemetryRow(random, machine, timestamp, state, context) {
  const profile = STATE_BUSINESS_PROFILES[state]
  const idleMinutes = Math.round(randRange(random, profile.idleMinutes))
  const rpm = Math.round(randRange(random, profile.rpm) * 10) / 10
  const torque = Math.round(randRange(random, profile.torque) * 10) / 10
  const workerCount = randInt(random, profile.workerCount.min, profile.workerCount.max)
  const temperature = Math.round(randRange(random, profile.temperature) * 10) / 10
  const vibration = Math.round(randRange(random, profile.vibration) * 100) / 100

  let errorCode = null
  let errorLabel = null
  if (state === 'TECHNICAL_ERROR') {
    const err = profile.errorCode === 'AUTO'
      ? pickErrorCode(machine.id, isoAt(timestamp))
      : pickErrorCode(machine.id, machine.id)
    errorCode = err.code
    errorLabel = err.label
  }

  const concretePhase = state === 'WORKING' && random() > 0.55
  const concreteTruckVisible = state === 'WAITING_CONCRETE'
    ? false
    : state === 'WORKING' && concretePhase
      ? true
      : profile.concreteTruckVisible

  const safetyViolation = state === 'SAFETY_STOP'
    ? random() > 0.35
    : profile.safetyViolation

  const dangerZoneIntrusion = state === 'SAFETY_STOP'
    ? !safetyViolation || random() > 0.4
    : profile.dangerZoneIntrusion

  const row = {
    id: `tel-${machine.id}-${timestamp.getTime()}`,
    machineId: machine.id,
    projectId: machine.projectId,
    zoneId: machine.zoneId,
    timestamp: isoAt(timestamp),
    operationalState: state,
    idleMinutes,
    rpm,
    torque,
    temperature,
    vibration,
    workerCount,
    signalStatus: profile.signalStatus,
    hasPlan: profile.hasPlan,
    planId: profile.hasPlan ? context.planId : null,
    errorCode,
    errorLabel,
    safetyViolation,
    dangerZoneIntrusion,
    concreteTruckVisible,
    concretePhase,
    fuelLevelPct: randInt(random, 25, 98),
    hoursMeter: randInt(random, 1200, 8900),
  }

  return row
}

/**
 * @param {() => number} random
 * @param {Object[]} machines
 * @param {Object[]} piles
 */
export function generateWorkPlans(random, machines, piles) {
  /** @type {Object[]} */
  const plans = []
  let planIdx = 1

  for (const machine of machines) {
    const zonePiles = piles.filter(p => p.zoneId === machine.zoneId && p.status !== 'completed')
    const assigned = zonePiles.filter(p => p.assignedMachineId === machine.id)
    const targets = assigned.length > 0 ? assigned : zonePiles.slice(0, 3)

    for (const pile of targets.slice(0, randInt(random, 1, 3))) {
      plans.push({
        id: `plan-${pad(planIdx, 4)}`,
        machineId: machine.id,
        pileId: pile.id,
        projectId: machine.projectId,
        zoneId: machine.zoneId,
        shift: pick(random, ['Ca 1', 'Ca 2', 'Ca 3']),
        plannedStart: isoAt(new Date(2026, 5, randInt(random, 17, 24), randInt(random, 6, 14))),
        plannedEnd: isoAt(new Date(2026, 5, randInt(random, 17, 24), randInt(random, 15, 22))),
        status: pick(random, ['scheduled', 'in_progress', 'completed', 'cancelled']),
      })
      planIdx += 1
    }
  }
  return plans
}

/**
 * @param {() => number} random
 * @param {Object[]} machines
 * @param {Object[]} workPlans
 * @param {number} targetCount
 */
export function generateTelemetry(random, machines, workPlans, targetCount) {
  const start = historyStart(ANCHOR_DATE)
  const end = new Date(ANCHOR_DATE)
  const slots = buildTimeSlots(start, end, TELEMETRY_INTERVAL_MINUTES)

  /** @type {Object[]} */
  const telemetry = []
  /** @type {Map<string, string>} */
  const machinePlanMap = new Map()
  for (const plan of workPlans) {
    if (plan.status === 'in_progress' || plan.status === 'scheduled') {
      machinePlanMap.set(plan.machineId, plan.id)
    }
  }

  let attempts = 0
  const maxAttempts = targetCount * 4

  while (telemetry.length < targetCount && attempts < maxAttempts) {
    attempts += 1
    const machine = pick(random, machines)
    const timestamp = pick(random, slots)
    const state = weightedPick(random, MACHINE_STATE_WEIGHTS)
    const planId = machinePlanMap.get(machine.id) ?? `plan-${machine.id}-default`

    const row = buildTelemetryRow(random, machine, timestamp, state, { planId })

    const issues = validateTelemetryRow(row)
    if (issues.length === 0) {
      row.consistencyScore = scoreStateConsistency(state, row)
      telemetry.push(row)
    }
  }

  telemetry.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  return telemetry
}

/**
 * @param {() => number} random
 * @param {Object[]} telemetry
 * @param {Object[]} cameras
 * @param {number} targetCount
 */
export function generateCameraEvents(random, telemetry, cameras, targetCount) {
  /** @type {Object[]} */
  const events = []
  const eventPool = telemetry.length > 0
    ? telemetry
    : []

  const stateToEventType = {
    WAITING_CONCRETE: 'concrete_truck_missing',
    SAFETY_STOP: 'worker_in_danger_zone',
    WORKING: 'pile_progress_detected',
    IDLE: 'equipment_idle_detected',
    OFF_PLAN: 'unauthorized_vehicle',
    WAITING_OPERATOR: 'crowd_near_machine',
    TECHNICAL_ERROR: 'equipment_idle_detected',
    HARD_GEOLOGY: 'pile_progress_detected',
    NO_SIGNAL: 'equipment_idle_detected',
    PLANNED_IDLE: 'equipment_idle_detected',
  }

  let eIdx = 1
  let attempts = 0

  while (events.length < targetCount && attempts < targetCount * 3) {
    attempts += 1
    const tel = pick(random, eventPool)
    if (!tel) break

    const camera = cameras.find(c => c.zoneId === tel.zoneId && (c.machineId === tel.machineId || random() > 0.5))
      ?? pick(random, cameras.filter(c => c.zoneId === tel.zoneId))
    if (!camera) continue

    const preferredType = stateToEventType[tel.operationalState] ?? pick(random, CAMERA_AI_EVENT_TYPES).type
    const meta = CAMERA_AI_EVENT_TYPES.find(e => e.type === preferredType)
      ?? pick(random, CAMERA_AI_EVENT_TYPES)

    const expectations = deriveCameraExpectations(tel.operationalState, tel)
    const confidence = Math.round((0.72 + random() * 0.26) * 100) / 100

    events.push({
      id: `cae-${pad(eIdx, 5)}`,
      cameraId: camera.id,
      machineId: tel.machineId,
      projectId: tel.projectId,
      zoneId: tel.zoneId,
      timestamp: tel.timestamp,
      type: meta.type,
      label: meta.label,
      confidence,
      concreteTruckVisible: expectations.concreteTruckVisible,
      workerInDangerZone: expectations.workerInDangerZone,
      ppeViolation: expectations.ppeViolation,
      snapshotRef: `/equipment-intelligence/snapshots/${camera.id}/${tel.timestamp.slice(0, 10)}.jpg`,
    })
    eIdx += 1
  }

  while (events.length < targetCount) {
    const camera = pick(random, cameras)
    const meta = pick(random, CAMERA_AI_EVENT_TYPES)
    events.push({
      id: `cae-${pad(eIdx, 5)}`,
      cameraId: camera.id,
      machineId: camera.machineId,
      projectId: camera.projectId,
      zoneId: camera.zoneId,
      timestamp: isoAt(new Date(2026, 5, randInt(random, 17, 24), randInt(random, 6, 20), randInt(random, 0, 59))),
      type: meta.type,
      label: meta.label,
      confidence: Math.round((0.65 + random() * 0.3) * 100) / 100,
      concreteTruckVisible: null,
      workerInDangerZone: meta.type === 'worker_in_danger_zone',
      ppeViolation: meta.type === 'ppe_violation',
      snapshotRef: `/equipment-intelligence/snapshots/${camera.id}/fallback.jpg`,
    })
    eIdx += 1
  }

  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  return events
}

/**
 * @param {() => number} random
 * @param {Object[]} telemetry
 * @param {Object[]} machines
 * @param {number} targetCount
 */
export function generateAlerts(random, telemetry, machines, targetCount) {
  /** @type {Object[]} */
  const alerts = []
  const flagged = telemetry.filter(t =>
    ['SAFETY_STOP', 'TECHNICAL_ERROR', 'NO_SIGNAL', 'OFF_PLAN', 'HARD_GEOLOGY', 'WAITING_CONCRETE', 'WAITING_OPERATOR'].includes(t.operationalState),
  )

  let aIdx = 1
  const used = new Set()

  for (const tel of flagged) {
    if (alerts.length >= targetCount) break
    const key = `${tel.machineId}:${tel.operationalState}:${tel.timestamp.slice(0, 13)}`
    if (used.has(key)) continue
    used.add(key)

    const machine = machines.find(m => m.id === tel.machineId)
    const category = stateToAlertCategory(tel.operationalState)
    const severity = tel.operationalState === 'SAFETY_STOP' || tel.operationalState === 'TECHNICAL_ERROR'
      ? pick(random, ['critical', 'high'])
      : pick(random, ALERT_SEVERITIES)

    alerts.push({
      id: `alr-${pad(aIdx, 4)}`,
      projectId: tel.projectId,
      zoneId: tel.zoneId,
      machineId: tel.machineId,
      telemetryId: tel.id,
      timestamp: tel.timestamp,
      category,
      severity,
      operationalState: tel.operationalState,
      title: alertTitle(tel.operationalState, machine?.assetTag),
      message: alertMessage(tel),
      acknowledged: random() > 0.55,
      resolved: random() > 0.72,
    })
    aIdx += 1
  }

  while (alerts.length < targetCount) {
    const tel = pick(random, telemetry)
    const machine = machines.find(m => m.id === tel.machineId)
    alerts.push({
      id: `alr-${pad(aIdx, 4)}`,
      projectId: tel.projectId,
      zoneId: tel.zoneId,
      machineId: tel.machineId,
      telemetryId: tel.id,
      timestamp: tel.timestamp,
      category: pick(random, ALERT_CATEGORIES),
      severity: pick(random, ALERT_SEVERITIES),
      operationalState: tel.operationalState,
      title: alertTitle(tel.operationalState, machine?.assetTag),
      message: alertMessage(tel),
      acknowledged: random() > 0.6,
      resolved: random() > 0.75,
    })
    aIdx += 1
  }

  alerts.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  return alerts
}

/** @param {string} state @param {string | undefined} assetTag */
function alertTitle(state, assetTag) {
  const tag = assetTag ?? 'Máy SANY'
  const map = {
    IDLE: `${tag} — Chờ việc kéo dài`,
    WAITING_CONCRETE: `${tag} — Chờ bê tông`,
    WAITING_OPERATOR: `${tag} — Thiếu vận hành viên`,
    SAFETY_STOP: `${tag} — Dừng an toàn`,
    TECHNICAL_ERROR: `${tag} — Lỗi kỹ thuật`,
    HARD_GEOLOGY: `${tag} — Địa chất cứng`,
    NO_SIGNAL: `${tag} — Mất tín hiệu`,
    OFF_PLAN: `${tag} — Chạy ngoài kế hoạch`,
    WORKING: `${tag} — Cảnh báo vận hành`,
    PLANNED_IDLE: `${tag} — Nghỉ theo kế hoạch`,
  }
  return map[state] ?? `${tag} — Cảnh báo`
}

/** @param {Object} tel */
function alertMessage(tel) {
  if (tel.operationalState === 'WAITING_CONCRETE') {
    return `Camera AI không phát hiện xe bê tông. Idle ${tel.idleMinutes} phút.`
  }
  if (tel.operationalState === 'WAITING_OPERATOR') {
    return `Chỉ ${tel.workerCount} nhân sự tại tổ — dưới ngưỡng vận hành.`
  }
  if (tel.operationalState === 'SAFETY_STOP') {
    return `Vi phạm an toàn${tel.dangerZoneIntrusion ? ' — xâm nhập vùng nguy hiểm' : ''}.`
  }
  if (tel.operationalState === 'TECHNICAL_ERROR') {
    return `${tel.errorLabel ?? 'Lỗi hệ thống'} · ${tel.temperature}°C · rung ${tel.vibration} mm/s.`
  }
  if (tel.operationalState === 'HARD_GEOLOGY') {
    return `Momen ${tel.torque}% · RPM ${tel.rpm} — địa chất cứng bất thường.`
  }
  if (tel.operationalState === 'NO_SIGNAL') {
    return 'Thiết bị OFFLINE — không nhận telemetry.'
  }
  if (tel.operationalState === 'OFF_PLAN') {
    return `Máy hoạt động RPM ${tel.rpm} nhưng không có kế hoạch pile tương ứng.`
  }
  if (tel.operationalState === 'IDLE') {
    return `Idle ${tel.idleMinutes} phút — vượt ngưỡng chờ việc.`
  }
  return `Trạng thái ${tel.operationalState} · idle ${tel.idleMinutes} phút.`
}

/**
 * @param {() => number} random
 * @param {Object[]} alerts
 * @param {Object[]} machines
 * @param {Object[]} piles
 * @param {number} targetCount
 */
export function generateRecommendations(random, alerts, machines, piles, targetCount) {
  /** @type {Object[]} */
  const recommendations = []
  let rIdx = 1

  const stateToRec = {
    WAITING_CONCRETE: 'schedule_concrete',
    WAITING_OPERATOR: 'assign_operator',
    TECHNICAL_ERROR: 'maintenance_window',
    HARD_GEOLOGY: 'geology_survey',
    SAFETY_STOP: 'safety_briefing',
    NO_SIGNAL: 'camera_reposition',
    OFF_PLAN: 'optimize_pile_sequence',
    IDLE: 'relocate_equipment',
  }

  for (const alert of alerts) {
    if (recommendations.length >= targetCount) break
    const recType = stateToRec[alert.operationalState] ?? pick(random, RECOMMENDATION_TYPES)
    recommendations.push({
      id: `rec-${pad(rIdx, 3)}`,
      projectId: alert.projectId,
      zoneId: alert.zoneId,
      machineId: alert.machineId,
      alertId: alert.id,
      type: recType,
      priority: alert.severity === 'critical' ? 'high' : alert.severity === 'high' ? 'medium' : 'low',
      title: recommendationTitle(recType),
      description: recommendationDescription(recType, alert),
      estimatedImpactPct: randInt(random, 5, 28),
      createdAt: alert.timestamp,
      status: pick(random, ['open', 'in_review', 'accepted', 'dismissed']),
    })
    rIdx += 1
  }

  while (recommendations.length < targetCount) {
    const machine = pick(random, machines)
    const pile = pick(random, piles.filter(p => p.zoneId === machine.zoneId))
    const recType = pick(random, RECOMMENDATION_TYPES)
    recommendations.push({
      id: `rec-${pad(rIdx, 3)}`,
      projectId: machine.projectId,
      zoneId: machine.zoneId,
      machineId: machine.id,
      pileId: pile?.id ?? null,
      alertId: null,
      type: recType,
      priority: pick(random, ['high', 'medium', 'low']),
      title: recommendationTitle(recType),
      description: recommendationDescription(recType, { operationalState: 'WORKING', machineId: machine.id }),
      estimatedImpactPct: randInt(random, 3, 22),
      createdAt: isoAt(new Date(2026, 5, randInt(random, 17, 24), randInt(random, 7, 18))),
      status: pick(random, ['open', 'in_review', 'accepted']),
    })
    rIdx += 1
  }

  return recommendations
}

/** @param {string} type */
function recommendationTitle(type) {
  const map = {
    relocate_equipment: 'Di dời máy sang zone có backlog cao',
    schedule_concrete: 'Điều phối lịch bê tông cho ca kế tiếp',
    assign_operator: 'Bổ sung vận hành viên cho tổ',
    maintenance_window: 'Lên lịch bảo trì khẩn',
    geology_survey: 'Khảo sát địa chất bổ sung',
    safety_briefing: 'Họp an toàn tại hiện trường',
    optimize_pile_sequence: 'Tối ưu thứ tự đóng cọc',
    camera_reposition: 'Hiệu chỉnh góc camera AI',
  }
  return map[type] ?? 'Đề xuất vận hành'
}

/** @param {string} type @param {Object} ctx */
function recommendationDescription(type, ctx) {
  switch (type) {
    case 'schedule_concrete':
      return 'Camera AI xác nhận không có xe bê tông — đề xuất gọi đội bê tông trong 45 phút.'
    case 'assign_operator':
      return 'Worker count thấp hơn ngưỡng tổ — cử thêm 1 vận hành viên SANY.'
    case 'maintenance_window':
      return `Máy ${ctx.machineId ?? ''} báo lỗi kỹ thuật — đề xuất dừng 2h để kiểm tra thủy lực.`
    case 'geology_survey':
      return 'Torque cao + RPM thấp — kiểm tra lớp địa chất trước khi khoan tiếp.'
    case 'safety_briefing':
      return 'Có sự kiện SAFETY_STOP — tổ chức toolbox 15 phút tại zone.'
    case 'camera_reposition':
      return 'Mất tín hiệu telemetry — kiểm tra antena và vị trí camera giám sát.'
    case 'optimize_pile_sequence':
      return 'Phát hiện OFF_PLAN — đồng bộ lại lịch pile với điều phối.'
    case 'relocate_equipment':
      return 'Idle kéo dài — chuyển máy sang zone có 3+ pile planned.'
    default:
      return 'Đề xuất tối ưu vận hành thiết bị SANY.'
  }
}

/**
 * Generate full enterprise dataset.
 * @param {{ seed?: number }} [options]
 */
export function generateEquipmentIntelligenceDataset(options = {}) {
  const random = createRng(options.seed ?? RNG_SEED)

  const zones = generateZones(random)
  const machines = generateMachines(random, zones)
  const cameras = generateCameras(random, zones, machines)
  const piles = generatePiles(random, zones, machines)
  const workers = generateWorkers(random, zones)
  const workPlans = generateWorkPlans(random, machines, piles)

  const telemetryTarget = randInt(random, TARGET_COUNTS.telemetry.min, TARGET_COUNTS.telemetry.max)
  const cameraEventsTarget = randInt(random, TARGET_COUNTS.cameraEvents.min, TARGET_COUNTS.cameraEvents.max)
  const alertsTarget = randInt(random, TARGET_COUNTS.alerts.min, TARGET_COUNTS.alerts.max)
  const recommendationsTarget = randInt(random, TARGET_COUNTS.recommendations.min, TARGET_COUNTS.recommendations.max)

  const telemetry = generateTelemetry(random, machines, workPlans, telemetryTarget)
  const cameraEvents = generateCameraEvents(random, telemetry, cameras, cameraEventsTarget)
  const alerts = generateAlerts(random, telemetry, machines, alertsTarget)
  const recommendations = generateRecommendations(random, alerts, machines, piles, recommendationsTarget)

  const validationSample = telemetry.slice(0, 200)
  const validationFailures = validationSample.filter(row => validateTelemetryRow(row).length > 0)

  return {
    meta: {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      seed: options.seed ?? RNG_SEED,
      anchorDate: ANCHOR_DATE,
      historyDays: HISTORY_DAYS,
      counts: {
        projects: PROJECTS.length,
        zones: zones.length,
        machines: machines.length,
        cameras: cameras.length,
        piles: piles.length,
        workers: workers.length,
        workPlans: workPlans.length,
        telemetry: telemetry.length,
        cameraEvents: cameraEvents.length,
        alerts: alerts.length,
        recommendations: recommendations.length,
      },
      validation: {
        sampleSize: validationSample.length,
        failures: validationFailures.length,
        passRate: Math.round(((validationSample.length - validationFailures.length) / validationSample.length) * 1000) / 10,
      },
    },
    projects: PROJECTS,
    zones,
    machines,
    cameras,
    piles,
    workers,
    workPlans,
    telemetry,
    cameraEvents,
    alerts,
    recommendations,
  }
}
