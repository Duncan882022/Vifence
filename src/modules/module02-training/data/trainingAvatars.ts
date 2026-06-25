/**
 * Ảnh chân dung demo — randomuser.me (ổn định, miễn phí demo).
 * Chỉ gán một phần HV hiển thị thường xuyên; còn lại fallback chữ cái.
 */
const P = (path: string) => `https://randomuser.me/api/portraits/${path}`

export const ATTENDEE_AVATAR_URLS: Record<string, string> = {
  /* ── Ngoại lệ nổi bật ── */
  'w-001': P('men/32.jpg'),      // Phạm Văn Cường
  'w-002': P('men/45.jpg'),      // Trần Văn Bình
  'w-004': P('men/22.jpg'),      // Hoàng Văn Em
  'w-003': P('men/52.jpg'),      // Lê Văn Dũng
  'w-005': P('women/44.jpg'),    // Nguyễn Thị Phương
  'w-012': P('men/67.jpg'),      // Phan Minh Tuấn
  'w-008': P('women/68.jpg'),    // Bùi Thị Lan

  /* ── Đang học / hoàn thành ── */
  'w-c01': P('women/65.jpg'),    // Nguyễn Thị Lan
  'w-c05': P('men/75.jpg'),      // Ngô Văn Tùng
  'w-c09': P('women/82.jpg'),    // Vũ Thị Thu
  'w-att01': P('men/36.jpg'),    // Bùi Văn Thanh
  'w-att02': P('women/23.jpg'),  // Nguyễn Thị Xuân

  /* ── Điện cơ E (đang diễn ra) ── */
  'w-a01': P('women/47.jpg'),    // Cao Thị Bích
  'w-a02': P('men/41.jpg'),      // Nguyễn Văn Phú
  'w-a03': P('men/53.jpg'),      // Trần Minh Đức
  'w-a05': P('men/28.jpg'),      // Vũ Minh Khải

  /* ── Ca sắp diễn ra (preview) ── */
  'e-vhmn-1': P('men/48.jpg'),   // Ngô Thanh Sơn
  'e-vhmn-4': P('women/56.jpg'), // Võ Thị Hằng
  'e-ktxd-1': P('men/61.jpg'),   // Hoàng Văn Phúc
}

export function getAttendeeAvatarUrl(attendeeId: string): string | undefined {
  return ATTENDEE_AVATAR_URLS[attendeeId]
}
