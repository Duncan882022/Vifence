import type {
  AssetRecord,
  ComponentId,
  InspectionComponent,
  InspectionDocument,
  ProjectRecord,
  StageCode,
  StageDef,
  StructureRecord,
} from '../../workflow.types'

export const POC_MOCK_LABEL = 'POC MOCK — NOT FOR CONSTRUCTION'

export const PROJECTS: ProjectRecord[] = [
  { id: 'hn-qn', code: 'HN–QN', name: 'Đường sắt cao tốc Hà Nội – Quảng Ninh', owner: 'Ban QLDA Đường sắt' },
]

export const STRUCTURES: StructureRecord[] = [
  { id: 'cau-song-hot', projectId: 'hn-qn', code: 'CSH', name: 'Cầu Sông Hốt', kind: 'Cầu dầm hộp BTCT DƯL' },
]

export const ASSETS: AssetRecord[] = [
  {
    id: 's002',
    structureId: 'cau-song-hot',
    code: 'S002',
    name: 'Dầm hộp S002',
    type: 'Dầm hộp BTCT DƯL căng sau 32.6 m',
    qrId: 'SH-S002',
    location: 'Cầu Sông Hốt · Nhịp 2',
    stages: ['GD01', 'GD02', 'GD03', 'GD04'],
    bim: { label: 'DUL.ifc + SUON.ifc', revision: 'IFC-2026.09', files: ['DUL.ifc', 'SUON.ifc'] },
    afc: { code: 'SH-BG-RB-101', revision: 'Rev.C' },
    bbs: { code: 'BBS-S002', revision: 'Rev.B' },
    bptc: { code: 'BPTC-SH-DH-03', revision: 'Rev.B' },
    itp: { code: 'ITP-BG-02', revision: 'Rev.A' },
  },
]

/** S002 dùng mô hình gộp DUL+SUON làm BIM tham chiếu. */
export const BIM_PACKAGE_FOR_ASSET: Record<string, string> = { s002: 'dam-hop' }

export const COMPONENTS: Record<ComponentId, InspectionComponent> = {
  bottom: { id: 'bottom', label: 'Bản đáy', labelEn: 'Bottom Slab', bim: { zones: ['bottom'], noneTags: ['rebar-anchor-zone'] } },
  'web-left': { id: 'web-left', label: 'Sườn trái', labelEn: 'Left Web', bim: { zones: ['web-left'], noneTags: ['rebar-anchor-zone'] } },
  'web-right': { id: 'web-right', label: 'Sườn phải', labelEn: 'Right Web', bim: { zones: ['web-right'], noneTags: ['rebar-anchor-zone'] } },
  deck: { id: 'deck', label: 'Bản mặt + cánh hẫng', labelEn: 'Deck Slab', bim: { zones: ['deck'] } },
  diaphragm: {
    id: 'diaphragm',
    label: 'Dầm ngang / vùng neo đầu dầm',
    labelEn: 'Diaphragm',
    bim: { zones: ['bottom', 'web-left', 'web-right', 'deck'], anyTags: ['rebar-anchor-zone'] },
  },
  'cable-bottom': { id: 'cable-bottom', label: 'Cáp DƯL bản đáy', labelEn: 'Bottom Tendons', bim: { zones: ['bottom'], anyTags: ['cable-bottom', 'duct'] } },
  'cable-web': { id: 'cable-web', label: 'Cáp DƯL sườn', labelEn: 'Web Tendons', bim: { zones: ['web-left', 'web-right'], anyTags: ['cable-web', 'duct'] } },
  anchors: { id: 'anchors', label: 'Neo đầu dầm', labelEn: 'Anchorages', bim: { zones: ['bottom', 'web-left', 'web-right'], anyTags: ['anchor'] } },
}

