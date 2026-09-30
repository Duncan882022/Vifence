import { describe, expect, it } from 'vitest'
import { ASSETS, STAGES, STAGE_ORDER } from './hnqnProject'
import { briefAck, briefFor, requirementText, visualContextFor } from './requirements'

const S002 = ASSETS[0]

describe('Inspection Brief', () => {
  it('builds a six-section brief for every stage component', () => {
    for (const stage of STAGE_ORDER) {
      for (const component of STAGES[stage].components) {
        const b = briefFor(S002.id, stage, component)
        expect(b, `${stage}/${component}`).not.toBeNull()
        expect(b!.requirements.length).toBeGreaterThan(0)
        expect(b!.attention.length).toBeGreaterThan(0)
        expect(b!.outsideVideo.length).toBeGreaterThan(0)
        expect(b!.references.length).toBeGreaterThan(0)
        expect(b!.aiSupport.length).toBeGreaterThan(0)
        expect(b!.aiFocus.length).toBeGreaterThan(0)
      }
    }
  })

  it('every requirement carries a source reference', () => {
    const b = briefFor(S002.id, 'GD02', 'bottom')!
    for (const r of b.requirements) {
      expect(r.sourceDocument).toBeTruthy()
      expect(r.sourceRevision).toBeTruthy()
      expect(r.sourceReference).toBeTruthy()
    }
  })

  it('shows IFC values but generic text for MOCK sources — never invents numbers', () => {
    const b = briefFor(S002.id, 'GD02', 'bottom')!
    const qty = b.requirements.find(r => r.title === 'Số lượng thanh')!
    expect(qty.sourceKind).toBe('IFC')
    expect(requirementText(qty)).toContain('414 thanh D16')
    const lap = b.requirements.find(r => r.title === 'Chiều dài nối chồng')!
    expect(lap.sourceKind).toBe('MOCK')
    expect(requirementText(lap)).toBe('Kiểm tra chiều dài nối chồng theo bản vẽ được duyệt')
    for (const r of b.requirements.filter(x => x.sourceKind === 'MOCK')) {
      expect(requirementText(r)).not.toMatch(/\d+\s*mm/)
    }
  })

  it('references AFC / BBS / ITP revisions of the rebar example', () => {
    const refs = briefFor(S002.id, 'GD02', 'bottom')!.references.map(r => `${r.code} ${r.revision}`)
    expect(refs).toEqual(expect.arrayContaining(['SH-BG-RB-101 Rev.C', 'BBS-S002 Rev.B', 'ITP-BG-02 Rev.A']))
  })

  it('maps concrete outside-video checks to lab / survey / document', () => {
    const b = briefFor(S002.id, 'GD03', 'deck')!
    expect(b.visualContext).toBe('CONCRETE')
    const methods = Object.fromEntries(b.outsideVideo.map(o => [o.item, o.method]))
    expect(methods['Cường độ bê tông']).toBe('LAB_TEST')
    expect(methods['Cao độ']).toBe('SURVEY')
    expect(methods['Mác bê tông']).toBe('DOCUMENT_CHECK')
    expect(b.aiLimits).toContain('không kết luận cường độ')
  })

  it('assigns visual context per stage', () => {
    expect(visualContextFor('GD01', 'bottom')).toBe('FORMWORK')
    expect(visualContextFor('GD02', 'deck')).toBe('REBAR')
    expect(visualContextFor('GD04', 'anchors')).toBe('ANCHOR')
    expect(visualContextFor('GD04', 'cable-web')).toBe('PT_DUCT')
  })

  it('ack records brief version and requirement ids for traceability', () => {
    const b = briefFor(S002.id, 'GD02', 'deck')!
    const ack = briefAck(b, 'KS. A')
    expect(ack.briefId).toBe(b.id)
    expect(ack.requirementIds).toEqual(b.requirements.map(r => r.id))
    expect(ack.version).toContain('BBS Rev.B')
  })
})
