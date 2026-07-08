import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Calendar as CalendarIcon,
  User, X, Pencil, Repeat, Search, List, Grid3x3, ChevronDown,
  Clock, Info, CalendarDays
} from 'lucide-react';

const COLORS = ['#6366f1', '#a855f7', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#f97316'];

const emptyForm = { title: '', start: '12:00', end: '', description: '', color: COLORS[0], recType: '', recDays: [], recWeek2Days: [], recDuration: '' };
const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const recLabel = (r) => {
  if (!r) return '';
  if (r.type === 'weekly') return r.week2Days ? '1 sem./2' : 'Chaque sem.';
  if (r.type === 'monthly') return 'Tous les mois';
  if (r.type === 'yearly') return 'Tous les ans';
  return '';
};

function getWeekNumber(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const dayNum = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayNum + 3);
  const firstThursday = d.valueOf();
  d.setMonth(0, 1);
  if (d.getDay() !== 4) {
    d.setMonth(0, 1 + ((4 - d.getDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - d) / 604800000);
}

export default function CalendarView({ calendar, username, apiBaseUrl, onAddEvent, onUpdateEvent, onDeleteEvent, addTrigger, goToDate }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    if (goToDate) {
      setSelectedDate(goToDate);
      const d = new Date(goToDate + 'T12:00:00');
      setCurrentDate(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }, [goToDate]);
  const [viewMode, setViewMode] = useState('month');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [detailEvent, setDetailEvent] = useState(null);
  const [swipingId, setSwipingId] = useState(null);
  const [swipeX, setSwipeX] = useState(0);

  const activeYear = currentDate.getFullYear();
  const activeMonth = currentDate.getMonth();

  const prevMonth = useCallback(() => setCurrentDate(new Date(activeYear, activeMonth - 1, 1)), [activeYear, activeMonth]);
  const nextMonth = useCallback(() => setCurrentDate(new Date(activeYear, activeMonth + 1, 1)), [activeYear, activeMonth]);
  const goToday = useCallback(() => { setCurrentDate(new Date()); setSelectedDate(todayStr); }, [todayStr]);

  const getDaysInMonth = useCallback(() => {
    const days = [];
    const firstDayIndex = new Date(activeYear, activeMonth, 1).getDay();
    const adjustedFirstDay = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
    const numDays = new Date(activeYear, activeMonth + 1, 0).getDate();
    const prevNumDays = new Date(activeYear, activeMonth, 0).getDate();
    for (let i = adjustedFirstDay - 1; i >= 0; i--) days.push({ dayNum: prevNumDays - i, dateString: '', isCurrentMonth: false, date: null });
    for (let d = 1; d <= numDays; d++) {
      const dateString = `${activeYear}-${String(activeMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ dayNum: d, dateString, isCurrentMonth: true, date: new Date(activeYear, activeMonth, d) });
    }
    for (let i = 1; days.length < 42; i++) days.push({ dayNum: i, dateString: '', isCurrentMonth: false, date: null });
    return days;
  }, [activeYear, activeMonth]);

  const calendarDays = useMemo(getDaysInMonth, [getDaysInMonth]);
  const events = useMemo(() => calendar.events || [], [calendar.events]);

  const weekNumbers = useMemo(() => {
    const nums = [];
    let lastWk = 0;
    for (const day of calendarDays) {
      if (!day.dateString) { nums.push(null); continue; }
      const wk = getWeekNumber(day.dateString);
      nums.push(wk !== lastWk ? wk : null);
      lastWk = wk;
    }
    return nums;
  }, [calendarDays]);

const matchesRecurrence = useCallback((event, dateStr) => {
    if (!event.recurrence) return false;
    const rec = event.recurrence;
    const targetDate = new Date(dateStr + 'T12:00:00');
    const eventDate = new Date(event.date + 'T12:00:00');
    if (targetDate < eventDate) return false;
    if (rec.endDate && dateStr > rec.endDate) return false;
    switch (rec.type) {
      case 'weekly': {
        const dow = targetDate.getDay() || 7;
        const isBiweekly = 'week2Days' in rec;
        if (isBiweekly) {
          const targetWeek = getWeekNumber(dateStr);
          const anchorWeek = getWeekNumber(rec._anchorDate || event.date);
          const inEvenWeek = ((targetWeek - anchorWeek) % 2 + 2) % 2 === 0;
          if (inEvenWeek) {
            return rec.days && rec.days.length > 0 ? rec.days.includes(dow) : false;
          } else {
            return rec.week2Days && rec.week2Days.length > 0 ? rec.week2Days.includes(dow) : false;
          }
        }
        return rec.days?.includes(dow);
      }
      case 'monthly': return targetDate.getDate() === eventDate.getDate();
      case 'yearly': return targetDate.getMonth() === eventDate.getMonth() && targetDate.getDate() === eventDate.getDate();
      default: return false;
    }
  }, []);

  const eventOnDate = useCallback((event, dateStr) => event.date === dateStr || matchesRecurrence(event, dateStr), [matchesRecurrence]);

  const selectedDayEvents = useMemo(
    () => events.filter(e => eventOnDate(e, selectedDate)).sort((a, b) => a.start.localeCompare(b.start)),
    [events, selectedDate, eventOnDate]
  );

  const getEventDotsForDate = useCallback((dateStr) => {
    if (!dateStr) return [];
    const colors = [];
    for (const e of events) {
      if (eventOnDate(e, dateStr)) colors.push(e.color);
    }
    return Array.from(new Set(colors)).slice(0, 4);
  }, [events, eventOnDate]);

  const getEventsForDate = useCallback((dateStr) => {
    if (!dateStr) return [];
    return events.filter(e => eventOnDate(e, dateStr)).sort((a, b) => a.start.localeCompare(b.start));
  }, [events, eventOnDate]);

  const weekDays = useMemo(() => {
    const startOfWeek = new Date(selectedDate + 'T12:00:00');
    const day = startOfWeek.getDay() || 7;
    startOfWeek.setDate(startOfWeek.getDate() - (day - 1));
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      days.push({ date: d, dateStr, isToday: dateStr === todayStr, isSelected: dateStr === selectedDate, events: getEventsForDate(dateStr) });
    }
    return days;
  }, [selectedDate, todayStr, getEventsForDate]);

  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) return selectedDayEvents;
    const q = searchQuery.toLowerCase();
    return selectedDayEvents.filter(e =>
      e.title.toLowerCase().includes(q) || (e.description && e.description.toLowerCase().includes(q))
    );
  }, [selectedDayEvents, searchQuery]);

  const yearRange = useMemo(() => {
    const y = activeYear;
    return Array.from({ length: 9 }, (_, i) => y - 4 + i);
  }, [activeYear]);

  const openAddSheet = useCallback(() => {
    setEditingEvent(null);
    setForm({ ...emptyForm });
    setIsSheetOpen(true);
  }, []);

  useEffect(() => {
    if (addTrigger > 0) openAddSheet();
  }, [addTrigger, openAddSheet]);

  const openEditSheet = useCallback((ev) => {
    setEditingEvent(ev);
    setForm({
      title: ev.title, start: ev.start, end: ev.end || '', description: ev.description || '', color: ev.color || COLORS[0],
      recType: ev.recurrence?.week2Days ? 'biweekly' : (ev.recurrence?.type || ''),
      recDays: ev.recurrence?.days || [],
      recWeek2Days: ev.recurrence?.week2Days || [],
      recDuration: ev.recurrence?.duration || '',
    });
    setIsSheetOpen(true);
    setDetailEvent(null);
  }, []);

  const closeSheet = useCallback(() => setIsSheetOpen(false), []);

  const submitEvent = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !selectedDate || !form.start) return;
    if (form.end && form.start >= form.end) { alert("L'heure de fin doit être après l'heure de début."); return; }
    setLoading(true);
    try {
      let recurrence = null;
      if (form.recType) {
        if (form.recType === 'weekly' || form.recType === 'biweekly') {
          const hasWeekA = form.recDays.length > 0;
          const hasWeekB = form.recWeek2Days.length > 0;
          if (form.recType === 'biweekly' && !hasWeekA && hasWeekB) {
            recurrence = { type: 'weekly', days: [], week2Days: [...form.recWeek2Days], _anchorDate: selectedDate };
          } else if (hasWeekA || hasWeekB) {
            recurrence = { type: 'weekly', days: [...form.recDays] };
            if (form.recType === 'biweekly') {
              recurrence.week2Days = [...form.recWeek2Days];
              recurrence._anchorDate = selectedDate;
            }
          } else {
            recurrence = { type: 'weekly', days: [new Date(selectedDate + 'T12:00:00').getDay() || 7] };
          }
        } else {
          recurrence = { type: form.recType };
        }
        if (recurrence && form.recDuration) {
          const d = new Date(selectedDate + 'T12:00:00');
          d.setMonth(d.getMonth() + parseInt(form.recDuration));
          recurrence.endDate = d.toISOString().slice(0, 10);
          recurrence.duration = form.recDuration;
        }
      }
      const payload = {
        title: form.title.trim(), date: selectedDate, start: form.start,
        end: form.end, description: form.description.trim(), creator: username,
        color: form.color, recurrence
      };
      if (editingEvent) {
        const res = await fetch(`${apiBaseUrl}/api/calendar/${calendar.code}/event/${editingEvent.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: payload })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erreur de modification");
        onUpdateEvent(data);
      } else {
        const res = await fetch(`${apiBaseUrl}/api/calendar/${calendar.code}/event`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: payload })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erreur d'enregistrement");
        onAddEvent(data);
      }
      setForm({ ...emptyForm });
      setEditingEvent(null);
      setIsSheetOpen(false);
    } catch (err) {
      alert("Erreur: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteRef = useRef(null);
  deleteRef.current = (eventId) => {
    const ev = events.find(e => e.id === eventId);
    const msg = ev?.recurrence ? "Supprimer cet événement récurrent ?" : "Annuler cet événement ?";
    if (!window.confirm(msg)) return;
    setDeleting(eventId);
    (async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/calendar/${calendar.code}/event/${eventId}?username=${encodeURIComponent(username)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error("Erreur de suppression");
        setTimeout(() => { onDeleteEvent(eventId); setDetailEvent(null); }, 200);
      } catch (err) {
        alert("Erreur: " + err.message);
        setDeleting(null);
      }
    })();
  };

  const [yearPickerOpen, setYearPickerOpen] = useState(false);

  const swipeState = useRef({ startX: 0, id: null });

  const handleSwipeStart = (clientX, id) => {
    swipeState.current = { startX: clientX, id };
  };

  const handleSwipeMove = (clientX, id) => {
    const state = swipeState.current;
    if (state.id !== id) return;
    const diff = clientX - state.startX;
    if (diff < 0) { setSwipingId(id); setSwipeX(Math.max(diff, -80)); }
  };

  const handleSwipeEnd = () => {
    if (swipeX <= -50 && swipingId) { deleteRef.current(swipingId); }
    setSwipingId(null); setSwipeX(0);
  };

  const handleTouchStart = (e, id) => handleSwipeStart(e.touches[0].clientX, id);
  const handleTouchMove = (e, id) => handleSwipeMove(e.touches[0].clientX, id);
  const handleTouchEnd = handleSwipeEnd;
  const handleMouseDown = (e, id) => { e.preventDefault(); handleSwipeStart(e.clientX, id); };
  const handleMouseMove = (e, id) => { if (swipeState.current.id) handleSwipeMove(e.clientX, id); };
  const handleMouseUp = handleSwipeEnd;
  const handleMouseLeave = handleSwipeEnd;

  return (
    <div className="calendar-view-container">
      <div className="month-selector">
        <button type="button" className="icon-btn" onClick={prevMonth} aria-label="Mois précédent"><ChevronLeft size={20} /></button>
        <div className="month-title-group" style={{ position: 'relative', cursor: 'pointer', userSelect: 'none' }} onClick={() => setYearPickerOpen(p => !p)}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            {monthNames[activeMonth]} {activeYear} <ChevronDown size={14} style={{ opacity: 0.5 }} />
          </h3>
          {yearPickerOpen && (
            <div className="year-picker-dropdown">
              <div className="year-picker-grid">
                {yearRange.map(y => (
                  <button key={y} type="button" className={`year-picker-btn ${y === activeYear ? 'active' : ''}`}
                    onClick={() => { setCurrentDate(new Date(y, activeMonth, 1)); setYearPickerOpen(false); }}>{y}</button>
                ))}
              </div>
              <div className="month-picker-grid">
                {monthNames.map((m, i) => (
                  <button key={m} type="button" className={`year-picker-btn month-btn ${i === activeMonth ? 'active' : ''}`}
                    onClick={() => { setCurrentDate(new Date(activeYear, i, 1)); setYearPickerOpen(false); }}>{m.slice(0, 3)}</button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button type="button" className="icon-btn today-btn" onClick={goToday} aria-label="Aujourd'hui">Auj.</button>
          <button type="button" className="icon-btn" onClick={nextMonth} aria-label="Mois suivant"><ChevronRight size={20} /></button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.75rem' }}>
        <button type="button" onClick={() => setCurrentDate(new Date(activeYear, activeMonth - 1, 1))} className="icon-btn" style={{ fontSize: '0.7rem' }}>{monthNames[(activeMonth + 11) % 12].slice(0, 3)}</button>
        {['month', 'week', 'day'].map(m => (
          <button key={m} type="button"
            className={`day-toggle ${viewMode === m ? 'active' : ''}`}
            onClick={() => setViewMode(m)}
            style={{ flex: 1 }}
          >
            {m === 'month' ? <Grid3x3 size={14} /> : m === 'week' ? <List size={14} /> : <Clock size={14} />}
            <span style={{ marginLeft: '0.25rem' }}>{m === 'month' ? 'Mois' : m === 'week' ? 'Semaine' : 'Jour'}</span>
          </button>
        ))}
        <button type="button" onClick={() => setCurrentDate(new Date(activeYear, activeMonth + 1, 1))} className="icon-btn" style={{ fontSize: '0.7rem' }}>{monthNames[(activeMonth + 1) % 12].slice(0, 3)}</button>
      </div>

      {viewMode === 'month' && (
        <div className="calendar-grid">
          <div className="weekdays">
            {dayNames.map(d => <span key={d}>{d}</span>)}
          </div>
          <div className="days-grid">
            {calendarDays.map((day, idx) => {
              const isSelected = day.dateString === selectedDate;
              const isToday = day.dateString === todayStr;
              const dots = getEventDotsForDate(day.dateString);
              const dayEvts = getEventsForDate(day.dateString);
              const hasRecurring = dayEvts.length > 0 && dayEvts.some(e => e.date !== day.dateString && e.recurrence);
              const wkNum = weekNumbers[idx];
              return (
                <button type="button" key={idx}
                  className={`day-cell ${!day.isCurrentMonth ? 'inactive' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                  onClick={() => day.dateString && setSelectedDate(day.dateString)}
                  disabled={!day.isCurrentMonth}
                >
                  {wkNum !== null && <span className="week-num">{wkNum}</span>}
                  <span className="day-num">{day.dayNum}</span>
                  {dots.length > 0 && (
                    <div className="day-dot-container">
                      {dots.map((c, di) => <span key={di} className="day-dot" style={{ backgroundColor: c }} />)}
                    </div>
                  )}
                  {hasRecurring && <Repeat size={6} style={{ position: 'absolute', bottom: 1, right: 2, opacity: 0.4 }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {viewMode === 'week' && (
        <div className="week-view">
          {weekDays.map((d, i) => (
            <button key={i} type="button"
              className={`week-day-row ${d.isToday ? 'today' : ''} ${d.isSelected ? 'selected' : ''}`}
              onClick={() => setSelectedDate(d.dateStr)}
            >
              <div className="week-day-label">
                <span className="week-day-name">{dayNames[i]}</span>
                <span className="week-day-num">{d.date.getDate()}</span>
              </div>
              <div className="week-day-events">
                {d.events.length === 0 ? (
                  <span className="week-day-empty">Aucun</span>
                ) : d.events.slice(0, 3).map(ev => (
                  <span key={ev.id} className="week-day-event-dot" style={{ backgroundColor: ev.color }}>
                    {ev.start} {ev.title}
                  </span>
                ))}
                {d.events.length > 3 && <span className="week-day-empty">+{d.events.length - 3} autres</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {viewMode === 'day' && (
        <div className="day-view">
          <div className="day-view-header">
            <span>{new Date(selectedDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          </div>
          <div className="day-grid">
            {Array.from({ length: 24 }, (_, h) => {
              const hourStr = `${String(h).padStart(2, '0')}:00`;
              const hourEvents = selectedDayEvents.filter(e => {
                const eh = parseInt(e.start.split(':')[0]);
                return eh === h || (eh < h && parseInt(e.end?.split(':')[0] || eh) > h);
              });
              const isNow = todayStr === selectedDate && h === new Date().getHours();
              return (
                <div key={h} className={`day-hour-row ${isNow ? 'now' : ''}`}>
                  <span className="day-hour-label">{hourStr}</span>
                  <div className="day-hour-line">
                    {isNow && <span className="day-now-indicator" />}
                    {hourEvents.map(ev => (
                      <div key={ev.id} className="day-hour-event" style={{ backgroundColor: ev.color + '30', borderLeftColor: ev.color }}
                        onClick={() => setDetailEvent(ev)}>
                        <span className="day-hour-event-title">{ev.title}</span>
                        <span className="day-hour-event-time">{ev.start}{ev.end ? `-${ev.end}` : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="search-bar">
        <Search size={14} style={{ opacity: 0.4 }} />
        <input type="text" className="search-input" placeholder="Rechercher un événement..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        {searchQuery && <button type="button" className="icon-btn" onClick={() => setSearchQuery('')} style={{ width: 24, height: 24 }}><X size={12} /></button>}
      </div>

      <div className="section-header">
        <h3>
          {new Date(selectedDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </h3>
        <span className="event-count-badge">{filteredEvents.length} événement(s)</span>
      </div>

      <div className="events-container">
        {filteredEvents.length === 0 ? (
          <div className="no-events">
            <CalendarIcon size={36} />
            <p>{searchQuery ? "Aucun résultat" : "Aucun événement de prévu"}</p>
            <button type="button" className="btn-primary" onClick={openAddSheet} style={{ marginTop: '0.5rem', padding: '0.6rem 1.2rem', fontSize: '0.85rem' }}>
              <Plus size={16} /> Ajouter un événement
            </button>
          </div>
        ) : (
          filteredEvents.map(event => (
            <div
              key={event.id}
              className={`event-card ${deleting === event.id ? 'deleting' : ''} ${swipingId === event.id ? 'swiping' : ''}`}
              style={{ '--event-color': event.color, transform: swipingId === event.id ? `translateX(${swipeX}px)` : 'none' }}
              onClick={() => setDetailEvent(event)}
              onTouchStart={(e) => handleTouchStart(e, event.id)}
              onTouchMove={(e) => handleTouchMove(e, event.id)}
              onTouchEnd={handleTouchEnd}
              onMouseDown={(e) => handleMouseDown(e, event.id)}
              onMouseMove={(e) => handleMouseMove(e, event.id)}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
            >
              <div className="event-time-col">
                <span className="event-time-start">{event.start}</span>
                {event.end && <span className="event-time-end">{event.end}</span>}
                {event.recurrence && <Repeat size={10} style={{ marginTop: '0.25rem', opacity: 0.5 }} title={recLabel(event.recurrence)} />}
              </div>
              <div className="event-color-strip" style={{ backgroundColor: event.color }} />
              <div className="event-detail-col">
                <h4>{event.title}</h4>
                {event.description && <p className="event-desc-preview">{event.description.length > 50 ? event.description.slice(0, 50) + '…' : event.description}</p>}
                <div className="event-creator-badge">
                  <User size={10} />
                  <span>Par {event.creator === username ? 'vous' : event.creator}</span>
                  {event.recurrence && <span className="rec-badge">{recLabel(event.recurrence)}</span>}
                </div>
              </div>
              <div className="event-swipe-hint">Supprimer</div>
            </div>
          ))
        )}
      </div>

      {/* Detail modal */}
      {detailEvent && (
        <div className="detail-overlay" onClick={() => setDetailEvent(null)}>
          <div className="detail-modal" onClick={e => e.stopPropagation()} style={{ '--event-color': detailEvent.color }}>
            <button type="button" className="detail-close" onClick={() => setDetailEvent(null)}><X size={20} /></button>
            <div className="detail-color-bar" style={{ backgroundColor: detailEvent.color }} />
            <div className="detail-body">
              <h2 className="detail-title">{detailEvent.title}</h2>
              <div className="detail-info-row">
                <CalendarDays size={16} />
                <span>{new Date(detailEvent.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </div>
              <div className="detail-info-row">
                <Clock size={16} />
                <span>{detailEvent.start}{detailEvent.end ? ` → ${detailEvent.end}` : ''}</span>
              </div>
              {detailEvent.recurrence && (
                <div className="detail-info-row">
                  <Repeat size={16} />
                  <span>Répète : {recLabel(detailEvent.recurrence)}</span>
                </div>
              )}
              {detailEvent.description && (
                <div className="detail-info-row" style={{ alignItems: 'flex-start' }}>
                  <Info size={16} style={{ marginTop: 2 }} />
                  <span style={{ lineHeight: 1.5 }}>{detailEvent.description}</span>
                </div>
              )}
              <div className="detail-info-row">
                <User size={16} />
                <span>Créé par {detailEvent.creator === username ? 'vous' : detailEvent.creator}</span>
              </div>
              <div className="detail-actions">
                <button type="button" className="btn-primary" onClick={() => openEditSheet(detailEvent)} style={{ flex: 1 }}>
                  <Pencil size={16} /> Modifier
                </button>
                <button type="button" className="btn-secondary btn-danger" onClick={() => handleDelete(detailEvent.id)} style={{ flex: 1 }} disabled={deleting === detailEvent.id}>
                  <Trash2 size={16} /> Supprimer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom sheet */}
      <div className={`bottom-sheet-overlay ${isSheetOpen ? 'open' : ''}`} onClick={closeSheet}>
        <div className="bottom-sheet" onClick={e => e.stopPropagation()}>
          <div className="bottom-sheet-handle" />
          <div className="bottom-sheet-header">
            <h3>{editingEvent ? "Modifier l'événement" : 'Nouvel Événement'}</h3>
            <button type="button" className="icon-btn" onClick={closeSheet}><X size={20} /></button>
          </div>
          <form onSubmit={submitEvent} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="input-group">
              <label>Titre</label>
              <input type="text" className="input-field" placeholder="Ex: Réunion" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} maxLength={40} required />
            </div>
            <div className="form-row">
              <div className="input-group">
                <label>Début</label>
                <input type="time" className="input-field" value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))} required />
              </div>
              <div className="input-group">
                <label>Fin (opt.)</label>
                <input type="time" className="input-field" value={form.end} onChange={e => setForm(f => ({ ...f, end: e.target.value }))} />
              </div>
            </div>
            <div className="input-group">
              <label>Description</label>
              <textarea className="input-field" placeholder="Détails..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ resize: 'none', height: '80px' }} maxLength={150} />
            </div>
            <div className="input-group">
              <label>Couleur</label>
              <div className="color-picker">
                {COLORS.map(color => (
                  <button key={color} type="button" className={`color-dot ${form.color === color ? 'selected' : ''}`} style={{ backgroundColor: color }} onClick={() => setForm(f => ({ ...f, color }))} />
                ))}
              </div>
            </div>
            <div className="input-group" style={{ borderTop: '1px solid var(--border-light)', paddingTop: '1rem' }}>
              <label>Répétition</label>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {[
                  { value: '', label: 'Jamais' },
                  { value: 'weekly', label: 'Chaque sem.' },
                  { value: 'biweekly', label: '1 sem./2' },
                  { value: 'monthly', label: 'Tous les mois' },
                  { value: 'yearly', label: 'Tous les ans' },
                ].map(opt => (
                  <button key={opt.value} type="button"
                    className={`day-toggle ${form.recType === opt.value ? 'active' : ''}`}
                    onClick={() => setForm(f => ({ ...f, recType: f.recType === opt.value ? '' : opt.value }))}
                  >{opt.label}</button>
                ))}
              </div>
              {(form.recType === 'weekly' || form.recType === 'biweekly') && (
                <div style={{ marginTop: '0.5rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                    {form.recType === 'biweekly' ? 'Semaine A' : 'Jours actifs'}
                  </div>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d, i) => {
                      const dayNum = i + 1;
                      return (
                        <button key={d} type="button"
                          className={`day-toggle ${form.recDays.includes(dayNum) ? 'active' : ''}`}
                          onClick={() => setForm(f => ({ ...f, recDays: f.recDays.includes(dayNum) ? f.recDays.filter(x => x !== dayNum) : [...f.recDays, dayNum] }))}
                        >{d}</button>
                      );
                    })}
                  </div>
                </div>
              )}
              {form.recType === 'biweekly' && (
                <div style={{ marginTop: '0.5rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Semaine B</div>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d, i) => {
                      const dayNum = i + 1;
                      return (
                        <button key={d} type="button"
                          className={`day-toggle ${form.recWeek2Days.includes(dayNum) ? 'active' : ''}`}
                          onClick={() => setForm(f => ({ ...f, recWeek2Days: f.recWeek2Days.includes(dayNum) ? f.recWeek2Days.filter(x => x !== dayNum) : [...f.recWeek2Days, dayNum] }))}
                        >{d}</button>
                      );
                    })}
                  </div>
                </div>
              )}
              {form.recType && (
                <div style={{ marginTop: '0.75rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '0.5rem' }}>Pendant</label>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {[
                      { value: '', label: 'Illimité' },
                      { value: '1', label: '1 mois' },
                      { value: '2', label: '2 mois' },
                      { value: '3', label: '3 mois' },
                    ].map(opt => (
                      <button key={opt.value} type="button"
                        className={`day-toggle ${form.recDuration === opt.value ? 'active' : ''}`}
                        onClick={() => setForm(f => ({ ...f, recDuration: f.recDuration === opt.value ? '' : opt.value }))}
                      >{opt.label}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Enregistrement...' : editingEvent ? 'Enregistrer' : 'Ajouter'}
              </button>
              <button type="button" className="btn-secondary" onClick={closeSheet}>Annuler</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
