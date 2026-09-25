import { useEffect, useRef, useState } from 'react'
import {
  CalendarDays, Check, ChevronRight, CircleAlert, Clock3, CloudSun, Copy, Download,
  ExternalLink, FileLock2, FileText, Globe2, Languages, ListChecks, LockKeyhole,
  MapPin, Navigation, NotebookPen, Phone, Plane, RotateCcw, Search, ShieldCheck, Sparkles,
  TrainFront, Trash2, UserRound, UsersRound, Wifi, WifiOff, X, ZoomIn,
} from 'lucide-react'
import type { AttachmentMeta, Booking, DayPlan, EventItem, FactStatus, GuideArticle, NoteState, Place, Source, TaskState, TripData } from './domain/types'
import { demoTrip } from './data/demo'
import { taskChangeSummary } from './domain/taskChanges'
import { createLocalPackage, importLocalPackage } from './security/package'
import {
  clearPrivateData, getSetting, importPackageAtomically, loadAttachment, loadNotes, loadTaskStates,
  loadSettings, loadStoredPackage, saveNote, saveTaskState, setSetting, storageEstimate, storedAttachmentIds,
} from './storage/db'
import { clampTripDate, dateRange, daysBetween, formatDate, formatWeekday, localDateInTimeZone, zonedDateTimeToInstant } from './utils/date'
import { googleMapsDirections, googleMapsSearch } from './utils/maps'

type Tab = 'today' | 'schedule' | 'guides' | 'me'

const statusMeta: Record<FactStatus, { label: string; className: string }> = {
  document: { label: '原文信息', className: 'status-document' },
  official: { label: '官网核验', className: 'status-official' },
  suggested: { label: '行程建议', className: 'status-suggested' },
  pending: { label: '待确认', className: 'status-pending' },
  conflict: { label: '信息冲突', className: 'status-conflict' },
  derived: { label: '据上下文推定', className: 'status-derived' },
}

const eventIcons = {
  flight: Plane, train: TrainFront, stay: MapPin, sight: Sparkles, food: Sparkles,
  transfer: Navigation, meeting: UsersRound, free: Clock3, prep: ListChecks,
}

function App() {
  const [trip, setTrip] = useState<TripData | null>(null)
  const [ready, setReady] = useState(false)
  const [travelerId, setTravelerId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('today')
  const [selectedDate, setSelectedDate] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [referenceTimeZone, setReferenceTimeZone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [now, setNow] = useState(() => new Date())
  const previousTripDate = useRef('')

  useEffect(() => {
    loadStoredPackage()
      .then(async (storedTrip) => {
        if (storedTrip) await activateTrip(storedTrip)
      })
      .catch((error) => setNotice(error instanceof Error ? error.message : '读取本机数据失败'))
      .finally(() => setReady(true))
  }, [])

  const activateTrip = async (data: TripData) => {
    const [savedTimeZone] = await Promise.all([getSetting<string>('referenceTimeZone')])
    const personalTraveler = data.travelers.find((item) => item.shortName === 'YY') || data.travelers[0]
    const timeZone = savedTimeZone || referenceTimeZone
    const today = localDateInTimeZone(timeZone, new Date())
    setSelectedDate(clampTripDate(today, data.trip.preparationStartDate, data.trip.endDate))
    setTrip(data)
    setTravelerId(personalTraveler?.id || null)
    if (savedTimeZone) setReferenceTimeZone(savedTimeZone)
  }

  const openDemo = async () => {
    await importPackageAtomically({ data: demoTrip, attachments: new Map(), taskStates: [], notes: [], settings: {} })
    await activateTrip(demoTrip)
  }

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline) }
  }, [])

  useEffect(() => {
    if (!trip) return
    const today = localDateInTimeZone(referenceTimeZone, new Date())
    previousTripDate.current = clampTripDate(today, trip.trip.preparationStartDate, trip.trip.endDate)
    setSelectedDate(clampTripDate(today, trip.trip.preparationStartDate, trip.trip.endDate))
  }, [trip, referenceTimeZone])

  useEffect(() => {
    const refresh = () => {
      const active = document.activeElement
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return
      setNow(new Date())
    }
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh() }
    const timer = window.setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  const actualToday = localDateInTimeZone(referenceTimeZone, now)
  const currentTripDate = trip ? clampTripDate(actualToday, trip.trip.preparationStartDate, trip.trip.endDate) : ''
  useEffect(() => {
    if (!currentTripDate) return
    const prior = previousTripDate.current
    if (prior && prior !== currentTripDate) setSelectedDate((current) => current === prior ? currentTripDate : current)
    previousTripDate.current = currentTripDate
  }, [currentTripDate])

  if (!ready) return <Splash />
  if (!trip) return <Welcome onDemo={() => { openDemo().catch(() => setNotice('虚构演示无法打开。')) }} onActivated={async (data) => { await activateTrip(data); setTab('today') }} notice={notice} setNotice={setNotice} />
  if (!travelerId) return <Welcome onDemo={() => { openDemo().catch(() => setNotice('虚构演示无法打开。')) }} onActivated={async (data) => { await activateTrip(data); setTab('today') }} notice={notice} setNotice={setNotice} />

  const traveler = trip.travelers.find((item) => item.id === travelerId)!

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">{trip.packageId === 'demo-package' ? '虚构演示 · ' : ''}{online ? '在线' : '离线可用'}</p>
          <h1>{trip.trip.title}</h1>
        </div>
        <span className="traveler-chip" aria-label="个人行程">
          <span style={{ background: traveler.avatarColor }}>{traveler.shortName}</span>
          {traveler.displayName}
        </span>
      </header>

      {notice && <Notice message={notice} onClose={() => setNotice(null)} />}

      <main>
        {tab === 'today' && <TodayView trip={trip} travelerId={travelerId} date={selectedDate} actualToday={actualToday} returnDate={currentTripDate} nowMs={now.getTime()} referenceTimeZone={referenceTimeZone} onDate={setSelectedDate} setNotice={setNotice} />}
        {tab === 'schedule' && <ScheduleView trip={trip} travelerId={travelerId} actualToday={actualToday} onOpenDay={(date) => { setSelectedDate(date); setTab('today') }} />}
        {tab === 'guides' && <GuidesView trip={trip} />}
        {tab === 'me' && <MeView trip={trip} travelerId={travelerId} online={online} referenceTimeZone={referenceTimeZone} onReferenceTimeZone={(value) => { setReferenceTimeZone(value); setSetting('referenceTimeZone', value).catch(() => setNotice('参考时区未能保存。')) }} onImported={async (data) => { await activateTrip(data); setTab('today') }} onDeleted={() => { setTrip(null); setTravelerId(null) }} setNotice={setNotice} />}
      </main>

      <nav className="bottom-nav" aria-label="主导航">
        <NavButton active={tab === 'today'} icon={Clock3} label="今日" onClick={() => setTab('today')} />
        <NavButton active={tab === 'schedule'} icon={CalendarDays} label="全部日程" onClick={() => setTab('schedule')} />
        <NavButton active={tab === 'guides'} icon={FileText} label="资料攻略" onClick={() => setTab('guides')} />
        <NavButton active={tab === 'me'} icon={UserRound} label="我的" onClick={() => setTab('me')} />
      </nav>
    </div>
  )
}

