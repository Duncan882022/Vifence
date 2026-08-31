/** Liên kết tk-* ↔ OBJ-* để gộp lịch sử khi gán profile. Legacy sgc-* vẫn đọc được. */
const STORAGE_KEY = 'vifence_patrol_tk_object_link_v1'
const LEGACY_STORAGE_KEY = 'vifence_patrol_sgc_object_link_v1'

interface LinkStore {
  tkToObject: Record<string, string>
  objectToTk: Record<string, string[]>
}

function readStore(): LinkStore {
  if (typeof localStorage === 'undefined') return { tkToObject: {}, objectToTk: {} }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
      ?? localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return { tkToObject: {}, objectToTk: {} }
    const parsed = JSON.parse(raw) as {
      tkToObject?: Record<string, string>
      objectToTk?: Record<string, string[]>
      sgcToObject?: Record<string, string>
      objectToSgc?: Record<string, string[]>
    }
    return {
      tkToObject: parsed.tkToObject ?? parsed.sgcToObject ?? {},
      objectToTk: parsed.objectToTk ?? parsed.objectToSgc ?? {},
    }
  } catch {
    return { tkToObject: {}, objectToTk: {} }
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

function normTk(id: string): string {
  return id.trim().toUpperCase()
}

function normObj(id: string): string {
  return id.trim()
}

function isTrackWorkerKey(id: string): boolean {
  return /^(tk-|sgc-)/i.test(id.trim())
}

export function rememberPatrolTkObjectLink(tkWorkerId: string, objectId: string): void {
  const tk = normTk(tkWorkerId)
  const obj = normObj(objectId)
  if (!isTrackWorkerKey(tk) || !obj.toUpperCase().startsWith('OBJ-')) return

  const store = readStore()
  store.tkToObject[tk] = obj
  const list = store.objectToTk[obj] ?? []
  if (!list.includes(tk)) {
    store.objectToTk[obj] = [...list, tk]
  }
  writeStore(store)
}

/** @deprecated Use rememberPatrolTkObjectLink */
export const rememberPatrolSgcObjectLink = rememberPatrolTkObjectLink

export function getPatrolObjectIdForTk(tkWorkerId: string): string | null {
  const tk = normTk(tkWorkerId)
  return readStore().tkToObject[tk] ?? null
}

/** @deprecated Use getPatrolObjectIdForTk */
export const getPatrolObjectIdForSgc = getPatrolObjectIdForTk

export function getPatrolTkKeysForObject(objectId: string): string[] {
  const obj = normObj(objectId)
  return readStore().objectToTk[obj] ?? []
}

/** @deprecated Use getPatrolTkKeysForObject */
export const getPatrolSgcKeysForObject = getPatrolTkKeysForObject

export function expandPatrolIdentityAliasKeys(objectKey: string): string[] {
  const key = objectKey.trim()
  if (!key) return []
  const keys = new Set<string>([key])
  if (/^(tk-|sgc-)/i.test(key)) {
    const obj = getPatrolObjectIdForTk(key)
    if (obj) keys.add(obj)
  } else if (/^obj-/i.test(key)) {
    for (const tk of getPatrolTkKeysForObject(key)) {
      keys.add(tk)
    }
  }
  return [...keys]
}
