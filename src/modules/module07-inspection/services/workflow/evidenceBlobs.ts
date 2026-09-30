/** Lưu blob bằng chứng (snapshot, ghi âm, video) trong IndexedDB của iPad. */
const DB_NAME = 'vifence-m07-evidence'
const STORE = 'blobs'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      dbPromise = null
      reject(req.error)
    }
  })
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = fn(tx.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }))
}

export function putBlob(key: string, blob: Blob): Promise<IDBValidKey> {
  return run('readwrite', s => s.put(blob, key))
}

export function getBlob(key: string): Promise<Blob | undefined> {
  return run<Blob | undefined>('readonly', s => s.get(key) as IDBRequest<Blob | undefined>)
}

export function clearBlobs(): Promise<undefined> {
  return run('readwrite', s => s.clear() as IDBRequest<undefined>)
}
