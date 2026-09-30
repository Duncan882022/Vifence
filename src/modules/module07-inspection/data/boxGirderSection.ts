/**
 * Tiết diện VHM_DamHopDienHinh_32.6m đo từ mesh IFC (lát cắt giữa nhịp).
 * Hệ toạ độ girder (m): x ngang cầu tính từ tim, y từ đáy dầm lên, z dọc cầu tính từ giữa nhịp.
 * Bảng là nửa phải (x ≥ 0), dầm đối xứng.
 */
export const BOX_SECTION = {
  length: 32.6,
  height: 3.032,
  deckWidth: 12.6,
  soffitWidth: 5.14,
  bottomSlabThk: 0.275,
  webThk: 0.371,
  deckThk: 0.265,
  cantilever: 2.955,
  /** Mạch ngừng thi công: trên vút đáy / dưới vút mặt. */
  joint1: 0.6,
  joint2: 2.42,
  outer: [
    [2.573, 0.025],
    [2.768, 0.275],
    [3.18, 1.925],
    [3.345, 2.425],
    [3.874, 2.575],
    [5.359, 2.725],
    [6.287, 2.825],
    [6.3, 2.875],
  ] as [number, number][],
  inner: [
    [2.171, 0.275],
    [2.471, 0.575],
    [2.809, 1.925],
    [2.811, 2.375],
    [2.691, 2.475],
    [1.942, 2.725],
    [0, 2.765],
  ] as [number, number][],
} as const

/** Lớp bảo vệ dùng cho thép nội suy (tim thanh = mặt bê tông ± cover + r). */
export const INFERRED_COVER = 0.05

export interface InferredBarSpec {
  key: string
  name: string
  dia: number
  spacing: number
  note: string
}

/**
 * Thép còn thiếu trong DUL.ifc + SUON.ifc (kiểm tra theo vùng):
 * – bản mặt: không có thanh dọc, cánh hẫng không có thanh ngang;
 * – bản đáy: chỉ có 10 thanh dọc giữa tim.
 * Đường kính / bước theo kinh nghiệm dầm hộp DƯL nhịp 30–35 m.
 */
export const INFERRED_REBAR: Record<'deckLongTop' | 'deckLongBot' | 'cantTop' | 'cantBot' | 'bottomLongBot' | 'bottomLongTop' | 'starter', InferredBarSpec> = {
  deckLongTop: { key: 'deckLongTop', name: 'Thép dọc bản mặt – lớp trên', dia: 12, spacing: 0.2, note: 'D12 a200' },
  deckLongBot: { key: 'deckLongBot', name: 'Thép dọc bản mặt – lớp dưới', dia: 12, spacing: 0.2, note: 'D12 a200' },
  cantTop: { key: 'cantTop', name: 'Thép ngang cánh hẫng – lớp trên', dia: 16, spacing: 0.15, note: 'D16 a150' },
  cantBot: { key: 'cantBot', name: 'Thép ngang cánh hẫng – lớp dưới', dia: 12, spacing: 0.15, note: 'D12 a150' },
  bottomLongBot: { key: 'bottomLongBot', name: 'Thép dọc bản đáy – lớp dưới', dia: 14, spacing: 0.2, note: 'D14 a200' },
  bottomLongTop: { key: 'bottomLongTop', name: 'Thép dọc bản đáy – lớp trên', dia: 12, spacing: 0.2, note: 'D12 a200' },
  starter: { key: 'starter', name: 'Thép chờ gờ lan can', dia: 12, spacing: 0.2, note: 'D12 a200, chờ 350 mm' },
}

export interface InferredEmbedSpec {
  key: string
  name: string
  note: string
}

export const INFERRED_EMBEDS = {
  bearing: { key: 'bearing', name: 'Bản thép đệm gối', note: '500×600×20, 4 bản dưới tim sườn' },
  lifting: { key: 'lifting', name: 'Móc cẩu', note: 'Cáp T15.2 vòng, 4 vị trí cách đầu dầm 2.5 m' },
  drain: { key: 'drain', name: 'Ống thoát nước mặt cầu', note: 'Ống PVC Φ100 qua cánh hẫng, 4 ống/bên' },
  weep: { key: 'weep', name: 'Lỗ thoát nước bản đáy', note: 'Ống Φ50 tại 2 đầu hộp' },
} as const satisfies Record<string, InferredEmbedSpec>

/** Ống gen bao ngoài bó cáp IFC; thành ống ≈ 3 mm. */
export const DUCT_WALL = 0.004
/** Bó có độ vồng (max y − min y) nhỏ hơn giá trị này nằm trong bản đáy. */
export const BOTTOM_CABLE_MAX_RISE = 0.6
