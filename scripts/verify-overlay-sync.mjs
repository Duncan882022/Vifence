/**
 * Kiểm chứng OverlayTimeBuffer — chọn đúng snapshot theo wallclock khung hình.
 *
 * Repo chưa có test runner cho FE; script này bundle module bằng esbuild rồi
 * chạy trên node. Chạy: node scripts/verify-overlay-sync.mjs
 */
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundle = await build({
  entryPoints: ['src/modules/module03-safety/utils/overlayTimeSync.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
})

const source = bundle.outputFiles[0].text
const module = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
)
const { OverlayTimeBuffer } = module

function snapshot(wallclockMs, tag) {
  return {
    camera_id: 'HC-02',
    width: 1280,
    height: 720,
    updated_at: wallclockMs / 1000,
    frame_wallclock_ms: wallclockMs,
    vms_ready: true,
    stream_online: true,
    frame_age_sec: 0,
    detections: [{ behavior: 'person', label: tag, confidence: 0.9, bbox: [0, 0, 10, 10] }],
    roi_zones: [],
    metrics: {},
  }
}

const T0 = 1_800_000_000_000

const cases = []

/* Buffer rỗng → không có gì để vẽ. */
{
  const buffer = new OverlayTimeBuffer()
  const result = buffer.resolve(T0)
  assert.equal(result.snapshot, null)
  assert.equal(result.matched, false)
  cases.push('buffer rỗng trả null')
}

/* Không biết đồng hồ video (WebRTC) → dùng snapshot mới nhất. */
{
  const buffer = new OverlayTimeBuffer()
  buffer.push(snapshot(T0, 'cu'))
  buffer.push(snapshot(T0 + 1000, 'moi'))
  const result = buffer.resolve(null)
  assert.equal(result.snapshot.detections[0].label, 'moi')
  assert.equal(result.matched, false)
  cases.push('không có đồng hồ → snapshot mới nhất')
}

/* Đây là lỗi cũ: HLS trễ 3s, phải vẽ bbox của 3s trước, không phải mới nhất. */
{
  const buffer = new OverlayTimeBuffer()
  for (let i = 0; i <= 30; i += 1) {
    buffer.push(snapshot(T0 + i * 200, `t${i}`))
  }
  // Khung hình đang hiển thị trễ 3 giây so với frame AI mới nhất (t30 = T0+6000).
  const displayMs = T0 + 3000
  const result = buffer.resolve(displayMs)

  assert.equal(result.matched, true)
  assert.equal(result.snapshot.detections[0].label, 't15')
  assert.ok(result.driftMs <= 100, `drift quá lớn: ${result.driftMs}`)
  cases.push('HLS trễ 3s → chọn đúng snapshot cùng thời điểm (t15), không lấy t30')
}

/* Lệch ngoài ngưỡng (video tua / stream reset) → về snapshot mới nhất. */
{
  const buffer = new OverlayTimeBuffer()
  buffer.push(snapshot(T0, 'a'))
  buffer.push(snapshot(T0 + 500, 'b'))
  const result = buffer.resolve(T0 - 60_000)
  assert.equal(result.matched, false)
  assert.equal(result.snapshot.detections[0].label, 'b')
  cases.push('lệch quá ngưỡng → fallback snapshot mới nhất')
}

/* Buffer có trần — không phình vô hạn khi xem cả ca. */
{
  const buffer = new OverlayTimeBuffer()
  for (let i = 0; i < 500; i += 1) buffer.push(snapshot(T0 + i * 160, `t${i}`))
  const result = buffer.resolve(T0 + 499 * 160)
  assert.equal(result.snapshot.detections[0].label, 't499')
  // Snapshot quá cũ đã bị loại khỏi buffer → không khớp được nữa.
  const old = buffer.resolve(T0)
  assert.equal(old.matched, false)
  cases.push('buffer giới hạn kích thước, vẫn khớp được frame gần đây')
}

/* Backend cũ chưa gửi frame_wallclock_ms → dùng updated_at. */
{
  const buffer = new OverlayTimeBuffer()
  const legacy = snapshot(T0 + 1000, 'legacy')
  delete legacy.frame_wallclock_ms
  buffer.push(snapshot(T0, 'a'))
  buffer.push(legacy)
  const result = buffer.resolve(T0 + 1000)
  assert.equal(result.snapshot.detections[0].label, 'legacy')
  cases.push('backend cũ (chỉ có updated_at) vẫn khớp được')
}

/* Cùng thời điểm gửi lại → thay tại chỗ, không nhân đôi. */
{
  const buffer = new OverlayTimeBuffer()
  buffer.push(snapshot(T0, 'lan1'))
  buffer.push(snapshot(T0, 'lan2'))
  const result = buffer.resolve(T0)
  assert.equal(result.snapshot.detections[0].label, 'lan2')
  cases.push('gửi lại cùng thời điểm → thay tại chỗ')
}

console.log('OverlayTimeBuffer — tất cả kiểm tra đạt:\n')
cases.forEach(c => console.log(`  ✓ ${c}`))
