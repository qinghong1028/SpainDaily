import { describe, expect, it } from 'vitest'
import { createLocalStateCipher, decryptLocalState, encryptLocalState } from './localState'

describe('encrypted local user state', () => {
  it('round-trips tasks, notes and settings without retaining the password', async () => {
    const cipher = await createLocalStateCipher('correct horse battery staple')
    const encrypted = await encryptLocalState({ taskStates: [{ complete: true }], notes: [{ text: 'memo' }], settings: { referenceTimeZone: 'Europe/Madrid' } }, cipher)
    const result = await decryptLocalState(encrypted, 'correct horse battery staple')
    expect(result.payload.taskStates).toEqual([{ complete: true }])
    expect(result.payload.notes).toEqual([{ text: 'memo' }])
    expect(result.payload.settings.referenceTimeZone).toBe('Europe/Madrid')
  })

  it('rejects a wrong password', async () => {
    const cipher = await createLocalStateCipher('correct horse battery staple')
    const encrypted = await encryptLocalState({ taskStates: [], notes: [], settings: {} }, cipher)
    await expect(decryptLocalState(encrypted, 'wrong password')).rejects.toThrow(/无法解锁/)
  })
})
