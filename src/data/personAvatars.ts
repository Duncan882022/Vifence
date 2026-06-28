/**
 * Ảnh chân dung công nhân — public/avatars/
 * - clip-*.jpg: Module 02 Đào tạo — cắt từ clip camera (npm run extract-avatars)
 * - vn-worker-*.jpg: stock Pexels (fallback module khác / ID chưa map)
 */

const AVATAR_BASE = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}avatars/`

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
  /* ── Module 02 Đào tạo — toàn bộ từ clip camera (npm run extract-avatars) ── */

  /* Ngoại lệ (w-001 … w-020) */
  'w-001': 'clip-w-001.jpg',  // Phạm Văn Cường
  'w-002': 'clip-w-002.jpg',  // Trần Văn Bình
  'w-003': 'clip-w-003.jpg',  // Lê Văn Dũng
  'w-004': 'clip-w-004.jpg',  // Hoàng Văn Em
  'w-005': 'clip-w-005.jpg',  // Nguyễn Thị Phương
  'w-006': 'clip-w-006.jpg',  // Vũ Minh Giang
  'w-007': 'clip-w-007.jpg',  // Đinh Quốc Hùng
  'w-008': 'clip-w-008.jpg',  // Bùi Thị Lan
  'w-010': 'clip-w-010.jpg',  // Trương Văn Khoa
  'w-011': 'clip-w-011.jpg',  // Lý Thị Mỹ Duyên
  'w-012': 'clip-w-012.jpg',  // Phan Minh Tuấn
  'w-013': 'clip-w-013.jpg',  // Cao Văn Nam
  'w-014': 'clip-w-014.jpg',  // Đặng Thị Hoa
  'w-015': 'clip-w-015.jpg',  // Hồ Quốc Việt
  'w-016': 'clip-w-016.jpg',  // Kiều Thanh Thảo
  'w-018': 'clip-w-018.jpg',  // Mai Xuân Trường
  'w-019': 'clip-w-019.jpg',  // Nguyễn Văn Hoàng
  'w-020': 'clip-w-020.jpg',  // Phùng Anh Tuấn

  /* Hoàn thành / đang học (w-c*, w-att*) */
  'w-c01': 'clip-w-c01.jpg',    // Nguyễn Thị Lan
  'w-c02': 'clip-w-c02.jpg',    // Trần Quốc Bảo
  'w-c03': 'clip-w-c03.jpg',    // Lê Thị Hương
  'w-c04': 'clip-w-c04.jpg',    // Phạm Minh Tuấn
  'w-c05': 'clip-w-c05.jpg',    // Ngô Văn Tùng
  'w-c06': 'clip-w-c06.jpg',    // Đinh Thị Mai
  'w-c07': 'clip-w-c07.jpg',    // Hoàng Thị Ngọc
  'w-c08': 'clip-w-c08.jpg',    // Bùi Văn Khoa
  'w-c09': 'clip-w-c09.jpg',    // Vũ Thị Thu
  'w-c10': 'clip-w-c10.jpg',    // Lý Văn Nam
  'w-c11': 'clip-w-c11.jpg',    // Trịnh Văn Hùng
  'w-c12': 'clip-w-c12.jpg',    // Đặng Thị Linh
  'w-att01': 'clip-w-att01.jpg',  // Bùi Văn Thanh
  'w-att02': 'clip-w-att02.jpg',  // Nguyễn Thị Xuân
  'w-att03': 'clip-w-att03.jpg',  // Phạm Văn An
  'w-att04': 'clip-w-att04.jpg',  // Trần Minh Khang

  /* Điện cơ E (w-a*) */
  'w-a01': 'clip-w-a01.jpg',  // Cao Thị Bích
  'w-a02': 'clip-w-a02.jpg',  // Nguyễn Văn Phú
  'w-a03': 'clip-w-a03.jpg',  // Trần Minh Đức
  'w-a04': 'clip-w-a04.jpg',  // Lê Thị Phương
  'w-a05': 'clip-w-a05.jpg',  // Vũ Minh Khải

  /* Ca sắp diễn ra (e-*) */
  'e-vhmn-1': 'clip-e-vhmn-1.jpg',  // Ngô Thanh Sơn
  'e-vhmn-2': 'clip-e-vhmn-2.jpg',  // Lưu Đức Minh
  'e-vhmn-3': 'clip-e-vhmn-3.jpg',  // Đỗ Văn Long
  'e-vhmn-4': 'clip-e-vhmn-4.jpg',  // Võ Thị Hằng
  'e-ktxd-1': 'clip-e-ktxd-1.jpg',  // Hoàng Văn Phúc
  'e-ktxd-2': 'clip-e-ktxd-2.jpg',  // Lê Thị Thu Hà
  'e-ktxd-3': 'clip-e-ktxd-3.jpg',  // Trương Văn Dũng
  'e-atmt-1': 'clip-w-att01.jpg',   // Bùi Văn Thanh — cùng w-att01
  'e-atmt-2': 'clip-w-att02.jpg',   // Nguyễn Thị Xuân — cùng w-att02
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
