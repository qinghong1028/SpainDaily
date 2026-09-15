import type { TripData } from '../domain/types'

const travelers = [
  { id: 'demo-traveler-a', displayName: '演示旅客 A', shortName: 'A', avatarColor: '#EC5934' },
  { id: 'demo-traveler-b', displayName: '演示旅客 B', shortName: 'B', avatarColor: '#1D6A61' },
  { id: 'demo-traveler-c', displayName: '演示旅客 C', shortName: 'C', avatarColor: '#7756A7' },
]

const today = new Date().toLocaleDateString('en-CA')

export const demoTrip: TripData = {
  schemaVersion: 1,
  packageId: 'demo-package',
  createdAt: new Date().toISOString(),
  trip: {
    id: 'demo-trip', title: '西班牙 · 演示行程', subtitle: '虚构数据，仅用于体验界面',
    startDate: today, endDate: today, preparationStartDate: today, defaultTimeZone: 'Europe/Madrid', sourceIds: ['demo-source'],
  },
  travelers,
  dayPlans: [{ id: 'demo-day-today', date: today, city: 'Madrid', title: '抵达马德里', subtitle: '先放行李，再慢慢认识这座城', timeZone: 'Europe/Madrid', travelerIds: travelers.map((t) => t.id), eventIds: ['demo-event-arrive', 'demo-event-museum', 'demo-event-hotel'], taskIds: ['demo-task-ticket'], sourceIds: ['demo-source'] }],
  events: [
    { id: 'demo-event-arrive', dayPlanId: 'demo-day-today', date: today, title: '机场 → 市区', subtitle: '机场快线', startTime: '10:15', endTime: '11:10', timeZone: 'Europe/Madrid', kind: 'transfer', status: 'suggested', travelerIds: travelers.map((t) => t.id), placeId: 'demo-place-station', attachmentIds: [], sourceIds: ['demo-source'], detail: '这是建议路线，不是实时交通信息。', actionLabel: 'Google 地图', actionUrl: 'https://www.google.com/maps/dir/?api=1&destination=Madrid+Atocha' },
    { id: 'demo-event-museum', dayPlanId: 'demo-day-today', date: today, title: '普拉多博物馆', subtitle: '免费时段示例', startTime: '17:00', endTime: '19:00', timeZone: 'Europe/Madrid', kind: 'sight', status: 'official', travelerIds: travelers.map((t) => t.id), placeId: 'demo-place-prado', attachmentIds: [], sourceIds: ['demo-source'], detail: '演示内容，不代表真实预约。', actionLabel: '打开地图', actionUrl: 'https://www.google.com/maps/search/?api=1&query=Museo+Nacional+del+Prado' },
    { id: 'demo-event-hotel', dayPlanId: 'demo-day-today', date: today, title: '示例酒店入住', startTime: '20:00', timeZone: 'Europe/Madrid', kind: 'stay', status: 'document', travelerIds: travelers.map((t) => t.id), bookingId: 'demo-booking-hotel', attachmentIds: [], sourceIds: ['demo-source'] },
  ],
  bookings: [{ id: 'demo-booking-hotel', kind: 'hotel', title: '示例酒店', travelerIds: travelers.map((t) => t.id), date: today, status: 'document', fields: [{ label: '入住', value: '15:00' }, { label: 'Wi‑Fi', value: '点击后显示', sensitive: true }], attachmentIds: [], sourceIds: ['demo-source'] }],
  places: [
    { id: 'demo-place-station', name: 'Madrid Atocha', city: 'Madrid', timeZone: 'Europe/Madrid', googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Madrid+Atocha', sourceIds: ['demo-source'] },
    { id: 'demo-place-prado', name: 'Museo Nacional del Prado', city: 'Madrid', address: 'Paseo del Prado, s/n', timeZone: 'Europe/Madrid', googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Museo+Nacional+del+Prado', sourceIds: ['demo-source'] },
  ],
  attachments: [],
  dailyTasks: [{ id: 'demo-task-ticket', dayPlanId: 'demo-day-today', date: today, title: '出发前确认门票已下载到手机', travelerIds: travelers.map((t) => t.id), dueTime: '16:00', eventId: 'demo-event-museum', status: 'suggested', timing: 'today', sourceIds: ['demo-source'] }],
  guides: [{ id: 'demo-guide-safety', title: '城市步行小提示', category: 'safety', summary: '在人多处把包放在身前。', body: ['仅为虚构演示内容。', '真实行程包会保留每条信息的来源与核验状态。'], sourceIds: ['demo-source'], attachmentIds: [] }],
  sources: [{ id: 'demo-source', type: 'user', title: '虚构演示数据', note: '不对应任何真实旅客、订单或行程。' }],
}
