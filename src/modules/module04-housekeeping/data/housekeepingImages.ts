export type HousekeepingImageKey =
  | 'waste-violation'
  | 'waste-improved'
  | 'materials-violation'
  | 'materials-improved'
  | 'water-violation'
  | 'water-improved'
  | 'clutter-violation'
  | 'clutter-improved'
  | 'thumb-phong-dao-tao-a2'
  | 'thumb-san-thuc-hanh-b1'
  | 'thumb-phong-dao-tao-a1'
  | 'thumb-san-tap-a'
  | 'thumb-kho-vat-tu'

const IMAGE_FILES: Record<HousekeepingImageKey, string> = {
  'waste-violation': 'waste-violation.jpg',
  'waste-improved': 'waste-improved.jpg',
  'materials-violation': 'materials-violation.jpg',
  'materials-improved': 'materials-improved.jpg',
  'water-violation': 'water-violation.jpg',
  'water-improved': 'water-improved.jpg',
  'clutter-violation': 'clutter-violation.jpg',
  'clutter-improved': 'clutter-improved.jpg',
  'thumb-phong-dao-tao-a2': 'thumb-phong-dao-tao-a2.jpg',
  'thumb-san-thuc-hanh-b1': 'thumb-san-thuc-hanh-b1.jpg',
  'thumb-phong-dao-tao-a1': 'thumb-phong-dao-tao-a1.jpg',
  'thumb-san-tap-a': 'thumb-san-tap-a.jpg',
  'thumb-kho-vat-tu': 'thumb-kho-vat-tu.jpg',
}

export function getHousekeepingImageUrl(key: HousekeepingImageKey): string {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/')
  return `${base}housekeeping/${IMAGE_FILES[key]}`
}
