import { describe, expect, it } from 'vitest'
import { demoTrip } from '../data/demo'
import { decryptTripPackage, encryptBackup } from './package'

describe('encrypted package', () => {
  it('round-trips a package and personal state', async () => {
    const state = { taskStates: [{ key: 'a:t', travelerId: 'a', taskId: 't', complete: true, updatedAt: '2026-09-15T00:00:00Z' }], notes: [] }
    const blob = await encryptBackup(demoTrip, new Map(), 'correct horse battery staple', state)
    const result = await decryptTripPackage(new File([blob], 'backup.spaintrip'), 'correct horse battery staple')
    expect(result.data.packageId).toBe('demo-package')
    expect(result.backupState?.taskStates?.[0].complete).toBe(true)
  })

  it('rejects a wrong password without exposing partial contents', async () => {
    const blob = await encryptBackup(demoTrip, new Map(), 'correct horse battery staple', {})
    await expect(decryptTripPackage(new File([blob], 'backup.spaintrip'), 'wrong password')).rejects.toThrow(/密码不正确/)
  })
})
