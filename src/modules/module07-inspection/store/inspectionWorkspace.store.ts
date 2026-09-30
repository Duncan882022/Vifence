import { create } from 'zustand'
import type { BimObject, InspectionStageId, ObjectKind, ObjectOrigin } from '../types'

export type LoadPhase = 'idle' | 'ifc' | 'parse' | 'stage' | 'ready' | 'error'
export type WorkspaceMode = 'planning' | 'review' | 'field'
export type KpiFilter = 'all' | 'waiting' | 'progress' | 'done' | 'fail'
type OriginFilter = ObjectOrigin

interface WorkspaceState {
  selectedAssetId: string | null
  stageFilter: InspectionStageId | 'all'
  kindFilters: ObjectKind[]
  originFilters: OriginFilter[]
  selectedIds: string[]
  hoveredId: string | null
  hoveredChecklistId: string | null
  focusedChecklistId: string | null
  isolatedIds: string[] | null
  unsaved: boolean
  savedFlash: boolean
  loadPhase: LoadPhase
  loadPct: number
  loadMessage: string
  loadError: string | null
  mode: WorkspaceMode
  kpiFilter: KpiFilter
  ifcObjects: BimObject[]

  setAsset: (id: string | null) => void
  setStage: (stage: InspectionStageId | 'all') => void
  toggleKind: (kind: ObjectKind) => void
  clearKinds: () => void
  toggleOrigin: (origin: OriginFilter) => void
  clearOrigins: () => void
  setSelected: (ids: string[]) => void
  addSelected: (id: string, additive: boolean) => void
  setHovered: (id: string | null) => void
  setHoveredChecklist: (id: string | null) => void
  setFocusedChecklist: (id: string | null) => void
  isolate: (ids: string[] | null) => void
  markDirty: () => void
  savePlan: () => void
  setLoad: (phase: LoadPhase, pct?: number, error?: string | null, message?: string) => void
  setMode: (mode: WorkspaceMode) => void
  setKpiFilter: (filter: KpiFilter) => void
  assignStage: (ids: string[], stage: InspectionStageId) => void
  mergeIfcObjects: (items: BimObject[]) => void
}

export const useInspectionWorkspace = create<WorkspaceState>((set, get) => ({
  selectedAssetId: null,
  stageFilter: 'all',
  kindFilters: [],
  originFilters: [],
  selectedIds: [],
  hoveredId: null,
  hoveredChecklistId: null,
  focusedChecklistId: null,
  isolatedIds: null,
  unsaved: false,
  savedFlash: false,
  loadPhase: 'idle',
  loadPct: 0,
  loadMessage: '',
  loadError: null,
  mode: 'planning',
  kpiFilter: 'all',
  ifcObjects: [],

  setAsset: (id) => set({
    selectedAssetId: id,
    selectedIds: [],
    hoveredId: null,
    focusedChecklistId: null,
    isolatedIds: null,
    stageFilter: 'all',
    kindFilters: [],
    originFilters: [],
    ifcObjects: [],
    loadPhase: id ? 'ifc' : 'idle',
    loadPct: id ? 4 : 0,
    loadError: null,
    loadMessage: id ? 'Đang tải DUL.ifc + SUON.ifc...' : '',
  }),

  setStage: (stage) => set({ stageFilter: stage, isolatedIds: null }),

  toggleKind: (kind) => {
    const current = get().kindFilters
    set({ kindFilters: current.includes(kind) ? current.filter(k => k !== kind) : [...current, kind] })
  },
  clearKinds: () => set({ kindFilters: [] }),

  toggleOrigin: (origin) => {
    const current = get().originFilters
    set({ originFilters: current.includes(origin) ? current.filter(o => o !== origin) : [...current, origin] })
  },
  clearOrigins: () => set({ originFilters: [] }),

  setSelected: (ids) => set({ selectedIds: ids }),

  addSelected: (id, additive) => {
    if (!additive) {
      set({ selectedIds: [id] })
      return
    }
    const current = get().selectedIds
    set({ selectedIds: current.includes(id) ? current.filter(x => x !== id) : [...current, id] })
  },

  setHovered: (id) => set({ hoveredId: id }),
  setHoveredChecklist: (id) => set({ hoveredChecklistId: id }),
  setFocusedChecklist: (id) => set({ focusedChecklistId: id }),
  isolate: (ids) => set({ isolatedIds: ids && ids.length > 0 ? ids : null }),
  markDirty: () => set({ unsaved: true, savedFlash: false }),

  savePlan: () => {
    set({ unsaved: false, savedFlash: true })
    window.setTimeout(() => set({ savedFlash: false }), 1800)
  },

  setLoad: (phase, pct = 0, error = null, message = '') => set({
    loadPhase: phase,
    loadPct: pct,
    loadError: error,
    loadMessage: message,
  }),
  setMode: (mode) => set({ mode }),
  setKpiFilter: (filter) => set({ kpiFilter: filter }),
  assignStage: () => set({ unsaved: true }),

  mergeIfcObjects: (items) => {
    const current = get().ifcObjects
    const ids = new Set(items.map(o => o.id))
    set({ ifcObjects: [...current.filter(o => !ids.has(o.id)), ...items] })
  },
}))
