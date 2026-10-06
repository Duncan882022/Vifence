import { BOX_SECTION, INFERRED_COVER } from '../boxGirderSection'
import type { ComponentId, CriterionDef, CriterionGroup, CriterionMethod, SourceRef, StageCode } from '../../workflow.types'

const mm = (m: number) => Math.round(m * 1000)

const IFC_SUON = (ref: string): SourceRef => ({ kind: 'IFC', ref: `SUON.ifc · ${ref}` })
const IFC_DUL = (ref: string): SourceRef => ({ kind: 'IFC', ref: `DUL.ifc · ${ref}` })
const MOCK = (ref: string): SourceRef => ({ kind: 'MOCK', ref })

interface Spec {
  code: string
  component: ComponentId
  group: CriterionGroup
  title: string
  design: string
  designValue?: number
  unit?: string
  tolerance: string
  source: SourceRef
  method: CriterionMethod
  mandatory?: boolean
  evidenceRequired?: boolean
  aiCapable?: boolean
}

/**
 * Số lượng thiết kế đếm từ IFC (tổng đoạn thanh IfcReinforcingBar theo vùng,
 * cáp/neo theo IfcTendon/IfcTendonAnchor). Giá trị không có trong IFC là MOCK.
 */
const SPECS: Record<StageCode, Spec[]> = {
  GD01: [
    { code: '1.01', component: 'bottom', group: 'quantity', title: 'Chiều dài ván khuôn đáy', design: `${BOX_SECTION.length.toFixed(1)} m`, designValue: BOX_SECTION.length, unit: 'm', tolerance: '±10 mm', source: IFC_SUON('IfcBeam chiều dài dầm'), method: 'measurement' },
    { code: '1.02', component: 'bottom', group: 'quality', title: 'Bề rộng đáy hộp', design: `${mm(BOX_SECTION.soffitWidth)} mm`, designValue: mm(BOX_SECTION.soffitWidth), unit: 'mm', tolerance: '±5 mm', source: IFC_SUON('mặt cắt hộp'), method: 'measurement' },
    { code: '1.03', component: 'bottom', group: 'quality', title: 'Độ kín khít, vệ sinh, chống dính', design: 'Kín, sạch, phủ chống dính', tolerance: 'Không hở > 2 mm', source: MOCK('BPTC §4.2'), method: 'camera', aiCapable: true },
    { code: '1.04', component: 'web-left', group: 'quality', title: 'Chiều dày sườn trái', design: `${mm(BOX_SECTION.webThk)} mm`, designValue: mm(BOX_SECTION.webThk), unit: 'mm', tolerance: '±5 mm', source: IFC_SUON('mặt cắt sườn'), method: 'measurement' },
    { code: '1.05', component: 'web-left', group: 'quality', title: 'Độ thẳng đứng ván khuôn sườn trái', design: '≤ 1/500 H', tolerance: '≤ 6 mm', source: MOCK('BPTC §4.3'), method: 'measurement' },
    { code: '1.06', component: 'web-right', group: 'quality', title: 'Chiều dày sườn phải', design: `${mm(BOX_SECTION.webThk)} mm`, designValue: mm(BOX_SECTION.webThk), unit: 'mm', tolerance: '±5 mm', source: IFC_SUON('mặt cắt sườn'), method: 'measurement' },
    { code: '1.07', component: 'web-right', group: 'quality', title: 'Độ thẳng đứng ván khuôn sườn phải', design: '≤ 1/500 H', tolerance: '≤ 6 mm', source: MOCK('BPTC §4.3'), method: 'measurement' },
    { code: '1.08', component: 'deck', group: 'quality', title: 'Bề rộng bản mặt', design: `${mm(BOX_SECTION.deckWidth)} mm`, designValue: mm(BOX_SECTION.deckWidth), unit: 'mm', tolerance: '±10 mm', source: IFC_SUON('mặt cắt bản mặt'), method: 'measurement' },
    { code: '1.09', component: 'deck', group: 'quality', title: 'Cao độ đáy bản mặt / chiều cao dầm', design: `${mm(BOX_SECTION.height)} mm`, designValue: mm(BOX_SECTION.height), unit: 'mm', tolerance: '±5 mm', source: IFC_SUON('chiều cao dầm'), method: 'measurement' },
  ],
  GD02: [
    { code: '2.01', component: 'bottom', group: 'quantity', title: 'Số thanh thép chủ D16 bản đáy', design: '414 thanh', designValue: 414, unit: 'thanh', tolerance: '0', source: IFC_SUON('IfcReinforcingBar D16 · vùng bản đáy'), method: 'camera', aiCapable: true },
    { code: '2.02', component: 'bottom', group: 'quantity', title: 'Số thanh thép D12 bản đáy', design: '106 thanh', designValue: 106, unit: 'thanh', tolerance: '0', source: IFC_SUON('IfcReinforcingBar D12 · vùng bản đáy'), method: 'camera', aiCapable: true },
    { code: '2.03', component: 'bottom', group: 'quantity', title: 'Thép D8 định vị ống gen bản đáy', design: '1938 thanh', designValue: 1938, unit: 'thanh', tolerance: '0', source: IFC_DUL('IfcReinforcingBar D8 · định vị ống gen'), method: 'camera', aiCapable: true },
    { code: '2.04', component: 'bottom', group: 'quality', title: 'Khoảng cách thép chủ bản đáy', design: '150 mm', designValue: 150, unit: 'mm', tolerance: '±10 mm', source: MOCK('AFC Rev.C · chưa có trong IFC'), method: 'camera', aiCapable: true },
    { code: '2.05', component: 'bottom', group: 'quality', title: 'Lớp bê tông bảo vệ bản đáy', design: `${mm(INFERRED_COVER)} mm`, designValue: mm(INFERRED_COVER), unit: 'mm', tolerance: '−0 / +10 mm', source: MOCK('ITP 2.5 · con kê'), method: 'measurement' },
    { code: '2.06', component: 'web-left', group: 'quantity', title: 'Số thanh thép sườn trái', design: '754 thanh', designValue: 754, unit: 'thanh', tolerance: '0', source: IFC_SUON('IfcReinforcingBar D16/D12/D18 · sườn trái'), method: 'camera', aiCapable: true },
    { code: '2.07', component: 'web-left', group: 'quantity', title: 'Thép D8 định vị ống gen sườn trái', design: '291 thanh', designValue: 291, unit: 'thanh', tolerance: '0', source: IFC_DUL('IfcReinforcingBar D8 · sườn trái'), method: 'camera', aiCapable: true },
    { code: '2.08', component: 'web-left', group: 'quality', title: 'Khoảng cách cốt đai sườn trái', design: '150 mm', designValue: 150, unit: 'mm', tolerance: '±10 mm', source: MOCK('AFC Rev.C'), method: 'camera', aiCapable: true },
    { code: '2.09', component: 'web-right', group: 'quantity', title: 'Số thanh thép sườn phải', design: '754 thanh', designValue: 754, unit: 'thanh', tolerance: '0', source: IFC_SUON('IfcReinforcingBar D16/D12/D18 · sườn phải'), method: 'camera', aiCapable: true },
    { code: '2.10', component: 'web-right', group: 'quantity', title: 'Thép D8 định vị ống gen sườn phải', design: '291 thanh', designValue: 291, unit: 'thanh', tolerance: '0', source: IFC_DUL('IfcReinforcingBar D8 · sườn phải'), method: 'camera', aiCapable: true },
    { code: '2.11', component: 'web-right', group: 'quality', title: 'Khoảng cách cốt đai sườn phải', design: '150 mm', designValue: 150, unit: 'mm', tolerance: '±10 mm', source: MOCK('AFC Rev.C'), method: 'camera', aiCapable: true },
    { code: '2.12', component: 'deck', group: 'quantity', title: 'Số thanh thép D12 bản mặt', design: '566 thanh', designValue: 566, unit: 'thanh', tolerance: '0', source: IFC_SUON('IfcReinforcingBar D12 · bản mặt'), method: 'camera', aiCapable: true },
    { code: '2.13', component: 'deck', group: 'quality', title: 'Chiều dài nối chồng thép bản mặt', design: '≥ 40d = 480 mm', designValue: 480, unit: 'mm', tolerance: '≥ 480 mm', source: MOCK('TCVN 11823 · AFC ghi chú'), method: 'measurement' },
    { code: '2.14', component: 'diaphragm', group: 'quantity', title: 'Số thanh thép vùng neo đầu dầm', design: '1037 thanh', designValue: 1037, unit: 'thanh', tolerance: '0', source: IFC_SUON('IfcReinforcingBar D22/D16/D12 · vùng neo'), method: 'camera', aiCapable: true },
    { code: '2.15', component: 'diaphragm', group: 'quality', title: 'Lưới thép xoắn chống ép mặt sau neo', design: 'Đủ lưới, đúng vị trí', tolerance: '±10 mm', source: MOCK('AFC Rev.C · chi tiết neo'), method: 'camera', aiCapable: true },
    { code: '2.16', component: 'bottom', group: 'quality', title: 'Chứng chỉ vật liệu thép lô lắp dựng', design: 'CB400-V · lô 26-09', tolerance: 'Khớp lô', source: MOCK('Hồ sơ vật liệu'), method: 'document', evidenceRequired: false },
  ],
  GD03: [
    { code: '3.01', component: 'bottom', group: 'quantity', title: 'Khối lượng bê tông đổ đợt 1', design: 'Theo phiếu đổ', tolerance: '±2%', source: MOCK('BPTC §6 · chưa tính từ IFC'), method: 'measurement' },
    { code: '3.02', component: 'bottom', group: 'quality', title: 'Độ sụt bê tông tại hiện trường', design: '18 ± 2 cm', designValue: 18, unit: 'cm', tolerance: '±2 cm', source: MOCK('Cấp phối C50'), method: 'test' },
    { code: '3.03', component: 'web-left', group: 'quality', title: 'Đầm chặt, không rỗ sườn trái', design: 'Không rỗ, không phân tầng', tolerance: '—', source: MOCK('ITP 3.3'), method: 'camera', aiCapable: true },
    { code: '3.04', component: 'web-right', group: 'quality', title: 'Đầm chặt, không rỗ sườn phải', design: 'Không rỗ, không phân tầng', tolerance: '—', source: MOCK('ITP 3.3'), method: 'camera', aiCapable: true },
    { code: '3.05', component: 'deck', group: 'quality', title: 'Cao độ mặt bê tông bản mặt', design: `${mm(BOX_SECTION.height)} mm`, designValue: mm(BOX_SECTION.height), unit: 'mm', tolerance: '±5 mm', source: IFC_SUON('chiều cao dầm'), method: 'measurement' },
    { code: '3.06', component: 'deck', group: 'quality', title: 'Lấy mẫu thử cường độ', design: '≥ 3 tổ mẫu / 100 m³', tolerance: '≥ 3 tổ', source: MOCK('TCVN 4453'), method: 'test' },
    { code: '3.07', component: 'bottom', group: 'quality', title: 'Bề mặt bê tông bản đáy sau tháo ván khuôn', design: 'Đặc chắc, không rỗ / nứt / lộ thép', tolerance: '—', source: MOCK('ITP-BG-02 · sau đổ'), method: 'camera', aiCapable: true },
    { code: '3.08', component: 'deck', group: 'quality', title: 'Bề mặt bê tông bản mặt sau đổ', design: 'Đặc chắc, không rỗ / nứt / lộ thép', tolerance: '—', source: MOCK('ITP-BG-02 · sau đổ'), method: 'camera', aiCapable: true },
  ],
  GD04: [
    { code: '4.01', component: 'cable-bottom', group: 'quantity', title: 'Số bó cáp bản đáy', design: '11 bó (7×10T15.2 · 4×9T15.2)', designValue: 11, unit: 'bó', tolerance: '0', source: IFC_DUL('IfcTendon · bản đáy'), method: 'camera', aiCapable: true },
    { code: '4.02', component: 'cable-web', group: 'quantity', title: 'Số bó cáp sườn', design: '6 bó 18T15.2', designValue: 6, unit: 'bó', tolerance: '0', source: IFC_DUL('IfcTendon · sườn'), method: 'camera', aiCapable: true },
    { code: '4.03', component: 'anchors', group: 'quantity', title: 'Số đầu neo', design: '34 neo', designValue: 34, unit: 'neo', tolerance: '0', source: IFC_DUL('IfcTendonAnchor'), method: 'camera', aiCapable: true },
    { code: '4.04', component: 'cable-bottom', group: 'quality', title: 'Độ giãn dài cáp bản đáy', design: 'Theo bảng căng', tolerance: '±6%', source: MOCK('Bảng tính căng kéo'), method: 'measurement' },
    { code: '4.05', component: 'cable-web', group: 'quality', title: 'Độ giãn dài cáp sườn', design: 'Theo bảng căng', tolerance: '±6%', source: MOCK('Bảng tính căng kéo'), method: 'measurement' },
    { code: '4.06', component: 'anchors', group: 'quality', title: 'Bơm vữa ống gen', design: 'Đầy vữa, không rò', tolerance: 'Cường độ vữa ≥ 30 MPa', source: MOCK('ITP 4.6'), method: 'test' },
  ],
}

export const CRITERIA: CriterionDef[] = (Object.keys(SPECS) as StageCode[]).flatMap(stage =>
  SPECS[stage].map(spec => ({
    id: `${stage}-${spec.code}`,
    stage,
    component: spec.component,
    group: spec.group,
    code: spec.code,
    title: spec.title,
    design: spec.design,
    designValue: spec.designValue,
    unit: spec.unit,
    tolerance: spec.tolerance,
    source: spec.source,
    mandatory: spec.mandatory ?? true,
    evidenceRequired: spec.evidenceRequired ?? spec.method !== 'document',
    method: spec.method,
    aiCapable: spec.aiCapable ?? false,
  })),
)

export function criteriaForStage(stage: StageCode): CriterionDef[] {
  return CRITERIA.filter(c => c.stage === stage)
}

export function criteriaForComponent(stage: StageCode, component: ComponentId): CriterionDef[] {
  return CRITERIA.filter(c => c.stage === stage && c.component === component)
}

export function findCriterion(id: string): CriterionDef | undefined {
  return CRITERIA.find(c => c.id === id)
}
