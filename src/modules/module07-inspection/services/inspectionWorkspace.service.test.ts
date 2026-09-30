import { describe, expect, it } from 'vitest'
import { DAM_HOP_CHECKLISTS } from '../data/inspectionChecklists'
import { INSPECTION_ASSETS } from '../data/inspectionProject'
import {
  bindChecklistsToObjects,
  centerKpis,
  checklistsForAsset,
  computeCompleteness,
  countByKind,
  countByOrigin,
  emptyKindHint,
  filterObjects,
  generateChecklistsFromObjects,
  missingPlanGaps,
  packageAssets,
  planChecklistsFor,
  relatedChecklists,
  tagMatches,
} from './inspectionWorkspace.service'
import type { BimObject } from '../types'

function obj(id: string, patch: Partial<BimObject>): BimObject {
  return {
    id,
    ifcGuid: id,
    ifcClass: 'IfcBuildingElementProxy',
    name: id,
    kind: 'concrete',
    stage: 'gd1',
    assetId: 'dam-hop',
    parentId: null,
    provenance: 'extracted',
    source: 'suon',
    tags: [],
    properties: [],
    ...patch,
  }
}

const SCENE: BimObject[] = [
  obj('c-bottom', { tags: ['concrete-bottom', 'concrete'] }),
  obj('c-web-l', { stage: 'gd2', tags: ['concrete-web', 'concrete'] }),
  obj('c-deck', { stage: 'gd3', tags: ['concrete-deck', 'concrete'] }),
  obj('cable-b', { kind: 'dul', source: 'dul', tags: ['cable-bottom', 'cable'] }),
  obj('cable-w', { kind: 'dul', source: 'dul', stage: 'gd2', tags: ['cable-web', 'cable'] }),
  obj('anc-w', { kind: 'anchor', source: 'dul', stage: 'gd2', tags: ['anchor-web', 'anchor'] }),
  obj('d8-bottom', { kind: 'rebar', source: 'dul', tags: ['rebar-bottom', 'rebar', 'rebar-duct-support'] }),
  obj('d8-web', { kind: 'rebar', source: 'dul', stage: 'gd2', tags: ['rebar-web', 'rebar', 'rebar-duct-support'] }),
  obj('inf-deck', {
    kind: 'rebar', stage: 'gd3', source: 'inferred', provenance: 'inferred', tags: ['rebar-deck', 'inferred-rebar'],
    properties: [{ key: 'afc', label: 'Bản vẽ bố trí thép', value: null, provenance: 'required' }],
  }),
  obj('inf-bearing', {
    kind: 'embed', source: 'inferred', provenance: 'inferred', tags: ['bearing-plate'],
    properties: [{ key: 'afc', label: 'Bản vẽ chi tiết chôn sẵn', value: null, provenance: 'required' }],
  }),
]

const byCode = (code: string) => DAM_HOP_CHECKLISTS.find(c => c.code === code)!

describe('dầm hộp ITP', () => {
  it('has KT / HP / QA steps for all 3 stages', () => {
    for (const stage of ['gd1', 'gd2', 'gd3'] as const) {
      const types = new Set(DAM_HOP_CHECKLISTS.filter(c => c.stage === stage).map(c => c.checkType))
      expect([...types].sort()).toEqual(['HP', 'KT', 'QA'])
    }
  })

  it('every step has a method, reference and a BIM binding', () => {
    for (const item of DAM_HOP_CHECKLISTS) {
      expect(item.method, item.code).toBeTruthy()
      expect(item.reference, item.code).toBeTruthy()
      expect(item.matchTags?.length, item.code).toBeGreaterThan(0)
    }
  })

  it('codes are unique and in order', () => {
    const codes = DAM_HOP_CHECKLISTS.map(c => c.code)
    expect(new Set(codes).size).toBe(codes.length)
    expect(codes[0]).toBe('1.1')
    expect(codes[codes.length - 1]).toBe('3.13')
  })

  it('stressing is a hold point with ±6% elongation, design force Cần bổ sung', () => {
    const hp = byCode('3.8')
    expect(hp.checkType).toBe('HP')
    expect(hp.tolerance).toMatch(/±6%/)
    expect(hp.designProvenance).toBe('required')
  })
})

