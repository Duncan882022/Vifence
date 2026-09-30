import { BOX_SECTION } from '../boxGirderSection'
import { criteriaForStage } from './criteria'
import { ASSETS, COMPONENTS, DOCUMENTS } from './hnqnProject'
import type {
  AiWarningType,
  AssetRecord,
  BriefAck,
  BriefOutsideCheck,
  BriefReference,
  ComponentId,
  InspectionBrief,
  InspectionRequirement,
  RequirementSourceType,
  SourceKind,
  StageCode,
  VisualContext,
} from '../../workflow.types'

const mm = (m: number) => Math.round(m * 1000)

type Source = Pick<InspectionRequirement, 'sourceType' | 'sourceKind' | 'sourceDocument' | 'sourceRevision' | 'sourceReference'>

interface Row extends Omit<InspectionRequirement, 'id' | 'assetType' | 'stage' | 'component' | keyof Source> {
  src: Source
}

interface Template {
  rows: (component: ComponentId) => Row[]
  attention: string[]
  outsideVideo: BriefOutsideCheck[]
  references: RequirementSourceType[]
  aiSupport: string[]
  aiLimits: string
  aiFocus: AiWarningType[]
}

function docOf(code: string) {
  return DOCUMENTS.find(d => d.code === code)
}

/** Nguồn tham chiếu theo hồ sơ của hạng mục. Hồ sơ nào chưa cấu hình → `configured: false`. */
function sourceFor(asset: AssetRecord, type: RequirementSourceType, reference: string): Source {
  const base = (sourceDocument: string, sourceRevision: string, sourceKind: SourceKind): Source => ({
    sourceType: type, sourceKind, sourceDocument, sourceRevision, sourceReference: reference,
  })
  switch (type) {
    case 'AFC': return base(asset.afc.code, asset.afc.revision, 'MOCK')
    case 'BBS': return base(asset.bbs.code, asset.bbs.revision, 'MOCK')
    case 'ITP': return base(asset.itp.code, asset.itp.revision, 'MOCK')
    case 'BPTC': return base(asset.bptc.code, asset.bptc.revision, 'MOCK')
    case 'BIM': return base(asset.bim.label, asset.bim.revision, 'IFC')
    case 'MATERIAL': {
      const doc = docOf(reference)
      return doc
        ? { sourceType: type, sourceKind: doc.source, sourceDocument: doc.code, sourceRevision: doc.revision, sourceReference: doc.title }
        : base('Hồ sơ vật liệu', 'chưa cấu hình', 'MOCK')
    }
    case 'SPEC': return base('Chỉ dẫn kỹ thuật dự án', 'chưa cấu hình', 'MOCK')
    case 'STANDARD': return base('Tiêu chuẩn áp dụng', 'chưa cấu hình', 'MOCK')
    case 'CONFIG': return base('Cấu hình dự án', '—', 'MOCK')
  }
}

