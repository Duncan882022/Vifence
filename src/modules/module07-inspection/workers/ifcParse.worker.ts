import * as WEBIFC from 'web-ifc'
import { BOX_SECTION } from '../data/boxGirderSection'
import { classifyIfc, parseCableProfile, parseRebarDia, shortIfcName } from '../services/ifcClassify'
import {
  FIRST_PAINT,
  IFC_TO_METERS,
  patchIfc2x2Schema,
  shouldReadRebarLine,
  uniqueExpressIds,
} from '../services/ifcFirstPaint'
import {
  buildTubeMesh,
  collectBsplineFaces,
  collectSweptDisks,
  ifcPointToViewer,
  localPlacement,
  mergeTubeMeshes,
  rejectFarVertices,
  type Vec3,
} from '../services/ifcSweptTube'
import {
  anchorZone,
  boundsOf,
  buildInferredParts,
  cableCenterline,
  cableProperties,
  cableZone,
  girderOriginFromBounds,
  isBoxHoop,
  nearGirderEnd,
  splitConcreteByZone,
  zoneOfBounds,
  type CableAxis,
  type MeshData,
} from '../services/girderModel'
import { ZONE_META, type GirderZone, type ObjectKind } from '../types'
import type { IfcCatalogItem, IfcMeshChunk, IfcWorkerEvent, IfcWorkerLoadMessage, MeshStyle } from './ifcParse.types'

const SETTINGS: WEBIFC.LoaderSettings = {
  COORDINATE_TO_ORIGIN: false,
  CIRCLE_SEGMENTS: 8,
  ALLOW_INCOMPATIBLE_SCHEMA_ALIASES: true,
}

let api: WEBIFC.IfcAPI | null = null

type Props = IfcCatalogItem['properties']

const ZONE_TAG: Record<GirderZone, string> = {
  bottom: 'bottom',
  'web-left': 'web',
  'web-right': 'web',
  deck: 'deck',
}

async function ensureApi(wasmBase: string): Promise<WEBIFC.IfcAPI> {
  if (api) return api
  const instance = new WEBIFC.IfcAPI()
  instance.SetWasmPath(wasmBase, true)
  await instance.Init((path) => {
    const file = path.split('/').pop() ?? 'web-ifc.wasm'
    return `${wasmBase}${file}`
  }, true)
  try {
    instance.SetLogLevel(WEBIFC.LogLevel.LOG_LEVEL_OFF)
  } catch {
    /* log helper missing in some web-ifc builds */
  }
  api = instance
  return instance
}

function post(event: IfcWorkerEvent, transfer?: Transferable[]) {
  if (transfer?.length) self.postMessage(event, { transfer })
  else self.postMessage(event)
}

function shift(mesh: MeshData, origin: Vec3): MeshData {
  const p = mesh.positions
  for (let i = 0; i < p.length; i += 3) {
    p[i] -= origin[0]
    p[i + 1] -= origin[1]
    p[i + 2] -= origin[2]
  }
  return mesh
}

