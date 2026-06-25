export type AssetType = 'equipment' | 'material' | 'vehicle'
export type AssetStatus = 'active' | 'inactive' | 'misplaced' | 'maintenance'

export interface Asset {
  id: string
  name: string
  code: string
  type: AssetType
  status: AssetStatus
  location: string
  assignedTo?: string
  lastSeen?: string
  imageUrl?: string
}

export interface MaterialRecord {
  id: string
  assetId: string
  assetName: string
  action: 'in' | 'out'
  quantity: number
  unit: string
  timestamp: string
  authorizedBy: string
  location: string
  imageUrl?: string
}
