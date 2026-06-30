export type TenantId =
  | 'ocp1'
  | 'ocp2'
  | 'ha-long-xanh'
  | 'lang-olympic'
  | 'can-gio'
  | 'vung-ang'

export interface Tenant {
  id: TenantId
  name: string
  /** Demo data available in this build */
  hasDemoData: boolean
}

export const TENANTS: Tenant[] = [
  { id: 'ocp1', name: 'OCP1', hasDemoData: true },
  { id: 'ocp2', name: 'OCP2', hasDemoData: false },
  { id: 'ha-long-xanh', name: 'Hạ Long Xanh', hasDemoData: false },
  { id: 'lang-olympic', name: 'Làng Olympic', hasDemoData: false },
  { id: 'can-gio', name: 'Cần Giờ', hasDemoData: false },
  { id: 'vung-ang', name: 'Vũng Áng', hasDemoData: false },
]

export const DEFAULT_TENANT_ID: TenantId = 'ocp1'

const STORAGE_KEY = 'vifence-active-tenant'

export function getTenantById(id: string): Tenant | undefined {
  return TENANTS.find(t => t.id === id)
}

export function tenantHasDemoData(id: string): boolean {
  return getTenantById(id)?.hasDemoData ?? false
}

export function readStoredTenantId(): TenantId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && TENANTS.some(t => t.id === stored)) return stored as TenantId
  } catch {
    /* ignore */
  }
  return DEFAULT_TENANT_ID
}

export function writeStoredTenantId(id: TenantId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}
