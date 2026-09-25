import type { NoteState, TaskState, TripData } from '../domain/types'
import { parseBackupState } from '../security/package'

const DB_NAME = 'spaindaily'
const DB_VERSION = 3
const VAULT_KEY = 'active'

interface LocalTripRecord {
  key: typeof VAULT_KEY
  vaultId: string
  trip: TripData
  stateBlob: Blob
  importedAt: string
}

interface LocalAttachmentRecord { id: string; blob: Blob }

export interface ImportedPackage {
  data: TripData
  attachments: Map<string, Blob>
  taskStates?: TaskState[]
  notes?: NoteState[]
  settings?: Record<string, unknown>
  encryptedPackage?: Blob
  password?: string
  persistLocally?: boolean
}

let sessionTrip: TripData | null = null
let sessionAttachments = new Map<string, Blob>()
let sessionTaskStates = new Map<string, TaskState>()
let sessionNotes = new Map<string, NoteState>()
let sessionSettings: Record<string, unknown> = {}
let sessionVaultId: string | null = null
let stateWriteChain = Promise.resolve()

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

function replaceSession(pkg: ImportedPackage, vaultId: string | null): void {
  sessionTrip = pkg.data
  sessionAttachments = new Map(pkg.attachments)
  sessionTaskStates = new Map((pkg.taskStates || []).map((state) => [state.key, state]))
  sessionNotes = new Map((pkg.notes || []).map((note) => [note.key, note]))
  sessionSettings = { ...(pkg.settings || {}) }
  sessionVaultId = vaultId
}

function clearSession(): void {
  sessionTrip = null
  sessionAttachments = new Map()
  sessionTaskStates = new Map()
  sessionNotes = new Map()
  sessionSettings = {}
  sessionVaultId = null
}

function statePayload() {
  return {
    taskStates: Array.from(sessionTaskStates.values()),
    notes: Array.from(sessionNotes.values()),
    settings: { ...sessionSettings },
  }
}

export async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION)
    open.onupgradeneeded = () => {
      const db = open.result
      if (!db.objectStoreNames.contains('vault')) db.createObjectStore('vault', { keyPath: 'key' })
      if (!db.objectStoreNames.contains('attachments')) db.createObjectStore('attachments', { keyPath: 'id' })
    }
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error || new Error('无法打开本机存储'))
    open.onblocked = () => reject(new Error('本机存储升级被其他页面阻塞，请关闭旧页面后重试'))
  })
}

async function loadVault(): Promise<LocalTripRecord | null> {
  const db = await openDatabase()
  try {
    return await request(db.transaction('vault', 'readonly').objectStore('vault').get(VAULT_KEY)) as LocalTripRecord | undefined || null
  } finally {
    db.close()
  }
}

export async function hasStoredPackage(): Promise<boolean> {
  return Boolean((await loadVault())?.trip)
}

export async function loadStoredPackage(): Promise<TripData | null> {
  const vault = await loadVault()
  if (!vault?.trip) return null
  const state = vault.stateBlob ? parseBackupState(JSON.parse(await vault.stateBlob.text())) : { taskStates: [], notes: [], settings: {} }
  replaceSession({ data: vault.trip, attachments: new Map(), ...state }, vault.vaultId)
  return vault.trip
}

export async function loadTrip(): Promise<TripData | null> {
  return sessionTrip
}

