import { z } from 'zod'

const status = z.enum(['document', 'official', 'suggested', 'pending', 'conflict', 'derived'])
const id = z.string().min(2).regex(/^[a-z0-9][a-z0-9-]*$/)
const safeUrl = z.string().url().refine((value) => ['https:', 'http:'].includes(new URL(value).protocol), '只允许 HTTP(S) 链接')

const source = z.object({
  id,
  type: z.enum(['document', 'official', 'inference', 'user']),
  title: z.string().min(1),
  location: z.string().optional(),
  url: safeUrl.optional(),
  accessedAt: z.string().optional(),
  note: z.string().optional(),
})

export const tripDataSchema = z.object({
  schemaVersion: z.literal(1),
  packageId: id,
  createdAt: z.string(),
  trip: z.object({
    id,
    title: z.string().min(1),
    subtitle: z.string().optional(),
    startDate: z.string(),
    endDate: z.string(),
    defaultTimeZone: z.string(),
    preparationStartDate: z.string(),
    sourceIds: z.array(id),
  }),
  travelers: z.array(z.object({
    id,
    displayName: z.string().min(1),
    shortName: z.string().min(1),
    latinName: z.string().optional(),
    avatarColor: z.string(),
  })).min(1),
  dayPlans: z.array(z.object({
    id,
    date: z.string(),
    city: z.string(),
    title: z.string(),
    subtitle: z.string().optional(),
    timeZone: z.string(),
    travelerIds: z.array(id),
    eventIds: z.array(id),
    taskIds: z.array(id),
    sourceIds: z.array(id),
  })),
  events: z.array(z.object({
    id, dayPlanId: id, date: z.string(), title: z.string(), subtitle: z.string().optional(),
    startTime: z.string().optional(), endTime: z.string().optional(), timeZone: z.string(),
    kind: z.enum(['flight', 'train', 'stay', 'sight', 'food', 'transfer', 'meeting', 'free', 'prep']),
    status, travelerIds: z.array(id), placeId: id.optional(), bookingId: id.optional(),
    attachmentIds: z.array(id), sourceIds: z.array(id), detail: z.string().optional(),
    actionLabel: z.string().optional(), actionUrl: safeUrl.optional(),
    reminderMinutes: z.array(z.number()).optional(), allDay: z.boolean().optional(),
  })),
  bookings: z.array(z.object({
    id, kind: z.enum(['flight', 'train', 'hotel', 'ticket', 'storage']), title: z.string(),
    travelerIds: z.array(id), date: z.string(), status,
    fields: z.array(z.object({ label: z.string(), value: z.string(), sensitive: z.boolean().optional(), conflict: z.boolean().optional() })),
    attachmentIds: z.array(id), sourceIds: z.array(id),
  })),
  places: z.array(z.object({
    id, name: z.string(), city: z.string(), address: z.string().optional(), latitude: z.number().optional(),
    longitude: z.number().optional(), timeZone: z.string(), googleMapsUrl: safeUrl, sourceIds: z.array(id),
  })),
  attachments: z.array(z.object({
    id, name: z.string(), path: z.string(), mimeType: z.string(), sha256: z.string(), size: z.number().nonnegative(),
    kind: z.enum(['ticket', 'booking', 'map', 'guide', 'source']), travelerIds: z.array(id),
    sensitive: z.boolean(), sourceIds: z.array(id),
  })),
  dailyTasks: z.array(z.object({
    id, dayPlanId: id, date: z.string(), title: z.string(), detail: z.string().optional(),
    travelerIds: z.array(id), dueTime: z.string().optional(), eventId: id.optional(), status, timing: z.enum(['today', 'advance']).optional(), sourceIds: z.array(id),
  })),
  guides: z.array(z.object({
    id, title: z.string(), category: z.enum(['safety', 'language', 'transport', 'venue', 'emergency', 'source']),
    summary: z.string(), body: z.array(z.string()), sourceIds: z.array(id), placeId: id.optional(), attachmentIds: z.array(id).optional(),
  })),
  sources: z.array(source),
}).superRefine((data, context) => {
  const travelers = new Set(data.travelers.map((item) => item.id))
  const days = new Set(data.dayPlans.map((item) => item.id))
  const sources = new Set(data.sources.map((item) => item.id))
  const events = new Set(data.events.map((item) => item.id))
  const bookings = new Set(data.bookings.map((item) => item.id))
  const places = new Set(data.places.map((item) => item.id))
  const attachments = new Set(data.attachments.map((item) => item.id))
  const tasks = new Set(data.dailyTasks.map((item) => item.id))
  const ids = [...data.travelers, ...data.dayPlans, ...data.events, ...data.bookings, ...data.places, ...data.attachments, ...data.dailyTasks, ...data.guides, ...data.sources].map((item) => item.id)
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message: '所有对象 ID 必须全局唯一' })
  data.events.forEach((item) => {
    if (!days.has(item.dayPlanId)) context.addIssue({ code: 'custom', message: `事件 ${item.id} 引用了不存在的日期` })
    item.travelerIds.forEach((value) => { if (!travelers.has(value)) context.addIssue({ code: 'custom', message: `事件 ${item.id} 引用了不存在的旅客` }) })
    item.attachmentIds.forEach((value) => { if (!attachments.has(value)) context.addIssue({ code: 'custom', message: `事件 ${item.id} 引用了不存在的附件` }) })
    item.sourceIds.forEach((value) => { if (!sources.has(value)) context.addIssue({ code: 'custom', message: `事件 ${item.id} 引用了不存在的来源` }) })
    if (item.bookingId && !bookings.has(item.bookingId)) context.addIssue({ code: 'custom', message: `事件 ${item.id} 引用了不存在的预订` })
    if (item.placeId && !places.has(item.placeId)) context.addIssue({ code: 'custom', message: `事件 ${item.id} 引用了不存在的地点` })
  })
  data.dayPlans.forEach((item) => {
    item.travelerIds.forEach((value) => { if (!travelers.has(value)) context.addIssue({ code: 'custom', message: `日期 ${item.id} 引用了不存在的旅客` }) })
    item.eventIds.forEach((value) => { if (!events.has(value)) context.addIssue({ code: 'custom', message: `日期 ${item.id} 引用了不存在的事件` }) })
    item.taskIds.forEach((value) => { if (!tasks.has(value)) context.addIssue({ code: 'custom', message: `日期 ${item.id} 引用了不存在的任务` }) })
    item.sourceIds.forEach((value) => { if (!sources.has(value)) context.addIssue({ code: 'custom', message: `日期 ${item.id} 引用了不存在的来源` }) })
  })
  data.bookings.forEach((item) => {
    item.travelerIds.forEach((value) => { if (!travelers.has(value)) context.addIssue({ code: 'custom', message: `预订 ${item.id} 引用了不存在的旅客` }) })
    item.attachmentIds.forEach((value) => { if (!attachments.has(value)) context.addIssue({ code: 'custom', message: `预订 ${item.id} 引用了不存在的附件` }) })
    item.sourceIds.forEach((value) => { if (!sources.has(value)) context.addIssue({ code: 'custom', message: `预订 ${item.id} 引用了不存在的来源` }) })
  })
  data.dailyTasks.forEach((item) => {
    if (!days.has(item.dayPlanId)) context.addIssue({ code: 'custom', message: `任务 ${item.id} 引用了不存在的日期` })
    if (item.eventId && !events.has(item.eventId)) context.addIssue({ code: 'custom', message: `任务 ${item.id} 引用了不存在的事件` })
    item.travelerIds.forEach((value) => { if (!travelers.has(value)) context.addIssue({ code: 'custom', message: `任务 ${item.id} 引用了不存在的旅客` }) })
    item.sourceIds.forEach((value) => { if (!sources.has(value)) context.addIssue({ code: 'custom', message: `任务 ${item.id} 引用了不存在的来源` }) })
  })
  data.places.forEach((item) => item.sourceIds.forEach((value) => { if (!sources.has(value)) context.addIssue({ code: 'custom', message: `地点 ${item.id} 引用了不存在的来源` }) }))
  data.attachments.forEach((item) => {
    item.travelerIds.forEach((value) => { if (!travelers.has(value)) context.addIssue({ code: 'custom', message: `附件 ${item.id} 引用了不存在的旅客` }) })
    item.sourceIds.forEach((value) => { if (!sources.has(value)) context.addIssue({ code: 'custom', message: `附件 ${item.id} 引用了不存在的来源` }) })
  })
  data.guides.forEach((item) => {
    if (item.placeId && !places.has(item.placeId)) context.addIssue({ code: 'custom', message: `攻略 ${item.id} 引用了不存在的地点` })
    item.sourceIds.forEach((value) => { if (!sources.has(value)) context.addIssue({ code: 'custom', message: `攻略 ${item.id} 引用了不存在的来源` }) })
    item.attachmentIds?.forEach((value) => { if (!attachments.has(value)) context.addIssue({ code: 'custom', message: `攻略 ${item.id} 引用了不存在的附件` }) })
  })
})
