import type { NoteState, TaskState, TripData } from '../domain/types'
import { parseBackupState, decryptTripPackage } from '../security/package'
import { createLocalStateCipher, decryptLocalState, encryptLocalState, type LocalStateCipher } from '../security/localState'

const DB_NAME = 'spaindaily'
const DB_VERSION = 3
const VAULT_KEY = 'active'
const LOCAL_KEY = 'spaindaily-personal-v1'
const PRIVATE_CACHE_PREFIX = 'spaindaily-private-'

interface PersonalTripRecord {
  vaultId: string
  trip: TripData
  taskStates: TaskState[]
  notes: NoteState[]
  settings: Record<string, unknown>
  attachmentIds: string[]
  importedAt: string
}

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
let sessionCacheName: string | null = null
let stateWriteChain = Promise.resolve()

function readPersonalRecord(): PersonalTripRecord | null {
  const value = localStorage.getItem(LOCAL_KEY)
  return value ? JSON.parse(value) as PersonalTripRecord : null
}

function attachmentUrl(vaultId: string, id: string): string {
  return new URL(`${import.meta.env.BASE_URL}__private/${encodeURIComponent(vaultId)}/${encodeURIComponent(id)}`, location.origin).href
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
  sessionCacheName = null
}

function clearSession(): void {
  sessionTrip = null
  sessionAttachments = new Map()
  sessionTaskStates = new Map()
  sessionNotes = new Map()
  sessionSettings = {}
  sessionCipher = null
  sessionVaultId = null
  sessionCacheName = null
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
  if (readPersonalRecord()) return true
  const vault = await loadVault()
  return Boolean(vault?.trip || vault?.packageBlob)
}

export async function loadStoredPackage(): Promise<TripData | null> {
  const personal = readPersonalRecord()
  if (personal) {
    replaceSession({ data: personal.trip, attachments: new Map(), taskStates: personal.taskStates, notes: personal.notes, settings: personal.settings }, null, personal.vaultId)
    sessionCacheName = `${PRIVATE_CACHE_PREFIX}${personal.vaultId}`
    return personal.trip
  }
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
    const vaultId = crypto.randomUUID()
    const cacheName = `${PRIVATE_CACHE_PREFIX}${vaultId}`
    const previous = readPersonalRecord()
    try {
      for (const [id, blob] of pkg.attachments) {
        try {
          const cache = await caches.open(cacheName)
          await cache.put(attachmentUrl(vaultId, id), new Response(blob, { headers: { 'Content-Type': blob.type || 'application/octet-stream' } }))
        } catch (error) {
          throw new Error(`附件保存失败（${id}，${(blob.size / 1024 / 1024).toFixed(1)} MB）：${error instanceof Error ? error.message : '本机存储不可用'}`)
        }
      }
      const record: PersonalTripRecord = {
        vaultId, trip: pkg.data, taskStates, notes, settings,
        attachmentIds: Array.from(pkg.attachments.keys()), importedAt: new Date().toISOString(),
      }
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(record)) }
      catch (error) { throw new Error(`行程目录保存失败：${error instanceof Error ? error.message : '本机存储不可用'}`) }
    } catch (error) {
      if ('caches' in globalThis) await caches.delete(cacheName).catch(() => undefined)
      throw error
    }
    replaceSession(next, null, vaultId)
    sessionCacheName = cacheName
    if (previous && previous.vaultId !== vaultId) await caches.delete(`${PRIVATE_CACHE_PREFIX}${previous.vaultId}`).catch(() => undefined)
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
    if (sessionCacheName) {
      const record = readPersonalRecord()
      if (record?.vaultId === vaultId) localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...record, ...payload }))
      return
    }
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
  const inMemory = sessionAttachments.get(id)
  if (inMemory) return inMemory
  if (!sessionCacheName || !sessionVaultId) return null
  const response = await (await caches.open(sessionCacheName)).match(attachmentUrl(sessionVaultId, id))
  return response ? response.blob() : null
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
  localStorage.removeItem(LOCAL_KEY)
  if ('caches' in globalThis) await Promise.all((await caches.keys()).filter((key) => key.startsWith(PRIVATE_CACHE_PREFIX)).map((key) => caches.delete(key)))
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
  if (sessionCacheName && sessionVaultId && sessionTrip) {
    const cache = await caches.open(sessionCacheName)
    const checks = await Promise.all(sessionTrip.attachments.map(async ({ id }) => ({ id, found: Boolean(await cache.match(attachmentUrl(sessionVaultId!, id))) })))
    return checks.filter(({ found }) => found).map(({ id }) => id)
  }
  return Array.from(sessionAttachments.keys())
}
