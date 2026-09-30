import { memo, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  IFC_SOURCE_META,
  KIND_META,
  MERGED_IFC_SOURCES,
  type BimObject,
  type InspectionStageId,
  type ObjectKind,
  type Provenance,
} from '../types'
import { MAX_VIEWER_RADIUS } from '../services/ifcSweptTube'
import type { IfcCatalogItem, IfcWorkerEvent, IfcWorkerLoadMessage, MeshStyle } from '../workers/ifcParse.types'

interface Props {
  assetId: string
  objects: BimObject[]
  visibleIds: Set<string>
  selectedIds: string[]
  hoveredId: string | null
  highlightIds: string[]
  isolatedIds: string[] | null
  stageFilter: InspectionStageId | 'all'
  onSelect: (id: string, additive: boolean) => void
  onHover: (id: string | null) => void
  onCatalog: (items: BimObject[]) => void
  onProgress: (pct: number, message: string, phase: 'ifc' | 'parse' | 'stage') => void
  onReady: () => void
  onError: (message: string) => void
}

const STAGE_TINT: Record<InspectionStageId, number> = {
  gd1: 0x4ade80,
  gd2: 0xfbbf24,
  gd3: 0x38bdf8,
}

function materialFor(kind: ObjectKind, provenance: Provenance, style: MeshStyle): THREE.MeshLambertMaterial {
  const color = new THREE.Color(KIND_META[kind].color)
  const inferred = provenance !== 'extracted'
  if (inferred) color.lerp(new THREE.Color(0xffffff), 0.35)
  const ghost = style === 'ghost'
  const opacity = ghost ? 0.26 : kind === 'concrete' ? 0.36 : inferred ? 0.85 : 1
  return new THREE.MeshLambertMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 0.8,
    side: THREE.DoubleSide,
    emissive: 0x000000,
    emissiveIntensity: 0,
  })
}

function fitCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls, box: THREE.Box3) {
  if (box.isEmpty()) return
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const radius = Math.max(size.x, size.y, size.z, 2)
  camera.near = Math.max(radius / 800, 0.05)
  camera.far = Math.max(radius * 24, 80)
  camera.position.set(center.x + radius * 0.75, center.y + radius * 0.45, center.z + radius * 0.8)
  controls.target.copy(center)
  controls.maxDistance = radius * 10
  controls.minDistance = Math.max(radius * 0.04, 0.4)
  camera.updateProjectionMatrix()
  controls.update()
}

function rebuildBox(map: Map<string, THREE.Mesh>, box: THREE.Box3) {
  box.makeEmpty()
  map.forEach(mesh => {
    mesh.geometry.computeBoundingBox()
    mesh.geometry.computeBoundingSphere()
    mesh.updateMatrixWorld(true)
    box.expandByObject(mesh)
  })
}

function toBimObject(item: IfcCatalogItem, assetId: string): BimObject {
  return { ...item, assetId }
}