async function loadMerged(msg: IfcWorkerLoadMessage) {
  const { sources, wasmBase } = msg
  const names = sources.map(s => `${s.source.toUpperCase()}.ifc`).join(' + ')
  try {
    post({ type: 'progress', phase: 'fetch', pct: 6, message: `Đang tải ${names}...` })
    const [ifc, buffers] = await Promise.all([
      ensureApi(wasmBase),
      Promise.all(sources.map(async ({ url }) => {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`Không tải được ${url} (${res.status})`)
        return new Uint8Array(await res.arrayBuffer())
      })),
    ])

    const catalog = new Map<string, IfcCatalogItem>()
    const guidOwner = new Map<string, string>()
    const cables: CableAxis[] = []
    const pendingMeshes: IfcMeshChunk[] = []
    const pendingTransfer: Transferable[] = []
    let origin: Vec3 | null = null
    let meshCount = 0

    const flush = () => {
      if (!pendingMeshes.length) return
      post({ type: 'meshes', meshes: pendingMeshes.splice(0) }, pendingTransfer.splice(0))
    }
    const postCatalog = () => post({ type: 'catalog', items: [...catalog.values()] })
    const queue = (id: string, kind: ObjectKind, mesh: MeshData, style: MeshStyle = 'solid', provenance: IfcMeshChunk['provenance'] = 'extracted') => {
      pendingMeshes.push({ id, kind, provenance, style, positions: mesh.positions, indices: mesh.indices })
      pendingTransfer.push(mesh.positions.buffer, mesh.indices.buffer)
      meshCount += 1
      if (pendingMeshes.length >= 8) flush()
    }

    for (let fileIndex = 0; fileIndex < sources.length; fileIndex++) {
      const { source } = sources[fileIndex]
      const file = `${source.toUpperCase()}.ifc`
      const basePct = 20 + Math.round((fileIndex / sources.length) * 60)
      const spanPct = Math.round(60 / sources.length)
      post({ type: 'progress', phase: 'open', pct: basePct, message: `Đang mở ${file}...` })
      const modelID = ifc.OpenModel(patchIfc2x2Schema(buffers[fileIndex]), SETTINGS)
      if (modelID < 0) throw new Error(`Không đọc được ${file}. File schema không tương thích.`)

      const idsOf = (type: number) => {
        try {
          const vec = ifc.GetLineIDsWithType(modelID, type, true)
          const out: number[] = []
          for (let i = 0; i < vec.size(); i++) out.push(vec.get(i))
          return out
        } catch {
          return []
        }
      }

      let site: Vec3 = [0, 0, 0]
      const siteIds = idsOf(WEBIFC.IFCSITE)
      if (siteIds.length) {
        try {
          const line = ifc.GetLine(modelID, siteIds[0], true) as { ObjectPlacement?: unknown }
          site = localPlacement(line.ObjectPlacement).t
        } catch { /* keep project origin */ }
      }
      const siteViewer: Vec3 = [site[0] * IFC_TO_METERS, site[2] * IFC_TO_METERS, -site[1] * IFC_TO_METERS]
      const resolve = (ref: unknown) => {
        const id = (ref as { value?: unknown } | null)?.value
        return typeof id === 'number' ? ifc.GetLine(modelID, id, false) : null
      }
      const toGirder = (p: Vec3): Vec3 => {
        const v = ifcPointToViewer(p, site)
        return origin ? [v[0] - origin[0], v[1] - origin[1], v[2] - origin[2]] : v
      }

      const flatMesh = (expressID: number): MeshData | null => {
        try {
          const geos = ifc.GetFlatMesh(modelID, expressID).geometries
          const parts: MeshData[] = []
          for (let i = 0; i < Math.min(geos.size(), FIRST_PAINT.maxPlacedGeometries); i++) {
            const placed = geos.get(i)
            const geom = ifc.GetGeometry(modelID, placed.geometryExpressID)
            const vSize = geom.GetVertexDataSize()
            const iSize = geom.GetIndexDataSize()
            if (vSize > 6 * 800000 || iSize > 2_400_000) continue
            const verts = ifc.GetVertexArray(geom.GetVertexData(), vSize)
            const idx = ifc.GetIndexArray(geom.GetIndexData(), iSize)
            const m = placed.flatTransformation
            const count = Math.floor(verts.length / 6)
            if (count < 3 || idx.length < 3) continue
            const positions = new Float32Array(count * 3)
            for (let k = 0, o = 0; k < verts.length; k += 6, o += 3) {
              const x = verts[k]
              const y = verts[k + 1]
              const z = verts[k + 2]
              positions[o] = m[0] * x + m[4] * y + m[8] * z + m[12] - siteViewer[0]
              positions[o + 1] = m[1] * x + m[5] * y + m[9] * z + m[13] - siteViewer[1]
              positions[o + 2] = m[2] * x + m[6] * y + m[10] * z + m[14] - siteViewer[2]
            }
            const clean = rejectFarVertices(positions, new Uint32Array(idx))
            if (clean) parts.push(clean)
          }
          const merged = mergeTubeMeshes(parts)
          if (!merged) return null
          if (!origin) {
            const b = boundsOf(merged.positions)
            if (b) origin = girderOriginFromBounds(b.min, b.max)
          }
          return origin ? shift(merged, origin) : merged
        } catch {
          return null
        }
      }

      const baseProps = (expressID: number, typeName: string): Props => [
        { key: 'class', label: 'IFC Class', value: typeName, provenance: 'extracted' },
        { key: 'express', label: 'Express ID', value: String(expressID), provenance: 'extracted' },
        { key: 'file', label: 'Nguồn', value: file, provenance: 'extracted' },
      ]

      const readProduct = (expressID: number, named: boolean) => {
        const typeName = ifc.GetNameFromTypeCode(ifc.GetLineType(modelID, expressID) as number) || 'IfcProduct'
        let name = `${typeName} #${expressID}`
        let guid = `${source}-${expressID}`
        if (named) {
          try {
            const line = ifc.GetLine(modelID, expressID, false) as { Name?: { value?: string }; GlobalId?: { value?: string } }
            if (line?.Name?.value) name = String(line.Name.value)
            if (line?.GlobalId?.value) guid = String(line.GlobalId.value)
          } catch { /* keep fallback */ }
        }
        return { typeName, name, guid, ...classifyIfc(typeName, name) }
      }

      type Product = ReturnType<typeof readProduct> & { expressID: number }
      const buckets: Record<ObjectKind, Product[]> = { concrete: [], rebar: [], dul: [], anchor: [], embed: [] }
      const structureIds = uniqueExpressIds([
        idsOf(WEBIFC.IFCBUILDINGELEMENTPROXY),
        idsOf(WEBIFC.IFCBEAM),
        idsOf(WEBIFC.IFCMEMBER),
        idsOf(WEBIFC.IFCSLAB),
        idsOf(WEBIFC.IFCCOLUMN),
        idsOf(WEBIFC.IFCTENDON),
        idsOf(WEBIFC.IFCTENDONANCHOR),
        idsOf(WEBIFC.IFCPLATE),
        idsOf(WEBIFC.IFCDISCRETEACCESSORY),
        idsOf(WEBIFC.IFCMECHANICALFASTENER),
        idsOf(WEBIFC.IFCFASTENER),
        idsOf(WEBIFC.IFCREINFORCINGMESH),
      ])
      const barIds = idsOf(WEBIFC.IFCREINFORCINGBAR)
      for (const id of structureIds) {
        const p = readProduct(id, true)
        const owner = guidOwner.get(p.guid)
        if (owner) {
          const shared = [...catalog.values()].filter(item => item.ifcGuid === p.guid)
          shared.forEach(item => {
            const fileProp = item.properties.find(prop => prop.key === 'file')
            if (fileProp && !fileProp.value?.includes(file)) fileProp.value = `${fileProp.value} + ${file} (trùng GUID)`
          })
          continue
        }
        guidOwner.set(p.guid, `${source}-${id}`)
        buckets[p.kind].push({ ...p, expressID: id })
      }
      barIds.forEach((id, i) => buckets.rebar.push({ ...readProduct(id, shouldReadRebarLine(i)), expressID: id }))

      const total = Math.max(1, Object.values(buckets).reduce((n, list) => n + list.length, 0))
      let done = 0
      const tick = (label: string) => {
        done += 1
        if (done % 25 !== 0 && done !== total) return
        post({
          type: 'progress',
          phase: 'geom',
          pct: basePct + Math.round((done / total) * spanPct),
          message: `Đang dựng 3D ${file} · ${label} (${done}/${total})...`,
        })
      }

      const addItem = (item: IfcCatalogItem) => catalog.set(item.id, item)

      for (const p of buckets.concrete) {
        tick('bê tông')
        const mesh = flatMesh(p.expressID)
        const baseId = `${source}-${p.expressID}`
        const zones = mesh && /damhop/i.test(p.name) ? splitConcreteByZone(mesh) : null
        const zoneProps: Record<GirderZone, Props> = {
          bottom: [
            { key: 'soffit', label: 'Bề rộng đáy', value: BOX_SECTION.soffitWidth.toFixed(2), unit: 'm', provenance: 'extracted' },
            { key: 'thk', label: 'Chiều dày bản đáy', value: String(BOX_SECTION.bottomSlabThk * 1000), unit: 'mm', provenance: 'extracted' },
          ],
          'web-left': [{ key: 'thk', label: 'Bề dày sườn', value: String(Math.round(BOX_SECTION.webThk * 1000)), unit: 'mm', provenance: 'extracted' }],
          'web-right': [{ key: 'thk', label: 'Bề dày sườn', value: String(Math.round(BOX_SECTION.webThk * 1000)), unit: 'mm', provenance: 'extracted' }],
          deck: [
            { key: 'width', label: 'Bề rộng bản mặt', value: BOX_SECTION.deckWidth.toFixed(1), unit: 'm', provenance: 'extracted' },
            { key: 'thk', label: 'Chiều dày bản mặt', value: String(Math.round(BOX_SECTION.deckThk * 1000)), unit: 'mm', provenance: 'extracted' },
            { key: 'cant', label: 'Cánh hẫng', value: BOX_SECTION.cantilever.toFixed(2), unit: 'm', provenance: 'extracted' },
          ],
        }
        if (zones) {
          for (const zone of Object.keys(zones) as GirderZone[]) {
            const part = zones[zone]
            if (!part) continue
            const id = `${baseId}-${zone}`
            addItem({
              id,
              expressID: p.expressID,
              ifcGuid: p.guid,
              ifcClass: p.typeName,
              name: `Dầm hộp · ${ZONE_META[zone].label}`,
              kind: 'concrete',
              stage: ZONE_META[zone].stage,
              source,
              provenance: 'extracted',
              parentId: null,
              tags: [`concrete-${ZONE_TAG[zone]}`, 'concrete', `zone-${zone}`],
              properties: [
                ...baseProps(p.expressID, p.typeName),
                { key: 'family', label: 'Family', value: shortIfcName(p.name), provenance: 'extracted' },
                { key: 'length', label: 'Chiều dài', value: BOX_SECTION.length.toFixed(1), unit: 'm', provenance: 'extracted' },
                ...zoneProps[zone],
                { key: 'cut', label: 'Tách vùng', value: `Mạch ngừng y=${BOX_SECTION.joint1} / ${BOX_SECTION.joint2} m`, provenance: 'inferred' },
              ],
            })
            queue(id, 'concrete', part)
          }
        } else {
          addItem({
            id: baseId,
            expressID: p.expressID,
            ifcGuid: p.guid,
            ifcClass: p.typeName,
            name: shortIfcName(p.name),
            kind: 'concrete',
            stage: p.stage,
            source,
            provenance: 'extracted',
            parentId: null,
            tags: ['concrete'],
            properties: baseProps(p.expressID, p.typeName),
          })
          if (mesh) queue(baseId, 'concrete', mesh)
        }
      }
      postCatalog()
      flush()

      const fileCables: CableAxis[] = []
      for (const p of buckets.dul) {
        tick('cáp DƯL')
        const id = `${source}-${p.expressID}`
        const profile = parseCableProfile(p.name)
        let axis: CableAxis | null = null
        try {
          const faces = collectBsplineFaces(ifc.GetLine(modelID, p.expressID, true), resolve)
            .map(rows => rows.map(row => row.map(toGirder)))
          const line = cableCenterline(faces)
          if (line) axis = { id, points: line.points, radius: line.radius, zone: cableZone(line.points), profile }
        } catch { /* fall back to tessellation */ }
        let mesh: MeshData | null = axis ? buildTubeMesh(axis.points, axis.radius, 10) : null
        let zone: GirderZone = axis?.zone ?? 'bottom'
        if (!mesh) {
          mesh = flatMesh(p.expressID)
          const b = mesh ? boundsOf(mesh.positions) : null
          if (b) zone = zoneOfBounds(b.min, b.max)
        }
        if (axis) fileCables.push(axis)
        addItem({
          id,
          expressID: p.expressID,
          ifcGuid: p.guid,
          ifcClass: p.typeName,
          name: `Bó cáp ${profile ?? ''} · ${ZONE_META[zone].label}`.replace('  ', ' '),
          kind: 'dul',
          stage: ZONE_META[zone].stage,
          source,
          provenance: 'extracted',
          parentId: null,
          tags: [zone === 'bottom' ? 'cable-bottom' : 'cable-web', 'cable', `zone-${zone}`],
          properties: [
            ...baseProps(p.expressID, p.typeName),
            ...(profile ? [{ key: 'profile', label: 'Loại bó', value: profile, provenance: 'extracted' as const }] : []),
            ...(axis ? cableProperties(axis) : []),
            { key: 'zone', label: 'Vùng (theo vị trí)', value: ZONE_META[zone].label, provenance: 'inferred' },
            { key: 'force', label: 'Lực căng thiết kế', value: null, unit: 'kN', provenance: 'required' },
          ],
        })
        if (mesh) queue(id, 'dul', mesh)
      }
      cables.push(...fileCables)
      flush()

      for (const kind of ['anchor', 'embed'] as const) {
        for (const p of buckets[kind]) {
          tick(kind === 'anchor' ? 'neo' : 'chi tiết chôn sẵn')
          const id = `${source}-${p.expressID}`
          const mesh = flatMesh(p.expressID)
          const b = mesh ? boundsOf(mesh.positions) : null
          const center: Vec3 | null = b ? [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2] : null
          const linked = kind === 'anchor' && center ? anchorZone(center, cables) : null
          const zone: GirderZone = linked?.zone ?? (b ? zoneOfBounds(b.min, b.max) : 'bottom')
          const profile = parseCableProfile(p.name)
          addItem({
            id,
            expressID: p.expressID,
            ifcGuid: p.guid,
            ifcClass: p.typeName,
            name: kind === 'anchor'
              ? `Neo ${profile ?? ''} · ${ZONE_META[zone].label}${center ? (center[2] < 0 ? ' · đầu A' : ' · đầu B') : ''}`.replace('  ', ' ')
              : shortIfcName(p.name),
            kind,
            stage: ZONE_META[zone].stage,
            source,
            provenance: 'extracted',
            parentId: linked?.cableId ?? null,
            tags: kind === 'anchor' ? [zone === 'bottom' ? 'anchor-bottom' : 'anchor-web', 'anchor', `zone-${zone}`] : ['embed', `zone-${zone}`],
            properties: [
              ...baseProps(p.expressID, p.typeName),
              ...(profile ? [{ key: 'profile', label: 'Loại neo', value: profile, provenance: 'extracted' as const }] : []),
              ...(linked ? [{ key: 'cable', label: 'Bó cáp', value: catalog.get(linked.cableId)?.name ?? linked.cableId, provenance: 'inferred' as const }] : []),
              { key: 'zone', label: 'Vùng (theo vị trí)', value: ZONE_META[zone].label, provenance: 'inferred' },
              ...(kind === 'anchor' ? [{ key: 'hold', label: 'Hold point căng kéo', value: null, provenance: 'required' as const }] : []),
            ],
          })
          if (mesh) queue(id, kind, mesh)
        }
      }
      postCatalog()
      flush()

      for (const p of buckets.rebar) {
        tick('cốt thép')
        const id = `${source}-${p.expressID}`
        let mesh: MeshData | null = null
        let barCount = 0
        try {
          const disks = collectSweptDisks(ifc.GetLine(modelID, p.expressID, true))
          const parts: MeshData[] = []
          for (const disk of disks.slice(0, FIRST_PAINT.maxDisksPerProduct)) {
            const tube = buildTubeMesh(disk.points.map(toGirder), disk.radius * IFC_TO_METERS, 5)
            if (tube) parts.push(tube)
          }
          mesh = mergeTubeMeshes(parts)
          barCount = disks.length
        } catch { /* keep catalog entry */ }
        const b = mesh ? boundsOf(mesh.positions) : null
        const zone: GirderZone = b ? zoneOfBounds(b.min, b.max) : 'web-left'
        const tags = [`rebar-${ZONE_TAG[zone]}`, 'rebar', `zone-${zone}`]
        const hoop = b ? isBoxHoop(b.min, b.max) : false
        if (hoop) tags.push('rebar-web', 'rebar-hoop')
        if (b) {
          if (source === 'dul') tags.push(nearGirderEnd(b.min, b.max, 0.6) ? 'rebar-anchor-zone' : 'rebar-duct-support')
          else if (nearGirderEnd(b.min, b.max, 4.6) && b.max[2] - b.min[2] < 4.5) tags.push('rebar-anchor-zone')
        }
        const dia = parseRebarDia(p.name)
        const role = tags.includes('rebar-duct-support')
          ? ' · định vị ống gen'
          : hoop ? ' · đai kín hộp' : tags.includes('rebar-anchor-zone') ? ' · vùng neo' : ''
        addItem({
          id,
          expressID: p.expressID,
          ifcGuid: p.guid,
          ifcClass: p.typeName,
          name: `${shortIfcName(p.name)}${role}`,
          kind: 'rebar',
          stage: ZONE_META[zone].stage,
          source,
          provenance: 'extracted',
          parentId: null,
          tags,
          properties: [
            ...baseProps(p.expressID, p.typeName),
            ...(dia ? [{ key: 'dia', label: 'Đường kính', value: dia, provenance: 'extracted' as const }] : []),
            ...(barCount ? [{ key: 'bars', label: 'Số thanh', value: String(barCount), provenance: 'extracted' as const }] : []),
            { key: 'zone', label: 'Vùng (theo vị trí)', value: ZONE_META[zone].label, provenance: 'inferred' },
          ],
        })
        if (mesh) queue(id, 'rebar', mesh)
      }
      postCatalog()
      flush()
      ifc.CloseModel(modelID)
    }

    post({ type: 'progress', phase: 'geom', pct: 92, message: 'Đang nội suy cấu kiện thiếu (Đề xuất)...' })
    for (const part of buildInferredParts(cables)) {
      catalog.set(part.id, {
        id: part.id,
        expressID: 0,
        ifcGuid: part.id,
        ifcClass: 'Đề xuất',
        name: part.name,
        kind: part.kind,
        stage: ZONE_META[part.zone].stage,
        source: 'inferred',
        provenance: 'inferred',
        parentId: part.id.startsWith('inf-duct-') ? part.id.slice('inf-duct-'.length) : null,
        tags: [...part.tags, `zone-${part.zone}`],
        properties: [
          { key: 'zone', label: 'Vùng', value: ZONE_META[part.zone].label, provenance: 'inferred' },
          ...part.properties,
        ],
      })
      queue(part.id, part.kind, part.mesh, part.style, 'inferred')
    }
    flush()
    if (catalog.size === 0) throw new Error(`${names} không chứa geometry hiển thị được.`)
    postCatalog()
    post({ type: 'done', count: meshCount })
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : `Lỗi đọc ${names}` })
  }
}

self.onmessage = (event: MessageEvent<IfcWorkerLoadMessage>) => {
  if (event.data?.type === 'load') void loadMerged(event.data)
}
