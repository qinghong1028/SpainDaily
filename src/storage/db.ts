import type { NoteState, TaskState, TripData } from '../domain/types'
import { parseBackupState, decryptTripPackage } from '../security/package'
import { createLocalStateCipher, decryptLocalState, encryptLocalState, type LocalStateCipher } from '../security/localState'

const DB_NAME = 'spaindaily'
const DB_VERSION = 3
const VAULT_KEY = 'active'

interface LocalTripRecord {
  key: typeof VAULT_KEY
  vaultId: string
  trip?: TripData
  attachments?: Array<{ id: string; blob: Blob }>
  attachmentKeys?: string[]
  packageBlob?: Blob
  stateBlob: Blob
  importedAt: string
}

interface LocalAttachmentRecord {
  key: string
  vaultId: string
  id: string
  blob: Blob
}

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
let sessionCipher: LocalStateCipher | null = null
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
    const fail = (fallback: string) => {
      const cause = transaction.error
      if (cause?.name === 'QuotaExceededError') reject(new Error('手机可用存储空间不足，请清理空间后重新导入'))
      else if (cause?.name === 'SecurityError' || cause?.name === 'NotAllowedError') reject(new Error('浏览器阻止了本机存储，请在 Safari 中打开行程页后重试'))
      else reject(cause || new Error(fallback))
    }
    transaction.onerror = () => fail('本机存储事务失败')
    transaction.onabort = () => fail('本机存储事务已取消')
  })
}

function replaceSession(pkg: ImportedPackage, cipher: LocalStateCipher | null, vaultId: string | null): void {
  sessionTrip = pkg.data
  sessionAttachments = new Map(pkg.attachments)
  sessionTaskStates = new Map((pkg.taskStates || []).map((state) => [state.key, state]))
  sessionNotes = new Map((pkg.notes || []).map((note) => [note.key, note]))
  sessionSettings = { ...(pkg.settings || {}) }
  sessionCipher = cipher
  sessionVaultId = vaultId
}

function clearSession(): void {
  sessionTrip = null
  sessionAttachments = new Map()
  sessionTaskStates = new Map()
  sessionNotes = new Map()
  sessionSettings = {}
  sessionCipher = null
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
  const vault = await loadVault()
  return Boolean(vault?.trip || vault?.packageBlob)
}

export async function loadStoredPackage(): Promise<TripData | null> {
  const vault = await loadVault()
  if (!vault?.trip) return null
  const state = vault.stateBlob ? parseBackupState(JSON.parse(await vault.stateBlob.text())) : { taskStates: [], notes: [], settings: {} }
  const attachments = new Map((vault.attachments || []).map(({ id, blob }) => [id, blob]))
  if (vault.attachmentKeys?.length) {
    const db = await openDatabase()
    try {
      const transaction = db.transaction('vault', 'readonly')
      const store = transaction.objectStore('vault')
      const records = await Promise.all(vault.attachmentKeys.map((key) => request(store.get(key) as IDBRequest<LocalAttachmentRecord | undefined>)))
      records.forEach((record) => { if (record) attachments.set(record.id, record.blob) })
      await transactionDone(transaction)
    } finally { db.close() }
  }
  replaceSession({ data: vault.trip, attachments, ...state }, null, vault.vaultId)
  return vault.trip
}

export async function unlockStoredPackage(password: string): Promise<TripData> {
  const vault = await loadVault()
  if (!vault?.packageBlob) throw new Error('这台设备上没有已保存的旧版加密行程')
  const pkg = await decryptTripPackage(new File([vault.packageBlob], 'SpainDaily.spaintrip'), password)
  const local = await decryptLocalState(vault.stateBlob, password)
  const state = parseBackupState(local.payload)
  replaceSession({ data: pkg.data, attachments: pkg.attachments, ...state }, local.cipher, vault.vaultId)
  return pkg.data
}

export async function loadTrip(): Promise<TripData | null> {
  return sessionTrip
}

export async function importPackageAtomically(pkg: ImportedPackage): Promise<void> {
  const taskStates = pkg.taskStates === undefined ? Array.from(sessionTaskStates.values()) : pkg.taskStates
  const notes = pkg.notes === undefined ? Array.from(sessionNotes.values()) : pkg.notes
  const settings = pkg.settings === undefined ? { ...sessionSettings } : { ...pkg.settings }
  const next = { ...pkg, taskStates, notes, settings }

  if (pkg.persistLocally) {
    const stateBlob = new Blob([JSON.stringify({ taskStates, notes, settings })], { type: 'application/json' })
    const vaultId = crypto.randomUUID()
    const attachmentKeys = Array.from(pkg.attachments.keys(), (id) => `attachment:${vaultId}:${id}`)
    const db = await openDatabase()
    const writtenKeys: string[] = []
    try {
      for (const [id, blob] of pkg.attachments) {
        const transaction = db.transaction('vault', 'readwrite')
        transaction.objectStore('vault').put({ key: `attachment:${vaultId}:${id}`, vaultId, id, blob } satisfies LocalAttachmentRecord)
        await transactionDone(transaction)
        writtenKeys.push(`attachment:${vaultId}:${id}`)
      }
      const record: LocalTripRecord = {
        key: VAULT_KEY, vaultId, trip: pkg.data, attachmentKeys,
        stateBlob, importedAt: new Date().toISOString(),
      }
      const transaction = db.transaction('vault', 'readwrite')
      transaction.objectStore('vault').put(record)
      await transactionDone(transaction)
    } catch (error) {
      for (const key of writtenKeys) {
        try {
          const cleanup = db.transaction('vault', 'readwrite')
          cleanup.objectStore('vault').delete(key)
          await transactionDone(cleanup)
        } catch { /* Best effort: the active manifest is unchanged, so partial data stays unused. */ }
      }
      throw error
    } finally { db.close() }
    replaceSession(next, null, vaultId)
    return
  }

  if (pkg.encryptedPackage && pkg.password) {
    const cipher = await createLocalStateCipher(pkg.password)
    const stateBlob = await encryptLocalState({ taskStates, notes, settings }, cipher)
    const vaultId = crypto.randomUUID()
    const record: LocalTripRecord = {
      key: VAULT_KEY, vaultId, packageBlob: pkg.encryptedPackage, stateBlob,
      importedAt: new Date().toISOString(),
    }
    const db = await openDatabase()
    const transaction = db.transaction('vault', 'readwrite')
    transaction.objectStore('vault').put(record)
    try { await transactionDone(transaction) } finally { db.close() }
    replaceSession(next, cipher, vaultId)
    return
  }
  replaceSession(next, null, null)
}

function persistSessionState(): Promise<void> {
  const cipher = sessionCipher
  const vaultId = sessionVaultId
  const payload = statePayload()
  if (!vaultId) return Promise.resolve()
  const write = async () => {
    const stateBlob = cipher
      ? await encryptLocalState(payload, cipher)
      : new Blob([JSON.stringify(payload)], { type: 'application/json' })
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
  return sessionAttachments.get(id) || null
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
  const transaction = db.transaction('vault', 'readwrite')
  transaction.objectStore('vault').clear()
  await transactionDone(transaction)
  db.close()
}

export async function storageEstimate(): Promise<{ usage?: number; quota?: number }> {
  if (!navigator.storage?.estimate) return {}
  return navigator.storage.estimate()
}

export async function storedAttachmentIds(): Promise<string[]> {
  return Array.from(sessionAttachments.keys())
}
