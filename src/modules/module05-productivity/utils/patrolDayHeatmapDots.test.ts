import { describe, expect, it } from 'vitest'
import type { PatrolDayPresence } from '../services/patrolDayEvents.service'
import { assignPatrolManualIdentity } from '../services/patrolManualIdentity.service'
import {
  buildPatrolDayHeatmapDots,
  buildPatrolPersEntityLookup,
  buildPatrolPresenceHeatmapDots,
  filterPatrolHeatmapDotsByDevice,
  filterRecentPatrolWorkerEvents,
  filterRecentPresences,
  mergePatrolHeatmapDetectionDots,
} from './patrolDayHeatmapDots'
import type { DetectionDot } from '../data/patrolDetectionData'
import type { PatrolEvent } from '../data/patrolTypes'
import { PATROL_SITE_CENTER } from '../data/patrolSiteMap'
import { countPatrolGlobalWorkers, summarizePatrolGlobalWorkers } from './patrolPatrolCounts'

function makeDayEvent(over: Partial<PatrolEvent>): PatrolEvent {
  return {
    id: 'pers:pers-0001',
    type: 'PERSON_DETECTED',
    cameraId: '',
    cameraName: '',
    zoneId: 'ZONE_SITE',
    zoneName: 'Site',
    objectId: 'pers-0001',
    objectLabel: 'pers-0001',
    violationLabel: 'pers-0001',
    startedAt: '2026-08-26T08:00:00Z',
    lockedAt: '2026-08-26T08:00:00Z',
    endedAt: null,
    durationSeconds: null,
    status: 'LOCKED',
    confidence: 1,
    gps: { lat: 0, lng: 0 },
    snapshotUrl: 'https://example.com/snap.jpg',
    stage: 'person',
    ...over,
  } as PatrolEvent
}

function makePresence(over: Partial<PatrolDayPresence>): PatrolDayPresence {
  return {
    id: 1,
    subjectId: 'pers-0001',
    cameraId: 'HC-01',
    zoneId: 'ZONE_SITE',
    startedAt: 1_700_000_000,
    endedAt: 1_700_000_030,
    gpsLat: PATROL_SITE_CENTER[0],
    gpsLng: PATROL_SITE_CENTER[1],
    presenceSeq: 1,
    tier: 'person',
    displayName: 'pers-0001',
    sourceCameras: ['HC-01'],
    ...over,
  }
}

