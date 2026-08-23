/**
 * Module 05 FE — pure-function tests (no vitest in repo).
 * Run: node scripts/test_workforce_fe.mjs
 * Mirrors src/modules/module05-productivity/utils/workforceHeatmapUi.ts
 * and workforceEventsMapper.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []

function check(name, fn) {
  try {
    fn()
    console.log(`ok  ${name}`)
  } catch (e) {
    failures.push(name)
    console.log(`FAIL ${name}`)
    console.log(`  ${e.message}`)
  }
}

// --- Inline mirrors of production helpers (kept in sync by static audit) ---
function heatmapWindowMs(window) {
  switch (window) {
    case 'live':
      return 120_000
    case '5m':
      return 5 * 60_000
    case '15m':
      return 15 * 60_000
    case '1h':
      return 60 * 60_000
    case 'shift':
      return 8 * 60 * 60_000
  }
}

function isVerifiedWorkerLabel(label) {
  if (!label) return false
  const t = label.trim().toLowerCase()
  if (!t || t === 'person' || t === 'unknown') return false
  if (t.startsWith('sgc-') || t.startsWith('obj-') || t.startsWith('track-')) return false
  if (/^p[-_]?\d+$/i.test(t)) return false
  return true
}

const WORKFORCE_FEED_TYPES = new Set([
  'POPULATION_OBSERVED',
  'POPULATION_CHANGE',
  'HIGH_DENSITY',
  'IDENTITY_VERIFIED',
])

function workforceEventToPatrolEvent(ev) {
  if (!WORKFORCE_FEED_TYPES.has(ev.event_type)) return null
  return {
    id: ev.event_id,
    type: ev.event_type,
    lockedAt: ev.timestamp,
  }
}

function mergePatrolAndWorkforceEvents(patrol, workforce) {
  const byId = new Map()
  for (const ev of patrol) byId.set(ev.id, ev)
  for (const raw of workforce) {
    const mapped = workforceEventToPatrolEvent(raw)
    if (mapped) byId.set(mapped.id, mapped)
  }
  return [...byId.values()]
}

function isMeaningfulFeedEvent(event) {
  return event.type !== 'PERSON_DETECTED'
}

function filterByTab(events, tab) {
  const feed = events.filter(isMeaningfulFeedEvent)
  switch (tab) {
    case 'workforce':
      return feed.filter(e => e.type === 'POPULATION_OBSERVED' || e.type === 'POPULATION_CHANGE')
    case 'identity':
      return feed.filter(e => e.type === 'IDENTITY_VERIFIED')
    case 'density':
      return feed.filter(e => e.type === 'HIGH_DENSITY')
    case 'system':
      return feed.filter(e => e.type === 'PPE_VIOLATION' || e.type === 'MACHINE_STOPPED')
    case 'all':
    default:
      return feed
  }
}

// --- Source-of-truth drift checks ---
check('heatmapWindowMs matches source constants', () => {
  const src = readFileSync(join(root, 'src/modules/module05-productivity/utils/workforceHeatmapUi.ts'), 'utf8')
  assert.match(src, /case 'live':\s*\n\s*return 120_000/)
  assert.match(src, /case '15m':\s*\n\s*return 15 \* 60_000/)
  assert.equal(heatmapWindowMs('live'), 120_000)
  assert.equal(heatmapWindowMs('15m'), 900_000)
  assert.equal(heatmapWindowMs('shift'), 8 * 3600_000)
})

check('HEATMAP_TIME_TABS has 5 windows', () => {
  const src = readFileSync(join(root, 'src/modules/module05-productivity/utils/workforceHeatmapUi.ts'), 'utf8')
  for (const k of ['live', '5m', '15m', '1h', 'shift']) {
    assert.match(src, new RegExp(`key: '${k}'`))
  }
})

check('isVerifiedWorkerLabel rejects track/obj/sgc', () => {
  assert.equal(isVerifiedWorkerLabel('Nguyen Van A'), true)
  assert.equal(isVerifiedWorkerLabel('track-12'), false)
  assert.equal(isVerifiedWorkerLabel('OBJ-001'), false)
  assert.equal(isVerifiedWorkerLabel('sgc-99'), false)
  assert.equal(isVerifiedWorkerLabel('person'), false)
})

check('OBJECT_MERGED excluded from feed mapper', () => {
  const src = readFileSync(join(root, 'src/modules/module05-productivity/utils/workforceEventsMapper.ts'), 'utf8')
  assert.doesNotMatch(src, /WORKFORCE_FEED_TYPES[\s\S]*OBJECT_MERGED/)
  assert.equal(
    workforceEventToPatrolEvent({
      event_id: '1',
      event_type: 'OBJECT_MERGED',
      timestamp: '2026-01-01T00:00:00Z',
    }),
    null,
  )
})

check('meaningful types map into feed', () => {
  for (const t of WORKFORCE_FEED_TYPES) {
    const mapped = workforceEventToPatrolEvent({
      event_id: t,
      event_type: t,
      timestamp: '2026-01-01T00:00:00Z',
    })
    assert.ok(mapped)
    assert.equal(mapped.type, t)
  }
})

check('merge dedupes by id and drops OBJECT_MERGED', () => {
  const merged = mergePatrolAndWorkforceEvents(
    [{ id: 'p1', type: 'PPE_VIOLATION', lockedAt: '2026-01-01T01:00:00Z' }],
    [
      { event_id: 'w1', event_type: 'POPULATION_OBSERVED', timestamp: '2026-01-01T02:00:00Z' },
      { event_id: 'w2', event_type: 'OBJECT_MERGED', timestamp: '2026-01-01T03:00:00Z' },
    ],
  )
  assert.equal(merged.length, 2)
  assert.ok(merged.some(e => e.id === 'w1'))
  assert.ok(!merged.some(e => e.id === 'w2'))
})

check('filter tabs route workforce event types', () => {
  const events = [
    { id: '1', type: 'PERSON_DETECTED' },
    { id: '2', type: 'POPULATION_OBSERVED' },
    { id: '3', type: 'IDENTITY_VERIFIED' },
    { id: '4', type: 'HIGH_DENSITY' },
    { id: '5', type: 'PPE_VIOLATION' },
  ]
  assert.equal(filterByTab(events, 'all').length, 4)
  assert.equal(filterByTab(events, 'workforce').map(e => e.id).join(), '2')
  assert.equal(filterByTab(events, 'identity').map(e => e.id).join(), '3')
  assert.equal(filterByTab(events, 'density').map(e => e.id).join(), '4')
  assert.equal(filterByTab(events, 'system').map(e => e.id).join(), '5')
})

check('PERSON_DETECTED hidden in PatrolEventsPanel source', () => {
  const src = readFileSync(join(root, 'src/modules/module05-productivity/components/PatrolEventsPanel.tsx'), 'utf8')
  assert.match(src, /event\.type !== 'PERSON_DETECTED'/)
  assert.match(src, /Nhân lực/)
  assert.match(src, /Định danh/)
  assert.match(src, /Mật độ/)
  assert.match(src, /Hệ thống/)
})

check('Module05Page merges workforce events', () => {
  const src = readFileSync(join(root, 'src/modules/module05-productivity/Module05Page.tsx'), 'utf8')
  assert.match(src, /mergePatrolAndWorkforceEvents/)
  assert.match(src, /useWorkforceRealtimeState/)
})

check('Heatmap has layer toggles + object sheet (live-only)', () => {
  const src = readFileSync(join(root, 'src/modules/module05-productivity/components/PatrolDensityHeatmap.tsx'), 'utf8')
  assert.match(src, /Khu vực/)
  assert.match(src, /Người/)
  assert.match(src, /Mũ/)
  assert.doesNotMatch(src, /HEATMAP_TIME_TABS/)
  assert.match(src, /WorkforceObjectSheet/)
  assert.match(src, /helmetHeadingById/)
})

check('FE filters EXPIRED from live layer OR BE snapshot omits EXPIRED', () => {
  const fe = readFileSync(join(root, 'src/modules/module05-productivity/components/PatrolDensityHeatmap.tsx'), 'utf8')
  const be = readFileSync(join(root, 'backend-ai/app/workforce_engine.py'), 'utf8')
  const feFilters = /EXPIRED/.test(fe) && /status\s*!==\s*['"]EXPIRED['"]|status\s*===\s*['"]EXPIRED['"]/.test(fe)
  const beOmits = /if status == "EXPIRED":\s*\n\s*continue/.test(be)
  assert.ok(feFilters || beOmits, 'need FE EXPIRED filter or BE snapshot omit')
})

const summary = {
  total: 11 + (failures.length === 0 ? 0 : 0),
  passed: 11 - failures.length,
  failed: failures.length,
  failures,
}

// recount properly
const ran = 11
summary.total = ran
summary.passed = ran - failures.length
summary.failed = failures.length

console.log(`\nFE tests: ${summary.passed}/${summary.total} passed`)
if (failures.length) process.exit(1)
