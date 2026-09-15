import { describe, expect, it } from 'vitest'
import { demoTrip } from '../data/demo'
import { tripDataSchema } from './schema'

describe('trip schema', () => {
  it('accepts the fictional demo package', () => {
    expect(tripDataSchema.parse(demoTrip).packageId).toBe('demo-package')
  })

  it('rejects references to unknown travelers', () => {
    const broken = structuredClone(demoTrip)
    broken.events[0].travelerIds = ['unknown-traveler']
    expect(() => tripDataSchema.parse(broken)).toThrow(/不存在的旅客/)
  })
})
