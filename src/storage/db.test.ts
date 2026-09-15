import { beforeEach, describe, expect, it } from 'vitest'
import { demoTrip } from '../data/demo'
import { clearPrivateData, importPackageAtomically, loadTaskStates, loadTrip, saveTaskState } from './db'

describe('local persistence', () => {
  beforeEach(async () => { await clearPrivateData() })

  it('switches the active package only after a complete transaction', async () => {
    await importPackageAtomically({ data: demoTrip, attachments: new Map() })
    expect((await loadTrip())?.packageId).toBe('demo-package')
  })

  it('keeps completion state separate for each traveler', async () => {
    await saveTaskState({ key: 'a:task', travelerId: 'a', taskId: 'task', complete: true, updatedAt: 'now' })
    await saveTaskState({ key: 'b:task', travelerId: 'b', taskId: 'task', complete: false, updatedAt: 'now' })
    const states = await loadTaskStates()
    expect(states.find((item) => item.travelerId === 'a')?.complete).toBe(true)
    expect(states.find((item) => item.travelerId === 'b')?.complete).toBe(false)
  })
})
