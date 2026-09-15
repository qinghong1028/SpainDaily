const MAGIC = 'SPAINDAILYSTATE1\n'
const ITERATIONS = 310_000
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export interface LocalStatePayload {
  taskStates: unknown[]
  notes: unknown[]
  settings: Record<string, unknown>
}

export interface LocalStateCipher {
  key: CryptoKey
  salt: Uint8Array
}

interface StateHeader {
  version: 1
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string }
  cipher: { name: 'AES-GCM'; iv: string }
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

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function createLocalStateCipher(password: string, salt = crypto.getRandomValues(new Uint8Array(16))): Promise<LocalStateCipher> {
  if (password.length < 8) throw new Error('行程包密码至少需要 8 个字符')
  return { key: await deriveKey(password, salt), salt }
}

export async function encryptLocalState(payload: LocalStatePayload, cipher: LocalStateCipher): Promise<Blob> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const header: StateHeader = {
    version: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: bytesToBase64(cipher.salt) },
    cipher: { name: 'AES-GCM', iv: bytesToBase64(iv) },
  }
  const headerBytes = encoder.encode(JSON.stringify(header))
  const plaintext = encoder.encode(JSON.stringify(payload))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: headerBytes }, cipher.key, plaintext))
  const length = new Uint8Array(4)
  new DataView(length.buffer).setUint32(0, headerBytes.length, false)
  return new Blob([encoder.encode(MAGIC), length, headerBytes, ciphertext], { type: 'application/octet-stream' })
}

export async function decryptLocalState(blob: Blob, password: string): Promise<{ payload: LocalStatePayload; cipher: LocalStateCipher }> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (decoder.decode(bytes.subarray(0, MAGIC.length)) !== MAGIC) throw new Error('本机状态文件格式不受支持')
  const headerLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(MAGIC.length, false)
  const headerStart = MAGIC.length + 4
  const headerEnd = headerStart + headerLength
  if (headerLength < 32 || headerLength > 16 * 1024 || headerEnd >= bytes.length) throw new Error('本机状态文件已损坏')
  const headerBytes = bytes.slice(headerStart, headerEnd)
  const header = JSON.parse(decoder.decode(headerBytes)) as StateHeader
  if (header.version !== 1 || header.kdf.name !== 'PBKDF2' || header.kdf.hash !== 'SHA-256' || header.kdf.iterations !== ITERATIONS || header.cipher.name !== 'AES-GCM') throw new Error('本机状态加密方式不受支持')
  const cipher = await createLocalStateCipher(password, base64ToBytes(header.kdf.salt))
  let plaintext: ArrayBuffer
  try {
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(header.cipher.iv), additionalData: headerBytes }, cipher.key, bytes.slice(headerEnd))
  } catch {
    throw new Error('本机状态无法解锁，可能已损坏或密码不匹配')
  }
  const parsed = JSON.parse(decoder.decode(plaintext)) as Partial<LocalStatePayload>
  if (!Array.isArray(parsed.taskStates) || !Array.isArray(parsed.notes) || !parsed.settings || typeof parsed.settings !== 'object' || Array.isArray(parsed.settings)) throw new Error('本机状态结构无效')
  return { payload: { taskStates: parsed.taskStates, notes: parsed.notes, settings: parsed.settings }, cipher }
}