function referenceFor(asset: AssetRecord, type: RequirementSourceType, stage: StageCode): BriefReference {
  switch (type) {
    case 'AFC': return { type, code: asset.afc.code, revision: asset.afc.revision, note: 'Bản vẽ thi công được duyệt', sourceKind: 'MOCK', configured: true }
    case 'BBS': return { type, code: asset.bbs.code, revision: asset.bbs.revision, note: 'Bảng thống kê cốt thép', sourceKind: 'MOCK', configured: true }
    case 'ITP': return { type, code: asset.itp.code, revision: asset.itp.revision, note: 'Kế hoạch kiểm tra & thử nghiệm', sourceKind: 'MOCK', configured: true }
    case 'BPTC': return { type, code: asset.bptc.code, revision: asset.bptc.revision, note: 'Biện pháp thi công / Method Statement', sourceKind: 'MOCK', configured: true }
    case 'BIM': return { type, code: asset.bim.label, revision: asset.bim.revision, note: 'Mô hình IFC tham chiếu', sourceKind: 'IFC', configured: true }
    case 'MATERIAL': {
      const doc = DOCUMENTS.find(d => d.stage === stage && d.kind === 'MATERIAL')
      return doc
        ? { type, code: doc.code, revision: doc.revision, note: doc.title, sourceKind: doc.source, configured: doc.status === 'approved' }
        : { type, code: '—', revision: '—', note: 'Hồ sơ vật liệu', sourceKind: 'MOCK', configured: false }
    }
    case 'SPEC': return { type, code: 'Chỉ dẫn kỹ thuật dự án', revision: '—', note: 'Chưa cấu hình điều khoản áp dụng', sourceKind: 'MOCK', configured: false }
    case 'STANDARD': return { type, code: 'TCVN / tiêu chuẩn dự án', revision: '—', note: 'Chưa cấu hình điều khoản áp dụng', sourceKind: 'MOCK', configured: false }
    case 'CONFIG': return { type, code: 'Cấu hình dự án', revision: '—', note: '', sourceKind: 'MOCK', configured: false }
  }
}

/** Giá trị thiết kế lấy từ tiêu chí có nguồn IFC — không lấy tiêu chí MOCK. */
function ifcQuantity(stage: StageCode, component: ComponentId): string | undefined {
  const list = criteriaForStage(stage).filter(c => c.component === component && c.group === 'quantity' && c.source.kind === 'IFC')
  if (!list.length) return undefined
  return list.map(c => {
    const dia = c.source.ref.match(/D\d+(\/D\d+)*/)?.[0]
    return dia ? `${c.design} ${dia}` : c.design
  }).join(' · ')
}

function ifcDiameters(component: ComponentId): string | undefined {
  const refs = criteriaForStage('GD02').filter(c => c.component === component && c.source.kind === 'IFC').map(c => c.source.ref)
  const dias = [...new Set(refs.flatMap(r => r.match(/D\d+/g) ?? []))].sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)))
  return dias.length ? dias.join(' · ') : undefined
}

function ifcGeometry(component: ComponentId): string | undefined {
  switch (component) {
    case 'bottom': return `Rộng đáy ${mm(BOX_SECTION.soffitWidth)} mm · dài ${BOX_SECTION.length.toFixed(1)} m`
    case 'web-left':
    case 'web-right': return `Dày sườn ${mm(BOX_SECTION.webThk)} mm`
    case 'deck': return `Rộng bản mặt ${mm(BOX_SECTION.deckWidth)} mm · cao dầm ${mm(BOX_SECTION.height)} mm`
    default: return undefined
  }
}

