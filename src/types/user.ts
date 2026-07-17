export type UserRole = 'admin' | 'manager' | 'safety' | 'contractor' | 'supervisor' | 'super' | 'user'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  avatar?: string
  contractorId?: string
  
  username?: string
  fullName?: string
  phone?: string | null
  avatarUrl?: string | null
  roleId?: string
  roleDetail?: {
    id: string
    name: string
    code: string
    createdAt?: string
    updatedAt?: string
  } | null
  createdAt?: string
  updatedAt?: string
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
