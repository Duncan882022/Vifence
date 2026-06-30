declare module '@svg-country-maps/vietnam' {
  export interface SvgMapLocation {
    id: string
    name: string
    path: string
  }

  export interface SvgMap {
    viewBox: string
    label: string
    locations: SvgMapLocation[]
  }

  const vietnam: SvgMap
  export default vietnam
}
