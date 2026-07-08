import React, { useMemo, useState } from 'react';
import { Calendar as CalendarIcon, User, ChevronRight } from 'lucide-react';

const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function recLabel(r) {
  if (!r) return '';
  if (r.type === 'weekly') return r.week2Days ? '1 sem./2' : 'Chaque sem.';
  if (r.type === 'monthly') return 'Tous les mois';
  if (r.type === 'yearly') return 'Tous les ans';
  return '';
}

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

function matchesRecurrence(event, dateStr) {
  if (!event.recurrence) return false;
  const rec = event.recurrence;
  const targetDate = new Date(dateStr + 'T12:00:00');
  const eventDate = new Date(event.date + 'T12:00:00');
  if (targetDate < eventDate) return false;
  if (rec.endDate && dateStr > rec.endDate) return false;
  switch (rec.type) {
    case 'weekly': {
      const dow = targetDate.getDay() || 7;
      if ('week2Days' in rec) {
        const targetWeek = getWeekNumber(dateStr);
        const anchorWeek = getWeekNumber(rec._anchorDate || event.date);
        const inEvenWeek = ((targetWeek - anchorWeek) % 2 + 2) % 2 === 0;
        if (inEvenWeek) return rec.days?.includes(dow) || false;
        return rec.week2Days?.includes(dow) || false;
      }
      return rec.days?.includes(dow);
    }
    case 'monthly': return targetDate.getDate() === eventDate.getDate();
    case 'yearly': return targetDate.getMonth() === eventDate.getMonth() && targetDate.getDate() === eventDate.getDate();
    default: return false;
  }
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  if (dateStr === todayStr) return "Aujourd'hui";
  if (dateStr === tomorrowStr) return 'Demain';

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateStr === yesterday.toISOString().slice(0, 10)) return 'Hier';

  const dayName = d.toLocaleDateString('fr-FR', { weekday: 'long' });
  return `${dayName} ${d.getDate()} ${monthNames[d.getMonth()]}`;
}

export default function AgendaView({ events, username, onNavigateToDate }) {
  const [showAll, setShowAll] = useState(false);

  const grouped = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const map = {};

    const addEvent = (e, dateStr) => {
      if (dateStr < todayStr) return;
      if (!map[dateStr]) map[dateStr] = [];
      if (!map[dateStr].some(x => x.id === e.id)) map[dateStr].push(e);
    };

    for (const e of events) {
      addEvent(e, e.date);
      if (e.recurrence) {
        const start = new Date(e.date + 'T12:00:00');
        const end = e.recurrence.endDate ? new Date(e.recurrence.endDate + 'T12:00:00') : new Date(today.getFullYear() + 2, 0, 1);
        const cur = new Date(Math.max(start.getTime(), today.getTime()));
        let maxIter = 60;
        while (cur <= end && maxIter > 0) {
          const ds = cur.toISOString().slice(0, 10);
          if (ds !== e.date && matchesRecurrence(e, ds)) addEvent(e, ds);
          maxIter--;
          cur.setDate(cur.getDate() + 1);
        }
      }
    }

    const sorted = Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
    for (const [, evts] of sorted) evts.sort((a, b) => a.start.localeCompare(b.start));

    return sorted;
  }, [events]);

  const displayed = showAll ? grouped : grouped.slice(0, 5);
  const hasMore = grouped.length > 5;

  if (grouped.length === 0) {
    return (
      <div className="agenda-view">
        <div className="no-events" style={{ marginTop: '1rem' }}>
          <CalendarIcon size={36} />
          <p>Aucun événement à venir</p>
        </div>
      </div>
    );
  }

  return (
    <div className="agenda-view">
      <div className="agenda-header">
        <h3>Vue d'ensemble</h3>
        <span className="event-count-badge">{events.length} événement(s)</span>
      </div>

      {displayed.map(([dateStr, dayEvents]) => (
        <div key={dateStr} className="agenda-day-group">
          <div className="agenda-day-header" onClick={() => onNavigateToDate(dateStr)}>
            <span className="agenda-day-label">{formatDateLabel(dateStr)}</span>
            <ChevronRight size={14} className="agenda-day-arrow" />
          </div>
          {dayEvents.map(event => (
            <div key={event.id} className="agenda-event" onClick={() => onNavigateToDate(dateStr)}>
              <div className="event-color-strip" style={{ backgroundColor: event.color }} />
              <div className="agenda-event-time-col">
                <span className="agenda-event-time">{event.start}</span>
                {event.end && <span className="agenda-event-time-end">{event.end}</span>}
              </div>
              <div className="agenda-event-detail">
                <span className="agenda-event-title">{event.title}</span>
                <div className="event-creator-badge">
                  <User size={10} />
                  <span>Par {event.creator === username ? 'vous' : event.creator}</span>
                  {event.recurrence && <span className="rec-badge">{recLabel(event.recurrence)}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}

      {hasMore && (
        <button type="button" className="agenda-show-more" onClick={() => setShowAll(s => !s)}>
          {showAll ? 'Voir moins' : `Voir les ${grouped.length - 5} jours suivants`}
        </button>
      )}
    </div>
  );
}
