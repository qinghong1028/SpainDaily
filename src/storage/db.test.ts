import { beforeEach, describe, expect, it } from 'vitest'
import { demoTrip } from '../data/demo'
import { decryptTripPackage, encryptBackup } from '../security/package'
import { clearPrivateData, getSetting, hasStoredPackage, importPackageAtomically, loadNotes, loadTaskStates, loadTrip, lockPrivateData, openDatabase, saveNote, saveTaskState, setSetting, unlockStoredPackage } from './db'

describe('local persistence', () => {
  beforeEach(async () => { await clearPrivateData() })

  it('switches the active package only after a complete transaction', async () => {
    await importPackageAtomically({ data: demoTrip, attachments: new Map() })
    expect((await loadTrip())?.packageId).toBe('demo-package')
  })

  it('keeps completion state separate for each traveler', async () => {
    await importPackageAtomically({ data: demoTrip, attachments: new Map() })
    await saveTaskState({ key: 'a:task', travelerId: 'a', taskId: 'task', complete: true, updatedAt: 'now' })
    await saveTaskState({ key: 'b:task', travelerId: 'b', taskId: 'task', complete: false, updatedAt: 'now' })
    const states = await loadTaskStates()
    expect(states.find((item) => item.travelerId === 'a')?.complete).toBe(true)
    expect(states.find((item) => item.travelerId === 'b')?.complete).toBe(false)
  })

  it('preserves personal state when a normal content package is updated', async () => {
    await importPackageAtomically({ data: demoTrip, attachments: new Map() })
    await saveTaskState({ key: 'a:task', travelerId: 'a', taskId: 'task', complete: true, updatedAt: 'now' })
    await saveNote({ key: 'a:day', travelerId: 'a', dayPlanId: 'day', text: 'keep me', updatedAt: 'now' })
    await setSetting('referenceTimeZone', 'Europe/Madrid')
    await importPackageAtomically({ data: { ...demoTrip, createdAt: 'updated' }, attachments: new Map() })
    expect((await loadTaskStates())[0].complete).toBe(true)
    expect((await loadNotes())[0].text).toBe('keep me')
    expect(await getSetting('referenceTimeZone')).toBe('Europe/Madrid')
  })

  it('uses explicit backup state and can lock decrypted session data', async () => {
    await importPackageAtomically({ data: demoTrip, attachments: new Map(), taskStates: [], notes: [], settings: {} })
    expect(await loadTaskStates()).toEqual([])
    lockPrivateData()
    expect(await loadTrip()).toBeNull()
  })

  it('persists only encrypted vault data and requires the password after locking', async () => {
    const password = 'correct horse battery staple'
    const encrypted = await encryptBackup(demoTrip, new Map(), password, { taskStates: [], notes: [], settings: {} })
    const pkg = await decryptTripPackage(new File([encrypted], 'trip.spaintrip'), password)
    await importPackageAtomically({ data: pkg.data, attachments: pkg.attachments, encryptedPackage: encrypted, password })
    await saveTaskState({ key: 'a:task', travelerId: 'a', taskId: 'task', complete: true, updatedAt: 'now' })
    lockPrivateData()
    expect(await hasStoredPackage()).toBe(true)
    await expect(unlockStoredPackage('wrong password')).rejects.toThrow(/密码不正确/)
    expect((await unlockStoredPackage(password)).packageId).toBe('demo-package')
    expect((await loadTaskStates())[0].complete).toBe(true)
    const db = await openDatabase()
    expect(Array.from(db.objectStoreNames)).toEqual(['vault'])
    db.close()
  })
})
