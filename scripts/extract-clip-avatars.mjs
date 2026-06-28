/**
 * Cắt khuôn mặt từ clip camera → avatar JPG trong public/avatars/.
 * Module Đào tạo: toàn bộ w-*, e-* (trừ alias cùng người).
 * Chạy: npm run extract-avatars
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCanvas, loadImage } from '@napi-rs/canvas'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const FEEDS = join(ROOT, 'public/camera-feeds')
const OUT = join(ROOT, 'public/avatars')
const TMP = join(ROOT, '.tmp/avatar-extract')
const MAPPING_OUT = join(ROOT, 'scripts/training-avatar-mapping.json')

/** Toàn bộ học viên Module 02 — e-atmt-* dùng chung w-att01/02 */
const TRAINING_WORKER_IDS = [
  'w-001', 'w-002', 'w-003', 'w-004', 'w-005', 'w-006', 'w-007', 'w-008',
  'w-010', 'w-011', 'w-012', 'w-013', 'w-014', 'w-015', 'w-016', 'w-018', 'w-019', 'w-020',
  'w-c01', 'w-c02', 'w-c03', 'w-c04', 'w-c05', 'w-c06', 'w-c07', 'w-c08',
  'w-c09', 'w-c10', 'w-c11', 'w-c12',
  'w-att01', 'w-att02', 'w-att03', 'w-att04',
  'w-a01', 'w-a02', 'w-a03', 'w-a04', 'w-a05',
  'e-vhmn-1', 'e-vhmn-2', 'e-vhmn-3', 'e-vhmn-4',
  'e-ktxd-1', 'e-ktxd-2', 'e-ktxd-3',
]

const TRAINING_ALIASES = {
  'e-atmt-1': 'w-att01',
  'e-atmt-2': 'w-att02',
}

const OUT_SIZE = 256
const FACE_SCORE_MIN = 0.28
const MIN_FACE_PX = 24
const PERSON_SCORE_MIN = 0.22
const MIN_PERSON_PX = 64

function buildSources() {
  const clips = readdirSync(FEEDS)
    .filter(f => f.endsWith('.mp4'))
    .filter(f => /^(bodycam|ocp1-[ab])/.test(f))
    .sort()
  return clips.map(file => ({
    file,
    times: file.startsWith('bodycam') ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [1, 2, 3, 4, 5, 6, 7, 8, 9],
  }))
}

function extractFrame(videoPath, timeSec, outPath) {
  execFileSync('ffmpeg', [
    '-y', '-ss', String(timeSec), '-i', videoPath,
    '-frames:v', '1', '-q:v', '2', outPath,
  ], { stdio: 'pipe' })
}

function expandRect(x1, y1, x2, y2, pad, maxW, maxH) {
  const w = x2 - x1
  const h = y2 - y1
  const cx = (x1 + x2) / 2
  const cy = (y1 + y2) / 2
  const side = Math.max(w, h) * (1 + pad * 2)
  let left = cx - side / 2
  let top = cy - side / 2
  if (left < 0) left = 0
  if (top < 0) top = 0
  if (left + side > maxW) left = Math.max(0, maxW - side)
  if (top + side > maxH) top = Math.max(0, maxH - side)
  const size = Math.min(side, maxW - left, maxH - top)
  return { left, top, size }
}

function iou(a, b) {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.w, b.x + b.w)
  const y2 = Math.min(a.y + a.h, b.y + b.h)
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const union = a.w * a.h + b.w * b.h - inter
  return union > 0 ? inter / union : 0
}

function faceBox(f) {
  return { x: f.left, y: f.top, w: f.size, h: f.size }
}

function isDuplicate(face, existing, threshold) {
  const box = faceBox(face)
  return existing.some(e => iou(box, faceBox(e)) > threshold)
}

function pickUnique(candidates, count, threshold) {
  const picked = []
  for (const face of candidates) {
    if (picked.length >= count) break
    if (!isDuplicate(face, picked, threshold)) picked.push(face)
  }
  return picked
}

