import { UNKNOWN_LABEL, displayUnknown } from './displayUnknown'

export const UNKNOWN_VEHICLE_PLATE = UNKNOWN_LABEL

/** Biển số hiển thị — không fake, thiếu OCR → Unknown. */
export function resolveVehiclePlate(plate?: string | null): string {
  return displayUnknown(plate)
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
