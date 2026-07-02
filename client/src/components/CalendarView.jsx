import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2, Calendar as CalendarIcon, User, X } from 'lucide-react';

const COLORS = [
  '#6366f1', // Indigo
  '#a855f7', // Purple
  '#10b981', // Green
  '#f59e0b', // Orange
  '#ef4444', // Red
];

export default function CalendarView({ calendar, username, apiBaseUrl, onAddEvent, onDeleteEvent }) {
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return formatDateString(today);
  });
  
  const [currentDate, setCurrentDate] = useState(new Date()); // Controls active month view
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  
  // Event Form State
  const [eventTitle, setEventTitle] = useState('');
  const [eventStart, setEventStart] = useState('12:00');
  const [eventEnd, setEventEnd] = useState('');
  const [eventDesc, setEventDesc] = useState('');
  const [eventColor, setEventColor] = useState(COLORS[0]);
  const [loading, setLoading] = useState(false);

  // Helper: Format Date object to YYYY-MM-DD
  function formatDateString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const activeYear = currentDate.getFullYear();
  const activeMonth = currentDate.getMonth();

  const monthNames = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];

  // Navigate to previous month
  const prevMonth = () => {
    setCurrentDate(new Date(activeYear, activeMonth - 1, 1));
  };

  // Navigate to next month
  const nextMonth = () => {
    setCurrentDate(new Date(activeYear, activeMonth + 1, 1));
  };

  // Generate calendar days
  const getDaysInMonth = () => {
    const days = [];
    const firstDayIndex = new Date(activeYear, activeMonth, 1).getDay();
    // Adjust firstDayIndex to make Monday = 0, Sunday = 6
    const adjustedFirstDay = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
    
    const numDays = new Date(activeYear, activeMonth + 1, 0).getDate();
    const prevNumDays = new Date(activeYear, activeMonth, 0).getDate();

    // 1. Add days from previous month (as inactive padding)
    for (let i = adjustedFirstDay - 1; i >= 0; i--) {
      days.push({
        dayNum: prevNumDays - i,
        dateString: '', // Inactive
        isCurrentMonth: false
      });
    }

    // 2. Add days of the current month
    for (let d = 1; d <= numDays; d++) {
      const mStr = String(activeMonth + 1).padStart(2, '0');
      const dStr = String(d).padStart(2, '0');
      const dateString = `${activeYear}-${mStr}-${dStr}`;
      
      days.push({
        dayNum: d,
        dateString,
        isCurrentMonth: true
      });
    }

    // 3. Add padding days from the next month to make grid a perfect square (multiple of 7)
    const remainingCells = 42 - days.length; // 6 rows of 7 days
    for (let i = 1; i <= remainingCells; i++) {
      days.push({
        dayNum: i,
        dateString: '', // Inactive
        isCurrentMonth: false
      });
    }

    return days;
  };

  const calendarDays = getDaysInMonth();
  const events = calendar.events || [];

  // Filter events for the selected day
  const selectedDayEvents = events
    .filter(e => e.date === selectedDate)
    .sort((a, b) => a.start.localeCompare(b.start));

  const handleAddEventSubmit = async (e) => {
    e.preventDefault();
    if (!eventTitle.trim() || !selectedDate || !eventStart) return;

    setLoading(true);
    try {
      const eventPayload = {
        title: eventTitle.trim(),
        date: selectedDate,
        start: eventStart,
        end: eventEnd,
        description: eventDesc.trim(),
        creator: username,
        color: eventColor
      };

      const response = await fetch(`${apiBaseUrl}/api/calendar/${calendar.code}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: eventPayload })
      });

      const newEvent = await response.json();
      if (!response.ok) throw new Error(newEvent.error || "Erreur d'enregistrement");

      onAddEvent(newEvent);
      
      // Reset Form and close Sheet
      setEventTitle('');
      setEventStart('12:00');
      setEventEnd('');
      setEventDesc('');
      setEventColor(COLORS[0]);
      setIsBottomSheetOpen(false);
    } catch (err) {
      alert("Erreur lors de l'ajout de l'événement: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEventClick = async (eventId) => {
    if (!window.confirm("Voulez-vous vraiment annuler cet événement ?")) return;

    try {
      const response = await fetch(`${apiBaseUrl}/api/calendar/${calendar.code}/event/${eventId}?username=${encodeURIComponent(username)}`, {
        method: 'DELETE'
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erreur de suppression");

      onDeleteEvent(eventId);
    } catch (err) {
      alert("Erreur lors de la suppression de l'événement: " + err.message);
    }
  };

  // Get distinct dot colors for a date
  const getEventDotsForDate = (dateStr) => {
    if (!dateStr) return [];
    const dayEvents = events.filter(e => e.date === dateStr);
    // Take up to 3 distinct colors to show as status dots
    const colors = Array.from(new Set(dayEvents.map(e => e.color))).slice(0, 3);
    return colors;
  };

  const todayStr = formatDateString(new Date());

  return (
    <div className="calendar-view-container">
      {/* Month Navigation */}
      <div className="month-selector">
        <button type="button" className="icon-btn" onClick={prevMonth} aria-label="Mois précédent">
          <ChevronLeft size={20} />
        </button>
        <h3>{monthNames[activeMonth]} {activeYear}</h3>
        <button type="button" className="icon-btn" onClick={nextMonth} aria-label="Mois suivant">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Monthly Grid */}
      <div className="calendar-grid">
        <div className="weekdays">
          <span>Lun</span>
          <span>Mar</span>
          <span>Mer</span>
          <span>Jeu</span>
          <span>Ven</span>
          <span>Sam</span>
          <span>Dim</span>
        </div>
        <div className="days-grid">
          {calendarDays.map((day, idx) => {
            const isSelected = day.dateString === selectedDate;
            const isToday = day.dateString === todayStr;
            const dots = getEventDotsForDate(day.dateString);
            
            return (
              <button
                type="button"
                key={idx}
                className={`day-cell ${!day.isCurrentMonth ? 'inactive' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                onClick={() => day.dateString && setSelectedDate(day.dateString)}
                disabled={!day.isCurrentMonth}
              >
                <span>{day.dayNum}</span>
                {dots.length > 0 && (
                  <div className="day-dot-container">
                    {dots.map((color, dotIdx) => (
                      <span
                        key={dotIdx}
                        className="day-dot"
                        style={{ backgroundColor: isSelected ? 'white' : color }}
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Events List for Selected Day */}
      <div className="section-header">
        <h3>
          {new Date(selectedDate).toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
          })}
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
                  <span>Ajouté par {event.creator === username ? 'vous' : event.creator}</span>
                </div>
              </div>
              <div className="event-action-col">
                <button
                  type="button"
                  className="btn-delete-event"
                  onClick={() => handleDeleteEventClick(event.id)}
                  title="Annuler l'événement"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Float Action Button */}
      <button 
        type="button"
        className="fab-btn"
        onClick={() => setIsBottomSheetOpen(true)}
        aria-label="Ajouter un événement"
      >
        <Plus size={28} />
      </button>

      {/* Bottom Sheet Modal (Ajout d'événement) */}
      <div className={`bottom-sheet-overlay ${isBottomSheetOpen ? 'open' : ''}`} onClick={() => setIsBottomSheetOpen(false)}>
        <div className="bottom-sheet" onClick={e => e.stopPropagation()}>
          <div className="bottom-sheet-handle"></div>
          <div className="bottom-sheet-header">
            <h3>Nouvel Événement</h3>
            <button type="button" className="icon-btn" onClick={() => setIsBottomSheetOpen(false)}>
              <X size={20} />
            </button>
          </div>
          
          <form onSubmit={handleAddEventSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="input-group">
              <label htmlFor="event-title">Titre</label>
              <input
                id="event-title"
                type="text"
                className="input-field"
                placeholder="Ex: Réunion d'équipe"
                value={eventTitle}
                onChange={e => setEventTitle(e.target.value)}
                maxLength={40}
                required
              />
            </div>
            
            <div className="form-row">
              <div className="input-group">
                <label htmlFor="event-start">Heure de début</label>
                <input
                  id="event-start"
                  type="time"
                  className="input-field"
                  value={eventStart}
                  onChange={e => setEventStart(e.target.value)}
                  required
                />
              </div>
              <div className="input-group">
                <label htmlFor="event-end">Heure de fin (Optionnel)</label>
                <input
                  id="event-end"
                  type="time"
                  className="input-field"
                  value={eventEnd}
                  onChange={e => setEventEnd(e.target.value)}
                />
              </div>
            </div>
            
            <div className="input-group">
              <label htmlFor="event-desc">Description</label>
              <textarea
                id="event-desc"
                className="input-field"
                placeholder="Détails supplémentaires..."
                value={eventDesc}
                onChange={e => setEventDesc(e.target.value)}
                style={{ resize: 'none', height: '80px' }}
                maxLength={150}
              />
            </div>

            <div className="input-group">
              <label>Thème de Couleur</label>
              <div className="color-picker">
                {COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    className={`color-dot ${eventColor === color ? 'selected' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setEventColor(color)}
                    aria-label={`Couleur ${color}`}
                  />
                ))}
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Ajout...' : 'Ajouter au Calendrier'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setIsBottomSheetOpen(false)}>
                Annuler
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