export const STAGES: Record<StageCode, StageDef> = {
  GD01: {
    id: 'GD01',
    code: 'GĐ01',
    label: 'Ván khuôn',
    labelEn: 'Formwork',
    order: 1,
    dependsOn: null,
    components: ['bottom', 'web-left', 'web-right', 'deck'],
    holdPoints: [],
    requiredDocs: [{ id: 'doc-bptc', label: 'BPTC ván khuôn được duyệt', mode: 'block', documentId: 'doc-bptc' }],
    checklistRevision: 'CL-DH-GD01 v1.2',
    bimKinds: ['concrete'],
  },
  GD02: {
    id: 'GD02',
    code: 'GĐ02',
    label: 'Cốt thép',
    labelEn: 'Reinforcement',
    order: 2,
    dependsOn: 'GD01',
    components: ['bottom', 'web-left', 'web-right', 'deck', 'diaphragm'],
    holdPoints: [{ id: 'hp-gd02-formwork', label: 'HP: TVGS chấp thuận ván khuôn đáy trước khi lắp thép', mode: 'block' }],
    requiredDocs: [
      { id: 'doc-steel-cert', label: 'Chứng chỉ vật liệu thép CB400-V', mode: 'block', documentId: 'doc-steel-cert' },
      { id: 'doc-steel-test', label: 'Kết quả kéo/uốn thép mẫu', mode: 'warn', documentId: 'doc-steel-test' },
    ],
    checklistRevision: 'CL-DH-GD02 v2.0',
    bimKinds: ['rebar'],
  },
  GD03: {
    id: 'GD03',
    code: 'GĐ03',
    label: 'Bê tông',
    labelEn: 'Concrete',
    order: 3,
    dependsOn: 'GD02',
    components: ['bottom', 'web-left', 'web-right', 'deck'],
    holdPoints: [{ id: 'hp-gd03-rebar', label: 'HP: TVGS ký nghiệm thu cốt thép + ống gen trước khi đổ', mode: 'block' }],
    requiredDocs: [
      { id: 'doc-mix', label: 'Cấp phối bê tông C50 được duyệt', mode: 'block', documentId: 'doc-mix' },
      { id: 'doc-slump', label: 'Phiếu kiểm tra độ sụt tại trạm', mode: 'warn', documentId: 'doc-slump' },
    ],
    checklistRevision: 'CL-DH-GD03 v1.1',
    bimKinds: ['concrete'],
  },
  GD04: {
    id: 'GD04',
    code: 'GĐ04',
    label: 'Căng kéo DƯL',
    labelEn: 'Prestressing',
    order: 4,
    dependsOn: 'GD03',
    components: ['cable-bottom', 'cable-web', 'anchors'],
    holdPoints: [{ id: 'hp-gd04-strength', label: 'HP: cường độ BT ≥ 85% R28 trước khi căng', mode: 'block', documentId: 'doc-strength' }],
    requiredDocs: [{ id: 'doc-jack', label: 'Kiểm định kích + đồng hồ áp lực', mode: 'block', documentId: 'doc-jack' }],
    checklistRevision: 'CL-DH-GD04 v1.0',
    bimKinds: ['dul', 'anchor'],
  },
}

export const STAGE_ORDER: StageCode[] = ['GD01', 'GD02', 'GD03', 'GD04']

export const MATRIX_ROWS: ComponentId[] = [
  'bottom',
  'web-left',
  'web-right',
  'deck',
  'diaphragm',
  'cable-bottom',
  'cable-web',
  'anchors',
]

