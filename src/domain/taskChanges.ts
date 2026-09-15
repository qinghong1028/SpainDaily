import type { DailyTask, TripData } from './types'

function fingerprint(task: DailyTask): string {
  return JSON.stringify({
    date: task.date,
    title: task.title,
    detail: task.detail,
    travelerIds: [...task.travelerIds].sort(),
    dueTime: task.dueTime,
    eventId: task.eventId,
    status: task.status,
    timing: task.timing,
  })
}

export function taskChangeSummary(current: TripData, next: TripData): string | null {
  const before = new Map(current.dailyTasks.map((task) => [task.id, task]))
  const after = new Map(next.dailyTasks.map((task) => [task.id, task]))
  const added = next.dailyTasks.filter((task) => !before.has(task.id))
  const removed = current.dailyTasks.filter((task) => !after.has(task.id))
  const changed = next.dailyTasks.filter((task) => before.has(task.id) && fingerprint(before.get(task.id)!) !== fingerprint(task))
  if (!added.length && !removed.length && !changed.length) return null
  const samples = [...added, ...changed, ...removed].slice(0, 3).map((task) => task.title)
  return `检测到关联待办变化：新增 ${added.length} 项、调整 ${changed.length} 项、不再包含 ${removed.length} 项。\n建议先核对：${samples.join('、') || '变更项目'}。\n个人勾选、修改和备注会按稳定 ID 保留，不会被新内容静默覆盖。`
}
