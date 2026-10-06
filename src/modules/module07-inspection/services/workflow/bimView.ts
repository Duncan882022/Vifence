import type { ObjectKind } from '../../types'
import type { ComponentId } from '../../workflow.types'

export const ALL_KINDS: ObjectKind[] = ['concrete', 'rebar', 'dul', 'anchor', 'embed']

export const KIND_LABEL_VI: Record<ObjectKind, string> = {
  concrete: 'Khối BT',
  rebar: 'Thép',
  dul: 'Cáp DƯL',
  anchor: 'Neo',
  embed: 'Chi tiết chôn',
}

export function parseComponentParam(raw: string | null, allowed: readonly ComponentId[]): ComponentId[] {
  if (!raw || raw === 'all') return [...allowed]
  const picked = raw.split(',').filter((id): id is ComponentId => (allowed as readonly string[]).includes(id))
  return picked.length ? picked : [...allowed]
}

export function parseKindParam(raw: string | null, fallback: readonly ObjectKind[]): ObjectKind[] {
  if (!raw) return [...fallback]
  const picked = raw.split(',').filter((id): id is ObjectKind => (ALL_KINDS as readonly string[]).includes(id))
  return picked.length ? picked : [...fallback]
}

/** From "all selected", the first tap isolates. After that, taps toggle. Never empty. */
export function toggleComponent(selected: ComponentId[], id: ComponentId, allowed: readonly ComponentId[]): ComponentId[] {
  if (selected.length === allowed.length) return [id]
  if (selected.includes(id)) {
    const next = selected.filter(c => c !== id)
    return next.length ? next : [id]
  }
  return [...selected, id]
}

export function toggleKind(selected: ObjectKind[], id: ObjectKind): ObjectKind[] {
  if (selected.includes(id)) {
    const next = selected.filter(k => k !== id)
    return next.length ? next : [id]
  }
  return [...selected, id]
}

export function sameIds<T extends string>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every(id => set.has(id))
}
