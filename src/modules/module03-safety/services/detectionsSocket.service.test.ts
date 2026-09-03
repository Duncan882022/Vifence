import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDetectionsFeed } from './detectionsSocket.service'
import { buildVmsDetectionsUrl } from './vmsDetections.service'

interface SentMessage {
  type?: string
  at_ms?: number | null
}

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  static readonly OPEN = 1

  readyState = FakeWebSocket.OPEN
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null

  constructor(public url: string) {
    FakeWebSocket.instances.push(this)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.readyState = 3
    this.onclose?.()
  }

  parsedSent(): SentMessage[] {
    return this.sent.map(raw => JSON.parse(raw) as SentMessage)
  }
}

describe('buildVmsDetectionsUrl', () => {
  it('không kèm at_ms khi chưa biết khung hình đang chiếu', () => {
    expect(buildVmsDetectionsUrl('https://vms.example', 'HC-01')).toBe(
      'https://vms.example/stream/HC-01/detections',
    )
    expect(buildVmsDetectionsUrl('https://vms.example', 'HC-01', null)).toBe(
      'https://vms.example/stream/HC-01/detections',
    )
  })

  it('kèm at_ms để backend chọn overlay của đúng khung hình', () => {
    expect(buildVmsDetectionsUrl('https://vms.example', 'HC-01', 1_700_000_000_123.7)).toBe(
      'https://vms.example/stream/HC-01/detections?at_ms=1700000000124',
    )
  })

  it('bỏ qua mốc vô nghĩa thay vì gửi lên backend', () => {
    expect(buildVmsDetectionsUrl('https://vms.example', 'HC-01', 0)).toBe(
      'https://vms.example/stream/HC-01/detections',
    )
    expect(buildVmsDetectionsUrl('https://vms.example', 'HC-01', Number.NaN)).toBe(
      'https://vms.example/stream/HC-01/detections',
    )
  })
})

describe('createDetectionsFeed — báo mốc khung hình lên backend', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.stubGlobal('window', globalThis)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  function open(getDisplayWallclockMs?: () => number | null) {
    const handle = createDetectionsFeed({
      cameraId: 'HC-01',
      backendUrl: 'https://vms.example',
      onSnapshot: () => {},
      onStatusChange: () => {},
      getDisplayWallclockMs,
    })
    const socket = FakeWebSocket.instances[0]
    socket.onopen?.()
    return { handle, socket }
  }

  it('gửi mốc ngay khi mở kết nối rồi nhắc lại mỗi giây', () => {
    let displayMs = 1_700_000_000_000
    const { handle, socket } = open(() => displayMs)

    expect(socket.parsedSent()).toEqual([{ type: 'sync', at_ms: 1_700_000_000_000 }])

    displayMs += 1000
    vi.advanceTimersByTime(1000)
    const messages = socket.parsedSent()
    expect(messages[messages.length - 1]).toEqual({ type: 'sync', at_ms: 1_700_000_001_000 })

    handle.stop()
  })

  it('báo null khi chưa đọc được đồng hồ video — backend về chế độ bản mới nhất', () => {
    const { handle, socket } = open(() => null)

    expect(socket.parsedSent()).toEqual([{ type: 'sync', at_ms: null }])

    handle.stop()
  })

  it('không gửi gì khi tile không cung cấp đồng hồ', () => {
    const { handle, socket } = open(undefined)

    vi.advanceTimersByTime(3000)
    expect(socket.sent).toEqual([])

    handle.stop()
  })

  it('ngừng báo sau khi dừng feed', () => {
    const { handle, socket } = open(() => 1_700_000_000_000)
    handle.stop()

    const countAtStop = socket.sent.length
    vi.advanceTimersByTime(5000)

    expect(socket.sent.length).toBe(countAtStop)
  })
})
