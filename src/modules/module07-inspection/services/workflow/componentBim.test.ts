import { describe, expect, it } from 'vitest'
import { componentObjectSets, mergeComponentSets } from './componentBim'
import { COMPONENTS } from '../../data/workflow/hnqnProject'
import type { BimObject } from '../../types'

function obj(id: string, kind: BimObject['kind'], tags: string[], bars = 0): BimObject {
  return {
    id,
    ifcGuid: id,
    ifcClass: 'IfcBuildingElement',
    name: id,
    kind,
    stage: 'gd1',
    assetId: 's002',
    parentId: null,
    provenance: 'extracted',
    source: 'suon',
    tags,
    properties: bars ? [{ key: 'bars', label: 'bars', value: String(bars), provenance: 'extracted' }] : [],
  }
}

describe('component BIM sets', () => {
  const catalog = [
    obj('c-bottom', 'concrete', ['zone-bottom']),
    obj('c-web', 'concrete', ['zone-web-left']),
    obj('r-bottom', 'rebar', ['zone-bottom'], 12),
    obj('r-web', 'rebar', ['zone-web-left'], 8),
    obj('cable', 'dul', ['zone-bottom', 'cable-bottom']),
  ]

  it('isolates one component and ghosts sibling concrete as context', () => {
    const sets = componentObjectSets(catalog, COMPONENTS['web-left'], ['rebar'])
    expect(sets.focusIds).toEqual(['r-web'])
    expect(sets.contextIds).toEqual(['c-web'])
    expect(sets.barCount).toBe(8)
  })

  it('merges a combo without duplicating context that is already focus', () => {
    const merged = mergeComponentSets([
      componentObjectSets(catalog, COMPONENTS.bottom, ['rebar', 'concrete']),
      componentObjectSets(catalog, COMPONENTS['web-left'], ['rebar', 'concrete']),
    ])
    expect(merged.focusIds.sort()).toEqual(['c-bottom', 'c-web', 'r-bottom', 'r-web'])
    expect(merged.contextIds).toEqual([])
    expect(merged.barCount).toBe(20)
  })
})