function rebarTemplate(asset: AssetRecord): Template {
  const S = (t: RequirementSourceType, ref: string) => sourceFor(asset, t, ref)
  return {
    rows: c => [
      { group: 'material', title: 'Chủng loại / đường kính thép', value: ifcDiameters(c), genericText: 'Theo bản vẽ AFC / BBS được duyệt', method: 'COMBINATION', attentionNote: 'Đo đường kính + đối chiếu chứng chỉ vật liệu', src: S('BIM', `IfcReinforcingBar · ${COMPONENTS[c].labelEn}`), aiSupport: 'WARNING_ONLY', priority: 'high' },
      { group: 'quantity', title: 'Số lượng thanh', value: ifcQuantity('GD02', c), genericText: 'Theo bảng thống kê thép (BBS) được duyệt', method: 'COMBINATION', attentionNote: 'Quan sát + đối chiếu BIM; AI chỉ cảnh báo vùng thưa / thiếu', src: S('BIM', `IfcReinforcingBar · ${COMPONENTS[c].labelEn}`), aiSupport: 'WARNING_ONLY', priority: 'high' },
      { group: 'geometry', title: 'Khoảng cách thanh', genericText: 'Kiểm tra khoảng cách theo bản vẽ được duyệt', method: 'MEASUREMENT', src: S('AFC', 'Mặt cắt bố trí thép'), aiSupport: 'WARNING_ONLY', priority: 'high' },
      { group: 'detailing', title: 'Chiều dài thanh', genericText: 'Theo bảng thống kê thép (BBS) được duyệt', method: 'MEASUREMENT', src: S('BBS', COMPONENTS[c].label), aiSupport: 'NONE', priority: 'normal' },
      { group: 'detailing', title: 'Chiều dài nối chồng', genericText: 'Kiểm tra chiều dài nối chồng theo bản vẽ được duyệt', method: 'MEASUREMENT', src: S('AFC', 'Ghi chú nối chồng'), aiSupport: 'NONE', priority: 'high' },
      { group: 'detailing', title: 'Vị trí nối', genericText: 'Vị trí nối theo bản vẽ được duyệt, không nối tập trung tại một mặt cắt', method: 'VISUAL_MANUAL', src: S('AFC', 'Ghi chú nối chồng'), aiSupport: 'WARNING_ONLY', priority: 'normal' },
      { group: 'geometry', title: 'Lớp bê tông bảo vệ', genericText: 'Theo ITP / bản vẽ được duyệt — kiểm tra con kê', method: 'MEASUREMENT', src: S('ITP', 'Mục cốt thép · lớp bảo vệ'), aiSupport: 'NONE', priority: 'high' },
      { group: 'detailing', title: 'Neo / uốn / móc', genericText: 'Theo chi tiết neo, uốn, móc trên bản vẽ được duyệt', method: 'VISUAL_MANUAL', src: S('AFC', 'Chi tiết neo, uốn, móc'), aiSupport: 'NONE', priority: 'normal' },
      { group: 'material', title: 'Chứng chỉ vật liệu thép', genericText: 'Lô thép lắp dựng khớp chứng chỉ được duyệt', method: 'DOCUMENT_CHECK', src: S('MATERIAL', 'CQ-CB400V-2609'), aiSupport: 'NONE', priority: 'normal' },
    ],
    attention: [
      'Thiếu thanh', 'Sai đường kính', 'Vùng thép thưa', 'Khoảng cách không đều', 'Chiều dài nối chồng',
      'Vị trí nối', 'Con kê / lớp bảo vệ', 'Thanh cong, lệch', 'Bề mặt thép (gỉ, bẩn dầu)', 'Dị vật trong lòng khuôn',
    ],
    outsideVideo: [
      { item: 'Chiều dài nối chồng', method: 'MEASUREMENT', detail: 'Đo bằng thước tại vị trí nối' },
      { item: 'Đường kính thanh', method: 'COMBINATION', detail: 'Đo thước kẹp + đối chiếu chứng chỉ vật liệu' },
      { item: 'Lớp bê tông bảo vệ', method: 'MEASUREMENT', detail: 'Đo tại con kê / mép ván khuôn' },
      { item: 'Vật liệu thép', method: 'DOCUMENT_CHECK', detail: 'Chứng chỉ xuất xưởng + kết quả kéo / uốn' },
    ],
    references: ['AFC', 'BBS', 'ITP', 'BIM', 'MATERIAL', 'SPEC', 'STANDARD'],
    aiSupport: [
      'Vùng có vẻ thiếu / thưa thép', 'Khoảng cách có vẻ không đều', 'Thanh có vẻ nhỏ hơn xung quanh',
      'Thanh lệch / cong', 'Bố trí bất thường', 'Vật thể lạ', 'Vùng quay chưa rõ — cần xem lại',
    ],
    aiLimits: 'AI chỉ cảnh báo để người kiểm tra xem lại. AI không đếm chính xác số thanh, không đo đường kính / khoảng cách / lớp bảo vệ và không kết luận ĐẠT / KHÔNG ĐẠT.',
    aiFocus: ['POSSIBLE_MISSING_ITEM', 'LOW_DENSITY_PATTERN', 'UNEVEN_SPACING', 'SIZE_INCONSISTENCY', 'ALIGNMENT_ANOMALY', 'DEFORMATION', 'POSITION_ANOMALY', 'FOREIGN_OBJECT', 'CONTAMINATION', 'INCOMPLETE_VISUAL_EVIDENCE'],
  }
}

