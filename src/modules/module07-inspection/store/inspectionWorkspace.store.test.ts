import { beforeEach, describe, expect, it } from 'vitest'
import { workspaceIsLoading } from '../services/ifcFirstPaint'
import { useInspectionWorkspace } from './inspectionWorkspace.store'

describe('inspectionWorkspace store', () => {
  beforeEach(() => {
    useInspectionWorkspace.setState({
      selectedAssetId: null,
      stageFilter: 'gd2',
      kindFilters: ['rebar'],
      originFilters: ['inferred'],
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
      ifcObjects: [{
        id: 'stale',
        ifcGuid: 'x',
        ifcClass: 'IfcBeam',
        name: 'stale',
        kind: 'concrete',
        stage: 'gd1',
        assetId: 'dam-hop',
        parentId: null,
        provenance: 'extracted',
        source: 'dul',
        properties: [],
      }],
    })
  })

  it('setAsset starts the merged DUL + SUON load and clears stale state', () => {
    useInspectionWorkspace.getState().setAsset('dam-hop')
    const s = useInspectionWorkspace.getState()
    expect(s.selectedAssetId).toBe('dam-hop')
    expect(s.ifcObjects).toEqual([])
    expect(s.stageFilter).toBe('all')
    expect(s.kindFilters).toEqual([])
    expect(s.originFilters).toEqual([])
    expect(s.loadMessage).toMatch(/DUL\.ifc \+ SUON\.ifc/)
    expect(workspaceIsLoading(s.loadPhase)).toBe(true)
  })

  it('toggles IFC / Đề xuất origin filters', () => {
    const st = useInspectionWorkspace.getState()
    st.clearOrigins()
    st.toggleOrigin('inferred')
    expect(useInspectionWorkspace.getState().originFilters).toEqual(['inferred'])
    useInspectionWorkspace.getState().toggleOrigin('inferred')
    expect(useInspectionWorkspace.getState().originFilters).toEqual([])
  })

  it('mergeIfcObjects replaces items by id', () => {
    const st = useInspectionWorkspace.getState()
    const base = st.ifcObjects[0]
    st.mergeIfcObjects([{ ...base, name: 'fresh' }, { ...base, id: 'new' }])
    const names = useInspectionWorkspace.getState().ifcObjects.map(o => `${o.id}:${o.name}`)
    expect(names).toEqual(['stale:fresh', 'new:stale'])
  })

  it('isolate([]) does not hide the whole 3D scene', () => {
    useInspectionWorkspace.getState().isolate([])
    expect(useInspectionWorkspace.getState().isolatedIds).toBeNull()
  })
})
