/**
 * Ảnh chân dung công nhân công trường — lưu local tại public/avatars/ (Pexels, miễn phí demo).
 * Nguồn dùng chung cho Module 01 (ra vào), 02 (đào tạo), 03 (an toàn), 04 (5S).
 * Mỗi ảnh: công nhân xây dựng đội mũ/nón, áo phản quang — không dùng ảnh văn phòng.
 */

const AVATAR_BASE = '/avatars/'

export const MALE_AVATARS = [
  'vn-worker-m-01.jpg',
  'vn-worker-m-02.jpg',
  'vn-worker-m-03.jpg',
  'vn-worker-m-04.jpg',
  'vn-worker-m-05.jpg',
  'vn-worker-m-06.jpg',
  'vn-worker-m-07.jpg',
  'vn-worker-m-08.jpg',
  'vn-worker-m-09.jpg',
  'vn-worker-m-10.jpg',
  'vn-worker-m-11.jpg',
  'vn-worker-m-12.jpg',
] as const

export const FEMALE_AVATARS = [
  'vn-worker-w-01.jpg',
  'vn-worker-w-02.jpg',
  'vn-worker-w-03.jpg',
  'vn-worker-w-04.jpg',
  'vn-worker-w-05.jpg',
  'vn-worker-w-06.jpg',
  'vn-worker-w-07.jpg',
  'vn-worker-w-08.jpg',
  'vn-worker-w-09.jpg',
  'vn-worker-w-10.jpg',
  'vn-worker-w-11.jpg',
  'vn-worker-w-12.jpg',
] as const

/**
 * Gán cố định cho mọi personId dùng trong Module 01–04.
 * Cùng personId → cùng ảnh trên mọi module.
 */
