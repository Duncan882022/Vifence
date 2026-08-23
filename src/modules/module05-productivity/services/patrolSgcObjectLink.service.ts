/** Liên kết sgc-* ↔ OBJ-* để gộp lịch sử khi gán profile. */
const STORAGE_KEY = 'vifence_patrol_sgc_object_link_v1'

interface LinkStore {
  sgcToObject: Record<string, string>
  objectToSgc: Record<string, string[]>
}

function readStore(): LinkStore {
  if (typeof localStorage === 'undefined') return { sgcToObject: {}, objectToSgc: {} }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { sgcToObject: {}, objectToSgc: {} }
    const parsed = JSON.parse(raw) as LinkStore
    return {
      sgcToObject: parsed.sgcToObject ?? {},
      objectToSgc: parsed.objectToSgc ?? {},
    }
  } catch {
    return { sgcToObject: {}, objectToSgc: {} }
  }
}

function writeStore(store: LinkStore): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // quota
  }
}

function normSgc(id: string): string {
  return id.trim().toUpperCase()
}

function normObj(id: string): string {
  return id.trim()
}

export function rememberPatrolSgcObjectLink(sgcWorkerId: string, objectId: string): void {
  const sgc = normSgc(sgcWorkerId)
  const obj = normObj(objectId)
  if (!sgc.startsWith('SGC-') || !obj.toUpperCase().startsWith('OBJ-')) return

  const store = readStore()
  store.sgcToObject[sgc] = obj
  const list = store.objectToSgc[obj] ?? []
  if (!list.includes(sgc)) {
    store.objectToSgc[obj] = [...list, sgc]
  }
  writeStore(store)
}

export function getPatrolObjectIdForSgc(sgcWorkerId: string): string | null {
  const sgc = normSgc(sgcWorkerId)
  return readStore().sgcToObject[sgc] ?? null
}

export function getPatrolSgcKeysForObject(objectId: string): string[] {
  const obj = normObj(objectId)
  return readStore().objectToSgc[obj] ?? []
}

export function expandPatrolIdentityAliasKeys(objectKey: string): string[] {
  const key = objectKey.trim()
  if (!key) return []
  const keys = new Set<string>([key])
  if (/^sgc-/i.test(key)) {
    const obj = getPatrolObjectIdForSgc(key)
    if (obj) keys.add(obj)
  } else if (/^obj-/i.test(key)) {
    for (const sgc of getPatrolSgcKeysForObject(key)) {
      keys.add(sgc)
    }
  }
  return [...keys]
}