describe('tag binding', () => {
  it('"a+b" needs every tag', () => {
    expect(tagMatches(['rebar-web', 'rebar-duct-support'], 'rebar-duct-support+rebar-web')).toBe(true)
    expect(tagMatches(['rebar-bottom', 'rebar-duct-support'], 'rebar-duct-support+rebar-web')).toBe(false)
    expect(tagMatches(undefined, 'rebar')).toBe(false)
  })

  it('binds bottom-slab duct check to bottom cables + bottom D8 only', () => {
    const [bound] = bindChecklistsToObjects([byCode('1.4')], SCENE)
    expect(bound.objectIds.sort()).toEqual(['cable-b', 'd8-bottom'])
  })

  it('binds web duct-support check to web D8 only', () => {
    const [bound] = bindChecklistsToObjects([byCode('2.2')], SCENE)
    expect(bound.objectIds).toEqual(['d8-web'])
  })

  it('stressing HP spans cables from both stages', () => {
    const [bound] = bindChecklistsToObjects([byCode('3.8')], SCENE)
    expect(bound.objectIds.sort()).toEqual(['anc-w', 'cable-b', 'cable-w'])
  })

  it('inferred deck rebar is inspected in GĐ3', () => {
    const plan = planChecklistsFor('dam-hop', SCENE)
    const related = relatedChecklists(plan, 'inf-deck', SCENE.find(o => o.id === 'inf-deck')).map(c => c.code)
    expect(related).toContain('3.1')
    expect(related.every(code => code?.startsWith('3.'))).toBe(true)
  })
})

describe('filterObjects', () => {
  it('filters by stage, kind and origin', () => {
    expect(filterObjects(SCENE, 'gd3', [], []).map(o => o.id)).toEqual(['c-deck', 'inf-deck'])
    expect(filterObjects(SCENE, 'all', ['rebar'], ['inferred']).map(o => o.id)).toEqual(['inf-deck'])
    expect(filterObjects(SCENE, 'all', [], ['extracted']).some(o => o.source === 'inferred')).toBe(false)
  })

  it('counts IFC vs Đề xuất', () => {
    expect(countByOrigin(SCENE)).toEqual({ extracted: 8, inferred: 2 })
  })
})

describe('plan gaps + completeness', () => {
  it('groups required properties per label instead of per object', () => {
    const many = [...SCENE, obj('inf-deck-2', { ...SCENE[8], id: 'inf-deck-2' })]
    const gaps = missingPlanGaps(many, [])
    expect(gaps.labels).toContain('Bản vẽ bố trí thép (2 cấu kiện)')
    expect(gaps.count).toBe(2)
  })

  it('lists design values Cần bổ sung by checklist', () => {
    const gaps = missingPlanGaps([], [byCode('3.6')])
    expect(gaps.labels[0]).toMatch(/f'c/)
    expect(gaps.labels[0]).toMatch(/^f'c thiết kế — 3\.6/)
  })

  it('reports open hold points and inferred parts', () => {
    const plan = planChecklistsFor('dam-hop', SCENE)
    const items = computeCompleteness(SCENE, plan)
    const hold = items.find(i => i.id === 'hold')!
    expect(hold.ok).toBe(false)
    expect(hold.detail).toContain('3.8')
    expect(hold.detail).not.toContain('1.8')
    expect(items.find(i => i.id === 'inferred')?.label).toMatch(/^2 cấu kiện Đề xuất/)
    expect(items.find(i => i.id === 'geom')?.ok).toBe(true)
  })
})

describe('assets', () => {
  it('one package: Dầm hộp DƯL 32.6m', () => {
    expect(packageAssets().map(a => a.id)).toEqual(['dam-hop'])
    expect(packageAssets()[0].name).toBe('Dầm hộp DƯL 32.6m')
    expect(checklistsForAsset('dam-hop').length).toBe(DAM_HOP_CHECKLISTS.length)
  })

  it('does not invent fail records', () => {
    const kpis = centerKpis(INSPECTION_ASSETS)
    expect(kpis.fail).toBe(0)
    expect(kpis.totalComponents).toBe(1)
  })

  it('falls back to generated checklists without an authored plan', () => {
    const generated = generateChecklistsFromObjects('orphan', [
      obj('bar', { kind: 'rebar', properties: [{ key: 'dia', label: 'Đường kính', value: 'D12', provenance: 'extracted' }] }),
    ])
    expect(generated.some(item => item.title.includes('D12'))).toBe(true)
    expect(planChecklistsFor('orphan', [obj('x', {})])).toHaveLength(1)
  })
})

describe('kind presence', () => {
  it('counts each đối tượng bucket', () => {
    expect(countByKind(SCENE)).toEqual({ concrete: 3, rebar: 3, dul: 2, anchor: 1, embed: 1 })
  })

  it('explains empty chips from the merged files', () => {
    const counts = { concrete: 1, rebar: 370, dul: 0, anchor: 0, embed: 0 }
    expect(emptyKindHint('DUL.ifc + SUON.ifc', counts, [])).toBeNull()
    expect(emptyKindHint('DUL.ifc + SUON.ifc', counts, ['anchor'])).toBe('DUL.ifc + SUON.ifc không chứa Anchor.')
  })
})
