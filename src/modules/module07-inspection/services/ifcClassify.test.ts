import { describe, expect, it } from 'vitest'
import { classifyIfc, parseCableProfile, parseRebarDia, shortIfcName } from './ifcClassify'

describe('classifyIfc', () => {
  it('maps SUON box girder to concrete / GĐ1', () => {
    expect(classifyIfc('IfcBuildingElementProxy', 'VHM_DamHopDienHinh_32.6m (Updated)')).toEqual({
      kind: 'concrete',
      stage: 'gd1',
    })
  })

  it('maps DUL cables before generic proxy', () => {
    expect(classifyIfc('IfcBuildingElementProxy', 'SGC_DULCable_200P:10T15.2')).toEqual({
      kind: 'dul',
      stage: 'gd2',
    })
  })

  it('does not classify DauNeo as DƯL just because the name has T15.2', () => {
    expect(classifyIfc('IfcBuildingElementProxy', 'SGC_DauNeoChuDong_9T15.2:9T15.2')).toEqual({
      kind: 'anchor',
      stage: 'gd2',
    })
  })

  it('maps DauNeo as anchor even when name contains T15.2', () => {
    expect(classifyIfc('IfcBuildingElementProxy', 'SGC_DauNeoChuDong_10T15.2:10T15.2')).toEqual({
      kind: 'anchor',
      stage: 'gd2',
    })
  })

  it('maps reinforcing bars to rebar / GĐ2', () => {
    expect(classifyIfc('IfcReinforcingBar', 'Rebar Bar : D12')).toEqual({
      kind: 'rebar',
      stage: 'gd2',
    })
  })
})

describe('parse helpers', () => {
  it('reads rebar diameter', () => {
    expect(parseRebarDia('Rebar Bar : D16')).toBe('D16')
    expect(parseRebarDia('SGC_DULCable_200P')).toBeNull()
  })

  it('reads tendon profile', () => {
    expect(parseCableProfile('SGC_DULCable_200P:18T15.2')).toBe('18T15.2')
  })

  it('shortens long IFC names', () => {
    expect(shortIfcName('SGC_DULCable_200P : 10T15.2 : extra')).toBe('SGC_DULCable_200P · 10T15.2')
    expect(shortIfcName('VHM_DamHopDienHinh_32.6m')).toBe('VHM_DamHopDienHinh_32.6m')
  })
})