function concreteTemplate(asset: AssetRecord): Template {
  const S = (t: RequirementSourceType, ref: string) => sourceFor(asset, t, ref)
  return {
    rows: c => [
      { group: 'material', title: 'Mác bê tông', genericText: 'Theo mác thiết kế trên bản vẽ được duyệt', method: 'DOCUMENT_CHECK', src: S('MATERIAL', 'CP-C50-01'), aiSupport: 'NONE', priority: 'high' },
      { group: 'geometry', title: 'Hình dạng / kích thước', value: ifcGeometry(c), genericText: 'Theo bản vẽ / mô hình được duyệt', method: 'COMBINATION', attentionNote: 'Đo / trắc đạc — AI không đo kích thước', src: S('BIM', `Mặt cắt hộp · ${COMPONENTS[c].labelEn}`), aiSupport: 'WARNING_ONLY', priority: 'high' },
      { group: 'geometry', title: 'Cao độ', genericText: 'Theo cao độ thiết kế trên bản vẽ được duyệt', method: 'SURVEY', src: S('AFC', 'Mặt bằng cao độ'), aiSupport: 'NONE', priority: 'high' },
      { group: 'quality', title: 'Cường độ', genericText: 'Theo yêu cầu cường độ thiết kế — kết quả nén mẫu', method: 'LAB_TEST', src: S('ITP', 'Mục bê tông · thí nghiệm'), aiSupport: 'NONE', priority: 'high' },
      { group: 'quality', title: 'Bề mặt hoàn thiện', genericText: 'Bề mặt đặc chắc, không rỗ, không nứt, không lộ thép theo ITP', method: 'VIDEO_AI', attentionNote: 'AI cảnh báo vùng bất thường — người kiểm tra xác nhận', src: S('ITP', 'Mục bê tông · sau đổ'), aiSupport: 'WARNING_ONLY', priority: 'high' },
      { group: 'embedded', title: 'Chi tiết chôn sẵn (ống gen, neo, lỗ chờ)', genericText: 'Theo vị trí trên mô hình BIM / bản vẽ được duyệt', method: 'BIM_COMPARE', src: S('BIM', 'IfcTendon / IfcTendonAnchor'), aiSupport: 'WARNING_ONLY', priority: 'normal' },
    ],
    attention: [
      'Bề mặt không đồng đều', 'Rỗ / honeycomb', 'Vết nứt', 'Hốc, lỗ rỗng', 'Lộ thép',
      'Sứt, vỡ cạnh', 'Biến dạng', 'Dị vật', 'Bẩn bề mặt', 'Chi tiết chôn sẵn bất thường',
    ],
    outsideVideo: [
      { item: 'Cường độ bê tông', method: 'LAB_TEST', detail: 'Nén mẫu theo ITP' },
      { item: 'Cao độ', method: 'SURVEY', detail: 'Trắc đạc so với cao độ thiết kế' },
      { item: 'Kích thước', method: 'COMBINATION', detail: 'Đo thước / trắc đạc' },
      { item: 'Mác bê tông', method: 'DOCUMENT_CHECK', detail: 'Phiếu giao hàng + cấp phối được duyệt' },
    ],
    references: ['AFC', 'BIM', 'ITP', 'MATERIAL', 'SPEC', 'STANDARD'],
    aiSupport: [
      'Vùng có dấu hiệu rỗ / honeycomb', 'Vết nứt nhìn thấy', 'Hốc / lỗ rỗng', 'Có vẻ lộ thép',
      'Sứt / vỡ cạnh', 'Biến dạng bất thường', 'Dị vật / bẩn bề mặt',
    ],
    aiLimits: 'AI chỉ cảnh báo bề mặt nhìn thấy. AI không kết luận cường độ, cao độ, kích thước và không kết luận ĐẠT / KHÔNG ĐẠT.',
    aiFocus: ['SURFACE_ANOMALY', 'POSSIBLE_HONEYCOMB', 'VISIBLE_CRACK', 'POSSIBLE_VOID', 'POSSIBLE_EXPOSED_REBAR', 'EDGE_DAMAGE', 'DEFORMATION', 'CONTAMINATION', 'FOREIGN_OBJECT', 'INCOMPLETE_VISUAL_EVIDENCE'],
  }
}

