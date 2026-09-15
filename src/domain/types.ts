export type FactStatus = 'document' | 'official' | 'suggested' | 'pending' | 'conflict' | 'derived'

export interface Trip {
  id: string
  title: string
  subtitle?: string
  startDate: string
  endDate: string
  defaultTimeZone: string
  preparationStartDate: string
  sourceIds: string[]
}

export interface Traveler {
  id: string
  displayName: string
  shortName: string
  latinName?: string
  avatarColor: string
}

export interface DayPlan {
  id: string
  date: string
  city: string
  title: string
  subtitle?: string
  timeZone: string
  travelerIds: string[]
  eventIds: string[]
  taskIds: string[]
  sourceIds: string[]
  guidance?: {
    status: 'suggested'
    route: string
    rest: string
    lighter: string
    optionalEventIds?: string[]
    sourceIds: string[]
  }
}

export interface EventItem {
  id: string
  dayPlanId: string
  date: string
  title: string
  subtitle?: string
  startTime?: string
  endTime?: string
  timeZone: string
  kind: 'flight' | 'train' | 'stay' | 'sight' | 'food' | 'transfer' | 'meeting' | 'free' | 'prep'
  status: FactStatus
  travelerIds: string[]
  placeId?: string
  bookingId?: string
  attachmentIds: string[]
  sourceIds: string[]
  detail?: string
  actionLabel?: string
  actionUrl?: string
  reminderMinutes?: number[]
  allDay?: boolean
}

export interface Booking {
  id: string
  kind: 'flight' | 'train' | 'hotel' | 'ticket' | 'storage'
  title: string
  travelerIds: string[]
  date: string
  status: FactStatus
  fields: Array<{ label: string; value: string; sensitive?: boolean; conflict?: boolean }>
  attachmentIds: string[]
  sourceIds: string[]
}

export interface Place {
  id: string
  name: string
  city: string
  address?: string
  latitude?: number
  longitude?: number
  timeZone: string
  googleMapsUrl: string
  sourceIds: string[]
}

export interface AttachmentMeta {
  id: string
  name: string
  path: string
  mimeType: string
  sha256: string
  size: number
  kind: 'ticket' | 'booking' | 'map' | 'guide' | 'source'
  travelerIds: string[]
  sensitive: boolean
  sourceIds: string[]
}

export interface DailyTask {
  id: string
  dayPlanId: string
  date: string
  title: string
  detail?: string
  travelerIds: string[]
  dueTime?: string
  eventId?: string
  status: FactStatus
  timing?: 'today' | 'advance'
  sourceIds: string[]
}

export interface GuideArticle {
  id: string
  title: string
  category: 'safety' | 'language' | 'transport' | 'venue' | 'emergency' | 'source'
  summary: string
  body: string[]
  sourceIds: string[]
  placeId?: string
  attachmentIds?: string[]
}

export interface Source {
  id: string
  type: 'document' | 'official' | 'inference' | 'user'
  title: string
  location?: string
  url?: string
  accessedAt?: string
  note?: string
}

export interface TripData {
  schemaVersion: number
  packageId: string
  createdAt: string
  trip: Trip
  travelers: Traveler[]
  dayPlans: DayPlan[]
  events: EventItem[]
  bookings: Booking[]
  places: Place[]
  attachments: AttachmentMeta[]
  dailyTasks: DailyTask[]
  guides: GuideArticle[]
  sources: Source[]
}

export interface TaskState {
  key: string
  travelerId: string
  taskId: string
  complete: boolean
  ignored?: boolean
  notApplicable?: boolean
  titleOverride?: string
  timeOverride?: string
  custom?: boolean
  date?: string
  dayPlanId?: string
  deleted?: boolean
  updatedAt: string
}

export interface NoteState {
  key: string
  travelerId: string
  dayPlanId: string
  text: string
  updatedAt: string
}