export const PERSON_AVATAR_FILES: Record<string, string> = {
  /* ── Ngoại lệ đào tạo (w-001 … w-020) ── */
  'w-001': 'vn-worker-m-01.jpg',  // Phạm Văn Cường
  'w-002': 'vn-worker-m-02.jpg',  // Trần Văn Bình
  'w-003': 'vn-worker-m-03.jpg',  // Lê Văn Dũng
  'w-004': 'vn-worker-m-04.jpg',  // Hoàng Văn Em
  'w-005': 'vn-worker-w-01.jpg',  // Nguyễn Thị Phương
  'w-006': 'vn-worker-m-05.jpg',  // Vũ Minh Giang
  'w-007': 'vn-worker-m-06.jpg',  // Đinh Quốc Hùng
  'w-008': 'vn-worker-w-02.jpg',  // Bùi Thị Lan
  'w-010': 'vn-worker-m-07.jpg',  // Trương Văn Khoa
  'w-011': 'vn-worker-w-03.jpg',  // Lý Thị Mỹ Duyên
  'w-012': 'vn-worker-m-08.jpg',  // Phan Minh Tuấn
  'w-013': 'vn-worker-m-09.jpg',  // Cao Văn Nam
  'w-014': 'vn-worker-w-04.jpg',  // Đặng Thị Hoa
  'w-015': 'vn-worker-m-10.jpg',  // Hồ Quốc Việt
  'w-016': 'vn-worker-w-05.jpg',  // Kiều Thanh Thảo
  'w-018': 'vn-worker-m-11.jpg',  // Mai Xuân Trường
  'w-019': 'vn-worker-m-12.jpg',  // Nguyễn Văn Hoàng
  'w-020': 'vn-worker-m-01.jpg',  // Phùng Anh Tuấn

  /* ── Hoàn thành / đang học (w-c*, w-att*) ── */
  'w-c01': 'vn-worker-w-06.jpg',    // Nguyễn Thị Lan
  'w-c02': 'vn-worker-m-02.jpg',    // Trần Quốc Bảo
  'w-c03': 'vn-worker-w-07.jpg',    // Lê Thị Hương
  'w-c04': 'vn-worker-m-03.jpg',    // Phạm Minh Tuấn
  'w-c05': 'vn-worker-m-04.jpg',   // Ngô Văn Tùng
  'w-c06': 'vn-worker-w-08.jpg',    // Đinh Thị Mai
  'w-c07': 'vn-worker-w-09.jpg',    // Hoàng Thị Ngọc
  'w-c08': 'vn-worker-m-05.jpg',    // Bùi Văn Khoa
  'w-c09': 'vn-worker-w-10.jpg',    // Vũ Thị Thu
  'w-c10': 'vn-worker-m-06.jpg',    // Lý Văn Nam
  'w-c11': 'vn-worker-m-07.jpg',    // Trịnh Văn Hùng
  'w-c12': 'vn-worker-w-11.jpg',    // Đặng Thị Linh
  'w-att01': 'vn-worker-m-08.jpg',  // Bùi Văn Thanh
  'w-att02': 'vn-worker-w-12.jpg',  // Nguyễn Thị Xuân
  'w-att03': 'vn-worker-m-09.jpg',  // Phạm Văn An
  'w-att04': 'vn-worker-m-10.jpg',  // Trần Minh Khang

  /* ── Điện cơ E (w-a*) ── */
  'w-a01': 'vn-worker-w-01.jpg',  // Cao Thị Bích
  'w-a02': 'vn-worker-m-11.jpg',  // Nguyễn Văn Phú
  'w-a03': 'vn-worker-m-12.jpg',  // Trần Minh Đức
  'w-a04': 'vn-worker-w-02.jpg',  // Lê Thị Phương
  'w-a05': 'vn-worker-m-01.jpg',  // Vũ Minh Khải

  /* ── Ca sắp diễn ra (e-*) ── */
  'e-vhmn-1': 'vn-worker-m-02.jpg',  // Ngô Thanh Sơn
  'e-vhmn-2': 'vn-worker-m-03.jpg',  // Lưu Đức Minh
  'e-vhmn-3': 'vn-worker-m-04.jpg',  // Đỗ Văn Long
  'e-vhmn-4': 'vn-worker-w-03.jpg',  // Võ Thị Hằng
  'e-ktxd-1': 'vn-worker-m-05.jpg',  // Hoàng Văn Phúc
  'e-ktxd-2': 'vn-worker-w-04.jpg',  // Lê Thị Thu Hà
  'e-ktxd-3': 'vn-worker-m-06.jpg',  // Trương Văn Dũng
  'e-atmt-1': 'vn-worker-m-08.jpg',  // Bùi Văn Thanh (cùng ảnh w-att01)
  'e-atmt-2': 'vn-worker-w-12.jpg',  // Nguyễn Thị Xuân (cùng ảnh w-att02)
}

const AVATAR_COLOR_PALETTE = [
  '#3B82F6', '#F97316', '#10B981', '#8B5CF6', '#EC4899',
  '#06B6D4', '#F59E0B', '#A78BFA', '#FB923C', '#F472B6',
  '#60A5FA', '#E879F9', '#38BDF8', '#4ADE80', '#FCD34D',
  '#FB7185', '#A3E635', '#2DD4BF', '#14B8A6', '#F43F5E',
] as const

function hashCode(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return hash
}

function isLikelyFemaleName(name?: string): boolean {
  if (!name) return false
  return /\bThị\b/i.test(name)
}

function avatarPath(file: string): string {
  return `${AVATAR_BASE}${file}`
}

function pickFromPool(personId: string, female: boolean): string {
  const pool = female ? FEMALE_AVATARS : MALE_AVATARS
  const idx = Math.abs(hashCode(personId)) % pool.length
  return pool[idx]
}

export function getPersonAvatarUrl(personId: string, name?: string): string {
  const file = PERSON_AVATAR_FILES[personId]
    ?? pickFromPool(personId, isLikelyFemaleName(name))
  return avatarPath(file)
}

export function getPersonAvatarColor(name: string): string {
  const idx = Math.abs(hashCode(name)) % AVATAR_COLOR_PALETTE.length
  return AVATAR_COLOR_PALETTE[idx]
}