function formworkTemplate(asset: AssetRecord): Template {
  const S = (t: RequirementSourceType, ref: string) => sourceFor(asset, t, ref)
  return {
    rows: c => [
      { group: 'geometry', title: 'Kích thước ván khuôn', value: ifcGeometry(c), genericText: 'Theo bản vẽ / mô hình được duyệt', method: 'MEASUREMENT', src: S('BIM', `Mặt cắt hộp · ${COMPONENTS[c].labelEn}`), aiSupport: 'NONE', priority: 'high' },
      { group: 'geometry', title: 'Độ thẳng đứng / độ phẳng', genericText: 'Theo dung sai trong BPTC được duyệt', method: 'MEASUREMENT', src: S('BPTC', 'Mục ván khuôn · dung sai'), aiSupport: 'WARNING_ONLY', priority: 'high' },
      { group: 'geometry', title: 'Cao độ đáy ván khuôn', genericText: 'Theo cao độ thiết kế trên bản vẽ được duyệt', method: 'SURVEY', src: S('AFC', 'Mặt bằng cao độ'), aiSupport: 'NONE', priority: 'high' },
      { group: 'quality', title: 'Độ kín khít mối nối', genericText: 'Kín khít theo BPTC được duyệt', method: 'VISUAL_MANUAL', src: S('BPTC', 'Mục ván khuôn · mối nối'), aiSupport: 'WARNING_ONLY', priority: 'normal' },
      { group: 'quality', title: 'Vệ sinh, chống dính', genericText: 'Sạch, phủ chống dính theo BPTC được duyệt', method: 'VISUAL_MANUAL', src: S('BPTC', 'Mục ván khuôn · vệ sinh'), aiSupport: 'WARNING_ONLY', priority: 'normal' },
      { group: 'detailing', title: 'Đà giáo, giằng, liên kết', genericText: 'Theo BPTC được duyệt', method: 'VISUAL_MANUAL', src: S('BPTC', 'Mục đà giáo'), aiSupport: 'NONE', priority: 'normal' },
    ],
    attention: ['Khe hở mối nối', 'Biến dạng / phình ván khuôn', 'Lệch tim, lệch thẳng đứng', 'Bẩn, dị vật trong lòng khuôn', 'Thiếu chống dính', 'Liên kết, bu lông, thanh giằng'],
    outsideVideo: [
      { item: 'Kích thước', method: 'MEASUREMENT', detail: 'Đo thước tại các mặt cắt' },
      { item: 'Độ thẳng đứng', method: 'MEASUREMENT', detail: 'Dọi / thước thuỷ' },
      { item: 'Cao độ', method: 'SURVEY', detail: 'Trắc đạc so với cao độ thiết kế' },
      { item: 'BPTC được duyệt', method: 'DOCUMENT_CHECK', detail: 'Đối chiếu biện pháp đang áp dụng' },
    ],
    references: ['AFC', 'BIM', 'BPTC', 'ITP', 'STANDARD'],
    aiSupport: ['Khe hở có vẻ bất thường', 'Biến dạng / phình', 'Lệch thẳng hàng', 'Dị vật / bẩn', 'Vùng quay chưa rõ — cần xem lại'],
    aiLimits: 'AI chỉ cảnh báo để người kiểm tra xem lại. AI không đo kích thước, độ thẳng đứng, cao độ và không kết luận ĐẠT / KHÔNG ĐẠT.',
    aiFocus: ['DEFORMATION', 'ALIGNMENT_ANOMALY', 'CONTAMINATION', 'FOREIGN_OBJECT', 'SURFACE_ANOMALY', 'UNCLEAR_VIEW'],
  }
}

