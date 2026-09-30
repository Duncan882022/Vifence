import { MERGED_IFC_SOURCES, type IfcSourceId } from '../types'
import { DAM_HOP_ASSET_ID, INSPECTION_PROJECT } from '../data/inspectionProject'

export const INSPECTION_PROJECT_ID = 'sgc-dsct'

export interface InspectionPackageMeta {
  id: string
  label: string
  name: string
  file: string
  sources: IfcSourceId[]
  assetId: string
}

/** DUL.ifc (cáp, neo, thép định vị) + SUON.ifc (bê tông, thép sườn) = một dầm hộp. */
export const INSPECTION_PACKAGES: InspectionPackageMeta[] = [
  {
    id: DAM_HOP_ASSET_ID,
    label: 'Dầm hộp DƯL',
    name: 'Dầm hộp DƯL 32.6m',
    file: 'DUL.ifc + SUON.ifc',
    sources: MERGED_IFC_SOURCES,
    assetId: DAM_HOP_ASSET_ID,
  },
]

/** Gói / nhịp cũ trước khi gộp mô hình. */
const LEGACY_SEGMENTS = ['dul', 'suon', 'dul-01', 'dul-02', 'dul-03', 'suon-01']

export function inspectionHomePath(): string {
  return '/inspection'
}

export function inspectionPackageListPath(projectId = INSPECTION_PROJECT.id): string {
  return `/inspection/${projectId}`
}

export function inspectionWorkspacePath(projectId: string, pkg: string = DAM_HOP_ASSET_ID): string {
  return `/inspection/${projectId}/${pkg}`
}

export function findPackage(id: string): InspectionPackageMeta | undefined {
  return INSPECTION_PACKAGES.find(pkg => pkg.id === id)
}

export function isLegacySegment(segment: string): boolean {
  return LEGACY_SEGMENTS.includes(segment)
}

/** Old URLs /inspection/dul-01, /inspection/sgc-dsct/suon → dầm hộp gộp. */
export function legacyInspectionRedirect(segment: string): string | null {
  if (segment === INSPECTION_PROJECT.id) return null
  if (findPackage(segment)) return null
  if (isLegacySegment(segment)) return inspectionWorkspacePath(INSPECTION_PROJECT.id)
  return null
}

export const CLASSIFICATION_STEPS = ['project', 'package', 'detail'] as const

export function classificationStepIndex(params: { projectId?: string; packageId?: string }): (typeof CLASSIFICATION_STEPS)[number] {
  if (params.packageId && findPackage(params.packageId)) return 'detail'
  if (params.projectId === INSPECTION_PROJECT.id) return 'package'
  return 'project'
}
