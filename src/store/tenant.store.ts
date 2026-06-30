import { create } from 'zustand'
import {
  type TenantId,
  readStoredTenantId,
  tenantHasDemoData,
  writeStoredTenantId,
} from '@/data/tenants'

interface TenantState {
  activeTenantId: TenantId
  setActiveTenant: (id: TenantId) => boolean
}

export const useTenantStore = create<TenantState>((set) => ({
  activeTenantId: readStoredTenantId(),
  setActiveTenant: (id) => {
    if (!tenantHasDemoData(id)) return false
    writeStoredTenantId(id)
    set({ activeTenantId: id })
    return true
  },
}))
