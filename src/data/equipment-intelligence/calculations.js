/**
 * Business calculations + validation for Equipment Intelligence telemetry.
 * Ensures generated mock rows respect operational state semantics.
 */

import {
  STATE_BUSINESS_PROFILES,
  TECHNICAL_ERROR_CODES,
  SIGNAL_STATUSES,
  TELEMETRY_INTERVAL_MINUTES,
  MACHINE_UTILIZATION,
  CONTINUOUS_IDLE_STATES,
  CONTINUOUS_IDLE_ALERT_TYPE,
} from './constants.js'

/**
 * @typedef {Object} NumericRange
 * @property {number} min
 * @property {number} max
 */

/**
 * @typedef {Object} StateBusinessProfile
 * @property {NumericRange} idleMinutes
 * @property {NumericRange} rpm
 * @property {NumericRange} torque
 * @property {NumericRange} workerCount
 * @property {boolean} hasPlan
 * @property {'ONLINE' | 'OFFLINE' | 'DEGRADED'} signalStatus
 * @property {boolean | null} concreteTruckVisible
 * @property {boolean} safetyViolation
 * @property {boolean} dangerZoneIntrusion
 * @property {string | null | 'AUTO'} errorCode
 * @property {NumericRange} temperature
 * @property {NumericRange} vibration
 */

/**
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(min, value, max) {
  return Math.min(max, Math.max(min, value))
}

/**
 * @param {number} value
 * @param {NumericRange} range
 * @returns {boolean}
 */
export function inRange(value, range) {
  return value >= range.min && value <= range.max
}

/**
 * @param {string} state
 * @returns {StateBusinessProfile | undefined}
 */
export function getStateProfile(state) {
  return STATE_BUSINESS_PROFILES[state]
}

/**
 * Pick a technical error code deterministically from machine id + timestamp.
 * @param {string} machineId
 * @param {string} isoTime
 * @returns {{ code: string, label: string }}
 */
export function pickErrorCode(machineId, isoTime) {
  const hash = [...`${machineId}:${isoTime}`].reduce((a, c) => a + c.charCodeAt(0), 0)
  return TECHNICAL_ERROR_CODES[hash % TECHNICAL_ERROR_CODES.length]
}

/**
 * Derive expected camera AI flags from machine state + telemetry row.
 * @param {string} state
 * @param {Object} row
 * @returns {{ concreteTruckVisible: boolean | null, workerInDangerZone: boolean, ppeViolation: boolean }}
 */
export function deriveCameraExpectations(state, row) {
  const profile = getStateProfile(state)
  if (!profile) {
    return { concreteTruckVisible: null, workerInDangerZone: false, ppeViolation: false }
  }

  let concreteTruckVisible = profile.concreteTruckVisible
  if (state === 'WAITING_CONCRETE') concreteTruckVisible = false
  if (state === 'WORKING' && row.concretePhase) concreteTruckVisible = true

  const workerInDangerZone = profile.dangerZoneIntrusion
    || (state === 'SAFETY_STOP' && row.workerCount > 0)

  const ppeViolation = state === 'SAFETY_STOP' && profile.safetyViolation

  return { concreteTruckVisible, workerInDangerZone, ppeViolation }
}

/**
 * Score how well a telemetry row matches its declared operational state (0–100).
 * @param {string} state
 * @param {Object} row
 * @returns {number}
 */
export function scoreStateConsistency(state, row) {
  const profile = getStateProfile(state)
  if (!profile) return 0

  let score = 100
  const penalties = []

  if (!inRange(row.idleMinutes, profile.idleMinutes)) {
    penalties.push(state === 'IDLE' ? 25 : 12)
  }
  if (!inRange(row.rpm, profile.rpm)) penalties.push(15)
  if (!inRange(row.torque, profile.torque)) penalties.push(15)
  if (!inRange(row.workerCount, profile.workerCount)) penalties.push(10)
  if (row.signalStatus !== profile.signalStatus) penalties.push(20)

  if (state === 'WAITING_CONCRETE' && row.concreteTruckVisible === true) penalties.push(30)
  if (state === 'WAITING_OPERATOR' && row.workerCount > 1) penalties.push(25)
  if (state === 'SAFETY_STOP' && !row.safetyViolation && !row.dangerZoneIntrusion) penalties.push(35)
  if (state === 'TECHNICAL_ERROR' && !row.errorCode && row.temperature < 75 && row.vibration < 6) {
    penalties.push(35)
  }
  if (state === 'HARD_GEOLOGY' && (row.torque < 70 || row.rpm > 14)) penalties.push(30)
  if (state === 'NO_SIGNAL' && row.signalStatus !== 'OFFLINE') penalties.push(40)
  if (state === 'OFF_PLAN' && row.hasPlan) penalties.push(35)

  score -= penalties.reduce((a, b) => a + b, 0)
  return clamp(0, score, 100)
}

/**
 * Validate telemetry row against business rules. Returns list of violation messages.
 * @param {Object} row
 * @returns {string[]}
 */
export function validateTelemetryRow(row) {
  /** @type {string[]} */
  const issues = []
  const state = row.operationalState
  const profile = getStateProfile(state)
  if (!profile) {
    issues.push(`Unknown operational state: ${state}`)
    return issues
  }

  if (state === 'IDLE' && row.idleMinutes < 30) {
    issues.push('IDLE requires idleMinutes >= 30')
  }
  if (state === 'WAITING_CONCRETE' && row.concreteTruckVisible !== false) {
    issues.push('WAITING_CONCRETE requires concreteTruckVisible === false')
  }
  if (state === 'WAITING_OPERATOR' && row.workerCount > 1) {
    issues.push('WAITING_OPERATOR requires workerCount <= 1')
  }
  if (state === 'SAFETY_STOP' && !row.safetyViolation && !row.dangerZoneIntrusion) {
    issues.push('SAFETY_STOP requires safetyViolation or dangerZoneIntrusion')
  }
  if (state === 'TECHNICAL_ERROR' && !row.errorCode && row.temperature < 75 && row.vibration < 6) {
    issues.push('TECHNICAL_ERROR requires errorCode or elevated temperature/vibration')
  }
  if (state === 'HARD_GEOLOGY' && (row.torque < 70 || row.rpm > 14)) {
    issues.push('HARD_GEOLOGY requires high torque and low rpm')
  }
  if (state === 'NO_SIGNAL' && row.signalStatus !== 'OFFLINE') {
    issues.push('NO_SIGNAL requires signalStatus OFFLINE')
  }
  if (state === 'OFF_PLAN' && row.hasPlan) {
    issues.push('OFF_PLAN requires hasPlan === false while machine is active')
  }
  if (!SIGNAL_STATUSES.includes(row.signalStatus)) {
    issues.push(`Invalid signalStatus: ${row.signalStatus}`)
  }

  return issues
}

