/** Cầu GPS tuần tra — mỗi camera một vị trí riêng. */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearPatrolHelmetGps,
  getPatrolHelmetGps,
  setPatrolHelmetGps,
  subscribePatrolHelmetGps,
} from './patrolHelmetGpsBridge'

const NOW = Date.now()
// Trong ranh giới công trường — ngoài ranh giới thì bị snap về mép và mọi toạ
// độ thử nghiệm sẽ trùng nhau vì cùng một lý do, che mất thứ đang muốn đo.
const HC01_POS = { lat: 20.933_2, lng: 106.923_8 }
const HC02_POS = { lat: 20.933_0, lng: 106.924_1 }

describe('GPS theo từng mũ', () => {
  beforeEach(() => {
    clearPatrolHelmetGps()
  })

  it('hai mũ cùng tồn tại, không ghi đè nhau', () => {
    // Bẫy cũ: một biến chung cho mọi mũ, mũ ghi sau xoá sổ mũ ghi trước.
    setPatrolHelmetGps({ cameraId: 'HC-01', ...HC01_POS, updatedAt: NOW })
    setPatrolHelmetGps({ cameraId: 'HC-02', ...HC02_POS, updatedAt: NOW })

    expect(getPatrolHelmetGps('HC-01')?.cameraId).toBe('HC-01')
    expect(getPatrolHelmetGps('HC-02')?.cameraId).toBe('HC-02')
  })

  it('xoá một mũ không đụng tới mũ còn lại', () => {
    setPatrolHelmetGps({ cameraId: 'HC-01', ...HC01_POS, updatedAt: NOW })
    setPatrolHelmetGps({ cameraId: 'HC-02', ...HC02_POS, updatedAt: NOW })

    clearPatrolHelmetGps('HC-02')

    expect(getPatrolHelmetGps('HC-01')).not.toBeNull()
    expect(getPatrolHelmetGps('HC-02')).toBeNull()
  })

  it('drone cũng có chỗ riêng, không tranh với mũ', () => {
    setPatrolHelmetGps({ cameraId: 'HC-01', ...HC01_POS, updatedAt: NOW })
    setPatrolHelmetGps({ cameraId: 'DR-03', ...HC02_POS, updatedAt: NOW })

    expect(getPatrolHelmetGps('HC-01')).not.toBeNull()
    expect(getPatrolHelmetGps('DR-03')).not.toBeNull()
  })

  it('fix quá cũ coi như không có', () => {
    setPatrolHelmetGps({
      cameraId: 'HC-01',
      ...HC01_POS,
      updatedAt: NOW - 120_000,
    })
    expect(getPatrolHelmetGps('HC-01')).toBeNull()
  })

  it('người mới đăng ký nhận được vị trí của mọi mũ đang có', () => {
    setPatrolHelmetGps({ cameraId: 'HC-01', ...HC01_POS, updatedAt: NOW })
    setPatrolHelmetGps({ cameraId: 'HC-02', ...HC02_POS, updatedAt: NOW })

    const seen: string[] = []
    const unsub = subscribePatrolHelmetGps(snap => seen.push(snap.cameraId))
    unsub()

    expect(seen.sort()).toEqual(['HC-01', 'HC-02'])
  })
})
