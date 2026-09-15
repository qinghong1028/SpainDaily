import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { webcrypto } from 'node:crypto'
import { Blob, File } from 'node:buffer'

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
Object.defineProperty(globalThis, 'Blob', { value: Blob, configurable: true })
Object.defineProperty(globalThis, 'File', { value: File, configurable: true })
Object.defineProperty(globalThis, 'confirm', { value: () => true, configurable: true })
