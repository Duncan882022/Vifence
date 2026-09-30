import type { ChecklistStatus, ChecklistType, InspectionChecklistItem, InspectionStageId, ObjectKind, Provenance } from '../types'
import { BOX_SECTION, INFERRED_REBAR } from './boxGirderSection'
import { DAM_HOP_ASSET_ID } from './inspectionProject'

/**
 * Trình tự nghiệm thu dầm hộp DƯL căng sau, đúc tại chỗ theo 3 đợt:
 * GĐ1 bản đáy → GĐ2 hai sườn → GĐ3 bản mặt + cánh hẫng, sau đó căng kéo / bơm vữa.
 * `matchTags`: "a+b" = đối tượng phải mang đủ cả a và b.
 * Dung sai lấy theo thực hành phổ biến (TCVN 4453, 22TCN 247, AASHTO LRFD Construction §10)
 * nên để `inferred` cho tới khi có chỉ dẫn kỹ thuật dự án.
 */
interface Spec {
  code: string
  checkType: ChecklistType
  stage: InspectionStageId
  title: string
  matchTags?: string[]
  matchKinds?: ObjectKind[]
  method: string
  reference: string
  design: string | null
  designProvenance?: Provenance
  tolerance: string | null
  toleranceProvenance?: Provenance
  status?: ChecklistStatus
}

const mm = (m: number) => Math.round(m * 1000)
const S = BOX_SECTION
const R = INFERRED_REBAR

