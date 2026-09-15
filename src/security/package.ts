import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { z } from 'zod'
import type { NoteState, TaskState, TripData } from '../domain/types'
import { migrateTripData } from '../domain/migrations'
import type { ImportedPackage } from '../storage/db'

const MAGIC = 'SPAINDAILY1\n'
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export interface PackageHeader {
  packageFormat: 1
  schemaVersion: 1
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string }
  cipher: { name: 'AES-GCM'; iv: string }
  payloadSha256: string
  createdAt: string
  kind: 'trip' | 'backup'
}

export interface BackupState {
  taskStates: TaskState[]
  notes: NoteState[]
  settings: Record<string, unknown>
}

const taskStateSchema = z.object({
  key: z.string(), travelerId: z.string(), taskId: z.string(), complete: z.boolean(),
  ignored: z.boolean().optional(), notApplicable: z.boolean().optional(), titleOverride: z.string().optional(),
  timeOverride: z.string().optional(), custom: z.boolean().optional(), date: z.string().optional(),
  dayPlanId: z.string().optional(), deleted: z.boolean().optional(), updatedAt: z.string(),
})
const noteStateSchema = z.object({ key: z.string(), travelerId: z.string(), dayPlanId: z.string(), text: z.string(), updatedAt: z.string() })
const backupStateSchema = z.object({
  taskStates: z.array(taskStateSchema).default([]),
  notes: z.array(noteStateSchema).default([]),
  settings: z.record(z.unknown()).default({}),
})

export function parseBackupState(value: unknown): BackupState {
  const result = backupStateSchema.safeParse(value)
  if (!result.success) throw new Error('个人状态结构无效')
  return result.data
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((value) => { binary += String.fromCharCode(value) })
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(buffer), (value) => value.toString(16).padStart(2, '0')).join('')
}

function parseEnvelope(bytes: Uint8Array): { header: PackageHeader; headerBytes: Uint8Array; ciphertext: Uint8Array } {
  const magic = decoder.decode(bytes.subarray(0, MAGIC.length))
  if (magic !== MAGIC) throw new Error('这不是 SpainDaily 行程包')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const headerLength = view.getUint32(MAGIC.length, false)
  if (headerLength < 32 || headerLength > 64 * 1024) throw new Error('行程包头部损坏')
  const headerStart = MAGIC.length + 4
  const headerEnd = headerStart + headerLength
  if (headerEnd >= bytes.length) throw new Error('行程包内容不完整')
  const headerBytes = bytes.slice(headerStart, headerEnd)
  const header = JSON.parse(decoder.decode(headerBytes)) as PackageHeader
  if (header.packageFormat !== 1 || header.schemaVersion !== 1) throw new Error('此行程包版本暂不受支持')
  if (header.kdf.name !== 'PBKDF2' || header.kdf.hash !== 'SHA-256' || header.cipher.name !== 'AES-GCM') throw new Error('行程包使用了不受支持的加密方式')
  return { header, headerBytes, ciphertext: bytes.slice(headerEnd) }
}

export async function decryptTripPackage(file: File, password: string): Promise<ImportedPackage & { backupState?: BackupState; kind: PackageHeader['kind'] }> {
  if (!password) throw new Error('请输入行程包密码')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const { header, headerBytes, ciphertext } = parseEnvelope(bytes)
  const key = await deriveKey(password, base64ToBytes(header.kdf.salt), header.kdf.iterations)
  let plaintext: ArrayBuffer
  try {
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(header.cipher.iv), additionalData: headerBytes }, key, ciphertext)
  } catch {
    throw new Error('密码不正确，或行程包已损坏')
  }
  const zipped = new Uint8Array(plaintext)
  if (await sha256Hex(zipped) !== header.payloadSha256) throw new Error('行程包完整性校验失败')
  const files = unzipSync(zipped)
  const tripBytes = files['trip.json']
  if (!tripBytes) throw new Error('行程包缺少 trip.json')
  const parsed = migrateTripData(JSON.parse(strFromU8(tripBytes)))
  const attachments = new Map<string, Blob>()
  for (const meta of parsed.attachments) {
    const value = files[meta.path]
    if (!value) throw new Error(`行程包缺少附件：${meta.name}`)
    if (await sha256Hex(value) !== meta.sha256) throw new Error(`附件校验失败：${meta.name}`)
    attachments.set(meta.id, new Blob([value], { type: meta.mimeType }))
  }
  const state = files['state.json'] ? parseBackupState(JSON.parse(strFromU8(files['state.json']))) : undefined
  return { data: parsed, attachments, backupState: state, kind: header.kind }
}

export async function encryptBackup(
  data: TripData,
  attachments: Map<string, Blob>,
  password: string,
  state: BackupState,
): Promise<Blob> {
  if (password.length < 8) throw new Error('备份密码至少需要 8 个字符')
  const files: Record<string, Uint8Array> = {
    'trip.json': strToU8(JSON.stringify(data)),
    'state.json': strToU8(JSON.stringify(state)),
  }
  for (const meta of data.attachments) {
    const blob = attachments.get(meta.id)
    if (!blob) throw new Error(`备份缺少附件：${meta.name}`)
    if (blob.size !== meta.size) throw new Error(`附件大小不一致：${meta.name}`)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    if (await sha256Hex(bytes) !== meta.sha256) throw new Error(`附件完整性校验失败：${meta.name}`)
    files[meta.path] = bytes
  }
  const zipped = zipSync(files, { level: 0 })
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const header: PackageHeader = {
    packageFormat: 1, schemaVersion: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 310000, salt: bytesToBase64(salt) },
    cipher: { name: 'AES-GCM', iv: bytesToBase64(iv) },
    payloadSha256: await sha256Hex(zipped), createdAt: new Date().toISOString(), kind: 'backup',
  }
  const headerBytes = encoder.encode(JSON.stringify(header))
  const key = await deriveKey(password, salt, header.kdf.iterations)
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: headerBytes }, key, zipped))
  const length = new Uint8Array(4)
  new DataView(length.buffer).setUint32(0, headerBytes.length, false)
  return new Blob([encoder.encode(MAGIC), length, headerBytes, encrypted], { type: 'application/octet-stream' })
}
