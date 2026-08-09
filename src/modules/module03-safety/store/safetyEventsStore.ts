import type { SafetyViolationRecord } from '../types/safety.types'

type Listener = () => void

let records: SafetyViolationRecord[] = []
const listeners = new Set<Listener>()

export function getSafetyEventsSnapshot(): SafetyViolationRecord[] {
  return records
}

export function setSafetyEventsSnapshot(next: SafetyViolationRecord[]): void {
  records = next
  listeners.forEach(listener => listener())
}

export function subscribeSafetyEvents(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function findSafetyEventById(id: string | null | undefined): SafetyViolationRecord | null {
  if (!id) return null
  return records.find(r => r.id === id) ?? null
}
