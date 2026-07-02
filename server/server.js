import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import webPush from 'web-push';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, 'data.json');
const PUSH_FILE = path.join(__dirname, 'pushSubscriptions.json');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

const clients = new Map();

function readData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(content || '{}');
    }
  } catch (error) {
    console.error('Error reading data.json:', error);
  }
  return { calendars: {} };
}

function writeData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing data.json:', error);
  }
}

function readPushSubs() {
  try {
    if (fs.existsSync(PUSH_FILE)) {
      return JSON.parse(fs.readFileSync(PUSH_FILE, 'utf8') || '{}');
    }
  } catch (error) {
    console.error('Error reading push subscriptions:', error);
  }
  return { web: [], fcm: [] };
}

function writePushSubs(data) {
  try {
    fs.writeFileSync(PUSH_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing push subscriptions:', error);
  }
}

// Setup VAPID keys for Web Push
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BMrRdVqYlDFYjOMZvK6VDFPJ8FS3jDodY_yOZkLDSlVDD1g6OKQYpqewo5EAET12nR7PG_6D5N52N2xqxArQCys';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '7UPkPqfUw74Pk8dOX1VqjX7RkAfDB_B9gBpQBBAMWxI';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails('mailto:contact@cocalendar.app', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

async function sendPushToCalendar(code, title, body) {
  const subs = readPushSubs();
  if (!subs.web.length) return;

  const payload = JSON.stringify({ title, body, url: '/' });
  const results = await Promise.allSettled(
    subs.web.map(async (sub) => {
      try {
        await webPush.sendNotification(sub, payload);
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          return false;
        }
        throw err;
      }
    })
  );

  const valid = subs.web.filter((_, i) => results[i].value !== false);
  if (valid.length !== subs.web.length) {
    writePushSubs({ ...subs, web: valid });
  }
}

// Generate unique 6-digit uppercase alphanumeric code
function generateCode() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  const data = readData();
  
  do {
    code = 'CAL-';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (data.calendars && data.calendars[code]);
  
  return code;
}

// Broadcast message to all clients on a specific calendar
function broadcastToCalendar(code, message, senderWs = null) {
  let count = 0;
  for (const [ws, info] of clients.entries()) {
    if (info.code === code && ws !== senderWs && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      count++;
    }
  }
  console.log(`Broadcasted to ${count} clients on calendar ${code}`);
}

// --- REST API Endpoints ---

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), vapid: !!VAPID_PUBLIC_KEY });
});

app.post('/api/push/register', (req, res) => {
  const { subscription, token, platform } = req.body;
  const subs = readPushSubs();

  if (subscription) {
    const exists = subs.web.some(s => JSON.stringify(s) === JSON.stringify(subscription));
    if (!exists) subs.web.push(subscription);
  }
  if (token && platform === 'fcm') {
    const exists = subs.fcm.some(t => t.token === token);
    if (!exists) subs.fcm.push({ token, platform: 'android', createdAt: new Date().toISOString() });
  }

  writePushSubs(subs);
  res.json({ success: true, count: subs.web.length + subs.fcm.length });
});

// Create a new calendar
app.post('/api/calendar/create', (req, res) => {
  const { name, creator } = req.body;
  if (!name || !creator) {
    return res.status(400).json({ error: 'Calendar name and creator are required' });
  }

  const code = generateCode();
  const data = readData();

  data.calendars = data.calendars || {};
  data.calendars[code] = {
    name,
    code,
    creator,
    createdAt: new Date().toISOString(),
    members: [creator],
    events: []
  };

  writeData(data);
  console.log(`Calendar created: ${name} (${code}) by ${creator}`);
  res.json({ code, name, creator });
});

// Join an existing calendar
app.post('/api/calendar/:code/join', (req, res) => {
  const { code } = req.params;
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const data = readData();
  const calendar = data.calendars ? data.calendars[code.toUpperCase()] : null;

  if (!calendar) {
    return res.status(404).json({ error: 'Calendar not found' });
  }

  const cleanCode = code.toUpperCase();
  if (!calendar.members.includes(username)) {
    calendar.members.push(username);
    writeData(data);
    
    // Broadcast member joined
    broadcastToCalendar(cleanCode, {
      type: 'notification',
      notification: {
        id: Math.random().toString(),
        type: 'join',
        message: `${username} a rejoint le calendrier.`,
        timestamp: new Date().toISOString()
      }
    });
  }

  res.json({
    code: cleanCode,
    name: calendar.name,
    members: calendar.members,
    events: calendar.events
  });
});

// Get calendar details
app.get('/api/calendar/:code', (req, res) => {
  const { code } = req.params;
  const data = readData();
  const calendar = data.calendars ? data.calendars[code.toUpperCase()] : null;

  if (!calendar) {
    return res.status(404).json({ error: 'Calendar not found' });
  }

  res.json(calendar);
});

