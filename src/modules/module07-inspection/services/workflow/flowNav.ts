import { ASSETS, PROJECTS, STRUCTURES } from '../../data/workflow/hnqnProject'
import type { AssetRecord, ProjectRecord, StageCode, StructureRecord } from '../../workflow.types'

export type PassportTab = 'overview' | 'stages' | 'bim' | 'evidence' | 'documents' | 'issues' | 'history'

export const flowPaths = {
  home: () => '/inspection',
  project: (projectId: string) => `/inspection/p/${projectId}`,
  structure: (projectId: string, structureId: string) => `/inspection/p/${projectId}/s/${structureId}`,
  asset: (assetId: string, tab?: PassportTab) => `/inspection/asset/${assetId}${tab && tab !== 'overview' ? `?tab=${tab}` : ''}`,
  prepare: (assetId: string, stage: StageCode) => `/inspection/asset/${assetId}/stage/${stage}/prepare`,
  engineering: (assetId: string) => `/inspection/asset/${assetId}/engineering`,
  live: (sessionId: string) => `/inspection/session/${sessionId}/live`,
  finish: (sessionId: string) => `/inspection/session/${sessionId}/finish`,
  review: (sessionId: string) => `/inspection/session/${sessionId}/review`,
  report: (sessionId: string) => `/inspection/session/${sessionId}/report`,
}

export interface AssetContext {
  asset: AssetRecord
  structure: StructureRecord
  project: ProjectRecord
}

export function resolveAsset(assetId: string): AssetContext | null {
  const asset = ASSETS.find(a => a.id === assetId)
  const structure = asset && STRUCTURES.find(s => s.id === asset.structureId)
  const project = structure && PROJECTS.find(p => p.id === structure.projectId)
  return asset && structure && project ? { asset, structure, project } : null
}

export function findAssetByQr(qr: string): AssetRecord | undefined {
  const value = qr.trim().toUpperCase()
  return ASSETS.find(a => a.qrId.toUpperCase() === value)
}

const LEGACY_SEGMENTS = new Set(['sgc-dsct'])

/** URL cũ `/inspection/sgc-dsct/...` (BIM workspace) → Engineering Mode của S002. */
export function legacyFlowRedirect(segment: string): string | null {
  return LEGACY_SEGMENTS.has(segment) ? flowPaths.engineering('s002') : null
}
