import type { TripData } from './types'
import { tripDataSchema } from './schema'

const CURRENT_SCHEMA_VERSION = 1
type JsonRecord = Record<string, unknown>

const migrations: Record<number, (input: JsonRecord) => JsonRecord> = {
  0: (input) => ({
    ...input,
    schemaVersion: 1,
    guides: input.guides || [],
    sources: input.sources || [],
  }),
}

export function migrateTripData(input: unknown): TripData {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('trip.json 不是对象')
  let current = input as JsonRecord
  let version = Number(current.schemaVersion ?? 0)
  if (!Number.isInteger(version) || version < 0) throw new Error('资料包 schemaVersion 无效')
  if (version > CURRENT_SCHEMA_VERSION) throw new Error(`资料包版本 ${version} 高于当前应用支持的版本`)
  while (version < CURRENT_SCHEMA_VERSION) {
    const migrate = migrations[version]
    if (!migrate) throw new Error(`缺少从 schemaVersion ${version} 开始的迁移步骤`)
    current = migrate(current)
    version = Number(current.schemaVersion)
  }
  return tripDataSchema.parse(current)
}