// Add an event to a calendar
app.post('/api/calendar/:code/event', (req, res) => {
  const { code } = req.params;
  const { event } = req.body; // { title, date, start, end, description, creator, color }

  if (!event || !event.title || !event.date || !event.start || !event.creator) {
    return res.status(400).json({ error: 'Missing required event fields' });
  }

  const data = readData();
  const cleanCode = code.toUpperCase();
  const calendar = data.calendars ? data.calendars[cleanCode] : null;

  if (!calendar) {
    return res.status(404).json({ error: 'Calendar not found' });
  }

  const newEvent = {
    id: Math.random().toString(36).substring(2, 9),
    title: event.title,
    date: event.date, // YYYY-MM-DD
    start: event.start, // HH:MM
    end: event.end || '', // HH:MM
    description: event.description || '',
    creator: event.creator,
    color: event.color || '#6366f1', // default indigo
    createdAt: new Date().toISOString()
  };

  calendar.events = calendar.events || [];
  calendar.events.push(newEvent);
  writeData(data);

  broadcastToCalendar(cleanCode, {
    type: 'sync',
    events: calendar.events
  });

  const notifMsg = `${event.creator} a ajouté "${event.title}" à ${event.start}.`;
  broadcastToCalendar(cleanCode, {
    type: 'notification',
    notification: {
      id: Math.random().toString(),
      type: 'add',
      message: notifMsg,
      timestamp: new Date().toISOString()
    }
  });

  sendPushToCalendar(cleanCode, 'CoCalendar - Nouvel événement', notifMsg);

  res.json(newEvent);
});

// Delete / Cancel an event
app.delete('/api/calendar/:code/event/:id', (req, res) => {
  const { code, id } = req.params;
  const { username } = req.query; // Who deleted it

  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const data = readData();
  const cleanCode = code.toUpperCase();
  const calendar = data.calendars ? data.calendars[cleanCode] : null;

  if (!calendar) {
    return res.status(404).json({ error: 'Calendar not found' });
  }

  const eventIndex = calendar.events.findIndex(e => e.id === id);
  if (eventIndex === -1) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const deletedEvent = calendar.events[eventIndex];
  calendar.events.splice(eventIndex, 1);
  writeData(data);

  broadcastToCalendar(cleanCode, {
    type: 'sync',
    events: calendar.events
  });

  const notifMsg = `${username} a annulé "${deletedEvent.title}".`;
  broadcastToCalendar(cleanCode, {
    type: 'notification',
    notification: {
      id: Math.random().toString(),
      type: 'delete',
      message: notifMsg,
      timestamp: new Date().toISOString()
    }
  });

  sendPushToCalendar(cleanCode, 'CoCalendar - Événement annulé', notifMsg);

  res.json({ success: true, id });
});

// Bulk Import Events
app.post('/api/calendar/:code/import', (req, res) => {
  const { code } = req.params;
  const { events, username } = req.body; // array of events, importer username

  if (!events || !Array.isArray(events) || !username) {
    return res.status(400).json({ error: 'Events array and username are required' });
  }

  const data = readData();
  const cleanCode = code.toUpperCase();
  const calendar = data.calendars ? data.calendars[cleanCode] : null;

  if (!calendar) {
    return res.status(404).json({ error: 'Calendar not found' });
  }

  const importedEvents = events.map(e => ({
    id: Math.random().toString(36).substring(2, 9),
    title: e.title,
    date: e.date, // YYYY-MM-DD
    start: e.start, // HH:MM
    end: e.end || '',
    description: e.description || '',
    creator: username,
    color: e.color || '#10b981', // green default for imported
    createdAt: new Date().toISOString()
  }));

  calendar.events = calendar.events || [];
  calendar.events.push(...importedEvents);
  writeData(data);

  broadcastToCalendar(cleanCode, {
    type: 'sync',
    events: calendar.events
  });

  const notifMsg = `${username} a importé ${importedEvents.length} événement(s).`;
  broadcastToCalendar(cleanCode, {
    type: 'notification',
    notification: {
      id: Math.random().toString(),
      type: 'import',
      message: notifMsg,
      timestamp: new Date().toISOString()
    }
  });

  sendPushToCalendar(cleanCode, 'CoCalendar - Import', notifMsg);

  res.json({ success: true, count: importedEvents.length });
});

// --- WebSocket Setup ---

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws) => {
  console.log('New WebSocket client connected');

  ws.on('message', (messageStr) => {
    try {
      const message = JSON.parse(messageStr);
      
      if (message.type === 'join') {
        const { code, username } = message;
        if (code && username) {
          const cleanCode = code.toUpperCase();
          clients.set(ws, { code: cleanCode, username });
          console.log(`WS Client registered: ${username} to calendar ${cleanCode}`);
          
          // Send acknowledgement
          ws.send(JSON.stringify({ type: 'joined', code: cleanCode }));
        }
      }
      
      if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (e) {
      console.error('Error handling WebSocket message:', e);
    }
  });

  ws.on('close', () => {
    const clientInfo = clients.get(ws);
    if (clientInfo) {
      console.log(`WS Client disconnected: ${clientInfo.username} from ${clientInfo.code}`);
      clients.delete(ws);
    } else {
      console.log('WS Client disconnected (unregistered)');
    }
  });
});

// --- Serve Static Client Build (Production mode) ---
const clientDistPath = path.resolve(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  // SPA catch-all: serve index.html for all non-API routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
  console.log('Serving static client build from:', clientDistPath);
}

// Start Server
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`  Local:   http://localhost:${PORT}`);
});

