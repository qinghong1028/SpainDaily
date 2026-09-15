import { describe, expect, it } from 'vitest'
import { demoTrip } from '../data/demo'
import { taskChangeSummary } from './taskChanges'

describe('content-package task changes', () => {
  it('returns no prompt when the task layer is unchanged', () => {
    expect(taskChangeSummary(demoTrip, structuredClone(demoTrip))).toBeNull()
  })

  it('counts added, changed and removed tasks without reading personal state', () => {
    const next = structuredClone(demoTrip)
    next.dailyTasks[0].title = '调整后的任务'
    next.dailyTasks.push({ ...next.dailyTasks[0], id: 'new-task', title: '新增任务' })
    const current = structuredClone(demoTrip)
    current.dailyTasks.push({ ...current.dailyTasks[0], id: 'old-task', title: '旧任务' })
    expect(taskChangeSummary(current, next)).toMatch(/新增 1 项、调整 1 项、不再包含 1 项/)
  })
})