export const DOCUMENTS: InspectionDocument[] = [
  { id: 'doc-afc', kind: 'AFC', code: 'SH-BG-RB-101', title: 'Bản vẽ thi công dầm hộp S002', revision: 'Rev.C', status: 'approved', source: 'MOCK', date: '2026-09-02' },
  { id: 'doc-bbs', kind: 'BBS', code: 'BBS-S002', title: 'Bảng thống kê cốt thép dầm S002', revision: 'Rev.B', status: 'approved', source: 'MOCK', stage: 'GD02', date: '2026-09-04' },
  { id: 'doc-bim', kind: 'BIM', code: 'DUL.ifc + SUON.ifc', title: 'Mô hình IFC dầm hộp 32.6 m (gộp)', revision: 'IFC-2026.09', status: 'approved', source: 'IFC', date: '2026-09-10' },
  { id: 'doc-bptc', kind: 'BPTC', code: 'BPTC-SH-DH-03', title: 'Biện pháp thi công dầm hộp đúc tại bãi', revision: 'Rev.B', status: 'approved', source: 'MOCK', date: '2026-08-20' },
  { id: 'doc-itp', kind: 'ITP', code: 'ITP-BG-02', title: 'Kế hoạch kiểm tra & thử nghiệm dầm hộp', revision: 'Rev.A', status: 'approved', source: 'MOCK', date: '2026-08-22' },
  { id: 'doc-tpl-gd01', kind: 'TEMPLATE', code: 'CL-DH-GD01', title: 'Checklist ván khuôn', revision: 'v1.2', status: 'approved', source: 'MOCK', stage: 'GD01', date: '2026-08-25' },
  { id: 'doc-tpl-gd02', kind: 'TEMPLATE', code: 'CL-DH-GD02', title: 'Checklist cốt thép', revision: 'v2.0', status: 'approved', source: 'MOCK', stage: 'GD02', date: '2026-08-25' },
  { id: 'doc-tpl-gd03', kind: 'TEMPLATE', code: 'CL-DH-GD03', title: 'Checklist bê tông', revision: 'v1.1', status: 'approved', source: 'MOCK', stage: 'GD03', date: '2026-08-25' },
  { id: 'doc-tpl-gd04', kind: 'TEMPLATE', code: 'CL-DH-GD04', title: 'Checklist căng kéo DƯL', revision: 'v1.0', status: 'approved', source: 'MOCK', stage: 'GD04', date: '2026-08-25' },
  { id: 'doc-steel-cert', kind: 'MATERIAL', code: 'CQ-CB400V-2609', title: 'Chứng chỉ xuất xưởng thép CB400-V lô 26-09', revision: '—', status: 'approved', source: 'MOCK', stage: 'GD02', date: '2026-09-24' },
  { id: 'doc-steel-test', kind: 'TEST', code: 'TN-KT-2609', title: 'Kéo/uốn thép mẫu lô 26-09', revision: '—', status: 'approved', source: 'MOCK', stage: 'GD02', date: '2026-09-26' },
  { id: 'doc-mix', kind: 'MATERIAL', code: 'CP-C50-01', title: 'Cấp phối bê tông C50', revision: 'Rev.1', status: 'approved', source: 'MOCK', stage: 'GD03', date: '2026-08-30' },
  { id: 'doc-slump', kind: 'TEST', code: 'TN-SL-S002', title: 'Độ sụt tại trạm trộn', revision: '—', status: 'pending', source: 'MOCK', stage: 'GD03', date: '2026-09-30' },
  { id: 'doc-strength', kind: 'TEST', code: 'TN-NEN-S002', title: 'Nén mẫu BT — cường độ trước căng', revision: '—', status: 'missing', source: 'MOCK', stage: 'GD04', date: '—' },
  { id: 'doc-jack', kind: 'MEASUREMENT', code: 'KD-KICH-07', title: 'Kiểm định kích YCW-250 + đồng hồ', revision: '—', status: 'approved', source: 'MOCK', stage: 'GD04', date: '2026-09-15' },
]

export const INSPECTORS = {
  inspector: { id: 'insp-01', name: 'KS. Nguyễn Văn Hùng', role: 'inspector' },
  senior: { id: 'insp-02', name: 'KS. Trần Minh Đức (Trưởng TVGS)', role: 'senior_inspector' },
} as const

export const RESPONSIBLE_PARTIES = ['Nhà thầu thi công — Tổ cốt thép', 'Nhà thầu thi công — Tổ ván khuôn', 'Nhà thầu thi công — Tổ bê tông', 'Nhà thầu DƯL'] as const

export const H1_HELMET_ID = 'HC-01'
