import { describe, expect, it } from 'vitest'
import { demoTrip } from '../data/demo'
import { migrateTripData } from './migrations'

describe('schema migrations', () => {
  it('accepts the current schema', () => {
    expect(migrateTripData(demoTrip).schemaVersion).toBe(1)
  })

  it('runs the legacy version-zero migration before validation', () => {
    const legacy = structuredClone(demoTrip) as unknown as Record<string, unknown>
    delete legacy.schemaVersion
    expect(migrateTripData(legacy).schemaVersion).toBe(1)
  })

  it('rejects packages from a newer unsupported schema', () => {
    expect(() => migrateTripData({ ...demoTrip, schemaVersion: 99 })).toThrow(/高于当前应用支持/)
  })
})