function prestressTemplate(asset: AssetRecord): Template {
  const S = (t: RequirementSourceType, ref: string) => sourceFor(asset, t, ref)
  return {
    rows: c => c === 'anchors'
      ? [
          { group: 'quantity', title: 'Số đầu neo', value: ifcQuantity('GD04', c), genericText: 'Theo bản vẽ / mô hình được duyệt', method: 'COMBINATION', src: S('BIM', 'IfcTendonAnchor'), aiSupport: 'WARNING_ONLY', priority: 'high' },
          { group: 'geometry', title: 'Vị trí / phương đầu neo', genericText: 'Theo vị trí trên mô hình BIM / bản vẽ được duyệt', method: 'BIM_COMPARE', src: S('BIM', 'IfcTendonAnchor'), aiSupport: 'WARNING_ONLY', priority: 'high' },
          { group: 'detailing', title: 'Lưới xoắn chống ép mặt sau neo', genericText: 'Theo chi tiết neo trên bản vẽ được duyệt', method: 'VISUAL_MANUAL', src: S('AFC', 'Chi tiết neo'), aiSupport: 'WARNING_ONLY', priority: 'normal' },
          { group: 'quality', title: 'Bơm vữa, bịt đầu neo', genericText: 'Theo ITP — kết quả thí nghiệm vữa', method: 'LAB_TEST', src: S('ITP', 'Mục DƯL · bơm vữa'), aiSupport: 'NONE', priority: 'high' },
        ]
      : [
          { group: 'quantity', title: 'Số bó cáp', value: ifcQuantity('GD04', c), genericText: 'Theo bản vẽ / mô hình được duyệt', method: 'COMBINATION', src: S('BIM', 'IfcTendon'), aiSupport: 'WARNING_ONLY', priority: 'high' },
          { group: 'geometry', title: 'Tuyến ống gen / cáp', genericText: 'Theo tuyến cáp trên mô hình BIM / bản vẽ được duyệt', method: 'BIM_COMPARE', src: S('BIM', 'IfcTendon'), aiSupport: 'WARNING_ONLY', priority: 'high' },
          { group: 'quality', title: 'Độ giãn dài', genericText: 'Theo bảng tính căng kéo được duyệt', method: 'MEASUREMENT', src: S('BPTC', 'Bảng tính căng kéo'), aiSupport: 'NONE', priority: 'high' },
          { group: 'quality', title: 'Lực kích / áp lực', genericText: 'Theo bảng tính căng kéo — kích đã kiểm định', method: 'COMBINATION', src: S('BPTC', 'Bảng tính căng kéo'), aiSupport: 'NONE', priority: 'high' },
        ],
    attention: ['Ống gen móp, thủng, hở mối nối', 'Tuyến cáp lệch, gấp khúc', 'Thép định vị ống gen thiếu / lỏng', 'Đầu neo lệch phương', 'Dị vật trong ống / đầu neo'],
    outsideVideo: [
      { item: 'Độ giãn dài', method: 'MEASUREMENT', detail: 'Đo tại đầu kích, so bảng tính' },
      { item: 'Lực kích', method: 'COMBINATION', detail: 'Đồng hồ áp lực + hồ sơ kiểm định kích' },
      { item: 'Vữa ống gen', method: 'LAB_TEST', detail: 'Thí nghiệm mẫu vữa' },
      { item: 'Tuyến cáp', method: 'BIM_COMPARE', detail: 'Đối chiếu mô hình BIM / trắc đạc' },
    ],
    references: ['AFC', 'BIM', 'BPTC', 'ITP', 'STANDARD'],
    aiSupport: ['Ống gen có vẻ móp / biến dạng', 'Tuyến có vẻ lệch bất thường', 'Vị trí đầu neo bất thường', 'Vật thể lạ', 'Vùng quay chưa đủ — cần quay bổ sung'],
    aiLimits: 'AI chỉ cảnh báo để người kiểm tra xem lại. AI không đếm chính xác số bó / neo, không đo độ giãn dài hay lực kích và không kết luận ĐẠT / KHÔNG ĐẠT.',
    aiFocus: ['DEFORMATION', 'ALIGNMENT_ANOMALY', 'POSITION_ANOMALY', 'POSSIBLE_MISSING_ITEM', 'FOREIGN_OBJECT', 'INCOMPLETE_VISUAL_EVIDENCE'],
  }
}

