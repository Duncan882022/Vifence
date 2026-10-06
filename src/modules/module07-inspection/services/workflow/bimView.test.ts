import { describe, expect, it } from 'vitest'
import { parseComponentParam, parseKindParam, toggleComponent, toggleKind } from './bimView'

const ALLOWED = ['bottom', 'web-left', 'web-right', 'deck'] as const

describe('bim view selection', () => {
  it('treats missing or all as the full stage set', () => {
    expect(parseComponentParam(null, ALLOWED)).toEqual([...ALLOWED])
    expect(parseComponentParam('all', ALLOWED)).toEqual([...ALLOWED])
  })

  it('keeps a comma-separated combo and drops unknown ids', () => {
    expect(parseComponentParam('web-left,deck,nope', ALLOWED)).toEqual(['web-left', 'deck'])
  })

  it('defaults kinds to the stage set unless the URL names them', () => {
    expect(parseKindParam(null, ['rebar'])).toEqual(['rebar'])
    expect(parseKindParam('rebar,concrete', ['rebar'])).toEqual(['rebar', 'concrete'])
  })

  it('isolates on the first tap from Toàn dầm, then toggles to build a combo', () => {
    const isolated = toggleComponent([...ALLOWED], 'web-left', ALLOWED)
    expect(isolated).toEqual(['web-left'])
    expect(toggleComponent(isolated, 'deck', ALLOWED)).toEqual(['web-left', 'deck'])
    expect(toggleComponent(['web-left'], 'web-left', ALLOWED)).toEqual(['web-left'])
  })

  it('keeps at least one kind on', () => {
    expect(toggleKind(['rebar'], 'rebar')).toEqual(['rebar'])
    expect(toggleKind(['rebar'], 'concrete')).toEqual(['rebar', 'concrete'])
  })
})