describe('buildPatrolPresenceHeatmapDots', () => {
  it('một presence → một chấm tại GPS', () => {
    const dots = buildPatrolPresenceHeatmapDots([makePresence({})])
    expect(dots).toHaveLength(1)
    expect(dots[0].objectId).toBe('pers-0001')
    expect(dots[0].position[0]).toBeCloseTo(PATROL_SITE_CENTER[0], 3)
  })

  it('GPS trùng mũ → chấm lệch phía trước mũ', () => {
    const helmet: [number, number] = [PATROL_SITE_CENTER[0], PATROL_SITE_CENTER[1]]
    const dots = buildPatrolPresenceHeatmapDots([makePresence({})], {
      helmetPositionsById: { 'HC-01': helmet },
      helmetHeadingsById: { 'HC-01': 0 },
    })
    expect(dots).toHaveLength(1)
    expect(dots[0].position[0]).not.toBeCloseTo(helmet[0], 5)
    expect(dots[0].position[0]).toBeGreaterThan(helmet[0])
    expect(dots[0].presenceId).toBe(1)
  })

  it('gps end upsert → chấm theo vị trí cuối lượt', () => {
    const startLat = PATROL_SITE_CENTER[0]
    const endLat = PATROL_SITE_CENTER[0] + 0.0003
    const dots = buildPatrolPresenceHeatmapDots([
      makePresence({
        gpsLat: startLat,
        gpsLng: PATROL_SITE_CENTER[1],
        gpsLatEnd: endLat,
        gpsLngEnd: PATROL_SITE_CENTER[1],
      }),
    ])
    expect(dots[0].position[0]).toBeGreaterThan(startLat + 0.0001)
  })

  it('hai presence cùng session_id → một row (lượt mới nhất)', () => {
    const dots = buildPatrolPresenceHeatmapDots([
      makePresence({
        id: 1,
        sessionId: 'sess-abc',
        counted: true,
        endedAt: 1_700_000_010,
        gpsLat: PATROL_SITE_CENTER[0],
      }),
      makePresence({
        id: 2,
        sessionId: 'sess-abc',
        counted: true,
        endedAt: 1_700_000_030,
        gpsLat: PATROL_SITE_CENTER[0] + 0.0002,
      }),
    ], { countedOnly: true })
    expect(dots).toHaveLength(1)
    expect(dots[0].position[0]).toBeGreaterThan(PATROL_SITE_CENTER[0] + 0.0001)
  })

  it('countedOnly — bỏ presence chưa qua tripwire', () => {
    const dots = buildPatrolPresenceHeatmapDots([
      makePresence({ id: 1, counted: false }),
      makePresence({ id: 2, subjectId: 'pers-0002', counted: true }),
    ], { countedOnly: true })
    expect(dots).toHaveLength(1)
    expect(dots[0].objectId).toBe('pers-0002')
  })

  it('hai presence cùng người khác lượt → một chấm (lượt mới nhất)', () => {
    const dots = buildPatrolPresenceHeatmapDots([
      makePresence({ id: 1, presenceSeq: 1, gpsLat: PATROL_SITE_CENTER[0], gpsLng: PATROL_SITE_CENTER[1], endedAt: 1_700_000_010 }),
      makePresence({
        id: 2,
        presenceSeq: 2,
        gpsLat: PATROL_SITE_CENTER[0] + 0.0002,
        gpsLng: PATROL_SITE_CENTER[1] + 0.0002,
        endedAt: 1_700_000_030,
      }),
    ])
    expect(dots).toHaveLength(1)
    expect(dots[0].id).toBe('entity-pers-0001')
    expect(dots[0].presenceSeq).toBe(2)
    expect(dots[0].position[0]).toBeGreaterThan(PATROL_SITE_CENTER[0] + 0.0001)
  })

  it('hai người khác subjectId → hai chấm', () => {
    const dots = buildPatrolPresenceHeatmapDots([
      makePresence({ id: 1, subjectId: 'pers-0001' }),
      makePresence({ id: 2, subjectId: 'pers-0002', displayName: 'pers-0002' }),
    ])
    expect(dots).toHaveLength(2)
    expect(dots[0].id).not.toBe(dots[1].id)
  })

  it('obj tier khi includeUnassigned', () => {
    const dots = buildPatrolPresenceHeatmapDots(
      [makePresence({ subjectId: 'obj-20260826-0001', tier: 'object' })],
      { includeUnassigned: true },
    )
    expect(dots).toHaveLength(1)
    expect(dots[0].tier).toBe('object')
  })

  it('obj tier vẫn hiện khi liveOnly + countedOnly (camera online)', () => {
    const now = Date.now()
    const oldObject = makePresence({
      id: 10,
      subjectId: 'obj-20260826-0001',
      tier: 'object',
      counted: true,
      endedAt: (now - 600_000) / 1000,
    })
    const recentPerson = makePresence({
      id: 11,
      subjectId: 'pers-0099',
      tier: 'person',
      counted: true,
      endedAt: now / 1000,
    })
    const dots = buildPatrolPresenceHeatmapDots(
      [oldObject, recentPerson],
      {
        includeUnassigned: true,
        countedOnly: true,
        liveOnly: true,
        now,
        cameraOnlineById: { 'HC-01': true },
      },
    )
    expect(dots.some(d => d.tier === 'object')).toBe(true)
    expect(dots.some(d => d.objectId === 'pers-0099')).toBe(true)
  })

  it('obj tier bị lọc khi countedOnly và chưa qua tripwire', () => {
    const dots = buildPatrolPresenceHeatmapDots(
      [makePresence({ subjectId: 'obj-20260826-0001', tier: 'object', counted: false })],
      { includeUnassigned: true, countedOnly: true },
    )
    expect(dots).toHaveLength(0)
  })

  it('identity tier gán tier + verified', () => {
    const dots = buildPatrolPresenceHeatmapDots([
      makePresence({ tier: 'identity', subjectId: 'p-102' }),
    ])
    expect(dots[0].tier).toBe('identity')
    expect(dots[0].verified).toBe(true)
  })

  it('liveOnly lọc presence gần đây', () => {
    const old = makePresence({ endedAt: 1_000_000_000 })
    const recent = makePresence({ id: 2, endedAt: Date.now() / 1000 })
    const scoped = filterRecentPresences([old, recent], Date.now())
    expect(scoped).toHaveLength(1)
  })

  it('flycam tầm cao — không badge định danh (chỉ đếm)', () => {
    const dots = buildPatrolPresenceHeatmapDots([
      makePresence({ id: 2, cameraId: 'DR-03', tier: 'identity', subjectId: 'pers-0099' }),
    ], { flightModeByCamera: { 'DR-03': 'aerial' } })
    expect(dots).toHaveLength(1)
    expect(dots[0].verified).toBe(false)
  })

  it('flycam tầm thấp — badge định danh giống HC-*', () => {
    const dots = buildPatrolPresenceHeatmapDots([
      makePresence({ id: 2, cameraId: 'DR-03', tier: 'identity', subjectId: 'pers-0099' }),
    ], { flightModeByCamera: { 'DR-03': 'proximity' } })
    expect(dots).toHaveLength(1)
    expect(dots[0].verified).toBe(true)
    expect(dots[0].tier).toBe('identity')
  })

  it('displayName đã định danh (backend) → chấm tím dù subject pers-*', () => {
    const dots = buildPatrolPresenceHeatmapDots([
      makePresence({
        tier: 'identity',
        subjectId: 'pers-0042',
        displayName: 'Nguyễn Văn A',
      }),
    ])
    expect(dots[0].tier).toBe('identity')
    expect(dots[0].verified).toBe(true)
  })

  it('lookup bundle — presence pers-* map gallery, gộp registry không cần alias local', () => {
    const lookup = buildPatrolPersEntityLookup([
      makeDayEvent({
        id: 'pers:pers-0042',
        objectId: 'p-DUNCAN',
        objectLabel: 'Nguyễn Văn A',
        stage: 'profile',
      }),
    ])
    const presenceDots = buildPatrolPresenceHeatmapDots([
      makePresence({
        tier: 'identity',
        subjectId: 'pers-0042',
        displayName: 'Nguyễn Văn A',
      }),
    ], { persEntityLookup: lookup })
    const registryDot: DetectionDot = {
      id: 'pin-P-DUNCAN',
      type: 'person',
      position: [PATROL_SITE_CENTER[0], PATROL_SITE_CENTER[1]],
      zoneId: 'ZONE_SITE',
      cameraId: 'HC-02',
      confidence: 1,
      objectId: 'P-DUNCAN',
      tier: 'identity',
      inCameraView: true,
      lastSeenAt: 1000,
    }
    const merged = mergePatrolHeatmapDetectionDots([presenceDots, [registryDot]], {
      persEntityLookup: lookup,
    })
    expect(merged).toHaveLength(1)
    expect(merged[0].objectId?.toLowerCase()).toBe('p-duncan')
  })
})

