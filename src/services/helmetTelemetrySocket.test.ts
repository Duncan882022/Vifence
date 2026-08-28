import { describe, expect, it } from 'vitest'
import { buildTelemetryWsUrl } from '@/services/helmetTelemetrySocket'

describe('buildTelemetryWsUrl', () => {
  it('appends patrol JWT as query param when provided', () => {
    const url = buildTelemetryWsUrl(
      'https://api.example.test',
      'HC-02',
      'jwt-token-abc',
    )
    expect(url).toBe('wss://api.example.test/ws/helmet/HC-02/telemetry?token=jwt-token-abc')
  })

  it('omits token query when missing', () => {
    const url = buildTelemetryWsUrl('https://api.example.test', 'HC-02')
    expect(url).toBe('wss://api.example.test/ws/helmet/HC-02/telemetry')
  })
})
