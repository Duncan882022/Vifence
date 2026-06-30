/**
 * Equipment Intelligence Center — mock data entry point.
 *
 * @example
 * import { getEquipmentIntelligenceDataset } from '@/data/equipment-intelligence'
 * const data = getEquipmentIntelligenceDataset()
 */

export {
  DATA_VERSION,
  ANCHOR_DATE,
  HISTORY_DAYS,
  TELEMETRY_INTERVAL_MINUTES,
  MACHINE_UTILIZATION,
  CONTINUOUS_IDLE_STATES,
  CONTINUOUS_IDLE_ALERT_TYPE,
  TARGET_COUNTS,
  PROJECTS,
  ZONE_LABELS,
  SANY_MODELS,
  MACHINE_STATE_WEIGHTS,
  STATE_BUSINESS_PROFILES,
  TECHNICAL_ERROR_CODES,
  CAMERA_AI_EVENT_TYPES,
  ALERT_SEVERITIES,
  ALERT_CATEGORIES,
  RECOMMENDATION_TYPES,
  WORKER_ROLES,
  CONTRACTORS,
  PILE_STATUSES,
  SIGNAL_STATUSES,
  RNG_SEED,
} from './constants.js'

export {
  clamp,
  inRange,
  getStateProfile,
  pickErrorCode,
  deriveCameraExpectations,
  scoreStateConsistency,
  validateTelemetryRow,
  aggregateTelemetryKpis,
  stateToAlertCategory,
  pileProgressFromStatus,
  buildTimeSlots,
  analyzeContinuousIdle,
  computeMachineDailyMetrics,
  computeMachineEfficiencyScore,
  computeAllMachineDailyMetrics,
  deriveContinuousIdleAlerts,
  getLatestTelemetryDate,
  calculateExecutiveKPIs,
  calculateProjectEfficiency,
  calculateZoneEfficiency,
  calculateEquipmentStatusBreakdown,
  calculateRootCauseBreakdown,
  calculateTopLowEfficiencyMachines,
  calculateTopRiskZones,
  calculateProductivityTrend,
  getPriorityAlerts,
  getRecommendations,
  calculateCommandOverview,
  calculateImmediateActions,
  calculateEfficiencyLossBreakdown,
  calculateProjectRiskMatrix,
  calculateZoneIntelligence,
  calculateTopBestMachines,
  calculateTopWorstMachines,
  calculateCommandRecommendations,
  formatLossVnd,
} from './calculations.js'

export {
  generateZones,
  generateMachines,
  generateCameras,
  generatePiles,
  generateWorkers,
  generateWorkPlans,
  generateTelemetry,
  generateCameraEvents,
  generateAlerts,
  generateRecommendations,
  generateEquipmentIntelligenceDataset,
} from './mockGenerator.js'

import { generateEquipmentIntelligenceDataset } from './mockGenerator.js'
import { RNG_SEED } from './constants.js'

/** @type {ReturnType<generateEquipmentIntelligenceDataset> | null} */
let cachedDataset = null

/**
 * Lazy singleton — generates once per session unless reset.
 * @param {{ seed?: number, force?: boolean }} [options]
 */
export function getEquipmentIntelligenceDataset(options = {}) {
  if (!cachedDataset || options.force) {
    cachedDataset = generateEquipmentIntelligenceDataset({
      seed: options.seed ?? RNG_SEED,
    })
  }
  return cachedDataset
}

/** Clear memoized dataset (tests / hot reload). */
export function resetEquipmentIntelligenceDataset() {
  cachedDataset = null
}

/**
 * Filter dataset entities by project id.
 * @param {ReturnType<generateEquipmentIntelligenceDataset>} dataset
 * @param {string} projectId
 */
export function filterDatasetByProject(dataset, projectId) {
  return {
    ...dataset,
    zones: dataset.zones.filter(z => z.projectId === projectId),
    machines: dataset.machines.filter(m => m.projectId === projectId),
    cameras: dataset.cameras.filter(c => c.projectId === projectId),
    piles: dataset.piles.filter(p => p.projectId === projectId),
    workers: dataset.workers.filter(w => w.projectId === projectId),
    workPlans: dataset.workPlans.filter(p => p.projectId === projectId),
    telemetry: dataset.telemetry.filter(t => t.projectId === projectId),
    cameraEvents: dataset.cameraEvents.filter(e => e.projectId === projectId),
    alerts: dataset.alerts.filter(a => a.projectId === projectId),
    recommendations: dataset.recommendations.filter(r => r.projectId === projectId),
  }
}

/**
 * Filter dataset entities by zone id.
 * @param {ReturnType<generateEquipmentIntelligenceDataset>} dataset
 * @param {string} zoneId
 */
export function filterDatasetByZone(dataset, zoneId) {
  return {
    ...dataset,
    machines: dataset.machines.filter(m => m.zoneId === zoneId),
    cameras: dataset.cameras.filter(c => c.zoneId === zoneId),
    piles: dataset.piles.filter(p => p.zoneId === zoneId),
    workers: dataset.workers.filter(w => w.zoneId === zoneId),
    workPlans: dataset.workPlans.filter(p => p.zoneId === zoneId),
    telemetry: dataset.telemetry.filter(t => t.zoneId === zoneId),
    cameraEvents: dataset.cameraEvents.filter(e => e.zoneId === zoneId),
    alerts: dataset.alerts.filter(a => a.zoneId === zoneId),
    recommendations: dataset.recommendations.filter(r => r.zoneId === zoneId),
  }
}

/**
 * Resolve project record by human-readable name or code.
 * @param {ReturnType<generateEquipmentIntelligenceDataset>} dataset
 * @param {string} query
 */
export function findProject(dataset, query) {
  const q = query.trim().toLowerCase()
  return dataset.projects.find(
    p => p.id === query || p.code.toLowerCase() === q || p.name.toLowerCase() === q,
  )
}