export function visualContextFor(stage: StageCode, component: ComponentId): VisualContext {
  if (stage === 'GD01') return 'FORMWORK'
  if (stage === 'GD02') return 'REBAR'
  if (stage === 'GD03') return 'CONCRETE'
  return component === 'anchors' ? 'ANCHOR' : 'PT_DUCT'
}

function templateFor(asset: AssetRecord, ctx: VisualContext): Template {
  if (ctx === 'REBAR') return rebarTemplate(asset)
  if (ctx === 'CONCRETE') return concreteTemplate(asset)
  if (ctx === 'FORMWORK') return formworkTemplate(asset)
  return prestressTemplate(asset)
}

const cache = new Map<string, InspectionBrief>()

/** Brief chỉ tóm tắt yêu cầu có trong hồ sơ được duyệt — không tự tạo yêu cầu. */
export function briefFor(assetId: string, stage: StageCode, component: ComponentId): InspectionBrief | null {
  const id = `BR-${assetId}-${stage}-${component}`
  const hit = cache.get(id)
  if (hit) return hit
  const asset = ASSETS.find(a => a.id === assetId)
  if (!asset || !asset.stages.includes(stage)) return null
  const visualContext = visualContextFor(stage, component)
  const tpl = templateFor(asset, visualContext)
  const requirements: InspectionRequirement[] = tpl.rows(component).map(({ src, ...row }, i) => ({
    ...row,
    ...src,
    id: `REQ-${stage}-${component}-${String(i + 1).padStart(2, '0')}`,
    assetType: asset.type,
    stage,
    component,
  }))
  const brief: InspectionBrief = {
    id,
    version: `v1 · AFC ${asset.afc.revision} · ${visualContext === 'REBAR' ? `BBS ${asset.bbs.revision} · ` : ''}ITP ${asset.itp.revision}`,
    assetId,
    stage,
    component,
    visualContext,
    drawing: `${asset.afc.code} ${asset.afc.revision}`,
    requirements,
    attention: tpl.attention,
    outsideVideo: tpl.outsideVideo,
    references: tpl.references.map(t => referenceFor(asset, t, stage)),
    aiSupport: tpl.aiSupport,
    aiLimits: tpl.aiLimits,
    aiFocus: tpl.aiFocus,
  }
  cache.set(id, brief)
  return brief
}

export function briefAck(brief: InspectionBrief, by: string): BriefAck {
  return {
    briefId: brief.id,
    version: brief.version,
    component: brief.component,
    requirementIds: brief.requirements.map(r => r.id),
    viewedAt: new Date().toISOString(),
    by,
  }
}

/** Giá trị hiển thị: chỉ dùng số khi có nguồn thật, ngược lại dùng câu chung. */
export function requirementText(r: InspectionRequirement): string {
  if (r.value && r.sourceKind !== 'MOCK') return `${r.value}${r.unit ? ` ${r.unit}` : ''}${r.tolerance ? ` (${r.tolerance})` : ''}`
  return r.genericText
}
