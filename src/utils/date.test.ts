import { describe, expect, it } from 'vitest'
import { clampTripDate, dateRange, localDateInTimeZone } from './date'

describe('trip date resolution', () => {
  it('uses the itinerary IANA timezone rather than the device timezone', () => {
    const instant = new Date('2030-03-08T23:30:00Z')
    expect(localDateInTimeZone('Europe/Madrid', instant)).toBe('2030-03-09')
    expect(localDateInTimeZone('Asia/Shanghai', instant)).toBe('2030-03-09')
    expect(localDateInTimeZone('America/Los_Angeles', instant)).toBe('2030-03-08')
  })

  it('clamps pre-trip and post-trip dates to the actual calendar boundary', () => {
    expect(clampTripDate('2030-03-01', '2030-03-02', '2030-03-14')).toBe('2030-03-02')
    expect(clampTripDate('2030-03-15', '2030-03-02', '2030-03-14')).toBe('2030-03-14')
    expect(clampTripDate('2030-03-08', '2030-03-02', '2030-03-14')).toBe('2030-03-08')
  })

  it('includes the final personal return day', () => {
    const dates = dateRange('2030-03-02', '2030-03-14')
    expect(dates.at(-1)).toBe('2030-03-14')
    expect(dates).toHaveLength(13)
  })
})