async function detectPersonHeads(cocoModel, imagePath) {
  const img = await loadImage(imagePath)
  const canvas = createCanvas(img.width, img.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const preds = await cocoModel.detect(canvas, 24, PERSON_SCORE_MIN)
  const heads = []
  for (const p of preds) {
    if (p.class !== 'person') continue
    const [x, y, w, h] = p.bbox
    if (w < MIN_PERSON_PX || h < MIN_PERSON_PX) continue
    const headH = h * 0.38
    const headW = w * 0.85
    const cx = x + w / 2
    const rect = expandRect(cx - headW / 2, y, cx + headW / 2, y + headH, 0.15, img.width, img.height)
    heads.push({
      ...rect,
      score: p.score * rect.size * 0.85,
      sourceImage: imagePath,
      imgW: img.width,
      imgH: img.height,
      kind: 'person-head',
    })
  }
  return heads
}

async function detectFaces(model, imagePath) {
  const img = await loadImage(imagePath)
  const canvas = createCanvas(img.width, img.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const predictions = await model.estimateFaces(canvas, false)
  const faces = []
  for (const p of predictions) {
    const prob = Array.isArray(p.probability) ? p.probability[0] : p.probability
    if (prob < FACE_SCORE_MIN) continue
    const [x1, y1] = p.topLeft
    const [x2, y2] = p.bottomRight
    const fw = x2 - x1
    const fh = y2 - y1
    if (fw < MIN_FACE_PX || fh < MIN_FACE_PX) continue
    const rect = expandRect(x1, y1, x2, y2, 0.4, img.width, img.height)
    faces.push({
      ...rect,
      score: prob * rect.size,
      sourceImage: imagePath,
      imgW: img.width,
      imgH: img.height,
      kind: 'face',
    })
  }
  return faces
}

async function saveAvatar(face, outFile) {
  const img = await loadImage(face.sourceImage)
  const src = createCanvas(face.imgW, face.imgH)
  const sctx = src.getContext('2d')
  sctx.drawImage(img, 0, 0)
  const out = createCanvas(OUT_SIZE, OUT_SIZE)
  const octx = out.getContext('2d')
  octx.drawImage(
    src,
    face.left, face.top, face.size, face.size,
    0, 0, OUT_SIZE, OUT_SIZE,
  )
  writeFileSync(outFile, out.toBuffer('image/jpeg', { quality: 0.92 }))
}

async function main() {
  const SOURCES = buildSources()
  const need = TRAINING_WORKER_IDS.length

  rmSync(TMP, { recursive: true, force: true })
  mkdirSync(TMP, { recursive: true })
  mkdirSync(OUT, { recursive: true })

  console.log(`Quét ${SOURCES.length} clip · cần ${need} avatar\n`)

  const tf = await import('@tensorflow/tfjs')
  await import('@tensorflow/tfjs-backend-cpu')
  await tf.setBackend('cpu')
  await tf.ready()

  const blazeface = await import('@tensorflow-models/blazeface')
  const model = await blazeface.load()
  const coco = await import('@tensorflow-models/coco-ssd')
  const cocoModel = await coco.load({ base: 'lite_mobilenet_v2' })

  const allFaces = []
  for (const src of SOURCES) {
    const videoPath = join(FEEDS, src.file)
    for (const t of src.times) {
      const framePath = join(TMP, `${src.file.replace('.mp4', '')}-${t}s.jpg`)
      try {
        extractFrame(videoPath, t, framePath)
        const faces = await detectFaces(model, framePath)
        const heads = await detectPersonHeads(cocoModel, framePath)
        for (const f of [...faces, ...heads]) {
          f.source = src.file
          f.timeSec = t
        }
        allFaces.push(...faces, ...heads)
      } catch (err) {
        console.warn(`${src.file} @${t}s:`, err.message)
      }
    }
    process.stdout.write(`  ${src.file} ✓\n`)
  }

  console.log(`\nTổng candidate: ${allFaces.length}`)

  allFaces.sort((a, b) => {
    const boost = (f) => (f.kind === 'face' ? 1.15 : 1)
    return b.score * boost(b) - a.score * boost(a)
  })

  let picked = pickUnique(allFaces, need, 0.3)
  if (picked.length < need) picked = pickUnique(allFaces, need, 0.2)
  if (picked.length < need) picked = pickUnique(allFaces, need, 0.12)
  if (picked.length < need) {
    console.warn(`\nChỉ đủ ${picked.length}/${need} — bổ sung crop phụ từ candidate còn lại`)
    for (const face of allFaces) {
      if (picked.length >= need) break
      if (!picked.includes(face)) picked.push(face)
    }
  }

  const mapping = { ...TRAINING_ALIASES }
  for (let i = 0; i < Math.min(picked.length, need); i++) {
    const workerId = TRAINING_WORKER_IDS[i]
    const fileName = `clip-${workerId}.jpg`
    await saveAvatar(picked[i], join(OUT, fileName))
    mapping[workerId] = fileName
    console.log(`✓ ${workerId} ← ${picked[i].source} @${picked[i].timeSec}s`)
  }

  for (const [alias, target] of Object.entries(TRAINING_ALIASES)) {
    mapping[alias] = mapping[target]
  }

  writeFileSync(MAPPING_OUT, JSON.stringify(mapping, null, 2))
  console.log(`\n→ ${picked.length} file clip-*.jpg`)
  console.log(`→ Mapping: ${MAPPING_OUT}`)

  rmSync(TMP, { recursive: true, force: true })
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