/**
 * Aggregate KPIs from telemetry array.
 * @param {Object[]} telemetry
 * @returns {Object}
 */
export function aggregateTelemetryKpis(telemetry) {
  if (telemetry.length === 0) {
    return {
      avgIdleMinutes: 0,
      avgRpm: 0,
      avgTorque: 0,
      offlineRate: 0,
      errorRate: 0,
      safetyStopRate: 0,
      offPlanRate: 0,
    }
  }

  const n = telemetry.length
  let idleSum = 0
  let rpmSum = 0
  let torqueSum = 0
  let offline = 0
  let errors = 0
  let safety = 0
  let offPlan = 0

  for (const row of telemetry) {
    idleSum += row.idleMinutes
    rpmSum += row.rpm
    torqueSum += row.torque
    if (row.signalStatus === 'OFFLINE') offline += 1
    if (row.errorCode) errors += 1
    if (row.operationalState === 'SAFETY_STOP') safety += 1
    if (row.operationalState === 'OFF_PLAN') offPlan += 1
  }

  return {
    avgIdleMinutes: Math.round((idleSum / n) * 10) / 10,
    avgRpm: Math.round((rpmSum / n) * 10) / 10,
    avgTorque: Math.round((torqueSum / n) * 10) / 10,
    offlineRate: Math.round((offline / n) * 1000) / 10,
    errorRate: Math.round((errors / n) * 1000) / 10,
    safetyStopRate: Math.round((safety / n) * 1000) / 10,
    offPlanRate: Math.round((offPlan / n) * 1000) / 10,
  }
}

/**
 * Map operational state → primary alert category.
 * @param {string} state
 * @returns {string}
 */
export function stateToAlertCategory(state) {
  switch (state) {
    case 'SAFETY_STOP': return 'safety'
    case 'TECHNICAL_ERROR': return 'technical'
    case 'WAITING_CONCRETE': return 'concrete_supply'
    case 'WAITING_OPERATOR': return 'productivity'
    case 'HARD_GEOLOGY': return 'geology'
    case 'NO_SIGNAL': return 'connectivity'
    case 'OFF_PLAN': return 'compliance'
    default: return 'productivity'
  }
}

/**
 * Estimate pile progress percent from status.
 * @param {string} status
 * @returns {number}
 */
export function pileProgressFromStatus(status) {
  switch (status) {
    case 'planned': return 0
    case 'drilling': return 25
    case 'reinforcement': return 55
    case 'concreting': return 80
    case 'completed': return 100
    case 'on_hold': return 40
    default: return 0
  }
}

/**
 * @param {Date} start
 * @param {Date} end
 * @param {number} intervalMinutes
 * @returns {Date[]}
 */
export function buildTimeSlots(start, end, intervalMinutes) {
  /** @type {Date[]} */
  const slots = []
  const cursor = new Date(start)
  while (cursor <= end) {
    slots.push(new Date(cursor))
    cursor.setMinutes(cursor.getMinutes() + intervalMinutes)
  }
  return slots
}

/* ─────────────────────────────────────────────────────────────
   UTILIZATION-BASED ANALYTICS — 20h/day target, 30min idle cap
───────────────────────────────────────────────────────────── */

const PRODUCTIVE_STATES = new Set(['WORKING', 'HARD_GEOLOGY'])
const IDLE_STATES = new Set(['IDLE', 'PLANNED_IDLE', 'WAITING_CONCRETE', 'WAITING_OPERATOR'])
const DOWNTIME_STATES = new Set(['SAFETY_STOP', 'TECHNICAL_ERROR'])
const CONTINUOUS_IDLE_SET = new Set(CONTINUOUS_IDLE_STATES)

const TARGET_H = MACHINE_UTILIZATION.targetWorkingHoursPerDay
const INTERVAL_H = TELEMETRY_INTERVAL_MINUTES / 60
const IDLE_COST_PER_HOUR = MACHINE_UTILIZATION.idleCostPerHour
const MAX_IDLE_MIN = MACHINE_UTILIZATION.maxContinuousIdleMinutes

function round1(n) { return Math.round(n * 10) / 10 }
function round0(n) { return Math.round(n) }

