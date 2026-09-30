import type { IfcSourceId, InspectionStageId, ObjectKind, Provenance } from '../types'

export interface IfcWorkerLoadMessage {
  type: 'load'
  /** Loaded in order into one scene; later files skip GUIDs already seen. */
  sources: { source: IfcSourceId; url: string }[]
  wasmBase: string
}

export interface IfcCatalogItem {
  id: string
  expressID: number
  ifcGuid: string
  ifcClass: string
  name: string
  kind: ObjectKind
  stage: InspectionStageId
  source: IfcSourceId | 'inferred'
  provenance: Provenance
  parentId: string | null
  tags: string[]
  properties: { key: string; label: string; value: string | null; unit?: string; provenance: Provenance }[]
}

export type MeshStyle = 'solid' | 'ghost'

export interface IfcMeshChunk {
  id: string
  kind: ObjectKind
  provenance: Provenance
  style: MeshStyle
  positions: Float32Array
  indices: Uint32Array
}

export type IfcWorkerEvent =
  | { type: 'progress'; phase: 'fetch' | 'open' | 'geom'; pct: number; message: string }
  | { type: 'catalog'; items: IfcCatalogItem[] }
  | { type: 'meshes'; meshes: IfcMeshChunk[] }
  | { type: 'done'; count: number }
  | { type: 'error'; message: string }
