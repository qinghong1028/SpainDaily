import type { NoteState, StoredTrip, TaskState, TripData } from '../domain/types'

const DB_NAME = 'spaindaily'
const DB_VERSION = 1

export interface ImportedPackage {
  data: TripData
  attachments: Map<string, Blob>
  taskStates?: TaskState[]
  notes?: NoteState[]
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result)
    value.onerror = () => reject(value.error || new Error('本机存储操作失败'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error('本机存储事务失败'))
    transaction.onabort = () => reject(transaction.error || new Error('本机存储事务已取消'))
  })
}

export async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION)
    open.onupgradeneeded = () => {
      const db = open.result
      if (!db.objectStoreNames.contains('trip')) db.createObjectStore('trip', { keyPath: 'key' })
      if (!db.objectStoreNames.contains('attachments')) db.createObjectStore('attachments')
      if (!db.objectStoreNames.contains('tasks')) db.createObjectStore('tasks', { keyPath: 'key' })
      if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'key' })
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings')
    }
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error || new Error('无法打开本机存储'))
    open.onblocked = () => reject(new Error('本机存储升级被其他页面阻塞，请关闭旧页面后重试'))
  })
}

export async function loadTrip(): Promise<TripData | null> {
  const db = await openDatabase()
  const transaction = db.transaction('trip', 'readonly')
  const stored = await request(transaction.objectStore('trip').get('active')) as StoredTrip | undefined
  db.close()
  return stored?.data || null
}

export async function importPackageAtomically(pkg: ImportedPackage): Promise<void> {
  const db = await openDatabase()
  const transaction = db.transaction(['trip', 'attachments', 'tasks', 'notes'], 'readwrite', { durability: 'strict' })
  const tripStore = transaction.objectStore('trip')
  const attachmentStore = transaction.objectStore('attachments')
  const taskStore = transaction.objectStore('tasks')
  const noteStore = transaction.objectStore('notes')
  attachmentStore.clear()
  taskStore.clear()
  noteStore.clear()
  for (const [id, blob] of pkg.attachments) attachmentStore.put(blob, id)
  for (const state of pkg.taskStates || []) taskStore.put(state)
  for (const note of pkg.notes || []) noteStore.put(note)
  tripStore.put({ key: 'active', data: pkg.data, importedAt: new Date().toISOString() } satisfies StoredTrip)
  try {
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

export async function loadAttachment(id: string): Promise<Blob | null> {
  const db = await openDatabase()
  const transaction = db.transaction('attachments', 'readonly')
  const blob = await request(transaction.objectStore('attachments').get(id)) as Blob | undefined
  db.close()
  return blob || null
}

export async function loadTaskStates(): Promise<TaskState[]> {
  const db = await openDatabase()
  const result = await request(db.transaction('tasks', 'readonly').objectStore('tasks').getAll()) as TaskState[]
  db.close()
  return result
}

export async function saveTaskState(state: TaskState): Promise<void> {
  const db = await openDatabase()
  const transaction = db.transaction('tasks', 'readwrite')
  transaction.objectStore('tasks').put(state)
  await transactionDone(transaction)
  db.close()
}

export async function loadNotes(): Promise<NoteState[]> {
  const db = await openDatabase()
  const result = await request(db.transaction('notes', 'readonly').objectStore('notes').getAll()) as NoteState[]
  db.close()
  return result
}

export async function saveNote(state: NoteState): Promise<void> {
  const db = await openDatabase()
  const transaction = db.transaction('notes', 'readwrite')
  transaction.objectStore('notes').put(state)
  await transactionDone(transaction)
  db.close()
}

export async function getSetting<T>(key: string): Promise<T | null> {
  const db = await openDatabase()
  const value = await request(db.transaction('settings', 'readonly').objectStore('settings').get(key)) as T | undefined
  db.close()
  return value ?? null
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const db = await openDatabase()
  const transaction = db.transaction('settings', 'readwrite')
  transaction.objectStore('settings').put(value, key)
  await transactionDone(transaction)
  db.close()
}

export async function clearPrivateData(): Promise<void> {
  const db = await openDatabase()
  const names = ['trip', 'attachments', 'tasks', 'notes']
  const transaction = db.transaction(names, 'readwrite')
  names.forEach((name) => transaction.objectStore(name).clear())
  await transactionDone(transaction)
  db.close()
}

export async function storageEstimate(): Promise<{ usage?: number; quota?: number }> {
  if (!navigator.storage?.estimate) return {}
  return navigator.storage.estimate()
}

export async function storedAttachmentIds(): Promise<string[]> {
  const db = await openDatabase()
  const keys = await request(db.transaction('attachments', 'readonly').objectStore('attachments').getAllKeys())
  db.close()
  return keys.map(String)
}
