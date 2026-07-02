import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2, Calendar as CalendarIcon, User, X, Pencil } from 'lucide-react';

const COLORS = ['#6366f1', '#a855f7', '#10b981', '#f59e0b', '#ef4444'];

const emptyForm = { title: '', start: '12:00', end: '', description: '', color: COLORS[0], recType: '', recDays: [], recWeek2Days: [], recDuration: '' };

export default function CalendarView({ calendar, username, apiBaseUrl, onAddEvent, onUpdateEvent, onDeleteEvent }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const activeYear = currentDate.getFullYear();
  const activeMonth = currentDate.getMonth();
  const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  const prevMonth = () => setCurrentDate(new Date(activeYear, activeMonth - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(activeYear, activeMonth + 1, 1));
  const goToday = () => { setCurrentDate(new Date()); setSelectedDate(todayStr); };

  const getDaysInMonth = () => {
    const days = [];
    const firstDayIndex = new Date(activeYear, activeMonth, 1).getDay();
    const adjustedFirstDay = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
    const numDays = new Date(activeYear, activeMonth + 1, 0).getDate();
    const prevNumDays = new Date(activeYear, activeMonth, 0).getDate();

    for (let i = adjustedFirstDay - 1; i >= 0; i--) days.push({ dayNum: prevNumDays - i, dateString: '', isCurrentMonth: false });
    for (let d = 1; d <= numDays; d++) {
      const dateString = `${activeYear}-${String(activeMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ dayNum: d, dateString, isCurrentMonth: true });
    }
    for (let i = 1; days.length < 42; i++) days.push({ dayNum: i, dateString: '', isCurrentMonth: false });
    return days;
  };

  const calendarDays = getDaysInMonth();
  const events = calendar.events || [];

  const matchesRecurrence = (event, dateStr) => {
    if (!event.recurrence) return false;
    const rec = event.recurrence;
    const targetDate = new Date(dateStr + 'T12:00:00');
    const eventDate = new Date(event.date + 'T12:00:00');
    if (targetDate < eventDate) return false;
    if (rec.endDate && dateStr > rec.endDate) return false;
    switch (rec.type) {
      case 'weekly': {
        const dow = targetDate.getDay() || 7;
        const diffDays = Math.round((targetDate - eventDate) / 86400000);
        const diffWeeks = Math.floor(diffDays / 7);
        if (rec.week2Days) {
          return diffWeeks % 2 === 0 ? rec.days.includes(dow) : rec.week2Days.includes(dow);
        }
        return rec.days?.includes(dow);
      }
      case 'monthly': return targetDate.getDate() === eventDate.getDate();
      case 'yearly': return targetDate.getMonth() === eventDate.getMonth() && targetDate.getDate() === eventDate.getDate();
      default: return false;
    }
  };

  const selectedDayEvents = events.filter(e => e.date === selectedDate || matchesRecurrence(e, selectedDate)).sort((a, b) => a.start.localeCompare(b.start));

  const getEventDotsForDate = (dateStr) => {
    if (!dateStr) return [];
    const matchingColors = [];
    for (const e of events) {
      if (e.date === dateStr || matchesRecurrence(e, dateStr)) {
        matchingColors.push(e.color);
      }
    }
    return Array.from(new Set(matchingColors)).slice(0, 3);
  };

  const openAddSheet = () => {
    setEditingEvent(null);
    setForm({ ...emptyForm });
    setIsSheetOpen(true);
  };

  const openEditSheet = (ev) => {
    setEditingEvent(ev);
    setForm({
      title: ev.title, start: ev.start, end: ev.end || '', description: ev.description || '', color: ev.color || COLORS[0],
      recType: ev.recurrence?.week2Days ? 'biweekly' : (ev.recurrence?.type || ''),
      recDays: ev.recurrence?.days || [],
      recWeek2Days: ev.recurrence?.week2Days || [],
      recDuration: ev.recurrence?.duration || '',
    });
    setIsSheetOpen(true);
  };

  const closeSheet = () => setIsSheetOpen(false);

  const submitEvent = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !selectedDate || !form.start) return;
    setLoading(true);

    try {
      let recurrence = null;
      if (form.recType) {
        if (form.recType === 'weekly' || form.recType === 'biweekly') {
          const days = form.recType === 'biweekly' && form.recDays.length === 0
            ? form.recWeek2Days
            : form.recDays;
          if (days.length > 0 || form.recWeek2Days.length > 0) {
            recurrence = { type: 'weekly', days };
            if (form.recType === 'biweekly') recurrence.week2Days = form.recWeek2Days;
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

      console.log('Recurrence avant submit:', JSON.stringify(recurrence));

      const payload = {
        title: form.title.trim(),
        date: selectedDate,
        start: form.start,
        end: form.end,
        description: form.description.trim(),
        creator: username,
        color: form.color,
        recurrence
      };
      console.log('Payload envoyé:', JSON.stringify(payload));

      if (editingEvent) {
        const res = await fetch(`${apiBaseUrl}/api/calendar/${calendar.code}/event/${editingEvent.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: payload })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erreur de modification");
        onUpdateEvent(data);
      } else {
        const res = await fetch(`${apiBaseUrl}/api/calendar/${calendar.code}/event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: payload })
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

  const handleDelete = async (eventId) => {
    const ev = events.find(e => e.id === eventId);
    const msg = ev?.recurrence ? "Supprimer cet événement récurrent ? (toutes les occurrences)" : "Annuler cet événement ?";
    if (!window.confirm(msg)) return;
    setDeletingId(eventId);
    try {
      const res = await fetch(`${apiBaseUrl}/api/calendar/${calendar.code}/event/${eventId}?username=${encodeURIComponent(username)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur de suppression");
      onDeleteEvent(eventId);
    } catch (err) {
      alert("Erreur: " + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="calendar-view-container">
      <div className="month-selector">
        <button type="button" className="icon-btn" onClick={prevMonth} aria-label="Mois précédent"><ChevronLeft size={20} /></button>
        <h3>{monthNames[activeMonth]} {activeYear}</h3>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button type="button" className="icon-btn today-btn" onClick={goToday} aria-label="Aujourd'hui" title="Aujourd'hui" style={{ fontSize: '0.7rem', fontWeight: 700, width: 'auto', padding: '0 0.5rem' }}>Auj.</button>
          <button type="button" className="icon-btn" onClick={nextMonth} aria-label="Mois suivant"><ChevronRight size={20} /></button>
        </div>
      </div>

      <div className="calendar-grid">
        <div className="weekdays">
          <span>Lun</span><span>Mar</span><span>Mer</span><span>Jeu</span><span>Ven</span><span>Sam</span><span>Dim</span>
        </div>
        <div className="days-grid">
          {calendarDays.map((day, idx) => {
            const isSelected = day.dateString === selectedDate;
            const isToday = day.dateString === todayStr;
            const dots = getEventDotsForDate(day.dateString);
            return (
              <button type="button" key={idx}
                className={`day-cell ${!day.isCurrentMonth ? 'inactive' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                onClick={() => day.dateString && setSelectedDate(day.dateString)}
                disabled={!day.isCurrentMonth}
              >
                <span>{day.dayNum}</span>
                {dots.length > 0 && (
                  <div className="day-dot-container">
                    {dots.map((c, di) => <span key={di} className="day-dot" style={{ backgroundColor: isSelected ? 'white' : c }} />)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="section-header">
        <h3>
          {new Date(selectedDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </h3>
        <span>{selectedDayEvents.length} événement(s)</span>
      </div>

      <div className="events-container">
        {selectedDayEvents.length === 0 ? (
          <div className="no-events">
            <CalendarIcon size={36} />
            <p>Aucun événement de prévu</p>
          </div>
        ) : (
          selectedDayEvents.map(event => (
            <div key={event.id} className="event-card" style={{ '--event-color': event.color }}>
              <div className="event-time-col">
                <span className="event-time-start">{event.start}</span>
                {event.end && <span className="event-time-end">à {event.end}</span>}
              </div>
              <div className="event-detail-col">
                <h4>{event.title}</h4>
                {event.description && <p>{event.description}</p>}
                <div className="event-creator-badge">
                  <User size={10} />
                  <span>Par {event.creator === username ? 'vous' : event.creator}</span>
                </div>
              </div>
              <div className="event-action-col">
                <button type="button" className="btn-icon-action" onClick={() => openEditSheet(event)} title="Modifier">
                  <Pencil size={14} />
                </button>
                <button type="button" className="btn-icon-action btn-delete" onClick={() => handleDelete(event.id)} title="Supprimer" disabled={deletingId === event.id}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <button type="button" className="fab-btn" onClick={openAddSheet} aria-label="Ajouter un événement">
        <Plus size={28} />
      </button>

      <div className={`bottom-sheet-overlay ${isSheetOpen ? 'open' : ''}`} onClick={closeSheet}>
        <div className="bottom-sheet" onClick={e => e.stopPropagation()}>
          <div className="bottom-sheet-handle" />
          <div className="bottom-sheet-header">
            <h3>{editingEvent ? "Modifier l'événement" : 'Nouvel Événement'}</h3>
            <button type="button" className="icon-btn" onClick={closeSheet}><X size={20} /></button>
          </div>

          <form onSubmit={submitEvent} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="input-group">
              <label htmlFor="event-title">Titre</label>
              <input id="event-title" type="text" className="input-field" placeholder="Ex: Réunion" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} maxLength={40} required />
            </div>

            <div className="form-row">
              <div className="input-group">
                <label htmlFor="event-start">Début</label>
                <input id="event-start" type="time" className="input-field" value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))} required />
              </div>
              <div className="input-group">
                <label htmlFor="event-end">Fin (opt.)</label>
                <input id="event-end" type="time" className="input-field" value={form.end} onChange={e => setForm(f => ({ ...f, end: e.target.value }))} />
              </div>
            </div>

            <div className="input-group">
              <label htmlFor="event-desc">Description</label>
              <textarea id="event-desc" className="input-field" placeholder="Détails..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ resize: 'none', height: '80px' }} maxLength={150} />
            </div>

            <div className="input-group">
              <label>Couleur</label>
              <div className="color-picker">
                {COLORS.map(color => (
                  <button key={color} type="button" className={`color-dot ${form.color === color ? 'selected' : ''}`} style={{ backgroundColor: color }} onClick={() => setForm(f => ({ ...f, color }))} aria-label={`Couleur ${color}`} />
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
                  >
                    {opt.label}
                  </button>
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
                          onClick={() => setForm(f => ({
                            ...f, recDays: f.recDays.includes(dayNum)
                              ? f.recDays.filter(x => x !== dayNum)
                              : [...f.recDays, dayNum]
                          }))}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {form.recType === 'biweekly' && (
                <div style={{ marginTop: '0.5rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                    Semaine B
                  </div>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d, i) => {
                      const dayNum = i + 1;
                      return (
                        <button key={d} type="button"
                          className={`day-toggle ${form.recWeek2Days.includes(dayNum) ? 'active' : ''}`}
                          onClick={() => setForm(f => ({
                            ...f, recWeek2Days: f.recWeek2Days.includes(dayNum)
                              ? f.recWeek2Days.filter(x => x !== dayNum)
                              : [...f.recWeek2Days, dayNum]
                          }))}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {form.recType && (
                <div style={{ marginTop: '0.75rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '0.5rem' }}>
                    Pendant
                  </label>
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
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Enregistrement...' : editingEvent ? 'Enregistrer les modifications' : 'Ajouter au Calendrier'}
              </button>
              <button type="button" className="btn-secondary" onClick={closeSheet}>Annuler</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
