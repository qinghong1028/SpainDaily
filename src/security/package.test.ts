import { describe, expect, it } from 'vitest'
import { demoTrip } from '../data/demo'
import { decryptTripPackage, encryptBackup } from './package'

describe('encrypted package', () => {
  it('round-trips a package and personal state', async () => {
    const state = { taskStates: [{ key: 'a:t', travelerId: 'a', taskId: 't', complete: true, updatedAt: '2026-09-15T00:00:00Z' }], notes: [], settings: {} }
    const blob = await encryptBackup(demoTrip, new Map(), 'correct horse battery staple', state)
    const result = await decryptTripPackage(new File([blob], 'backup.spaintrip'), 'correct horse battery staple')
    expect(result.data.packageId).toBe('demo-package')
    expect(result.backupState?.taskStates[0].complete).toBe(true)
  })

  it('rejects a wrong password without exposing partial contents', async () => {
    const blob = await encryptBackup(demoTrip, new Map(), 'correct horse battery staple', { taskStates: [], notes: [], settings: {} })
    await expect(decryptTripPackage(new File([blob], 'backup.spaintrip'), 'wrong password')).rejects.toThrow(/密码不正确/)
  })

  it('rejects a corrupted ciphertext without exposing partial contents', async () => {
    const blob = await encryptBackup(demoTrip, new Map(), 'correct horse battery staple', { taskStates: [], notes: [], settings: {} })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    bytes[bytes.length - 1] ^= 0xff
    await expect(decryptTripPackage(new File([bytes], 'corrupted.spaintrip'), 'correct horse battery staple')).rejects.toThrow(/已损坏/)
  })

  it('refuses to create an incomplete backup', async () => {
    const data = { ...demoTrip, attachments: [{ id: 'attachment-a', name: 'ticket.png', path: 'attachments/ticket.png', mimeType: 'image/png', sha256: '00', size: 1, kind: 'ticket' as const, travelerIds: ['demo-a'], sensitive: true, sourceIds: [] }] }
    await expect(encryptBackup(data, new Map(), 'correct horse battery staple', { taskStates: [], notes: [], settings: {} })).rejects.toThrow(/缺少附件/)
  })
})