export const BimViewer = memo(function BimViewer({
  assetId, objects, visibleIds, selectedIds, hoveredId, highlightIds, isolatedIds,
  stageFilter, onSelect, onHover, onCatalog, onProgress, onReady, onError,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map<string, THREE.Mesh>>(new Map())
  const boxRef = useRef(new THREE.Box3())
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const rayRef = useRef(new THREE.Raycaster())
  const mouseRef = useRef(new THREE.Vector2())
  const callbacks = useRef({ onSelect, onHover, onCatalog, onProgress, onReady, onError, assetId })
  callbacks.current = { onSelect, onHover, onCatalog, onProgress, onReady, onError, assetId }
  const visibilityRef = useRef({ visibleIds, isolatedIds })
  visibilityRef.current = { visibleIds, isolatedIds }

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x070b12)
    scene.fog = null

    const content = new THREE.Group()
    scene.add(content)

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 4000)
    camera.position.set(18, 12, 22)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.setSize(el.clientWidth, el.clientHeight)
    el.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.target.set(0, 1.5, 0)
    controls.maxPolarAngle = Math.PI * 0.92
    controlsRef.current = controls

    scene.add(new THREE.AmbientLight(0xb8c4d8, 0.7))
    const key = new THREE.DirectionalLight(0xe8eef8, 1.05)
    key.position.set(12, 22, 8)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0x4a90d9, 0.32)
    fill.position.set(-10, 6, -8)
    scene.add(fill)

    const grid = new THREE.GridHelper(80, 40, 0x1e2433, 0x141a24)
    grid.position.y = -0.6
    scene.add(grid)

    const meshMap = mapRef.current
    meshMap.clear()
    boxRef.current.makeEmpty()

    const frameScene = () => {
      rebuildBox(meshMap, boxRef.current)
      if (boxRef.current.isEmpty()) return
      try { fitCamera(camera, controls, boxRef.current) } catch { /* keep adding */ }
      scene.fog = new THREE.Fog(0x070b12, Math.max(camera.far * 0.4, 24), camera.far * 0.95)
    }

    const addMesh = (id: string, mesh: THREE.Mesh) => {
      mesh.name = id
      mesh.userData.id = id
      mesh.geometry.computeBoundingBox()
      const bb = mesh.geometry.boundingBox
      if (bb && !bb.isEmpty()) {
        const size = bb.getSize(new THREE.Vector3())
        if (Math.max(size.x, size.y, size.z) > MAX_VIEWER_RADIUS * 2) return
      }
      const vis = visibilityRef.current
      mesh.visible = vis.isolatedIds?.length ? vis.isolatedIds.includes(id) : vis.visibleIds.has(id)
      content.add(mesh)
      meshMap.set(id, mesh)
      mesh.updateMatrixWorld(true)
      boxRef.current.expandByObject(mesh)
      if (meshMap.size === 1 || meshMap.size % 200 === 0) frameScene()
    }

    const pickables = () => [...meshMap.values()].filter(m => m.visible)

    const pick = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect()
      mouseRef.current.x = ((clientX - rect.left) / rect.width) * 2 - 1
      mouseRef.current.y = -((clientY - rect.top) / rect.height) * 2 + 1
      rayRef.current.setFromCamera(mouseRef.current, camera)
      const hits = rayRef.current.intersectObjects(pickables(), false)
      return hits[0] ? String(hits[0].object.userData.id) : null
    }

    const onMove = (e: PointerEvent) => {
      const id = pick(e.clientX, e.clientY)
      callbacks.current.onHover(id)
      renderer.domElement.style.cursor = id ? 'pointer' : 'grab'
    }

    const onClick = (e: MouseEvent) => {
      const id = pick(e.clientX, e.clientY)
      if (!id) {
        if (!e.shiftKey) callbacks.current.onSelect('', false)
        return
      }
      callbacks.current.onSelect(id, e.shiftKey)
    }

    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('click', onClick)

    const resize = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (w < 8 || h < 8) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()

    let raf = 0
    const tick = () => {
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    tick()

    const worker = new Worker(new URL('../workers/ifcParse.worker.ts', import.meta.url), { type: 'module' })
    const queue: Array<{ id: string; kind: ObjectKind; provenance: Provenance; style: MeshStyle; positions: Float32Array; indices: Uint32Array }> = []
    let flushing = false
    let finished = false

    const flushQueue = () => {
      flushing = true
      try {
        for (const item of queue.splice(0, 60)) {
          if (meshMap.has(item.id)) continue
          try {
            if (item.positions.length < 9 || item.indices.length < 3) continue
            if (!Number.isFinite(item.positions[0])) continue
            const geo = new THREE.BufferGeometry()
            geo.setAttribute('position', new THREE.BufferAttribute(item.positions, 3))
            geo.setIndex(new THREE.BufferAttribute(item.indices, 1))
            geo.computeVertexNormals()
            const mesh = new THREE.Mesh(geo, materialFor(item.kind, item.provenance, item.style))
            if (item.style === 'ghost') mesh.renderOrder = 2
            addMesh(item.id, mesh)
          } catch {
            /* skip a corrupt IFC chunk without aborting the rest */
          }
        }
      } finally {
        if (queue.length) requestAnimationFrame(flushQueue)
        else flushing = false
      }
    }

    const drain = () => {
      if (queue.length || flushing) {
        requestAnimationFrame(drain)
        return
      }
      frameScene()
      callbacks.current.onProgress(100, 'Đang xây dựng Inspection Stage...', 'stage')
      callbacks.current.onReady()
    }

    worker.onmessage = (event: MessageEvent<IfcWorkerEvent>) => {
      const msg = event.data
      if (msg.type === 'progress') {
        callbacks.current.onProgress(msg.pct, msg.message, msg.phase === 'geom' ? 'parse' : 'ifc')
        return
      }
      if (msg.type === 'meshes') {
        queue.push(...msg.meshes)
        if (!flushing) flushQueue()
        return
      }
      if (msg.type === 'catalog') {
        callbacks.current.onCatalog(msg.items.map(item => toBimObject(item, callbacks.current.assetId)))
        return
      }
      if (msg.type === 'done') {
        finished = true
        drain()
        return
      }
      if (msg.type === 'error') {
        finished = true
        callbacks.current.onError(msg.message)
      }
    }

    worker.onerror = (err) => {
      if (finished) return
      finished = true
      callbacks.current.onError(err.message || 'Worker IFC lỗi')
    }

    const payload: IfcWorkerLoadMessage = {
      type: 'load',
      sources: MERGED_IFC_SOURCES.map(source => ({ source, url: IFC_SOURCE_META[source].url })),
      wasmBase: `${import.meta.env.BASE_URL}inspection/wasm/`,
    }
    worker.postMessage(payload)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      worker.terminate()
      renderer.domElement.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('click', onClick)
      controls.dispose()
      renderer.dispose()
      el.removeChild(renderer.domElement)
      scene.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          const m = obj.material
          if (Array.isArray(m)) m.forEach(x => x.dispose())
          else m.dispose()
        }
      })
      meshMap.clear()
    }
  }, [assetId])

  const stageOf = useMemo(() => new Map(objects.map(o => [o.id, o.stage])), [objects])

  useEffect(() => {
    const isolated = isolatedIds && isolatedIds.length > 0 ? new Set(isolatedIds) : null
    const selected = new Set(selectedIds)
    const highlighted = new Set(highlightIds)
    mapRef.current.forEach((mesh, id) => {
      mesh.visible = isolated ? isolated.has(id) : visibleIds.has(id)
      const mat = mesh.material as THREE.MeshLambertMaterial
      if (!mat?.emissive) return
      if (selected.has(id)) {
        mat.emissive.setHex(0x38bdf8)
        mat.emissiveIntensity = 0.55
      } else if (hoveredId === id || highlighted.has(id)) {
        mat.emissive.setHex(stageFilter === 'all' ? 0xfbbf24 : STAGE_TINT[stageFilter] ?? 0xfbbf24)
        mat.emissiveIntensity = 0.38
      } else if (stageFilter !== 'all' && stageOf.get(id) === stageFilter) {
        mat.emissive.setHex(STAGE_TINT[stageFilter])
        mat.emissiveIntensity = 0.16
      } else {
        mat.emissive.setHex(0x000000)
        mat.emissiveIntensity = 0
      }
    })
  }, [visibleIds, selectedIds, hoveredId, highlightIds, isolatedIds, stageFilter, stageOf])

  useEffect(() => {
    const map = mapRef.current
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls || map.size === 0) return
    const box = new THREE.Box3()
    map.forEach(mesh => {
      if (!mesh.visible) return
      mesh.updateMatrixWorld(true)
      box.expandByObject(mesh)
    })
    if (!box.isEmpty()) fitCamera(camera, controls, box)
  }, [visibleIds, isolatedIds])

  return <div ref={wrapRef} className="absolute inset-0" />
})