function Splash() {
  return <div className="splash"><div className="brand-mark">S</div><p>正在打开今日行程…</p></div>
}

function Welcome({ onDemo, onActivated, notice, setNotice }: { onDemo: () => void; onActivated: (data: TripData) => void | Promise<void>; notice: string | null; setNotice: (value: string | null) => void }) {
  return (
    <div className="welcome">
      <div className="welcome-art" aria-hidden="true"><span>Madrid</span><i /><span>Barcelona</span><i /><span>Granada</span></div>
      <div className="welcome-card">
        <div className="brand-mark">S</div>
        <p className="eyebrow">你的离线旅行日历</p>
        <h1>每天只看<br />现在要做的事</h1>
        <p className="welcome-copy">这是你的个人行程。资料保存在这台手机的浏览器里，不需要密码；首次导入后，离线也能查看。</p>
        {notice && <Notice message={notice} onClose={() => setNotice(null)} />}
        <PackageImporter onImported={onActivated} setNotice={setNotice} compact={false} />
        <button className="button ghost wide" onClick={onDemo}>先用虚构数据看看</button>
        <div className="privacy-line"><ShieldCheck size={16} /> 行程只存本机，未加密；请使用自己的设备</div>
      </div>
    </div>
  )
}

function TodayView({ trip, travelerId, date, actualToday, returnDate, nowMs, referenceTimeZone, onDate, setNotice }: { trip: TripData; travelerId: string; date: string; actualToday: string; returnDate: string; nowMs: number; referenceTimeZone: string; onDate: (date: string) => void; setNotice: (value: string | null) => void }) {
  const [eventStates, setEventStates] = useState<Record<string, TaskState>>({})
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [nextOpen, setNextOpen] = useState(false)
  const dates = dateRange(trip.trip.preparationStartDate, trip.trip.endDate)
  const day = trip.dayPlans.find((item) => item.date === date && item.travelerIds.includes(travelerId))
  const events = day ? day.eventIds.map((id) => trip.events.find((event) => event.id === id)).filter((event): event is EventItem => Boolean(event && event.travelerIds.includes(travelerId))) : []
  const tasks = day ? day.taskIds.map((id) => trip.dailyTasks.find((task) => task.id === id)).filter((task) => Boolean(task && task.travelerIds.includes(travelerId))) : []
  const tomorrow = trip.dayPlans.find((item) => item.date > date && item.travelerIds.includes(travelerId))
  const stay = [...events].reverse().find((event) => event.kind === 'stay')
  const tomorrowTasks = tomorrow ? tomorrow.taskIds.map((id) => trip.dailyTasks.find((task) => task.id === id)).filter((task) => task?.travelerIds.includes(travelerId)) : []
  const dateDelta = daysBetween(actualToday, date)
  const departureDelta = daysBetween(actualToday, trip.trip.startDate)
  const phaseLabel = date < trip.trip.startDate ? '出发前准备' : `旅行 Day ${daysBetween(trip.trip.startDate, date) + 1}`
  const nextEvent = date === actualToday ? events.map((event) => { const time = eventStates[event.id]?.timeOverride || event.startTime; return { event, time, delta: time ? Math.round((zonedDateTimeToInstant(event.date, time, event.timeZone).getTime() - nowMs) / 60000) : -1 } }).filter((item) => item.delta >= 0).sort((a, b) => a.delta - b.delta)[0] : undefined
  const nextEventIndex = nextEvent ? events.findIndex((item) => item.id === nextEvent.event.id) : -1
  const nextPreviousEvent = nextEventIndex > 0 ? [...events.slice(0, nextEventIndex)].reverse().find((item) => item.placeId) : undefined
  const nextPreviousPlace = nextPreviousEvent?.placeId ? trip.places.find((item) => item.id === nextPreviousEvent.placeId) : undefined
  const dayTimeZone = day?.timeZone || referenceTimeZone
  const stripRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    stripRef.current?.querySelector(`[data-date="${date}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [date])
  useEffect(() => { loadTaskStates().then((items) => setEventStates(Object.fromEntries(items.filter((item) => item.travelerId === travelerId && item.taskId.startsWith('event-state-')).map((item) => [item.taskId.replace(/^event-state-/, ''), item])))).catch(() => setNotice('个人事件状态读取失败。')) }, [travelerId, date, setNotice])

  return (
    <div className="page today-page">
      <section className="date-hero">
        <div>
          <p className="eyebrow">{date === actualToday ? (departureDelta > 0 ? `距出发 ${departureDelta} 天` : '今天 · 当前参考日期') : date > actualToday ? `正在预览：还有 ${dateDelta} 天` : '回看已过去行程'}</p>
          <h2>{formatDate(date, { month: 'long', day: 'numeric', weekday: 'long' })}</h2>
          <p>{phaseLabel} · {day?.city || '行前准备'} · {day?.title || '暂无安排'}</p>
        </div>
        <div className="date-actions">
          <button className="icon-button" onClick={() => setCalendarOpen(true)} aria-label="打开完整日历"><CalendarDays size={18} /></button>
          {date !== returnDate && <button className="button small" onClick={() => onDate(returnDate)}><RotateCcw size={15} />{actualToday >= trip.trip.preparationStartDate && actualToday <= trip.trip.endDate ? '回到今天' : '回到行程边界'}</button>}
        </div>
      </section>

      <div className="timezone-line"><Globe2 size={14} /> 今天按 {referenceTimeZone} 判断{dayTimeZone !== referenceTimeZone && <span> · 当日事件时区 {dayTimeZone}</span>}</div>

      <div className="date-strip" ref={stripRef}>
        {dates.map((item) => <button key={item} data-date={item} className={item === date ? 'active' : ''} onClick={() => onDate(item)}><span>{formatWeekday(item)}</span><strong>{Number(item.slice(-2))}</strong></button>)}
      </div>

      {!day ? <EmptyDay /> : <>
        <TaskList travelerId={travelerId} day={day} tasks={tasks as NonNullable<(typeof trip.dailyTasks)[number]>[]} setNotice={setNotice} />
        {nextEvent && <button className="next-card" onClick={() => setNextOpen(true)}><div><p className="eyebrow">下一项{nextEvent.event.status === 'suggested' ? ' · 建议时间' : ''}</p><strong>{nextEvent.time} · {nextEvent.event.title}</strong><span>{nextEvent.delta < 60 ? `${nextEvent.delta} 分钟后` : `${Math.floor(nextEvent.delta / 60)} 小时 ${nextEvent.delta % 60} 分后`} · 点开查看地点与票据</span></div><ChevronRight /></button>}
        {day.guidance && <DayGuidanceCard day={day} trip={trip} />}
        {events.length > 0 && <section className="section"><SectionTitle title="今日时间线" count={events.length} /><div className="timeline">{events.map((event, index) => {
          const previousEvent = [...events.slice(0, index)].reverse().find((item) => item.placeId)
          const previousPlace = previousEvent?.placeId ? trip.places.find((item) => item.id === previousEvent.placeId) : undefined
          return <EventCard key={event.id} event={event} trip={trip} travelerId={travelerId} previousPlace={previousPlace} eventState={eventStates[event.id]} onEventState={(state) => setEventStates((current) => ({ ...current, [event.id]: state }))} />
        })}</div></section>}
        {stay && <StayTonight event={stay} trip={trip} />}
        <DayNote day={day} travelerId={travelerId} setNotice={setNotice} />
        {tomorrow && <button className="tomorrow-card" onClick={() => onDate(tomorrow.date)}><div><p className="eyebrow">明日预告{tomorrowTasks.length ? ` · ${tomorrowTasks.length} 项需准备` : ''}</p><strong>{formatDate(tomorrow.date)} · {tomorrow.city}</strong><span>{tomorrowTasks.slice(0, 3).map((task) => task?.title).filter(Boolean).join(' · ') || tomorrow.title}</span></div><ChevronRight /></button>}
      </>}
      {calendarOpen && <CalendarSheet trip={trip} travelerId={travelerId} selectedDate={date} actualToday={actualToday} onSelect={(value) => { onDate(value); setCalendarOpen(false) }} onClose={() => setCalendarOpen(false)} />}
      {nextOpen && nextEvent && <EventSheet event={nextEvent.event} trip={trip} travelerId={travelerId} previousPlace={nextPreviousPlace} eventState={eventStates[nextEvent.event.id]} onEventState={(state) => setEventStates((current) => ({ ...current, [nextEvent.event.id]: state }))} onClose={() => setNextOpen(false)} />}
      {import.meta.env.DEV && <DevClock trip={trip} onDate={onDate} />}
    </div>
  )
}

function DayGuidanceCard({ day, trip }: { day: DayPlan; trip: TripData }) {
  if (!day.guidance) return null
  const sources = day.guidance.sourceIds.map((id) => trip.sources.find((source) => source.id === id)).filter(Boolean) as Source[]
  const optionalTitles = (day.guidance.optionalEventIds || []).map((id) => trip.events.find((event) => event.id === id)?.title).filter(Boolean)
  return <details className="day-guidance"><summary><span><Sparkles size={17} /> 今日路线与减负建议</span><StatusBadge status="suggested" /></summary><div><Fact label="顺路走法" value={day.guidance.route} /><Fact label="休息窗口" value={day.guidance.rest} /><Fact label="下雨 / 疲劳 / 晚出门" value={day.guidance.lighter} />{optionalTitles.length > 0 && <Fact label="可选项目" value={optionalTitles.join('、')} />}<SourceBlock sources={sources} /></div></details>
}

function CalendarSheet({ trip, travelerId, selectedDate, actualToday, onSelect, onClose }: { trip: TripData; travelerId: string; selectedDate: string; actualToday: string; onSelect: (date: string) => void; onClose: () => void }) {
  const dates = dateRange(trip.trip.preparationStartDate, trip.trip.endDate)
  const offset = new Date(`${dates[0]}T12:00:00Z`).getUTCDay()
  const cells: Array<string | null> = [...Array.from({ length: offset }, () => null), ...dates]
  while (cells.length % 7) cells.push(null)
  return <Sheet title="完整日历" onClose={onClose}>
    <p className="calendar-range">{formatDate(trip.trip.preparationStartDate)}—{formatDate(trip.trip.endDate)} · 行前与返程连续显示</p>
    <div className="calendar-weekdays">{'日一二三四五六'.split('').map((item) => <span key={item}>周{item}</span>)}</div>
    <div className="calendar-grid">{cells.map((value, index) => {
      if (!value) return <span key={`empty-${index}`} />
      const day = trip.dayPlans.find((item) => item.date === value && item.travelerIds.includes(travelerId))
      const className = [value === selectedDate ? 'selected' : '', value === actualToday ? 'today' : ''].filter(Boolean).join(' ')
      return <button key={value} className={className} onClick={() => onSelect(value)} aria-label={`${formatDate(value, { month: 'long', day: 'numeric' })} ${day?.city || '无安排'}`}><strong>{Number(value.slice(-2))}</strong><small>{day?.city || '—'}</small></button>
    })}</div>
  </Sheet>
}

function StayTonight({ event, trip }: { event: EventItem; trip: TripData }) {
  const place = event.placeId ? trip.places.find((item) => item.id === event.placeId) : undefined
  const booking = event.bookingId ? trip.bookings.find((item) => item.id === event.bookingId) : undefined
  const phone = booking?.fields.find((field) => field.label.includes('电话'))?.value
  if (!place) return null
  return <section className="section"><SectionTitle title="今晚住哪里" icon={MapPin} /><div className="hotel-card"><div><strong>{place.name}</strong><span>{place.address || place.city}</span><StatusBadge status={event.status} /></div><div className="hotel-actions"><a href={place.googleMapsUrl} target="_blank" rel="noreferrer" aria-label={`导航到 ${place.name}`}><Navigation /></a>{phone && <a href={`tel:${phone.replace(/[^+\d]/g, '')}`} aria-label={`联系 ${place.name}`}><Phone /></a>}</div></div></section>
}

function EmptyDay() {
  return <div className="empty-card"><Sparkles /><h3>今天没有排定事项</h3><p>没有为了填满日历而添加通用任务。</p></div>
}

function EventCard({ event, trip, travelerId, previousPlace, eventState, onEventState }: { event: EventItem; trip: TripData; travelerId: string; previousPlace?: Place; eventState?: TaskState; onEventState: (state: TaskState) => void }) {
  const [open, setOpen] = useState(false)
  const Icon = eventIcons[event.kind]
  return <>
    <button className="event-card" onClick={() => setOpen(true)}>
      <div className="event-time">{eventState?.timeOverride || event.startTime || (event.allDay ? '全天' : '—')}<span>{event.endTime ? `–${event.endTime}` : ''}</span></div>
      <div className={`event-icon ${event.kind}`}><Icon size={18} /></div>
      <div className="event-main"><strong>{event.title}</strong>{event.subtitle && <span>{event.subtitle}</span>}<StatusBadge status={event.status} />{eventState?.timeOverride && <small className="user-override">个人调整</small>}{eventState?.complete && <small className="user-override done-label">已完成</small>}{eventState?.ignored && <small className="user-override">已跳过</small>}{eventState?.notApplicable && <small className="user-override">不适用</small>}</div>
      <ChevronRight size={18} />
    </button>
    {open && <EventSheet event={event} trip={trip} travelerId={travelerId} previousPlace={previousPlace} eventState={eventState} onEventState={onEventState} onClose={() => setOpen(false)} />}
  </>
}

function EventSheet({ event, trip, travelerId, previousPlace, eventState, onEventState, onClose }: { event: EventItem; trip: TripData; travelerId: string; previousPlace?: Place; eventState?: TaskState; onEventState: (state: TaskState) => void; onClose: () => void }) {
  const booking = event.bookingId ? trip.bookings.find((item) => item.id === event.bookingId) : undefined
  const place = event.placeId ? trip.places.find((item) => item.id === event.placeId) : undefined
  const sources = event.sourceIds.map((id) => trip.sources.find((source) => source.id === id)).filter(Boolean) as Source[]
  const [copied, setCopied] = useState(false)
  const destination = place ? (place.address || `${place.name}, ${place.city}`) : ''
  const previousDestination = previousPlace ? (previousPlace.address || `${previousPlace.name}, ${previousPlace.city}`) : ''
  const travelMode = ['flight', 'train', 'transfer'].includes(event.kind) ? 'transit' : 'walking'
  const phone = booking?.fields.find((field) => field.label.includes('电话') && !field.sensitive)?.value
  const travelerNames = event.travelerIds.map((id) => trip.travelers.find((traveler) => traveler.id === id)?.displayName).filter(Boolean).join('、')
  const duration = event.kind !== 'flight' && event.startTime && event.endTime ? plannedDuration(event.startTime, event.endTime) : ''
  const copyAddress = async () => {
    if (!destination) return
    try {
      await navigator.clipboard.writeText(destination)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch { prompt('复制地址', destination) }
  }
  return <Sheet onClose={onClose} title={event.title}>
    <div className="sheet-lead"><StatusBadge status={event.status} /><p>{event.detail || event.subtitle}</p></div>
    <div className="fact-grid">
      <Fact label="当地时间" value={`${event.date}${event.startTime ? ` · ${eventState?.timeOverride || event.startTime}${event.endTime ? `–${event.endTime}` : ''}${eventState?.timeOverride ? '（个人调整）' : ''}` : ''}`} />
      <Fact label="时区" value={event.timeZone} />
      <Fact label="适用旅客" value={travelerNames || '未标注'} />
      {duration && <Fact label="计划停留" value={`${duration}（按页面计划时段计算）`} />}
      {place && <Fact label="地点" value={place.address ? `${place.name}\n${place.address}` : place.name} />}
    </div>
    {place && <section className="map-actions" aria-label="地点操作">
      <div className="map-action-grid">
        <a className="button primary" href={place.googleMapsUrl} target="_blank" rel="noreferrer"><MapPin size={16} /> 查看地点</a>
        <a className="button" href={googleMapsDirections(destination, undefined, travelMode)} target="_blank" rel="noreferrer"><Navigation size={16} /> 从当前位置导航</a>
        {previousPlace && previousPlace.id !== place.id && <a className="button" href={googleMapsDirections(destination, previousDestination, travelMode)} target="_blank" rel="noreferrer"><Navigation size={16} /> 从上一站看路线</a>}
        <button className="button" onClick={copyAddress}><Copy size={16} />{copied ? '地址已复制' : '复制地址'}</button>
        {phone && <a className="button" href={`tel:${phone.replace(/[^+\d]/g, '')}`}><Phone size={16} /> 联系地点</a>}
        <a className="button" href={weatherSearch(place.city)} target="_blank" rel="noreferrer"><CloudSun size={16} /> 临近再查天气</a>
      </div>
      <p className="map-disclaimer">下列为地图搜索入口，结果未经核验：</p>
      <div className="nearby-links">{['餐厅', '便利店', '药店', '洗手间'].map((label) => <a key={label} href={googleMapsSearch(`${label} near ${place.name}, ${place.city}`)} target="_blank" rel="noreferrer">附近{label}</a>)}</div>
    </section>}
    {event.actionUrl && (!place || event.actionUrl !== place.googleMapsUrl) && <a className="button wide" href={event.actionUrl} target="_blank" rel="noreferrer">{event.actionLabel || '打开链接'} <ExternalLink size={15} /></a>}
    {booking && <BookingBlock booking={booking} trip={trip} />}
    {event.attachmentIds.length > 0 && <AttachmentGrid attachmentIds={event.attachmentIds} trip={trip} />}
    <EventPersonalState event={event} travelerId={travelerId} eventState={eventState} onEventState={onEventState} />
    <SourceBlock sources={sources} />
  </Sheet>
}

function plannedDuration(start: string, end: string): string {
  const [startHour, startMinute] = start.split(':').map(Number)
  const [endHour, endMinute] = end.split(':').map(Number)
  let minutes = endHour * 60 + endMinute - startHour * 60 - startMinute
  if (minutes < 0) minutes += 24 * 60
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return [hours ? `${hours} 小时` : '', rest ? `${rest} 分钟` : ''].filter(Boolean).join(' ') || '0 分钟'
}

function weatherSearch(city: string): string {
  const url = new URL('https://www.google.com/search')
  url.searchParams.set('q', `${city} weather`)
  return url.toString()
}

function EventPersonalState({ event, travelerId, eventState, onEventState }: { event: EventItem; travelerId: string; eventState?: TaskState; onEventState: (state: TaskState) => void }) {
  type EventChoice = 'todo' | 'complete' | 'skipped' | 'not-applicable'
  const [choice, setChoice] = useState<EventChoice>(eventState?.complete ? 'complete' : eventState?.ignored ? 'skipped' : eventState?.notApplicable ? 'not-applicable' : 'todo')
  const [text, setText] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const loaded = useRef(false)
  const stateId = `event-state-${event.id}`
  useEffect(() => {
    loaded.current = false
    loadNotes().then((notes) => {
      setText(notes.find((item) => item.key === `${travelerId}:event:${event.id}`)?.text || '')
      loaded.current = true
    }).catch(() => setSaveState('error'))
  }, [event.id, travelerId, stateId])
  const setEventChoice = (value: EventChoice) => {
    setChoice(value)
    const state = { ...eventState, key: `${travelerId}:${stateId}`, travelerId, taskId: stateId, complete: value === 'complete', ignored: value === 'skipped', notApplicable: value === 'not-applicable', updatedAt: new Date().toISOString() }
    onEventState(state)
    saveTaskState(state).catch(() => setSaveState('error'))
  }
  const adjustTime = () => {
    const value = prompt('调整个人建议时间（HH:MM）', eventState?.timeOverride || event.startTime || '')?.trim()
    if (value === undefined) return
    if (value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) { alert('请输入 00:00–23:59 格式'); return }
    const state = { ...eventState, key: `${travelerId}:${stateId}`, travelerId, taskId: stateId, complete: eventState?.complete || false, ignored: eventState?.ignored || false, notApplicable: eventState?.notApplicable || false, timeOverride: value || undefined, updatedAt: new Date().toISOString() }
    onEventState(state)
    saveTaskState(state).catch(() => setSaveState('error'))
  }
  useEffect(() => {
    if (!loaded.current) return
    setSaveState('saving')
    const timer = window.setTimeout(() => saveNote({ key: `${travelerId}:event:${event.id}`, travelerId, dayPlanId: event.dayPlanId, text, updatedAt: new Date().toISOString() }).then(() => setSaveState('saved')).catch(() => setSaveState('error')), 500)
    return () => clearTimeout(timer)
  }, [text, event.id, event.dayPlanId, travelerId])
  return <section className="detail-section event-personal"><h3>我的状态与备注</h3><div className="choice-row"><button className={choice === 'todo' ? 'active' : ''} onClick={() => setEventChoice('todo')}>待处理</button><button className={choice === 'complete' ? 'active' : ''} onClick={() => setEventChoice('complete')}>已完成</button><button className={choice === 'skipped' ? 'active' : ''} onClick={() => setEventChoice('skipped')}>已跳过</button><button className={choice === 'not-applicable' ? 'active' : ''} onClick={() => setEventChoice('not-applicable')}>不适用</button></div>{event.status === 'suggested' && <button className="button wide adjust-time" onClick={adjustTime}>调整我的建议时间{eventState?.timeOverride ? ` · ${eventState.timeOverride}` : ''}</button>}<textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="这个事件的个人备注…"/><small className={`save-state ${saveState}`}>{saveState === 'saving' ? '正在保存…' : saveState === 'saved' ? '已保存到本机' : saveState === 'error' ? '保存失败' : '保存在本机浏览器'}</small></section>
}

function BookingBlock({ booking, trip }: { booking: Booking; trip: TripData }) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const proof = booking.attachmentIds.length > 0 ? `已附 ${booking.attachmentIds.length} 份原始票据/预订单` : ['pending', 'conflict'].includes(booking.status) ? '尚缺票据或仍需核对' : '已有原文记录，未附票据文件'
  return <section className="detail-section"><h3>{booking.kind === 'hotel' ? '住宿预订' : booking.kind === 'ticket' ? '门票状态' : '交通票据'}</h3><p className="booking-proof"><StatusBadge status={booking.status} /> {proof}</p><div className="booking-fields">{booking.fields.map((field, index) => {
    const hidden = field.sensitive && !revealed.has(index)
    return <div key={`${field.label}-${index}`} className={field.conflict ? 'field-conflict' : ''}><span>{field.label}{field.conflict && ' · 有冲突'}</span><strong>{hidden ? '••••••••' : field.value}</strong>{field.sensitive && <button onClick={() => setRevealed((current) => { const next = new Set(current); hidden ? next.add(index) : next.delete(index); return next })}>{hidden ? '显示' : '隐藏'}</button>}</div>
  })}</div>{booking.attachmentIds.length > 0 && <AttachmentGrid attachmentIds={booking.attachmentIds} trip={trip} />}</section>
}

function AttachmentGrid({ attachmentIds, trip }: { attachmentIds: string[]; trip: TripData }) {
  const [viewer, setViewer] = useState<{ meta: AttachmentMeta; url: string } | null>(null)
  const open = async (meta: AttachmentMeta) => {
    try {
      const blob = await loadAttachment(meta.id)
      if (!blob) throw new Error('本机没有找到这张附件，请重新导入行程包。')
      setViewer({ meta, url: URL.createObjectURL(blob) })
    } catch (error) { alert(error instanceof Error ? error.message : '无法打开附件') }
  }
  const close = () => { if (viewer) URL.revokeObjectURL(viewer.url); setViewer(null) }
  const metas = attachmentIds.map((id) => trip.attachments.find((item) => item.id === id)).filter(Boolean) as AttachmentMeta[]
  return <><div className="attachment-grid">{metas.map((meta) => <button key={meta.id} onClick={() => open(meta)}><AttachmentThumbnail meta={meta} /><span>{meta.name}</span><small>{meta.sensitive ? '敏感附件 · 本机原图' : '本机原图'}</small></button>)}</div>{viewer && <div className="image-viewer" role="dialog" aria-modal="true" aria-label={`查看 ${viewer.meta.name}`}><div className="viewer-bar"><span><ZoomIn size={17} /> 原图 · 双指或滚轮可放大</span><button onClick={close} aria-label="关闭票据"><X /></button></div><div className="image-scroll"><img src={viewer.url} alt={viewer.meta.name} /></div></div>}</>
}

function AttachmentThumbnail({ meta }: { meta: AttachmentMeta }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!meta.mimeType.startsWith('image/')) return
    let objectUrl = ''
    let cancelled = false
    loadAttachment(meta.id).then((blob) => {
      if (!blob || cancelled) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    }).catch(() => undefined)
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [meta.id, meta.mimeType])
  return <span className="attachment-thumb">{url ? <img src={url} alt="" loading="lazy" /> : <FileLock2 />}{meta.sensitive && <i aria-label="敏感附件"><LockKeyhole size={12} /></i>}</span>
}

function TaskList({ travelerId, day, tasks, setNotice }: { travelerId: string; day: DayPlan; tasks: TripData['dailyTasks']; setNotice: (value: string | null) => void }) {
  const [states, setStates] = useState<Record<string, TaskState>>({})
  const [expanded, setExpanded] = useState(false)
  useEffect(() => { loadTaskStates().then((items) => setStates(Object.fromEntries(items.filter((item) => item.travelerId === travelerId).map((item) => [item.taskId, item])))).catch(() => setNotice('任务状态读取失败。')) }, [travelerId, day.id, setNotice])
  useEffect(() => setExpanded(false), [day.id])
  const customTasks = Object.values(states).filter((state) => state.custom && state.dayPlanId === day.id && !state.deleted).map((state) => ({ id: state.taskId, dayPlanId: day.id, date: day.date, title: state.titleOverride || '自定义任务', detail: undefined, dueTime: undefined, travelerIds: [travelerId], status: 'suggested' as const, timing: 'today' as const, sourceIds: [] }))
  const visibleTasks = [...tasks, ...customTasks]
  const renderedTasks = expanded ? visibleTasks : visibleTasks.slice(0, 3)
  const persist = (state: TaskState) => {
    setStates((current) => ({ ...current, [state.taskId]: state }))
    saveTaskState(state).catch(() => setNotice('任务修改未能保存，请检查浏览器存储空间。'))
  }
  const toggle = (taskId: string) => {
    const current = states[taskId]
    persist({ ...current, key: `${travelerId}:${taskId}`, travelerId, taskId, complete: !current?.complete, ignored: false, updatedAt: new Date().toISOString() })
  }
  const edit = (taskId: string, currentTitle: string) => {
    const title = prompt('修改任务', currentTitle)?.trim()
    if (!title || title === currentTitle) return
    const current = states[taskId]
    persist({ ...current, key: `${travelerId}:${taskId}`, travelerId, taskId, complete: current?.complete || false, titleOverride: title, updatedAt: new Date().toISOString() })
  }
  const ignore = (taskId: string) => {
    const current = states[taskId]
    persist({ ...current, key: `${travelerId}:${taskId}`, travelerId, taskId, complete: false, ignored: !current?.ignored, updatedAt: new Date().toISOString() })
  }
  const add = () => {
    const title = prompt('新增今天的任务')?.trim()
    if (!title) return
    const taskId = `custom-${crypto.randomUUID().toLowerCase()}`
    persist({ key: `${travelerId}:${taskId}`, travelerId, taskId, complete: false, custom: true, date: day.date, dayPlanId: day.id, titleOverride: title, updatedAt: new Date().toISOString() })
  }
  const remove = (taskId: string) => {
    const current = states[taskId]
    if (!confirm('删除这条自定义任务？')) return
    persist({ ...current, key: `${travelerId}:${taskId}`, travelerId, taskId, complete: false, deleted: true, updatedAt: new Date().toISOString() })
  }
  return <section className="section"><div className="section-title"><h3>今天要确认</h3><button className="add-task" onClick={add}>＋ 新增</button></div>{visibleTasks.length === 0 ? <p className="nothing-required">今天没有必须处理的事项。</p> : <><div className="task-list">{renderedTasks.map((task) => {
    const state = states[task.id]
    const title = state?.titleOverride || task.title
    return <div key={task.id} className={`${state?.complete ? 'done' : ''} ${state?.ignored ? 'ignored' : ''}`}><button className="task-toggle" onClick={() => toggle(task.id)}><span className="check">{state?.complete && <Check size={16} />}</span><span><span className="task-meta">{task.timing === 'advance' ? '提前准备' : '当天处理'} · {statusMeta[task.status].label}</span><strong>{title}</strong>{task.detail && <small>{task.detail}</small>}</span>{task.dueTime && <time>{task.dueTime}</time>}</button><div className="task-actions"><button onClick={() => edit(task.id, title)}>编辑</button>{state?.custom ? <button onClick={() => remove(task.id)}>删除</button> : <button onClick={() => ignore(task.id)}>{state?.ignored ? '恢复' : '忽略'}</button>}</div></div>
  })}</div>{visibleTasks.length > 3 && <button className="task-expand" onClick={() => setExpanded((value) => !value)}>{expanded ? '收起任务' : `展开其余 ${visibleTasks.length - 3} 项`}</button>}</>}</section>
}

function DayNote({ day, travelerId, setNotice }: { day: DayPlan; travelerId: string; setNotice: (value: string | null) => void }) {
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const loaded = useRef(false)
  useEffect(() => { loaded.current = false; loadNotes().then((notes) => { setText(notes.find((item) => item.key === `${travelerId}:${day.id}`)?.text || ''); setState('idle'); loaded.current = true }).catch(() => { setState('error'); setNotice('笔记读取失败。') }) }, [day.id, travelerId, setNotice])
  useEffect(() => {
    if (!loaded.current) return
    setState('saving')
    const timer = window.setTimeout(() => {
      const note: NoteState = { key: `${travelerId}:${day.id}`, travelerId, dayPlanId: day.id, text, updatedAt: new Date().toISOString() }
      saveNote(note).then(() => setState('saved')).catch(() => { setState('error'); setNotice('笔记未能保存，请先复制内容避免丢失。') })
    }, 500)
    return () => clearTimeout(timer)
  }, [text, day.id, travelerId, setNotice])
  return <section className="section note-section"><SectionTitle title="我的当天笔记" icon={NotebookPen} /><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="集合点、临时想法、花费……只保存在这台设备" /><small className={`save-state ${state}`}>{state === 'saving' ? '正在保存…' : state === 'saved' ? '已保存到本机' : state === 'error' ? '保存失败' : '保存在本机浏览器'}</small></section>
}

function ScheduleView({ trip, travelerId, actualToday, onOpenDay }: { trip: TripData; travelerId: string; actualToday: string; onOpenDay: (date: string) => void }) {
  const days = trip.dayPlans.filter((day) => day.travelerIds.includes(travelerId))
  return <div className="page"><PageHeading eyebrow={`${trip.trip.preparationStartDate} — ${trip.trip.endDate}`} title="全部日程" description="行前、旅途与每个人的返程都在同一条时间线上。" /><div className="schedule-list">{days.map((day) => {
    const eventCount = day.eventIds.filter((id) => trip.events.find((event) => event.id === id)?.travelerIds.includes(travelerId)).length
    const delta = daysBetween(actualToday, day.date)
    const relative = delta === 0 ? '今天' : delta > 0 ? `还有 ${delta} 天` : `已过去 ${Math.abs(delta)} 天`
    const phase = day.date < trip.trip.startDate ? '出发前准备' : `旅行 Day ${daysBetween(trip.trip.startDate, day.date) + 1}`
    return <button key={day.id} className={delta === 0 ? 'today' : ''} onClick={() => onOpenDay(day.date)}><time><strong>{Number(day.date.slice(-2))}</strong><span>{formatDate(day.date, { month: 'short', weekday: 'short' })}</span></time><div><p>{phase} · {day.city} · {relative}</p><strong>{day.title}</strong><span>{day.subtitle || `${eventCount} 项安排`}</span></div><ChevronRight /></button>
  })}</div></div>
}

function GuidesView({ trip }: { trip: TripData }) {
  const [selected, setSelected] = useState<GuideArticle | null>(null)
  const [query, setQuery] = useState('')
  const categories = [
    { id: 'safety', label: '安全防盗', icon: ShieldCheck }, { id: 'language', label: '常用西语', icon: Languages },
    { id: 'transport', label: '交通', icon: TrainFront }, { id: 'venue', label: '场馆', icon: Sparkles },
    { id: 'emergency', label: '紧急信息', icon: CircleAlert }, { id: 'source', label: '原文页', icon: FileText },
  ] as const
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  const matches = (guide: GuideArticle) => {
    if (!normalizedQuery) return true
    const place = guide.placeId ? trip.places.find((item) => item.id === guide.placeId) : undefined
    const sourceTitles = guide.sourceIds.map((id) => trip.sources.find((item) => item.id === id)?.title || '')
    return [guide.title, guide.summary, ...guide.body, place?.name || '', place?.city || '', ...sourceTitles].join('\n').toLocaleLowerCase('zh-CN').includes(normalizedQuery)
  }
  const resultCount = trip.guides.filter(matches).length
  return <div className="page"><PageHeading eyebrow="原文资料 + 官网核验" title="资料攻略" description="每条攻略都能追溯来源；建议不会冒充已经确认的事实。" /><label className="guide-search"><Search size={17} /><input aria-label="搜索攻略" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜地点、交通、注意事项或来源" /></label>{normalizedQuery && <p className="search-count">找到 {resultCount} 条</p>}<div className="guide-groups">{categories.map((category) => {
    const articles = trip.guides.filter((guide) => guide.category === category.id && matches(guide))
    if (!articles.length) return null
    const Icon = category.icon
    return <section key={category.id}><h3><Icon size={18} />{category.label}</h3><div>{articles.map((guide) => <button key={guide.id} onClick={() => setSelected(guide)}><span><strong>{guide.title}</strong><small>{guide.summary}</small></span><ChevronRight /></button>)}</div></section>
  })}{normalizedQuery && resultCount === 0 && <p className="nothing-required">没有匹配的攻略或来源。</p>}</div>{selected && <GuideSheet guide={selected} trip={trip} onClose={() => setSelected(null)} />}</div>
}

function GuideSheet({ guide, trip, onClose }: { guide: GuideArticle; trip: TripData; onClose: () => void }) {
  const sources = guide.sourceIds.map((id) => trip.sources.find((source) => source.id === id)).filter(Boolean) as Source[]
  const place = guide.placeId ? trip.places.find((item) => item.id === guide.placeId) : undefined
  return <Sheet title={guide.title} onClose={onClose}><p className="guide-summary">{guide.summary}</p><div className="guide-body">{guide.body.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>{place && <a className="button primary wide" href={place.googleMapsUrl} target="_blank" rel="noreferrer"><Navigation size={17} /> 在 Google 地图打开</a>}{guide.attachmentIds && guide.attachmentIds.length > 0 && <AttachmentGrid attachmentIds={guide.attachmentIds} trip={trip} />}<SourceBlock sources={sources} /></Sheet>
}

function MeView({ trip, travelerId, online, referenceTimeZone, onReferenceTimeZone, onImported, onDeleted, setNotice }: { trip: TripData; travelerId: string; online: boolean; referenceTimeZone: string; onReferenceTimeZone: (value: string) => void; onImported: (data: TripData) => void | Promise<void>; onDeleted: () => void; setNotice: (value: string | null) => void }) {
  const [estimate, setEstimate] = useState<{ usage?: number; quota?: number }>({})
  const [backingUp, setBackingUp] = useState(false)
  const [offlineStatus, setOfflineStatus] = useState('尚未检查')
  const [lastBackupAt, setLastBackupAt] = useState('')
  const checkOffline = async () => {
    const stored = new Set(await storedAttachmentIds())
    const missing = trip.attachments.filter((item) => !stored.has(item.id))
    const shellReady = !import.meta.env.PROD || ('serviceWorker' in navigator && await Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), 3000))]))
    setOfflineStatus(missing.length ? `缺少 ${missing.length} 个附件，请重新导入` : shellReady ? `完整：程序与 ${trip.attachments.length} 个附件已存本机` : '附件完整，但程序离线缓存尚未完成')
  }
  useEffect(() => { storageEstimate().then(setEstimate); getSetting<string>('lastBackupAt').then((value) => setLastBackupAt(value || '')); checkOffline().catch(() => setOfflineStatus('检查失败')) }, [trip.packageId])
  const selectedTraveler = trip.travelers.find((item) => item.id === travelerId)
  const backup = async () => {
    setBackingUp(true)
    try {
      const [taskStates, notes, settings] = await Promise.all([loadTaskStates(), loadNotes(), loadSettings()])
      const attachments = new Map<string, Blob>()
      for (const meta of trip.attachments) { const blob = await loadAttachment(meta.id); if (blob) attachments.set(meta.id, blob) }
      const blob = await createLocalPackage(trip, attachments, { taskStates, notes, settings })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `SpainDaily-personal-backup-${new Date().toISOString().slice(0, 10)}.spaintrip`; anchor.click()
      URL.revokeObjectURL(url)
      const backedUpAt = new Date().toISOString()
      await setSetting('lastBackupAt', backedUpAt)
      setLastBackupAt(backedUpAt); setNotice('个人备份已下载，文件未加密，请妥善保管。')
    } catch (error) { setNotice(error instanceof Error ? error.message : '备份失败') } finally { setBackingUp(false) }
  }
  const remove = async () => {
    if (!confirm('确定删除这台设备上的行程、票据、任务状态和笔记吗？此操作无法撤销。')) return
    try { await clearPrivateData(); onDeleted() } catch { setNotice('删除失败，请关闭其他打开的 SpainDaily 页面后重试。') }
  }
  return <div className="page"><PageHeading eyebrow="本机设置" title="我的" description={`${selectedTraveler?.displayName || '个人'}的行程`} />
    <section className="settings-card status-card"><div className={online ? 'online-dot' : 'offline-dot'}>{online ? <Wifi /> : <WifiOff />}</div><div><strong>{online ? '网络已连接' : '当前离线'}</strong><p>{offlineStatus}</p><button className="text-action" onClick={() => checkOffline().catch(() => setOfflineStatus('检查失败'))}>重新检查离线资料</button></div></section>
    <section className="settings-card"><h3><FileText /> 更换个人行程</h3><p>资料在本机校验后保存；备注和待办状态保留在这台设备。</p><PackageImporter onImported={onImported} setNotice={setNotice} compact existingTrip={trip} /></section>
    <section className="settings-card"><h3><Download /> 本机备份</h3><p>导出行程、附件、待办和备注。备份文件未加密，请妥善保管。{lastBackupAt && <><br />最近备份：{new Date(lastBackupAt).toLocaleString('zh-CN')}</>}</p><button className="button primary wide" disabled={backingUp} onClick={backup}>{backingUp ? '正在生成…' : '下载本机备份'}</button></section>
    <section className="settings-card"><h3><Globe2 /> 本机与时区</h3><label className="select-label">“今天”的参考时区<select value={referenceTimeZone} onChange={(event) => onReferenceTimeZone(event.target.value)}>{Array.from(new Set([Intl.DateTimeFormat().resolvedOptions().timeZone, trip.trip.defaultTimeZone, ...trip.dayPlans.map((day) => day.timeZone)])).map((zone) => <option key={zone} value={zone}>{zone}{zone === Intl.DateTimeFormat().resolvedOptions().timeZone ? ' · 本机' : ''}</option>)}</select></label><Fact label="本机占用" value={estimate.usage ? `${(estimate.usage / 1024 / 1024).toFixed(1)} MB` : '浏览器未提供'} /><p className="microcopy">事件仍按各自所在地 IANA 时区显示。行前默认本机时区；到达后可切成目的地时区。测试日期开关只在开发构建出现。</p></section>
    <section className="settings-card"><h3><LockKeyhole /> 本机隐私</h3><p>行程和个人修改以未加密形式保存在此浏览器中。请使用自己的手机，并避免把浏览器资料共享给他人。</p></section>
    <section className="settings-card danger-zone"><h3><Trash2 /> 删除本机数据</h3><p>不会影响源文件或其他设备，但本机笔记会一并删除。</p><button className="button danger wide" onClick={remove}>删除这台设备上的行程</button></section>
    <footer className="app-footer">SpainDaily · schema v{trip.schemaVersion}<br />公开外壳不含真实行程数据</footer>
  </div>
}

function PackageImporter({ onImported, setNotice, compact, existingTrip }: { onImported: (data: TripData) => void | Promise<void>; setNotice: (value: string | null) => void; compact: boolean; existingTrip?: TripData }) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const submit = async () => {
    if (!file) return
    setBusy(true); setNotice(null)
    try {
      const pkg = await importLocalPackage(file)
      if (existingTrip && pkg.kind === 'trip') {
        const changes = taskChangeSummary(existingTrip, pkg.data)
        if (changes && !confirm(`${changes}\n\n继续更换行程包吗？`)) return
      }
      const backupState = pkg.kind === 'backup' ? (pkg.backupState || { taskStates: [], notes: [], settings: {} }) : undefined
      await importPackageAtomically({ data: pkg.data, attachments: pkg.attachments, persistLocally: true, ...(backupState || {}) })
      await onImported(pkg.data)
    } catch (error) { setNotice(error instanceof Error ? error.message : '行程包导入失败') } finally { setBusy(false) }
  }
  return <div className={`importer ${compact ? 'compact' : ''}`}><input ref={inputRef} type="file" accept=".spaintrip,application/zip,application/octet-stream" onChange={(event) => setFile(event.target.files?.[0] || null)} hidden />
    <button className={`button ${compact ? '' : 'primary'} wide`} disabled={busy} onClick={() => file ? submit() : inputRef.current?.click()}><FileText size={18} />{busy ? '正在导入到本机…' : file ? '导入并打开' : '选择个人行程文件'}</button>
    {file && !busy && <button className="text-action" onClick={() => setFile(null)}>重新选择文件</button>}
  </div>
}

function SourceBlock({ sources }: { sources: Source[] }) {
  if (!sources.length) return null
  return <section className="detail-section source-block"><h3>信息来源</h3>{sources.map((source) => <div key={source.id}><span>{source.type === 'official' ? '官网' : source.type === 'document' ? '原文' : source.type === 'inference' ? '推定' : '用户'}</span><p><strong>{source.title}</strong>{source.location && <small>{source.location}</small>}{source.note && <small>{source.note}</small>}</p>{source.url && <a href={source.url} target="_blank" rel="noreferrer" aria-label={`打开 ${source.title}`}><ExternalLink size={16} /></a>}</div>)}</section>
}

function DevClock({ trip, onDate }: { trip: TripData; onDate: (date: string) => void }) {
  return <details className="dev-clock"><summary>开发测试：模拟日期</summary><input type="date" min={trip.trip.preparationStartDate} max={trip.trip.endDate} onChange={(event) => event.target.value && onDate(event.target.value)} /></details>
}

function StatusBadge({ status }: { status: FactStatus }) { const meta = statusMeta[status]; return <small className={`status-badge ${meta.className}`}>{meta.label}</small> }
function Fact({ label, value }: { label: string; value: string }) { return <div className="fact"><span>{label}</span><strong>{value}</strong></div> }
function SectionTitle({ title, count, icon: Icon }: { title: string; count?: number; icon?: typeof NotebookPen }) { return <div className="section-title"><h3>{Icon && <Icon size={18} />}{title}</h3>{typeof count === 'number' && <span>{count}</span>}</div> }
function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <header className="page-heading"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{description}</p></header> }
function Sheet({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) { return <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}><article className="sheet" role="dialog" aria-modal="true" aria-label={title}><div className="sheet-handle" /><header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭"><X /></button></header>{children}</article></div> }
function NavButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Clock3; label: string; onClick: () => void }) { return <button className={active ? 'active' : ''} onClick={onClick}><Icon /><span>{label}</span></button> }
function Notice({ message, onClose }: { message: string; onClose: () => void }) { return <div className="notice" role="status"><CircleAlert size={18} /><span>{message}</span><button onClick={onClose}><X size={17} /></button></div> }

export default App