function latestMachineState(machineId, telemetry) {
  const rows = telemetry
    .filter(t => t.machineId === machineId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  return rows[0]?.operationalState ?? 'NO_SIGNAL'
}

function rootCauseLabel(state) {
  const map = {
    IDLE: 'Chờ việc kéo dài',
    WAITING_CONCRETE: 'Thiếu bê tông',
    WAITING_OPERATOR: 'Thiếu vận hành viên',
    SAFETY_STOP: 'Dừng an toàn',
    TECHNICAL_ERROR: 'Lỗi kỹ thuật',
    HARD_GEOLOGY: 'Địa chất cứng',
    NO_SIGNAL: 'Mất tín hiệu',
    OFF_PLAN: 'Ngoài kế hoạch',
    PLANNED_IDLE: 'Nghỉ theo kế hoạch',
    [CONTINUOUS_IDLE_ALERT_TYPE]: 'Idle liên tục > 30 phút',
    none: 'Không có',
  }
  return map[state] ?? state
}

function dominantRootCauseFromMetrics(metricsList) {
  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const m of metricsList) {
    if (m.longestIdleStreakMinutes > MAX_IDLE_MIN) {
      counts.set(CONTINUOUS_IDLE_ALERT_TYPE, (counts.get(CONTINUOUS_IDLE_ALERT_TYPE) ?? 0) + 1)
    }
    if (m.downtimeHours > 0.5) {
      counts.set('TECHNICAL_ERROR', (counts.get('TECHNICAL_ERROR') ?? 0) + m.downtimeHours)
    }
    if (m.idleHours > 1) {
      counts.set('IDLE', (counts.get('IDLE') ?? 0) + m.idleHours)
    }
  }
  if (counts.size === 0) return 'none'
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

function riskLevelFromMetrics(openAlerts, score) {
  if (openAlerts >= 5 || score < 30) return 'critical'
  if (openAlerts >= 3 || score < 50) return 'high'
  if (openAlerts >= 1 || score < 70) return 'medium'
  return 'low'
}

/**
 * Phân tích chuỗi idle liên tục trong ngày.
 * @param {Object[]} sortedRows
 * @returns {{ longestIdleStreakMinutes: number, continuousIdleViolationCount: number }}
 */
export function analyzeContinuousIdle(sortedRows) {
  let longest = 0
  let current = 0
  let violations = 0

  for (const row of sortedRows) {
    if (CONTINUOUS_IDLE_SET.has(row.operationalState)) {
      current += TELEMETRY_INTERVAL_MINUTES
    } else {
      if (current > MAX_IDLE_MIN) violations += 1
      longest = Math.max(longest, current)
      current = 0
    }
  }
  if (current > MAX_IDLE_MIN) violations += 1
  longest = Math.max(longest, current)

  return { longestIdleStreakMinutes: longest, continuousIdleViolationCount: violations }
}

/**
 * Tính metrics theo ngày cho một máy từ telemetry rows (cùng ngày).
 * @param {Object} machine
 * @param {Object[]} dayRows
 * @returns {Object}
 */
export function computeMachineDailyMetrics(machine, dayRows) {
  const sorted = [...dayRows].sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  let productiveHours = 0
  let idleHours = 0
  let downtimeHours = 0
  let offPlanHours = 0
  let noSignalHours = 0
  let plannedHours = 0

  for (const row of sorted) {
    const h = INTERVAL_H
    if (PRODUCTIVE_STATES.has(row.operationalState)) productiveHours += h
    else if (IDLE_STATES.has(row.operationalState)) idleHours += h
    else if (DOWNTIME_STATES.has(row.operationalState)) downtimeHours += h
    else if (row.operationalState === 'OFF_PLAN') offPlanHours += h
    else if (row.operationalState === 'NO_SIGNAL') noSignalHours += h

    if (row.operationalState === 'PLANNED_IDLE' || row.hasPlan) plannedHours += h
  }

  const { longestIdleStreakMinutes, continuousIdleViolationCount } = analyzeContinuousIdle(sorted)

  const utilizationVs20h = round0(Math.min(100, (productiveHours / TARGET_H) * 100))
  const utilizationRate = round1(productiveHours / TARGET_H)

  const idleCost = round0(idleHours * IDLE_COST_PER_HOUR)

  const metrics = {
    machineId: machine.id,
    projectId: machine.projectId,
    zoneId: machine.zoneId,
    date: sorted[0]?.timestamp.slice(0, 10) ?? null,
    availableHoursPerDay: MACHINE_UTILIZATION.availableHoursPerDay,
    targetWorkingHoursPerDay: TARGET_H,
    productiveHours: round1(productiveHours),
    idleHours: round1(idleHours),
    downtimeHours: round1(downtimeHours),
    offPlanHours: round1(offPlanHours),
    noSignalHours: round1(noSignalHours),
    plannedHours: round1(plannedHours),
    targetWorkingHours: TARGET_H,
    utilizationRate,
    utilizationVs20h,
    longestIdleStreakMinutes,
    continuousIdleViolationCount,
    idleCost,
    productiveHoursToday: round1(productiveHours),
    idleHoursToday: round1(idleHours),
  }

  metrics.efficiencyScore = computeMachineEfficiencyScore(metrics)
  return metrics
}

/**
 * Efficiency Score tổng hợp (0–100).
 * @param {Object} m
 * @returns {number}
 */
export function computeMachineEfficiencyScore(m) {
  const w = MACHINE_UTILIZATION.efficiencyWeights
  const target = TARGET_H

  const productiveScore = Math.min(m.productiveHours / target, 1) * 100

  const idleRatio = Math.min(m.idleHours / target, 1)
  const streakPenalty = Math.max(0, m.longestIdleStreakMinutes - MAX_IDLE_MIN) * 1.2
  const violationPenalty = m.continuousIdleViolationCount * 18
  const idleControlScore = clamp(0, 100 - idleRatio * 55 - streakPenalty - violationPenalty, 100)

  const downtimeScore = clamp(0, 100 - (m.downtimeHours / target) * 100, 100)
  const planScore = clamp(0, 100 - (m.offPlanHours / target) * 100, 100)
  const signalScore = clamp(0, 100 - (m.noSignalHours / target) * 100, 100)

  return round0(
    w.productive * productiveScore
    + w.idleControl * idleControlScore
    + w.downtimeControl * downtimeScore
    + w.planCompliance * planScore
    + w.signalQuality * signalScore,
  )
}

/**
 * @param {Object[]} telemetry
 * @returns {string}
 */
export function getLatestTelemetryDate(telemetry) {
  if (telemetry.length === 0) return new Date().toISOString().slice(0, 10)
  return telemetry.reduce((max, t) => (t.timestamp.slice(0, 10) > max ? t.timestamp.slice(0, 10) : max), '')
}

/**
 * Metrics tất cả máy cho một ngày.
 * @param {Object} data
 * @param {string} [dateStr]
 * @returns {Object[]}
 */
export function computeAllMachineDailyMetrics(data, dateStr) {
  const date = dateStr ?? getLatestTelemetryDate(data.telemetry)
  return data.machines.map(machine => {
    const dayRows = data.telemetry.filter(
      t => t.machineId === machine.id && t.timestamp.startsWith(date),
    )
    return computeMachineDailyMetrics(machine, dayRows)
  })
}

/**
 * Sinh alert CONTINUOUS_IDLE_OVER_30_MIN từ metrics.
 * @param {Object[]} metrics
 * @param {Object} data
 * @param {string} dateStr
 * @returns {Object[]}
 */
export function deriveContinuousIdleAlerts(metrics, data, dateStr) {
  /** @type {Object[]} */
  const derived = []

  for (const m of metrics) {
    if (m.longestIdleStreakMinutes <= MAX_IDLE_MIN) continue
    const machine = data.machines.find(x => x.id === m.machineId)
    const streak = m.longestIdleStreakMinutes
    derived.push({
      id: `alr-idle-${m.machineId}-${dateStr}`,
      projectId: m.projectId,
      zoneId: m.zoneId,
      machineId: m.machineId,
      telemetryId: null,
      timestamp: `${dateStr}T12:00:00.000Z`,
      category: 'productivity',
      severity: streak >= 90 ? 'high' : streak >= 60 ? 'medium' : 'high',
      operationalState: CONTINUOUS_IDLE_ALERT_TYPE,
      title: `${machine?.assetTag ?? m.machineId} — Idle liên tục vượt ngưỡng`,
      message: `Máy không tạo sản lượng liên tục ${streak} phút, vượt ngưỡng ${MAX_IDLE_MIN} phút.`,
      acknowledged: false,
      resolved: false,
      idleStreakMinutes: streak,
    })
  }
  return derived
}

/**
 * @param {Object} data
 * @param {string} [dateStr]
 * @returns {{ metrics: Object[], alerts: Object[], date: string }}
 */
function resolveDailyContext(data, dateStr) {
  const date = dateStr ?? getLatestTelemetryDate(data.telemetry)
  const metrics = computeAllMachineDailyMetrics(data, date)
  const idleAlerts = deriveContinuousIdleAlerts(metrics, data, date)
  const mergedAlerts = [...data.alerts, ...idleAlerts]
  return { metrics, alerts: mergedAlerts, date }
}

function aggregateMetrics(metricsList) {
  const n = metricsList.length || 1
  const sum = (key) => metricsList.reduce((s, m) => s + m[key], 0)
  const avgEfficiency = round0(metricsList.reduce((s, m) => s + m.efficiencyScore, 0) / n)
  const totalProductive = round1(sum('productiveHours'))
  const utilizationRate20h = round0(Math.min(100, (totalProductive / (n * TARGET_H)) * 100))

  return {
    totalMachines: metricsList.length,
    totalProductiveHours: totalProductive,
    totalIdleHours: round1(sum('idleHours')),
    totalDowntimeHours: round1(sum('downtimeHours')),
    averageEfficiency: avgEfficiency,
    utilizationRate20h,
    estimatedIdleCost: round0(sum('idleCost')),
    machinesIdleOver30Min: metricsList.filter(m => m.longestIdleStreakMinutes > MAX_IDLE_MIN).length,
    totalIdleViolations: sum('continuousIdleViolationCount'),
  }
}

// ── 1. Executive KPIs ────────────────────────────────────────

export function calculateExecutiveKPIs(data) {
  const { metrics, alerts, date } = resolveDailyContext(data)
  const agg = aggregateMetrics(metrics)

  const openAlerts = alerts.filter(a => !a.resolved).length
  const highAlerts = alerts.filter(
    a => !a.resolved && (a.severity === 'critical' || a.severity === 'high'),
  ).length

  let productive = 0
  let idle = 0
  let downtime = 0
  let offPlan = 0
  let noSignal = 0

  for (const m of data.machines) {
    const state = latestMachineState(m.id, data.telemetry)
    if (PRODUCTIVE_STATES.has(state)) productive += 1
    else if (IDLE_STATES.has(state)) idle += 1
    else if (DOWNTIME_STATES.has(state)) downtime += 1
    else if (state === 'OFF_PLAN') offPlan += 1
    else if (state === 'NO_SIGNAL') noSignal += 1
  }

  return {
    totalMachines: agg.totalMachines,
    productiveMachines: productive,
    idleMachines: idle,
    downtimeMachines: downtime,
    offPlanMachines: offPlan,
    noSignalMachines: noSignal,
    targetWorkingHoursPerDay: TARGET_H,
    totalProductiveHoursToday: agg.totalProductiveHours,
    machinesIdleOver30Min: agg.machinesIdleOver30Min,
    utilizationRate20h: agg.utilizationRate20h,
    averageEfficiency: agg.averageEfficiency,
    openAlerts,
    highAlerts,
    estimatedIdleCost: agg.estimatedIdleCost,
    metricsDate: date,
    totalIdleViolations: agg.totalIdleViolations,
  }
}

// ── 2. Project Efficiency ────────────────────────────────────

export function calculateProjectEfficiency(data) {
  const { metrics, alerts } = resolveDailyContext(data)

  return data.projects.map(project => {
    const pMetrics = metrics.filter(m => m.projectId === project.id)
    const pMachines = data.machines.filter(m => m.projectId === project.id)
    const pAlerts = alerts.filter(a => a.projectId === project.id && !a.resolved)
    const agg = aggregateMetrics(pMetrics)

    let productive = 0
    let idle = 0
    let downtime = 0
    for (const m of pMachines) {
      const state = latestMachineState(m.id, data.telemetry)
      if (PRODUCTIVE_STATES.has(state)) productive += 1
      else if (IDLE_STATES.has(state)) idle += 1
      else if (DOWNTIME_STATES.has(state)) downtime += 1
    }

    return {
      projectId: project.id,
      projectName: project.name,
      totalMachines: pMachines.length,
      productive,
      idle,
      downtime,
      productiveHours: agg.totalProductiveHours,
      utilizationRate20h: agg.utilizationRate20h,
      efficiencyScore: agg.averageEfficiency,
      openAlerts: pAlerts.length,
      machinesIdleOver30Min: pMetrics.filter(m => m.longestIdleStreakMinutes > MAX_IDLE_MIN).length,
      mainRootCause: rootCauseLabel(dominantRootCauseFromMetrics(pMetrics)),
    }
  })
}

// ── 3. Zone Efficiency ───────────────────────────────────────

export function calculateZoneEfficiency(data) {
  const { metrics, alerts } = resolveDailyContext(data)

  return data.zones.map(zone => {
    const project = data.projects.find(p => p.id === zone.projectId)
    const zMetrics = metrics.filter(m => m.zoneId === zone.id)
    const zAlerts = alerts.filter(a => a.zoneId === zone.id && !a.resolved)
    const activePiles = data.piles.filter(
      p => p.zoneId === zone.id && p.status !== 'planned' && p.status !== 'completed',
    ).length
    const agg = aggregateMetrics(zMetrics)
    const openAlerts = zAlerts.length

    return {
      zoneId: zone.id,
      zoneName: zone.name,
      projectId: zone.projectId,
      projectName: project?.name ?? zone.projectId,
      machines: data.machines.filter(m => m.zoneId === zone.id).length,
      cameras: data.cameras.filter(c => c.zoneId === zone.id).length,
      activePiles,
      productiveHours: agg.totalProductiveHours,
      utilizationRate20h: agg.utilizationRate20h,
      efficiencyScore: agg.averageEfficiency,
      riskLevel: riskLevelFromMetrics(openAlerts, agg.averageEfficiency),
      openAlerts,
      machinesIdleOver30Min: zMetrics.filter(m => m.longestIdleStreakMinutes > MAX_IDLE_MIN).length,
      mainRootCause: rootCauseLabel(dominantRootCauseFromMetrics(zMetrics)),
    }
  })
}

// ── 4. Equipment Status Breakdown ────────────────────────────

export function calculateEquipmentStatusBreakdown(data) {
  const { machines, telemetry } = data
  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const m of machines) {
    const state = latestMachineState(m.id, telemetry)
    counts.set(state, (counts.get(state) ?? 0) + 1)
  }
  const total = machines.length || 1
  return [...counts.entries()]
    .map(([state, count]) => ({
      state,
      label: rootCauseLabel(state),
      count,
      pct: round1((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count)
}

// ── 5. Root Cause Breakdown ──────────────────────────────────

export function calculateRootCauseBreakdown(data) {
  const { metrics } = resolveDailyContext(data)
  /** @type {Map<string, number>} */
  const counts = new Map()

  for (const m of metrics) {
    if (m.continuousIdleViolationCount > 0) {
      counts.set(
        CONTINUOUS_IDLE_ALERT_TYPE,
        (counts.get(CONTINUOUS_IDLE_ALERT_TYPE) ?? 0) + m.continuousIdleViolationCount,
      )
    }
    if (m.idleHours > 0.5) {
      counts.set('IDLE', (counts.get('IDLE') ?? 0) + round1(m.idleHours))
    }
    if (m.downtimeHours > 0.3) {
      counts.set('TECHNICAL_ERROR', (counts.get('TECHNICAL_ERROR') ?? 0) + round1(m.downtimeHours))
    }
    if (m.offPlanHours > 0.2) {
      counts.set('OFF_PLAN', (counts.get('OFF_PLAN') ?? 0) + round1(m.offPlanHours))
    }
    if (m.noSignalHours > 0.2) {
      counts.set('NO_SIGNAL', (counts.get('NO_SIGNAL') ?? 0) + round1(m.noSignalHours))
    }
  }

  const total = [...counts.values()].reduce((s, v) => s + v, 0) || 1
  return [...counts.entries()]
    .map(([state, count]) => ({
      state,
      label: rootCauseLabel(state),
      count: round1(count),
      pct: round1((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count)
}

// ── 6. Top Low-Efficiency Machines ───────────────────────────

export function calculateTopLowEfficiencyMachines(data, limit = 10) {
  const { metrics, alerts } = resolveDailyContext(data)

  return metrics
    .map(m => {
      const machine = data.machines.find(x => x.id === m.machineId)
      const project = data.projects.find(p => p.id === m.projectId)
      const zone = data.zones.find(z => z.id === m.zoneId)
      const mAlerts = alerts.filter(a => a.machineId === m.machineId && !a.resolved)

      return {
        machineId: m.machineId,
        assetTag: machine?.assetTag ?? m.machineId,
        projectName: project?.name ?? m.projectId,
        zoneName: zone?.name ?? m.zoneId,
        model: machine?.model ?? '',
        efficiencyScore: m.efficiencyScore,
        utilizationVs20h: m.utilizationVs20h,
        productiveHoursToday: m.productiveHoursToday,
        idleHoursToday: m.idleHoursToday,
        longestIdleStreakMinutes: m.longestIdleStreakMinutes,
        continuousIdleViolationCount: m.continuousIdleViolationCount,
        idleCost: m.idleCost,
        currentState: latestMachineState(m.machineId, data.telemetry),
        totalIdleMinutes: round0(m.idleHours * 60),
        openAlerts: mAlerts.length,
        mainRootCause: m.longestIdleStreakMinutes > MAX_IDLE_MIN
          ? rootCauseLabel(CONTINUOUS_IDLE_ALERT_TYPE)
          : rootCauseLabel('IDLE'),
      }
    })
    .sort((a, b) => a.efficiencyScore - b.efficiencyScore)
    .slice(0, limit)
}

// ── 7. Top Risk Zones ────────────────────────────────────────

export function calculateTopRiskZones(data, limit = 8) {
  const zoneList = calculateZoneEfficiency(data)
  const riskOrder = { critical: 0, high: 1, medium: 2, low: 3 }
  return zoneList
    .sort((a, b) => {
      const rDiff = (riskOrder[a.riskLevel] ?? 4) - (riskOrder[b.riskLevel] ?? 4)
      return rDiff !== 0 ? rDiff : b.openAlerts - a.openAlerts
    })
    .slice(0, limit)
}

// ── 8. Productivity Trend ────────────────────────────────────

export function calculateProductivityTrend(data) {
  const dates = [...new Set(data.telemetry.map(t => t.timestamp.slice(0, 10)))].sort()

  return dates.map(date => {
    const dayMetrics = computeAllMachineDailyMetrics(data, date)
    const agg = aggregateMetrics(dayMetrics)
    const alertCount = [...data.alerts, ...deriveContinuousIdleAlerts(dayMetrics, data, date)]
      .filter(a => a.timestamp.slice(0, 10) === date).length

    return {
      date,
      efficiencyScore: agg.averageEfficiency,
      utilizationRate20h: agg.utilizationRate20h,
      productiveHours: agg.totalProductiveHours,
      idleHours: agg.totalIdleHours,
      downtimeHours: agg.totalDowntimeHours,
      machinesIdleOver30Min: agg.machinesIdleOver30Min,
      alertCount,
    }
  })
}

// ── 9. Priority Alerts ───────────────────────────────────────

export function getPriorityAlerts(data, limit = 20) {
  const { alerts } = resolveDailyContext(data)
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }

  return alerts
    .filter(a => !a.resolved)
    .map(a => {
      const machine = data.machines.find(m => m.id === a.machineId)
      const zone = data.zones.find(z => z.id === a.zoneId)
      const project = data.projects.find(p => p.id === a.projectId)
      return {
        ...a,
        assetTag: machine?.assetTag ?? a.machineId,
        machineModel: machine?.model ?? null,
        zoneName: zone?.name ?? a.zoneId,
        projectName: project?.name ?? a.projectId,
      }
    })
    .sort((a, b) => {
      if (a.operationalState === CONTINUOUS_IDLE_ALERT_TYPE && b.operationalState !== CONTINUOUS_IDLE_ALERT_TYPE) return -1
      if (b.operationalState === CONTINUOUS_IDLE_ALERT_TYPE && a.operationalState !== CONTINUOUS_IDLE_ALERT_TYPE) return 1
      const sDiff = (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4)
      return sDiff !== 0 ? sDiff : b.timestamp.localeCompare(a.timestamp)
    })
    .slice(0, limit)
}

// ── 10. Recommendations ──────────────────────────────────────

export function getRecommendations(data, limit = 20) {
  const priorityOrder = { high: 0, medium: 1, low: 2 }
  const statusOrder = { open: 0, in_review: 1, accepted: 2, dismissed: 3 }

  return data.recommendations
    .filter(r => r.status !== 'dismissed')
    .map(r => {
      const machine = data.machines.find(m => m.id === r.machineId)
      const zone = data.zones.find(z => z.id === r.zoneId)
      const project = data.projects.find(p => p.id === r.projectId)
      return {
        ...r,
        assetTag: machine?.assetTag ?? r.machineId,
        machineModel: machine?.model ?? null,
        zoneName: zone?.name ?? r.zoneId,
        projectName: project?.name ?? r.projectId,
      }
    })
    .sort((a, b) => {
      const pDiff = (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3)
      if (pDiff !== 0) return pDiff
      const sDiff = (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4)
      return sDiff !== 0 ? sDiff : b.createdAt.localeCompare(a.createdAt)
    })
    .slice(0, limit)
}

/* ─────────────────────────────────────────────────────────────
   EQUIPMENT COMMAND CENTER — leadership & action analytics
───────────────────────────────────────────────────────────── */

const VND_PER_USD = 24_000
const DOWNTIME_COST_PER_HOUR = 120

/** @param {number} usd */
export function usdToVnd(usd) {
  return Math.round(usd * VND_PER_USD)
}

/** @param {number} usd */
export function formatLossVnd(usd) {
  const vnd = usdToVnd(usd)
  if (vnd >= 1_000_000) {
    const trieu = vnd / 1_000_000
    return `${trieu % 1 === 0 ? trieu : trieu.toFixed(1)} triệu VNĐ`
  }
  return `${vnd.toLocaleString('vi-VN')} VNĐ`
}

const LOSS_CAUSE_MAP = {
  WAITING_CONCRETE: 'Chờ bê tông',
  IDLE: 'Chờ mặt bằng',
  OFF_PLAN: 'Chờ mặt bằng',
  WAITING_OPERATOR: 'Thiếu tổ đội',
  TECHNICAL_ERROR: 'Lỗi kỹ thuật',
  SAFETY_STOP: 'An toàn',
  NO_SIGNAL: 'Mất tín hiệu',
  PLANNED_IDLE: 'Nghỉ theo kế hoạch',
  CONTINUOUS_IDLE_OVER_30_MIN: 'Idle liên tục > 30 phút',
}

/** @param {Object} m */
function estimatedMachineLossUsd(m) {
  return m.idleCost + m.downtimeHours * DOWNTIME_COST_PER_HOUR
    + (m.longestIdleStreakMinutes > MAX_IDLE_MIN ? (m.longestIdleStreakMinutes - MAX_IDLE_MIN) / 60 * IDLE_COST_PER_HOUR * 1.5 : 0)
}

/** @param {Object} machine @param {Object} data @param {Object[]} metrics */
function suggestRelocationZone(machine, data, metrics) {
  const candidates = data.zones.filter(z => z.projectId === machine.projectId && z.id !== machine.zoneId)
  if (candidates.length === 0) return null

  const scored = candidates.map(z => {
    const zMetrics = metrics.filter(m => m.zoneId === z.id)
    const plannedPiles = data.piles.filter(p => p.zoneId === z.id && p.status === 'planned').length
    const activePiles = data.piles.filter(p => p.zoneId === z.id && !['planned', 'completed'].includes(p.status)).length
    const avgUtil = zMetrics.length
      ? zMetrics.reduce((s, m) => s + m.utilizationVs20h, 0) / zMetrics.length
      : 50
    return { zone: z, score: plannedPiles * 3 + activePiles * 2 + avgUtil * 0.1 }
  })

  return scored.sort((a, b) => b.score - a.score)[0]?.zone ?? null
}

/** @param {string} state @param {Object} m */
function inferMachineRootCause(state, m) {
  if (m.longestIdleStreakMinutes > MAX_IDLE_MIN) return 'Idle liên tục > 30 phút'
  if (state === 'WAITING_CONCRETE') return 'Chờ bê tông'
  if (state === 'WAITING_OPERATOR') return 'Thiếu tổ đội'
  if (state === 'TECHNICAL_ERROR') return 'Lỗi kỹ thuật'
  if (state === 'SAFETY_STOP') return 'An toàn'
  if (state === 'OFF_PLAN' || state === 'IDLE') return 'Chờ mặt bằng'
  if (state === 'NO_SIGNAL') return 'Mất tín hiệu'
  return rootCauseLabel(state)
}

/** @param {string} category */
function evidenceForCategory(category) {
  const map = {
    safety: ['Camera AI', 'SANY', 'Nhật ký'],
    technical: ['SANY', 'Nhật ký'],
    concrete_supply: ['Camera AI', 'SANY', 'Kế hoạch'],
    productivity: ['Camera AI', 'SANY', 'Nhật ký'],
    geology: ['SANY', 'Kế hoạch'],
    connectivity: ['SANY', 'Camera AI'],
    compliance: ['Kế hoạch', 'Nhật ký'],
  }
  return map[category] ?? ['Camera AI', 'SANY', 'Nhật ký']
}

/** @param {Object} data @param {Object[]} metrics */
function countPilesAtRisk(data, metrics) {
  const idleViolationMachineIds = [
    ...new Set(metrics.filter(m => m.longestIdleStreakMinutes > MAX_IDLE_MIN).map(m => m.machineId)),
  ]

  let count = 0
  for (const machineId of idleViolationMachineIds) {
    const blocked = data.piles.some(
      p => p.assignedMachineId === machineId
        && ['drilling', 'concreting', 'reinforcement'].includes(p.status),
    )
    if (blocked) count += 1
  }
  return count
}

const STATE_BADGE_UI = {
  WORKING: { label: 'Đang tạo sản lượng' },
  HARD_GEOLOGY: { label: 'Đang tạo sản lượng' },
  IDLE: { label: 'Chờ việc' },
  WAITING_CONCRETE: { label: 'Chờ bê tông' },
  WAITING_OPERATOR: { label: 'Thiếu vận hành' },
  TECHNICAL_ERROR: { label: 'Lỗi kỹ thuật' },
  SAFETY_STOP: { label: 'Dừng an toàn' },
  NO_SIGNAL: { label: 'Mất tín hiệu' },
  OFF_PLAN: { label: 'Ngoài kế hoạch' },
}

const ACTION_SUGGESTIONS = {
  CONTINUOUS_IDLE_OVER_30_MIN: 'Điều phối ngay sang khu có backlog',
  WAITING_CONCRETE: 'Gọi xe bê tông trong 45 phút',
  WAITING_OPERATOR: 'Bổ sung vận hành viên',
  TECHNICAL_ERROR: 'Bảo trì khẩn SANY',
  SAFETY_STOP: 'Toolbox an toàn tại hiện trường',
  IDLE: 'Điều chuyển sang khu có cọc chờ',
  OFF_PLAN: 'Đồng bộ lịch cọc với điều phối',
  NO_SIGNAL: 'Kiểm tra antena IoT',
}

// ── Command Overview ─────────────────────────────────────────

export function calculateCommandOverview(data) {
  const { metrics, alerts, date } = resolveDailyContext(data)
  const n = metrics.length
  const totalTargetHours = round0(n * TARGET_H)
  const totalProductiveHours = round1(metrics.reduce((s, m) => s + m.productiveHours, 0))
  const lossHours = round1(Math.max(0, totalTargetHours - totalProductiveHours))

  const totalLossUsd = metrics.reduce((s, m) => s + estimatedMachineLossUsd(m), 0)
  const machinesNeedingAction = metrics.filter(
    m => m.longestIdleStreakMinutes > MAX_IDLE_MIN || m.efficiencyScore < 50,
  ).length
  const pilesAtRisk = countPilesAtRisk(data, metrics)
  const utilizationRate = round0(Math.min(100, (totalProductiveHours / totalTargetHours) * 100))
  const machinesIdleOver30Min = metrics.filter(m => m.longestIdleStreakMinutes > MAX_IDLE_MIN).length

  return {
    metricsDate: date,
    totalTargetHoursToday: totalTargetHours,
    totalProductiveHoursToday: totalProductiveHours,
    lossHoursToday: lossHours,
    estimatedLossUsd: round0(totalLossUsd),
    estimatedLossVnd: formatLossVnd(totalLossUsd),
    machinesNeedingAction,
    pilesAtRisk,
    utilizationRate20h: utilizationRate,
    machinesIdleOver30Min,
    averageEfficiencyScore: round0(metrics.reduce((s, m) => s + m.efficiencyScore, 0) / (n || 1)),
  }
}

// ── Immediate Actions ────────────────────────────────────────

export function calculateImmediateActions(data, limit = 5) {
  const { metrics, alerts, date } = resolveDailyContext(data)

  return metrics
    .map(m => {
      const machine = data.machines.find(x => x.id === m.machineId)
      const project = data.projects.find(p => p.id === m.projectId)
      const zone = data.zones.find(z => z.id === m.zoneId)
      const currentState = latestMachineState(m.machineId, data.telemetry)
      const mAlerts = alerts.filter(a => a.machineId === m.machineId && !a.resolved)
      const topAlert = mAlerts[0]
      const lossUsd = estimatedMachineLossUsd(m)
      const rootCause = inferMachineRootCause(currentState, m)
      const targetZone = machine ? suggestRelocationZone(machine, data, metrics) : null
      const category = topAlert?.category ?? 'productivity'

      const urgencyScore =
        (m.longestIdleStreakMinutes > MAX_IDLE_MIN ? 200 + m.longestIdleStreakMinutes : 0)
        + lossUsd * 0.5
        + mAlerts.length * 25
        + (100 - m.efficiencyScore)

      let statusLabel = STATE_BADGE_UI[currentState]?.label ?? currentState
      if (m.longestIdleStreakMinutes > MAX_IDLE_MIN) {
        statusLabel = `Idle liên tục ${m.longestIdleStreakMinutes} phút`
      }

      let suggestedAction = ACTION_SUGGESTIONS[currentState] ?? 'Kiểm tra và điều phối máy'
      if (targetZone && (m.longestIdleStreakMinutes > MAX_IDLE_MIN || currentState === 'IDLE')) {
        suggestedAction = `Điều chuyển sang ${targetZone.name.split(' · ')[0]}`
      }

      const hash = [...(machine?.assetTag ?? m.machineId)].reduce((a, c) => a + c.charCodeAt(0), 0)
      const aiConfidence = 72 + (hash % 23)

      return {
        machineId: m.machineId,
        assetTag: machine?.assetTag ?? m.machineId,
        model: machine?.model ?? '',
        projectId: m.projectId,
        projectName: project?.name ?? m.projectId,
        zoneId: m.zoneId,
        zoneName: zone?.name?.split(' · ')[0] ?? m.zoneId,
        currentState,
        statusLabel,
        continuousIdleMinutes: m.longestIdleStreakMinutes,
        estimatedLossUsd: round0(lossUsd),
        estimatedLossVnd: formatLossVnd(lossUsd),
        aiConfidence,
        rootCause,
        evidenceSources: evidenceForCategory(category),
        suggestedAction,
        targetZoneName: targetZone?.name?.split(' · ')[0] ?? null,
        urgencyScore,
        openAlerts: mAlerts.length,
        metricsDate: date,
      }
    })
    .filter(a => a.continuousIdleMinutes > MAX_IDLE_MIN || a.openAlerts > 0 || a.estimatedLossUsd > 50)
    .sort((a, b) => b.urgencyScore - a.urgencyScore)
    .slice(0, limit)
}

// ── Efficiency Loss Breakdown ────────────────────────────────

export function calculateEfficiencyLossBreakdown(data) {
  const date = getLatestTelemetryDate(data.telemetry)
  const dayRows = data.telemetry.filter(t => t.timestamp.startsWith(date))

  /** @type {Map<string, { hours: number, costUsd: number }>} */
  const byCause = new Map()

  for (const row of dayRows) {
    if (PRODUCTIVE_STATES.has(row.operationalState)) continue
    const label = LOSS_CAUSE_MAP[row.operationalState] ?? rootCauseLabel(row.operationalState)
    const h = INTERVAL_H
    const costRate = DOWNTIME_STATES.has(row.operationalState)
      ? DOWNTIME_COST_PER_HOUR
      : IDLE_COST_PER_HOUR
    const entry = byCause.get(label) ?? { hours: 0, costUsd: 0 }
    entry.hours += h
    entry.costUsd += h * costRate
    byCause.set(label, entry)
  }

  const totalHours = [...byCause.values()].reduce((s, v) => s + v.hours, 0) || 1

  return [...byCause.entries()]
    .map(([label, { hours, costUsd }]) => ({
      label,
      lossHours: round1(hours),
      lossCostUsd: round0(costUsd),
      lossCostVnd: formatLossVnd(costUsd),
      pct: round1((hours / totalHours) * 100),
    }))
    .sort((a, b) => b.lossHours - a.lossHours)
}

// ── Project Risk Matrix ──────────────────────────────────────

export function calculateProjectRiskMatrix(data) {
  const { metrics, alerts } = resolveDailyContext(data)

  return data.projects.map(project => {
    const pMetrics = metrics.filter(m => m.projectId === project.id)
    const pAlerts = alerts.filter(a => a.projectId === project.id && !a.resolved)
    const agg = aggregateMetrics(pMetrics)
    const lossUsd = pMetrics.reduce((s, m) => s + estimatedMachineLossUsd(m), 0)

    let riskLevel = 'low'
    if (agg.utilizationRate20h < 50 || pAlerts.length >= 10) riskLevel = 'critical'
    else if (agg.utilizationRate20h < 65 || pAlerts.length >= 5) riskLevel = 'high'
    else if (agg.utilizationRate20h < 75 || pAlerts.length >= 2) riskLevel = 'medium'

    return {
      projectId: project.id,
      projectName: project.name,
      efficiencyScore: agg.averageEfficiency,
      utilizationRate20h: agg.utilizationRate20h,
      riskLevel,
      estimatedLossUsd: round0(lossUsd),
      estimatedLossVnd: formatLossVnd(lossUsd),
      openAlerts: pAlerts.length,
      mainRootCause: rootCauseLabel(dominantRootCauseFromMetrics(pMetrics)),
      totalMachines: pMetrics.length,
      machinesIdleOver30Min: pMetrics.filter(m => m.longestIdleStreakMinutes > MAX_IDLE_MIN).length,
    }
  }).sort((a, b) => {
    const risk = { critical: 0, high: 1, medium: 2, low: 3 }
    const rDiff = (risk[a.riskLevel] ?? 4) - (risk[b.riskLevel] ?? 4)
    return rDiff !== 0 ? rDiff : b.estimatedLossUsd - a.estimatedLossUsd
  })
}

// ── Zone Intelligence ────────────────────────────────────────

export function calculateZoneIntelligence(data) {
  const { metrics, alerts } = resolveDailyContext(data)

  return data.zones.map(zone => {
    const project = data.projects.find(p => p.id === zone.projectId)
    const zMetrics = metrics.filter(m => m.zoneId === zone.id)
    const zMachines = data.machines.filter(m => m.zoneId === zone.id)
    const zAlerts = alerts.filter(a => a.zoneId === zone.id && !a.resolved)
    const agg = aggregateMetrics(zMetrics)
    const activePiles = data.piles.filter(
      p => p.zoneId === zone.id && !['planned', 'completed'].includes(p.status),
    ).length

    let idleMachines = 0
    for (const m of zMachines) {
      const state = latestMachineState(m.id, data.telemetry)
      if (IDLE_STATES.has(state)) idleMachines += 1
    }

    const safetyEvents = zAlerts.filter(
      a => a.category === 'safety' || a.operationalState === 'SAFETY_STOP',
    ).length

    return {
      zoneId: zone.id,
      zoneName: zone.name.split(' · ')[0],
      projectId: zone.projectId,
      projectName: project?.name ?? zone.projectId,
      machines: zMachines.length,
      activePiles,
      cameras: data.cameras.filter(c => c.zoneId === zone.id).length,
      efficiencyScore: agg.averageEfficiency,
      utilizationRate20h: agg.utilizationRate20h,
      idleMachines,
      machinesIdleOver30Min: zMetrics.filter(m => m.longestIdleStreakMinutes > MAX_IDLE_MIN).length,
      safetyEvents,
      riskLevel: riskLevelFromMetrics(zAlerts.length, agg.averageEfficiency),
      openAlerts: zAlerts.length,
      mainRootCause: rootCauseLabel(dominantRootCauseFromMetrics(zMetrics)),
      estimatedLossVnd: formatLossVnd(zMetrics.reduce((s, m) => s + estimatedMachineLossUsd(m), 0)),
    }
  }).sort((a, b) => {
    const risk = { critical: 0, high: 1, medium: 2, low: 3 }
    const rDiff = (risk[a.riskLevel] ?? 4) - (risk[b.riskLevel] ?? 4)
    return rDiff !== 0 ? rDiff : b.openAlerts - a.openAlerts
  })
}

// ── Best / Worst Machines ────────────────────────────────────

export function calculateTopBestMachines(data, limit = 5) {
  const { metrics } = resolveDailyContext(data)

  return metrics
    .map(m => {
      const machine = data.machines.find(x => x.id === m.machineId)
      const project = data.projects.find(p => p.id === m.projectId)
      return {
        machineId: m.machineId,
        assetTag: machine?.assetTag ?? m.machineId,
        model: machine?.model ?? '',
        projectName: project?.name ?? m.projectId,
        productiveHoursToday: m.productiveHoursToday,
        utilizationVs20h: m.utilizationVs20h,
        efficiencyScore: m.efficiencyScore,
      }
    })
    .sort((a, b) => b.efficiencyScore - a.efficiencyScore || b.productiveHoursToday - a.productiveHoursToday)
    .slice(0, limit)
}

export function calculateTopWorstMachines(data, limit = 5) {
  const { metrics } = resolveDailyContext(data)

  return metrics
    .map(m => {
      const machine = data.machines.find(x => x.id === m.machineId)
      const project = data.projects.find(p => p.id === m.projectId)
      const currentState = latestMachineState(m.machineId, data.telemetry)
      const lossUsd = estimatedMachineLossUsd(m)
      return {
        machineId: m.machineId,
        assetTag: machine?.assetTag ?? m.machineId,
        projectName: project?.name ?? m.projectId,
        productiveHoursToday: m.productiveHoursToday,
        continuousIdleMinutes: m.longestIdleStreakMinutes,
        estimatedLossVnd: formatLossVnd(lossUsd),
        rootCause: inferMachineRootCause(currentState, m),
        efficiencyScore: m.efficiencyScore,
      }
    })
    .sort((a, b) => a.efficiencyScore - b.efficiencyScore)
    .slice(0, limit)
}

// ── Command Recommendations ────────────────────────────────────

export function calculateCommandRecommendations(data, limit = 8) {
  const { metrics } = resolveDailyContext(data)
  const base = getRecommendations(data, limit * 2)

  return base.slice(0, limit).map(r => {
    const machine = data.machines.find(m => m.id === r.machineId)
    const fromZone = data.zones.find(z => z.id === r.zoneId)
    const mMetric = metrics.find(m => m.machineId === r.machineId)
    const targetZone = machine ? suggestRelocationZone(machine, data, metrics) : null

    const productiveGain = r.type === 'relocate_equipment'
      ? round1(randFromId(r.id, 4, 8))
      : round1(randFromId(r.id, 2, 5))
    const savingsUsd = productiveGain * IDLE_COST_PER_HOUR

    let actionType = 'general'
    if (r.type === 'relocate_equipment') actionType = 'relocate'
    else if (r.type === 'maintenance_window') actionType = 'maintenance'

    return {
      ...r,
      actionType,
      fromProject: r.projectName,
      fromZone: fromZone?.name?.split(' · ')[0] ?? r.zoneName,
      toZone: targetZone?.name?.split(' · ')[0] ?? null,
      productiveGainHours: productiveGain,
      estimatedSavingsVnd: formatLossVnd(savingsUsd),
      currentEfficiency: mMetric?.efficiencyScore ?? null,
    }
  })
}

/** Deterministic pseudo-random from string id */
function randFromId(id, min, max) {
  const hash = [...id].reduce((a, c) => a + c.charCodeAt(0), 0)
  return min + (hash % (max - min + 1))
}