export async function importPackageAtomically(pkg: ImportedPackage): Promise<void> {
  const taskStates = pkg.taskStates === undefined ? Array.from(sessionTaskStates.values()) : pkg.taskStates
  const notes = pkg.notes === undefined ? Array.from(sessionNotes.values()) : pkg.notes
  const settings = pkg.settings === undefined ? { ...sessionSettings } : { ...pkg.settings }
  const next = { ...pkg, taskStates, notes, settings }

  if (!pkg.persistLocally) {
    replaceSession(next, null)
    return
  }

  const stateBlob = new Blob([JSON.stringify({ taskStates, notes, settings })], { type: 'application/json' })
  const vaultId = crypto.randomUUID()
  const record: LocalTripRecord = {
    key: VAULT_KEY,
    vaultId,
    trip: pkg.data,
    stateBlob,
    importedAt: new Date().toISOString(),
  }
  const db = await openDatabase()
  const transaction = db.transaction(['vault', 'attachments'], 'readwrite', { durability: 'strict' })
  transaction.objectStore('vault').put(record)
  const attachmentStore = transaction.objectStore('attachments')
  attachmentStore.clear()
  for (const [id, blob] of pkg.attachments) attachmentStore.put({ id, blob } satisfies LocalAttachmentRecord)
  try {
    await transactionDone(transaction)
  } finally {
    db.close()
  }
  replaceSession(next, vaultId)
}

function persistSessionState(): Promise<void> {
  const vaultId = sessionVaultId
  const payload = statePayload()
  if (!vaultId) return Promise.resolve()
  const write = async () => {
    const stateBlob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
    if (sessionVaultId !== vaultId) return
    const db = await openDatabase()
    try {
      const transaction = db.transaction('vault', 'readwrite')
      const store = transaction.objectStore('vault')
      const record = await request(store.get(VAULT_KEY)) as LocalTripRecord | undefined
      if (record?.vaultId === vaultId) store.put({ ...record, stateBlob })
      await transactionDone(transaction)
    } finally {
      db.close()
    }
  }
  stateWriteChain = stateWriteChain.catch(() => undefined).then(write)
  return stateWriteChain
}

export async function loadAttachment(id: string): Promise<Blob | null> {
  const cached = sessionAttachments.get(id)
  if (cached) return cached
  const db = await openDatabase()
  try {
    const record = await request(db.transaction('attachments', 'readonly').objectStore('attachments').get(id)) as LocalAttachmentRecord | undefined
    if (record) sessionAttachments.set(id, record.blob)
    return record?.blob || null
  } finally {
    db.close()
  }
}

export async function loadTaskStates(): Promise<TaskState[]> {
  return Array.from(sessionTaskStates.values())
}

export async function saveTaskState(state: TaskState): Promise<void> {
  if (!sessionTrip) throw new Error('请先解锁行程')
  sessionTaskStates.set(state.key, state)
  await persistSessionState()
}

export async function loadNotes(): Promise<NoteState[]> {
  return Array.from(sessionNotes.values())
}

export async function saveNote(state: NoteState): Promise<void> {
  if (!sessionTrip) throw new Error('请先解锁行程')
  sessionNotes.set(state.key, state)
  await persistSessionState()
}

export async function getSetting<T>(key: string): Promise<T | null> {
  return key in sessionSettings ? sessionSettings[key] as T : null
}

export async function loadSettings(): Promise<Record<string, unknown>> {
  return { ...sessionSettings }
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  if (!sessionTrip) throw new Error('请先解锁行程')
  sessionSettings[key] = value
  await persistSessionState()
}

export function lockPrivateData(): void {
  clearSession()
}

export async function clearPrivateData(): Promise<void> {
  clearSession()
  await stateWriteChain.catch(() => undefined)
  const db = await openDatabase()
  const transaction = db.transaction(['vault', 'attachments'], 'readwrite')
  transaction.objectStore('vault').clear()
  transaction.objectStore('attachments').clear()
  await transactionDone(transaction)
  db.close()
}

export async function storageEstimate(): Promise<{ usage?: number; quota?: number }> {
  if (!navigator.storage?.estimate) return {}
  return navigator.storage.estimate()
}

export async function storedAttachmentIds(): Promise<string[]> {
  const db = await openDatabase()
  try {
    return (await request(db.transaction('attachments', 'readonly').objectStore('attachments').getAllKeys())).map(String)
  } finally {
    db.close()
  }
}
