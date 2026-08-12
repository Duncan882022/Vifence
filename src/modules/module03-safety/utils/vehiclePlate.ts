import { UNKNOWN_LABEL, displayUnknown } from './displayUnknown'

export const UNKNOWN_VEHICLE_PLATE = UNKNOWN_LABEL

/** Biển anchor demo cũ trên server — map sang giá trị đúng trên xe Cam A-03. */
const DEMO_PLATE_CORRECTIONS: Record<string, string> = {
  '29H-825.54': '29H2-5354',
  '29H-5354': '29H2-5354',
}

/** Biển số hiển thị — không fake, thiếu OCR → Unknown. */
export function resolveVehiclePlate(plate?: string | null): string {
  const corrected = plate?.trim()
    ? (DEMO_PLATE_CORRECTIONS[plate.trim()] ?? plate.trim())
    : plate
  return displayUnknown(corrected)
}

export function isKnownVehiclePlate(plate?: string | null): boolean {
  return resolveVehiclePlate(plate) !== UNKNOWN_VEHICLE_PLATE
}

export function formatVehicleOverlayLabel(plate?: string | null): string {
  return isKnownVehiclePlate(plate)
    ? `Ô tô · ${resolveVehiclePlate(plate)}`
    : 'Ô tô'
}

export function formatSpeedingOverlayLabel(plate?: string | null): string {
  return isKnownVehiclePlate(plate)
    ? `ATGT · ${resolveVehiclePlate(plate)}`
    : 'ATGT'
}