const SPECS: Spec[] = [
  // GĐ1 · Bản đáy
  {
    code: '1.1', checkType: 'QA', stage: 'gd1', title: 'Chứng chỉ vật liệu: thép, cáp, neo, ống gen',
    matchTags: ['rebar-bottom', 'cable', 'anchor'],
    method: 'Đối chiếu CO/CQ, lấy mẫu thí nghiệm kéo thép và cáp theo lô trước khi gia công',
    reference: 'TCVN 1651-2:2018 · ASTM A416 · EN 13391',
    design: 'Cáp T15.2 cấp 270 · neo theo hệ nhà cung cấp', designProvenance: 'inferred',
    tolerance: 'Đủ CO/CQ + kết quả thí nghiệm đạt', status: 'pass',
  },
  {
    code: '1.2', checkType: 'KT', stage: 'gd1', title: 'Ván khuôn đáy: cao độ, tim dầm, độ vồng ngược',
    matchTags: ['concrete-bottom'],
    method: 'Máy toàn đạc tại 2 đầu, 1/4, 1/2 nhịp; thước thép đo bề rộng đáy',
    reference: 'TCVN 4453:1995 §4.3',
    design: `Bề rộng đáy ${S.soffitWidth.toFixed(2)} m · dài ${S.length} m`,
    tolerance: 'Cao độ ±5 mm · tim ±5 mm · kích thước +8/−5 mm', status: 'pass',
  },
  {
    code: '1.3', checkType: 'KT', stage: 'gd1', title: 'Cốt thép bản đáy: chủng loại, số lượng, bước',
    matchTags: ['rebar-bottom'],
    method: 'Đếm thanh, đo bước tại 3 mặt cắt; kiểm tra mối nối chồng; đai kín hộp (đáy + 2 sườn) phải lắp xong trước khi đổ đáy',
    reference: 'TCVN 4453:1995 §4.5',
    design: `Dọc dưới ${R.bottomLongBot.note} · dọc trên ${R.bottomLongTop.note}`, designProvenance: 'inferred',
    tolerance: 'Bước ±10 mm · chiều dài nối ≥ 40d', status: 'pass',
  },
  {
    code: '1.4', checkType: 'KT', stage: 'gd1', title: 'Ống gen + bó cáp bản đáy: toạ độ đường cáp',
    matchTags: ['cable-bottom', 'duct-bottom', 'rebar-duct-support+rebar-bottom'],
    method: 'Đo cao độ tim ống gen tại mỗi thanh định vị D8 (≤ 1 m/điểm) so bảng toạ độ',
    reference: '22TCN 247-98 §5 · AASHTO LRFD Constr. §10.4',
    design: '11 bó 9T/10T15.2 · định vị D8',
    tolerance: 'Đứng ±5 mm · ngang ±10 mm', status: 'pass',
  },
  {
    code: '1.5', checkType: 'KT', stage: 'gd1', title: 'Neo bản đáy: vị trí, vuông góc trục cáp',
    matchTags: ['anchor-bottom'],
    method: 'Thước vuông + nivô tại mặt bích neo, đo tim neo so bản vẽ',
    reference: 'Hướng dẫn hệ neo nhà cung cấp',
    design: '22 neo (11 bó × 2 đầu)',
    tolerance: 'Tim ±5 mm · lệch góc ≤ 1°', status: 'pass',
  },
  {
    code: '1.6', checkType: 'KT', stage: 'gd1', title: 'Bản thép đệm gối + lỗ thoát nước đáy',
    matchTags: ['bearing-plate', 'weep-hole'],
    method: 'Máy thuỷ bình đo cao độ 4 góc bản đệm; kiểm tra neo bản đệm vào thép đáy',
    reference: 'Chỉ dẫn gối cầu nhà cung cấp',
    design: '4 bản 500×600×20 dưới tim sườn', designProvenance: 'inferred',
    tolerance: 'Cao độ ±3 mm · độ phẳng ≤ 1 mm', status: 'pass',
  },
  {
    code: '1.7', checkType: 'KT', stage: 'gd1', title: 'Lớp bê tông bảo vệ bản đáy',
    matchTags: ['rebar-bottom'],
    method: 'Kiểm tra con kê (≥ 4 cái/m²), đo khoảng hở thép – ván khuôn',
    reference: 'TCVN 11823-5:2017 · TCVN 4453:1995',
    design: `${mm(0.05)} mm`, designProvenance: 'inferred',
    tolerance: '−0 / +10 mm', status: 'pass',
  },
  {
    code: '1.8', checkType: 'HP', stage: 'gd1', title: 'Hold point: TVGS ký cho đổ bê tông bản đáy',
    matchTags: ['concrete-bottom', 'rebar-bottom', 'cable-bottom', 'anchor-bottom'],
    method: 'Biên bản nghiệm thu ván khuôn + cốt thép + ống gen GĐ1 có chữ ký TVGS',
    reference: 'Quy trình ITP dự án',
    design: 'Đạt 1.2 → 1.7', tolerance: 'Ký trước khi đổ', status: 'pass',
  },
  {
    code: '1.9', checkType: 'QA', stage: 'gd1', title: 'Đổ bê tông bản đáy: độ sụt, lấy mẫu, mạch ngừng',
    matchTags: ['concrete-bottom'],
    method: 'Thử độ sụt mỗi xe; đúc tổ mẫu nén; tạo nhám mạch ngừng y = 0.6 m',
    reference: 'TCVN 3106:2022 · TCVN 3118:2022',
    design: 'Mác bê tông thiết kế', designProvenance: 'required',
    tolerance: 'Độ sụt ±20 mm · ≥ 1 tổ 3 mẫu / đợt đổ', status: 'pass',
  },

  // GĐ2 · 2 sườn
  {
    code: '2.1', checkType: 'KT', stage: 'gd2', title: 'Cốt thép sườn: đai, thanh dọc, liên kết đáy',
    matchTags: ['rebar-web'],
    method: 'Đếm đai, đo bước đai tại vùng gối và giữa nhịp; kiểm tra neo đai vào bản đáy',
    reference: 'TCVN 4453:1995 §4.5',
    design: 'Theo SUON.ifc',
    tolerance: 'Bước đai ±10 mm', status: 'pass',
  },
  {
    code: '2.2', checkType: 'KT', stage: 'gd2', title: 'Thép định vị ống gen sườn (D8)',
    matchTags: ['rebar-duct-support+rebar-web'],
    method: 'Kiểm tra hàn / buộc chắc thanh định vị, khoảng cách ≤ 1 m',
    reference: 'AASHTO LRFD Constr. §10.4.1',
    design: 'D8 theo DUL.ifc',
    tolerance: 'Khoảng cách ≤ 1.0 m', status: 'pass',
  },
  {
    code: '2.3', checkType: 'KT', stage: 'gd2', title: 'Toạ độ ống gen + bó cáp sườn',
    matchTags: ['cable-web', 'duct-web'],
    method: 'Đo cao độ tim ống gen theo bảng toạ độ đường cong cáp tại mỗi 1 m',
    reference: '22TCN 247-98 §5',
    design: '6 bó 18T15.2 uốn cong trong sườn',
    tolerance: 'Đứng ±5 mm · ngang ±10 mm', status: 'pending',
  },
  {
    code: '2.4', checkType: 'KT', stage: 'gd2', title: 'Ống gen kín khít, ống thông hơi / bơm vữa',
    matchTags: ['duct'],
    method: 'Kiểm tra mối nối băng keo co nhiệt; bố trí ống thông hơi tại đỉnh / đáy đường cáp',
    reference: 'PTI M50.3 · AASHTO LRFD Constr. §10.9',
    design: 'Vị trí ống thông hơi', designProvenance: 'required',
    tolerance: 'Không rò; thông hơi tại mọi điểm cao', status: 'missing',
  },
  {
    code: '2.5', checkType: 'KT', stage: 'gd2', title: 'Neo sườn: vị trí, vuông góc trục cáp',
    matchTags: ['anchor-web'],
    method: 'Thước vuông + nivô tại mặt bích neo, kiểm tra ống loe',
    reference: 'Hướng dẫn hệ neo nhà cung cấp',
    design: '12 neo (6 bó × 2 đầu)',
    tolerance: 'Tim ±5 mm · lệch góc ≤ 1°', status: 'pending',
  },
  {
    code: '2.6', checkType: 'KT', stage: 'gd2', title: 'Cốt thép vùng neo (lưới / lò xo xoắn)',
    matchTags: ['rebar-anchor-zone'],
    method: 'Đếm lưới, kiểm tra tim lò xo trùng tim neo',
    reference: 'AASHTO LRFD 5.8.4 (vùng neo)',
    design: 'Theo DUL.ifc + SUON.ifc',
    tolerance: 'Tim lò xo ±10 mm', status: 'pending',
  },
  {
    code: '2.7', checkType: 'KT', stage: 'gd2', title: 'Ván khuôn sườn: bề dày, độ thẳng đứng',
    matchTags: ['concrete-web'],
    method: 'Đo bề dày sườn bằng thước tại 1/4, 1/2 nhịp; dây dọi kiểm tra nghiêng',
    reference: 'TCVN 4453:1995 §4.3',
    design: `Sườn ${mm(S.webThk)} mm`,
    tolerance: '+8 / −5 mm · nghiêng ≤ 5 mm', status: 'pending',
  },
  {
    code: '2.8', checkType: 'HP', stage: 'gd2', title: 'Hold point: TVGS ký cho đổ bê tông sườn',
    matchTags: ['concrete-web', 'rebar-web', 'cable-web', 'anchor-web'],
    method: 'Biên bản nghiệm thu GĐ2 + xử lý mạch ngừng bản đáy',
    reference: 'Quy trình ITP dự án',
    design: 'Đạt 2.1 → 2.7', tolerance: 'Ký trước khi đổ', status: 'pending',
  },
  {
    code: '2.9', checkType: 'QA', stage: 'gd2', title: 'Đổ bê tông sườn: đầm, mạch ngừng trên',
    matchTags: ['concrete-web'],
    method: 'Đổ đối xứng 2 sườn, đầm dùi không chạm ống gen; tạo nhám mạch ngừng y = 2.42 m',
    reference: 'TCVN 4453:1995 §6',
    design: 'Mác bê tông thiết kế', designProvenance: 'required',
    tolerance: 'Độ sụt ±20 mm · chênh cao 2 sườn ≤ 0.5 m', status: 'pending',
  },

  // GĐ3 · Bản mặt, căng kéo, bơm vữa
  {
    code: '3.1', checkType: 'KT', stage: 'gd3', title: 'Cốt thép bản mặt + cánh hẫng',
    matchTags: ['rebar-deck'],
    method: 'Đếm thanh, đo bước 2 lớp; kiểm tra chiều cao kê giữa 2 lớp thép',
    reference: 'TCVN 4453:1995 §4.5',
    design: `Dọc ${R.deckLongTop.note} · ngang cánh ${R.cantTop.note}`, designProvenance: 'inferred',
    tolerance: 'Bước ±10 mm · lớp bảo vệ −0/+10 mm', status: 'pending',
  },
  {
    code: '3.2', checkType: 'KT', stage: 'gd3', title: 'Chi tiết chôn sẵn: móc cẩu, thoát nước, thép chờ lan can',
    matchTags: ['lifting-loop', 'deck-drain', 'rebar-starter'],
    method: 'Đo vị trí từng chi tiết so bản vẽ; kiểm tra móc cẩu neo qua 2 lớp thép',
    reference: 'Bản vẽ chi tiết chôn sẵn',
    design: 'Bản vẽ chôn sẵn', designProvenance: 'required',
    tolerance: 'Vị trí ±10 mm', status: 'missing',
  },
  {
    code: '3.3', checkType: 'KT', stage: 'gd3', title: 'Ván khuôn bản mặt: bề rộng, dày, dốc ngang',
    matchTags: ['concrete-deck'],
    method: 'Đo bề rộng toàn cánh, chiều dày tại mép và tim; kiểm tra dốc ngang 2%',
    reference: 'TCVN 4453:1995 §4.3',
    design: `Rộng ${S.deckWidth} m · dày ${mm(S.deckThk)} mm · cánh ${S.cantilever} m`,
    tolerance: 'Rộng +10/−5 mm · dày +8/−5 mm', status: 'pending',
  },
  {
    code: '3.4', checkType: 'HP', stage: 'gd3', title: 'Hold point: TVGS ký cho đổ bê tông bản mặt',
    matchTags: ['concrete-deck', 'rebar-deck'],
    method: 'Biên bản nghiệm thu GĐ3 (3.1 → 3.3)',
    reference: 'Quy trình ITP dự án',
    design: 'Đạt 3.1 → 3.3', tolerance: 'Ký trước khi đổ', status: 'pending',
  },
  {
    code: '3.5', checkType: 'QA', stage: 'gd3', title: 'Đổ + bảo dưỡng bê tông bản mặt',
    matchTags: ['concrete-deck'],
    method: 'Độ sụt, tổ mẫu nén (thêm tổ mẫu cho căng kéo); bảo dưỡng ẩm ≥ 7 ngày',
    reference: 'TCVN 8828:2011 (bảo dưỡng ẩm)',
    design: 'Mác bê tông thiết kế', designProvenance: 'required',
    tolerance: 'Độ sụt ±20 mm · bảo dưỡng ≥ 7 ngày', status: 'pending',
  },
  {
    code: '3.6', checkType: 'HP', stage: 'gd3', title: 'Hold point: cường độ bê tông trước căng kéo',
    matchTags: ['concrete'],
    method: 'Nén tổ mẫu cùng điều kiện bảo dưỡng; TVGS ký cho phép căng',
    reference: '22TCN 247-98 · TCVN 3118:2022',
    design: "f'c thiết kế", designProvenance: 'required',
    tolerance: "≥ 85% f'c", status: 'missing',
  },
  {
    code: '3.7', checkType: 'QA', stage: 'gd3', title: 'Kiểm định kích + đồng hồ, chứng chỉ cáp / neo',
    matchTags: ['cable', 'anchor'],
    method: 'Chứng nhận hiệu chuẩn bộ kích – bơm – đồng hồ còn hạn (≤ 6 tháng)',
    reference: 'Quy trình căng kéo nhà thầu',
    design: 'Biểu đồ hiệu chuẩn kích', designProvenance: 'required',
    tolerance: 'Hiệu chuẩn ≤ 6 tháng', status: 'pending',
  },
  {
    code: '3.8', checkType: 'HP', stage: 'gd3', title: 'Hold point căng kéo: lực + độ giãn dài',
    matchTags: ['cable', 'anchor'],
    method: 'Căng theo cấp 0.1 → 0.2 → 1.0 Pk, ghi độ giãn dài từng bó, căng đối xứng',
    reference: '22TCN 247-98 §7 · AASHTO LRFD Constr. §10.10',
    design: 'Lực căng Pk + độ giãn dài tính toán', designProvenance: 'required',
    tolerance: 'Độ giãn dài ±6% tính toán', status: 'missing',
  },
  {
    code: '3.9', checkType: 'KT', stage: 'gd3', title: 'Tụt neo, đứt sợi sau căng kéo',
    matchTags: ['anchor'],
    method: 'Đo tụt nêm tại đầu neo; đếm sợi đứt / trượt',
    reference: 'AASHTO LRFD Constr. §10.10.1',
    design: 'Tụt neo theo hệ neo', designProvenance: 'required',
    tolerance: 'Tụt neo ≤ 6 mm · đứt sợi ≤ 1% mặt cắt', status: 'pending',
  },
  {
    code: '3.10', checkType: 'QA', stage: 'gd3', title: 'Bơm vữa ống gen',
    matchTags: ['duct', 'cable'],
    method: 'Thử độ chảy, tách nước tại hiện trường; bơm liên tục tới khi vữa đặc ra ở thông hơi',
    reference: 'PTI M55.1 · ASTM C939',
    design: 'Cấp phối vữa', designProvenance: 'required',
    tolerance: 'Độ chảy 11–30 s · tách nước ≤ 2%/3 h', status: 'pending',
  },
  {
    code: '3.11', checkType: 'KT', stage: 'gd3', title: 'Cắt cáp thừa + bịt đầu neo',
    matchTags: ['anchor'],
    method: 'Cắt bằng máy mài (không dùng nhiệt); đổ vữa / bê tông bịt đầu neo',
    reference: 'Hướng dẫn hệ neo nhà cung cấp',
    design: 'Đầu cáp thò ≥ 30 mm', designProvenance: 'inferred',
    tolerance: '≥ 30 mm sau nêm', status: 'pending',
  },
  {
    code: '3.12', checkType: 'HP', stage: 'gd3', title: 'Nghiệm thu dầm: kích thước, độ vồng, nứt',
    matchTags: ['concrete'],
    method: 'Đo độ vồng giữa nhịp sau căng; khảo sát vết nứt, rỗ mặt',
    reference: 'TCVN 9115:2019 · 22TCN 247-98',
    design: 'Độ vồng tính toán', designProvenance: 'required',
    tolerance: 'Độ vồng ±10% · nứt ≤ 0.1 mm', status: 'pending',
  },
  {
    code: '3.13', checkType: 'QA', stage: 'gd3', title: 'Hồ sơ hoàn công dầm',
    matchTags: ['concrete', 'cable'],
    method: 'Tập hợp biên bản GĐ1–GĐ3, nhật ký căng kéo, kết quả thí nghiệm, bản vẽ hoàn công',
    reference: 'Nghị định 06/2021/NĐ-CP',
    design: 'Danh mục hồ sơ ITP', tolerance: 'Đủ hồ sơ', status: 'pending',
  },
]

export const DAM_HOP_CHECKLISTS: InspectionChecklistItem[] = SPECS.map(s => ({
  id: `cl-dh-${s.code.replace('.', '-')}`,
  assetId: DAM_HOP_ASSET_ID,
  stage: s.stage,
  code: s.code,
  checkType: s.checkType,
  title: s.title,
  objectIds: [],
  matchTags: s.matchTags,
  matchKinds: s.matchKinds,
  method: s.method,
  reference: s.reference,
  designValue: s.design,
  designProvenance: s.designProvenance ?? 'extracted',
  tolerance: s.tolerance,
  toleranceProvenance: s.tolerance ? (s.toleranceProvenance ?? 'inferred') : 'required',
  sourceProvenance: s.designProvenance === 'required' ? 'required' : s.designProvenance === 'inferred' ? 'inferred' : 'extracted',
  status: s.status ?? 'pending',
}))