describe('filterPatrolHeatmapDotsByDevice', () => {
  it('chỉ mũ — giữ HC-*', () => {
    const dots = buildPatrolPresenceHeatmapDots([
      makePresence({ id: 1, cameraId: 'HC-01' }),
      makePresence({ id: 2, cameraId: 'DR-03', subjectId: 'pers-0002' }),
    ])
    const filtered = filterPatrolHeatmapDotsByDevice(dots, { helmet: true, flycam: false })
    expect(filtered).toHaveLength(1)
    expect(filtered[0].cameraId).toBe('HC-01')
  })

  it('chỉ flycam — giữ DR-*', () => {
    const dots = buildPatrolPresenceHeatmapDots([
      makePresence({ id: 1, cameraId: 'HC-02' }),
      makePresence({ id: 2, cameraId: 'DR-03', subjectId: 'pers-0002' }),
    ])
    const filtered = filterPatrolHeatmapDotsByDevice(dots, { helmet: false, flycam: true })
    expect(filtered).toHaveLength(1)
    expect(filtered[0].cameraId).toBe('DR-03')
  })

  it('cả hai tắt — vẫn giữ chấm (layer Mật độ điều khiển hiển thị)', () => {
    const dots = buildPatrolPresenceHeatmapDots([makePresence({})])
    expect(filterPatrolHeatmapDotsByDevice(dots, { helmet: false, flycam: false })).toHaveLength(1)
  })
})

