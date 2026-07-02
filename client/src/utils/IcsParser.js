/**
 * Simple and robust parser for iCalendar (.ics) files.
 * Extracts events with summaries, descriptions, dates, and times.
 */

// Helper to clean up folded lines (lines starting with space/tab belong to the previous line)
function unfoldLines(icsText) {
  return icsText.replace(/\r?\n[ \t]/g, '');
}

// Helper to decode escaped characters in ICS text
function decodeIcsText(text) {
  if (!text) return '';
  return text
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\n/gi, '\n')
    .replace(/\\r/gi, '\r')
    .replace(/\\\\/g, '\\');
}

// Parse datetime strings like 20260702T193000Z or 20260702
function parseIcsDateTime(val) {
  if (!val) return { date: '', time: '' };
  
  // Clean parameter prefixes if present (e.g., Value=DATE:20260702)
  const cleanVal = val.split(':').pop();
  
  if (cleanVal.length >= 8) {
    const year = cleanVal.substring(0, 4);
    const month = cleanVal.substring(4, 6);
    const day = cleanVal.substring(6, 8);
    const date = `${year}-${month}-${day}`;
    
    let time = '';
    if (cleanVal.includes('T') && cleanVal.length >= 13) {
      const hours = cleanVal.substring(9, 11);
      const minutes = cleanVal.substring(11, 13);
      time = `${hours}:${minutes}`;
      
      // If it's UTC (ends with 'Z'), we can convert it to local timezone for better UX
      if (cleanVal.endsWith('Z')) {
        try {
          const utcDate = new Date(
            Date.UTC(
              parseInt(year),
              parseInt(month) - 1,
              parseInt(day),
              parseInt(hours),
              parseInt(minutes)
            )
          );
          
          const localYear = utcDate.getFullYear();
          const localMonth = String(utcDate.getMonth() + 1).padStart(2, '0');
          const localDay = String(utcDate.getDate()).padStart(2, '0');
          const localHours = String(utcDate.getHours()).padStart(2, '0');
          const localMinutes = String(utcDate.getMinutes()).padStart(2, '0');
          
          return {
            date: `${localYear}-${localMonth}-${localDay}`,
            time: `${localHours}:${localMinutes}`
          };
        } catch (e) {
          console.error("Error parsing UTC date:", e);
        }
      }
    }
    
    return { date, time };
  }
  
  return { date: '', time: '' };
}

export function parseIcs(icsText) {
  const unfolded = unfoldLines(icsText);
  const lines = unfolded.split(/\r?\n/);
  
  const events = [];
  let currentEvent = null;
  let inEvent = false;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // Detect Event boundaries
    if (line === 'BEGIN:VEVENT') {
      currentEvent = {};
      inEvent = true;
      continue;
    }
    
    if (line === 'END:VEVENT') {
      if (currentEvent && currentEvent.summary) {
        // Format starting date and time
        const start = parseIcsDateTime(currentEvent.dtstart);
        const end = parseIcsDateTime(currentEvent.dtend);
        
        events.push({
          title: decodeIcsText(currentEvent.summary),
          description: decodeIcsText(currentEvent.description || ''),
          date: start.date,
          start: start.time || '00:00',
          end: end.time || '',
          color: '#10b981' // Green theme for imported events
        });
      }
      currentEvent = null;
      inEvent = false;
      continue;
    }

    if (inEvent && currentEvent) {
      // Split line by first colon (key:value) or first semicolon if parameters exist
      const colonIndex = line.indexOf(':');
      const semicolonIndex = line.indexOf(';');
      
      let splitIndex = colonIndex;
      if (semicolonIndex !== -1 && semicolonIndex < colonIndex) {
        splitIndex = semicolonIndex;
      }
      
      if (splitIndex !== -1) {
        const keyWithParams = line.substring(0, splitIndex).toUpperCase();
        // The value is everything after the first colon of the line, as key:value is standard
        const value = line.substring(line.indexOf(':') + 1);
        
        // Clean parameters from key (e.g., DTSTART;TZID=Europe/Paris becomes DTSTART)
        const key = keyWithParams.split(';')[0];
        
        if (key === 'SUMMARY') {
          currentEvent.summary = value;
        } else if (key === 'DESCRIPTION') {
          currentEvent.description = value;
        } else if (key === 'DTSTART') {
          currentEvent.dtstart = value;
        } else if (key === 'DTEND') {
          currentEvent.dtend = value;
        }
      }
    }
  }

  // Filter out any events that didn't parse a valid date
  return events.filter(e => e.date);
}
