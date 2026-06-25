export type UserRole = 'admin' | 'manager' | 'safety' | 'contractor' | 'supervisor'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  avatar?: string
  contractorId?: string
}

export interface Contractor {
  id: string
  name: string
  code: string
  totalWorkers: number
  presentWorkers: number
}

export interface Worker {
  id: string
  name: string
  code: string
  contractorId: string
  contractorName: string
  role: string
  avatar?: string
}
