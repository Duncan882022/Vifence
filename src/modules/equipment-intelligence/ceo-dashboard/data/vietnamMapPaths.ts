import vietnamMap from '@svg-country-maps/vietnam'

/** Cropped to mainland — removes empty South China Sea margin for better panel fill */
export const VIETNAM_MAP_VIEWBOX = '-12 -12 405 824' as const

export const VIETNAM_PROVINCES = vietnamMap.locations

/** Mainland provinces — exclude distant island groups for cleaner silhouette */
export const VIETNAM_MAINLAND = VIETNAM_PROVINCES.filter(
  loc => loc.id !== 'spratly-islands',
)

/** Paracel / Spratly — outside cropped viewBox, omitted at dashboard scale */
export const VIETNAM_ISLANDS: { id: string; cx: number; cy: number; r: number }[] = []