describe('mergePatrolHeatmapDetectionDots', () => {
  it('gộp theo objectId — ưu tiên inCameraView', () => {
    const live: DetectionDot = {
      id: 'pin-pers-0001',
      type: 'person',
      position: [PATROL_SITE_CENTER[0], PATROL_SITE_CENTER[1]],
      zoneId: 'ZONE_SITE',
      cameraId: 'HC-02',
      confidence: 1,
      objectId: 'pers-0001',
      inCameraView: true,
      lastSeenAt: 1000,
    }
    const history: DetectionDot = {
      ...live,
      id: 'presence-1',
      inCameraView: false,
      lastSeenAt: 900,
    }
    const merged = mergePatrolHeatmapDetectionDots([[history], [live]])
    expect(merged).toHaveLength(1)
    expect(merged[0].inCameraView).toBe(true)
    expect(merged[0].id).toBe('pin-pers-0001')
  })

  it('presence pers-* + registry gallery — một chấm / người định danh', () => {
    assignPatrolManualIdentity({
      objectKey: 'pers-0042',
      workerId: 'P-SGC-6688',
      workerName: 'Nguyễn Văn A',
      unitName: 'Công ty A',
    })

    const presenceDot: DetectionDot = {
      id: 'entity-p-sgc-6688',
      type: 'person',
      position: [PATROL_SITE_CENTER[0], PATROL_SITE_CENTER[1]],
      zoneId: 'ZONE_SITE',
      cameraId: 'HC-02',
      confidence: 1,
      objectId: 'pers-0042',
      tier: 'identity',
      inCameraView: false,
      lastSeenAt: 900,
    }
    const registryDot: DetectionDot = {
      id: 'pin-P-SGC-6688',
      type: 'person',
      position: [PATROL_SITE_CENTER[0] + 0.0001, PATROL_SITE_CENTER[1]],
      zoneId: 'ZONE_SITE',
      cameraId: 'HC-02',
      confidence: 1,
      objectId: 'P-SGC-6688',
      tier: 'identity',
      inCameraView: true,
      lastSeenAt: 1000,
    }

    const merged = mergePatrolHeatmapDetectionDots([[presenceDot], [registryDot]])
    expect(merged).toHaveLength(1)
    expect(merged[0].inCameraView).toBe(true)
    expect(merged[0].id).toBe('pin-P-SGC-6688')
  })

  it('presence sgc + registry gallery cùng người — một chấm', () => {
    assignPatrolManualIdentity({
      objectKey: 'SGC-7701',
      workerId: 'P-WORKER-99',
      workerName: 'Trần B',
      unitName: 'Công ty B',
    })

    const presenceDot: DetectionDot = {
      id: 'entity-p-worker-99',
      type: 'person',
      position: [PATROL_SITE_CENTER[0], PATROL_SITE_CENTER[1]],
      zoneId: 'ZONE_SITE',
      cameraId: 'HC-01',
      confidence: 1,
      objectId: 'SGC-7701',
      tier: 'identity',
      inCameraView: false,
      lastSeenAt: 500,
    }
    const registryDot: DetectionDot = {
      id: 'pin-P-WORKER-99',
      type: 'person',
      position: [PATROL_SITE_CENTER[0], PATROL_SITE_CENTER[1]],
      zoneId: 'ZONE_SITE',
      cameraId: 'HC-01',
      confidence: 1,
      objectId: 'P-WORKER-99',
      tier: 'identity',
      inCameraView: true,
      lastSeenAt: 800,
    }

    const merged = mergePatrolHeatmapDetectionDots([[presenceDot], [registryDot]])
    expect(merged).toHaveLength(1)
  })
})

describe('buildPatrolDayHeatmapDots legacy fallback', () => {
  it('một thẻ pers-* → một chấm', () => {
    const dots = buildPatrolDayHeatmapDots([makeDayEvent({})])
    expect(dots).toHaveLength(1)
    expect(dots[0].objectId).toBe('pers-0001')
  })

  it('liveOnly chỉ giữ người gần đây', () => {
    const old = makeDayEvent({
      id: 'pers:pers-0002',
      objectId: 'pers-0002',
      lockedAt: '2020-01-01T08:00:00Z',
    })
    const recent = makeDayEvent({
      id: 'pers:pers-0003',
      objectId: 'pers-0003',
      lockedAt: new Date().toISOString(),
    })
    const scoped = filterRecentPatrolWorkerEvents([old, recent], Date.now())
    expect(scoped).toHaveLength(1)
    expect(scoped[0].objectId).toBe('pers-0003')
  })
})

describe('countPatrolGlobalWorkers SQLite-first', () => {
  it('đếm theo pers day card, không cộng registry', () => {
    const events = [
      makeDayEvent({ id: 'pers:pers-0001', objectId: 'pers-0001' }),
      makeDayEvent({
        id: 'pers:pers-0002',
        objectId: 'pers-0002',
        objectLabel: 'pers-0002',
        lockedAt: '2026-08-26T09:00:00Z',
      }),
    ]
    expect(countPatrolGlobalWorkers(events)).toBe(2)
    const summary = summarizePatrolGlobalWorkers(events)
    expect(summary.total).toBe(2)
    expect(summary.person).toBe(2)
  })
})
