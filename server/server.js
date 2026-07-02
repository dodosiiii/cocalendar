import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import webPush from 'web-push';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, 'data.json');
const PUSH_FILE = path.join(__dirname, 'pushSubscriptions.json');

const app = express();
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '500kb' }));

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

const clients = new Map();

function readData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8') || '{}');
    }
  } catch (error) {
    console.error('Error reading data.json:', error);
  }
  return { calendars: {} };
}

function writeData(data) {
  const tmp = DATA_FILE + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, DATA_FILE);
  } catch (error) {
    console.error('Error writing data.json:', error);
  }
}

function readPushSubs() {
  try {
    if (fs.existsSync(PUSH_FILE)) {
      return JSON.parse(fs.readFileSync(PUSH_FILE, 'utf8') || '{}');
    }
  } catch {
    return { web: [], fcm: [] };
  }
  return { web: [], fcm: [] };
}

function writePushSubs(data) {
  const tmp = PUSH_FILE + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, PUSH_FILE);
  } catch (error) {
    console.error('Error writing push subscriptions:', error);
  }
}

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails('mailto:contact@cocalendar.app', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  console.log('Web Push: VAPID keys configured');
} else {
  console.warn('Web Push: VAPID keys not set. Push notifications disabled. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY env vars.');
}

async function sendPushToCalendar(code, title, body) {
  const subs = readPushSubs();
  if (!subs.web.length) return;

  const payload = JSON.stringify({ title, body, url: '/' });
  const results = await Promise.allSettled(
    subs.web.map(sub => webPush.sendNotification(sub, payload).catch(err => {
      if (err.statusCode === 410 || err.statusCode === 404) return { expired: true };
      throw err;
    }))
  );

  const valid = subs.web.filter((_, i) => {
    const r = results[i];
    return r.status === 'fulfilled' && !r.value?.expired;
  });

  if (valid.length !== subs.web.length) {
    writePushSubs({ ...subs, web: valid });
  }
}

function generateCode() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code;
  const data = readData();
  do {
    code = 'CAL-';
    for (let i = 0; i < 6; i++) {
      code += chars[crypto.randomInt(chars.length)];
    }
  } while (data.calendars?.[code]);
  return code;
}

function broadcastToCalendar(code, message, senderWs = null) {
  let count = 0;
  for (const [ws, info] of clients.entries()) {
    if (info.code === code && ws !== senderWs && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      count++;
    }
  }
}

function sanitize(str, maxLen = 200) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>&"']/g, '').trim().substring(0, maxLen);
}

function isValidDate(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d).getTime()); }
function isValidTime(t) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(t); }

const generalLimiter = rateLimit({ windowMs: 60000, max: 60, message: { error: 'Trop de requêtes, réessayez plus tard.' } });
const authLimiter = rateLimit({ windowMs: 60000, max: 10, message: { error: 'Trop de tentatives, réessayez plus tard.' } });

app.use('/api/', generalLimiter);

function getCalendarWithData(code) {
  const data = readData();
  const cal = data.calendars?.[code.toUpperCase()];
  return cal ? { data, cal } : null;
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), vapid: !!VAPID_PUBLIC_KEY });
});

app.post('/api/push/register', (req, res) => {
  const { subscription, token, platform } = req.body;
  const subs = readPushSubs();

  if (subscription?.endpoint) {
    const exists = subs.web.some(s => s.endpoint === subscription.endpoint);
    if (!exists) subs.web.push(subscription);
  }
  if (token && platform === 'fcm') {
    const exists = subs.fcm.some(t => t.token === token);
    if (!exists) subs.fcm.push({ token, platform: 'android', createdAt: new Date().toISOString() });
  }

  writePushSubs(subs);
  res.json({ success: true });
});

app.post('/api/calendar/create', authLimiter, (req, res) => {
  const name = sanitize(req.body.name, 25);
  const creator = sanitize(req.body.creator, 15);

  if (!name || !creator) {
    return res.status(400).json({ error: 'Nom et créateur requis (2-25 caractères).' });
  }

  const code = generateCode();
  const data = readData();

  data.calendars[code] = {
    name, code, creator,
    createdAt: new Date().toISOString(),
    members: [creator],
    events: []
  };

  writeData(data);
  res.json({ code, name, creator });
});

app.post('/api/calendar/:code/join', (req, res) => {
  const username = sanitize(req.body.username, 15);
  if (!username) return res.status(400).json({ error: 'Pseudo requis.' });

  const result = getCalendarWithData(req.params.code);
  if (!result) return res.status(404).json({ error: 'Calendrier introuvable.' });
  const { data, cal } = result;

  if (!cal.members.includes(username)) {
    cal.members.push(username);
    writeData(data);

    broadcastToCalendar(cal.code, {
      type: 'notification',
      notification: {
        id: crypto.randomUUID(),
        type: 'join',
        message: `${username} a rejoint le calendrier.`,
        timestamp: new Date().toISOString()
      }
    });
  }

  res.json({
    code: cal.code, name: cal.name,
    members: cal.members, events: cal.events
  });
});

app.get('/api/calendar/:code', (req, res) => {
  const result = getCalendarWithData(req.params.code);
  if (!result) return res.status(404).json({ error: 'Calendrier introuvable.' });
  res.json(result.cal);
});

app.post('/api/calendar/:code/event', (req, res) => {
  const result = getCalendarWithData(req.params.code);
  if (!result) return res.status(404).json({ error: 'Calendrier introuvable.' });
  const { data, cal } = result;

  const ev = req.body.event || {};
  const title = sanitize(ev.title, 40);
  const date = ev.date;
  const start = ev.start;
  const end = ev.end || '';
  const description = sanitize(ev.description, 150);
  const creator = sanitize(ev.creator, 15);
  const color = /^#[0-9a-f]{6}$/i.test(ev.color || '') ? ev.color : '#6366f1';

  if (!title || !date || !start || !creator) {
    return res.status(400).json({ error: 'Champs requis manquants : titre, date, heure, créateur.' });
  }
  if (!isValidDate(date)) return res.status(400).json({ error: 'Format date invalide (YYYY-MM-DD).' });
  if (!isValidTime(start)) return res.status(400).json({ error: 'Format heure invalide (HH:MM).' });
  if (end && !isValidTime(end)) return res.status(400).json({ error: 'Format heure de fin invalide (HH:MM).' });
  if (!cal.members.includes(creator)) return res.status(403).json({ error: 'Vous n\'êtes pas membre de ce calendrier.' });

  const newEvent = {
    id: crypto.randomUUID(),
    title, date, start, end, description, creator, color,
    recurrence: ev.recurrence && typeof ev.recurrence === 'object' ? ev.recurrence : null,
    createdAt: new Date().toISOString()
  };

  cal.events.push(newEvent);
  writeData(data);

  const msg = `${creator} a ajouté "${title}" à ${start}.`;
  broadcastToCalendar(cal.code, { type: 'sync', events: cal.events });
  broadcastToCalendar(cal.code, { type: 'notification', notification: { id: crypto.randomUUID(), type: 'add', message: msg, timestamp: new Date().toISOString() } });
  sendPushToCalendar(cal.code, 'CoCalendar - Nouvel événement', msg);

  res.json(newEvent);
});

app.put('/api/calendar/:code/event/:id', (req, res) => {
  const result = getCalendarWithData(req.params.code);
  if (!result) return res.status(404).json({ error: 'Calendrier introuvable.' });
  const { data, cal } = result;

  const evIdx = cal.events.findIndex(e => e.id === req.params.id);
  if (evIdx === -1) return res.status(404).json({ error: 'Événement introuvable.' });

  const existing = cal.events[evIdx];
  const body = req.body.event || {};
  const title = body.title !== undefined ? sanitize(body.title, 40) : existing.title;
  const date = body.date !== undefined ? body.date : existing.date;
  const start = body.start !== undefined ? body.start : existing.start;
  const end = body.end !== undefined ? body.end : existing.end;
  const description = body.description !== undefined ? sanitize(body.description, 150) : existing.description;
  const color = body.color !== undefined ? (/^#[0-9a-f]{6}$/i.test(body.color) ? body.color : existing.color) : existing.color;
  const recurrence = body.recurrence !== undefined ? (typeof body.recurrence === 'object' ? body.recurrence : null) : existing.recurrence;

  if (date && !isValidDate(date)) return res.status(400).json({ error: 'Format date invalide.' });
  if (start && !isValidTime(start)) return res.status(400).json({ error: 'Format heure invalide.' });
  if (end && !isValidTime(end)) return res.status(400).json({ error: 'Format heure de fin invalide.' });

  cal.events[evIdx] = { ...existing, title, date, start, end, description, color, recurrence, updatedAt: new Date().toISOString() };
  writeData(data);

  const msg = `${existing.creator} a modifié "${title}".`;
  broadcastToCalendar(cal.code, { type: 'sync', events: cal.events });
  broadcastToCalendar(cal.code, { type: 'notification', notification: { id: crypto.randomUUID(), type: 'edit', message: msg, timestamp: new Date().toISOString() } });

  res.json(cal.events[evIdx]);
});

app.delete('/api/calendar/:code/event/:id', (req, res) => {
  const result = getCalendarWithData(req.params.code);
  if (!result) return res.status(404).json({ error: 'Calendrier introuvable.' });
  const { data, cal } = result;

  const username = sanitize(req.query.username, 15);
  if (!username) return res.status(400).json({ error: 'Username requis.' });
  if (!cal.members.includes(username)) return res.status(403).json({ error: 'Vous n\'êtes pas membre de ce calendrier.' });

  const evIdx = cal.events.findIndex(e => e.id === req.params.id);
  if (evIdx === -1) return res.status(404).json({ error: 'Événement introuvable.' });

  const deleted = cal.events[evIdx];
  cal.events.splice(evIdx, 1);
  writeData(data);

  const msg = `${username} a annulé "${deleted.title}".`;
  broadcastToCalendar(cal.code, { type: 'sync', events: cal.events });
  broadcastToCalendar(cal.code, { type: 'notification', notification: { id: crypto.randomUUID(), type: 'delete', message: msg, timestamp: new Date().toISOString() } });
  sendPushToCalendar(cal.code, 'CoCalendar - Événement annulé', msg);

  res.json({ success: true, id: req.params.id });
});

app.delete('/api/calendar/:code/member/:username', (req, res) => {
  const result = getCalendarWithData(req.params.code);
  if (!result) return res.status(404).json({ error: 'Calendrier introuvable.' });
  const { data, cal } = result;

  const username = sanitize(req.params.username, 15);
  const idx = cal.members.indexOf(username);
  if (idx === -1) return res.status(404).json({ error: 'Membre introuvable.' });

  cal.members.splice(idx, 1);

  if (cal.members.length === 0) {
    delete data.calendars[cal.code];
  }
  writeData(data);

  broadcastToCalendar(cal.code, {
    type: 'notification',
    notification: { id: crypto.randomUUID(), type: 'leave', message: `${username} a quitté le calendrier.`, timestamp: new Date().toISOString() }
  });

  res.json({ success: true });
});

app.post('/api/calendar/:code/import', (req, res) => {
  const result = getCalendarWithData(req.params.code);
  if (!result) return res.status(404).json({ error: 'Calendrier introuvable.' });
  const { data, cal } = result;

  const events = req.body.events;
  const username = sanitize(req.body.username, 15);
  if (!events || !Array.isArray(events) || !events.length || !username) {
    return res.status(400).json({ error: 'Tableau d\'événements et nom requis.' });
  }
  if (!cal.members.includes(username)) return res.status(403).json({ error: 'Vous n\'êtes pas membre de ce calendrier.' });

  const imported = events.slice(0, 500).map(e => ({
    id: crypto.randomUUID(),
    title: sanitize(e.title, 40),
    date: isValidDate(e.date) ? e.date : '',
    start: isValidTime(e.start) ? e.start : '00:00',
    end: e.end && isValidTime(e.end) ? e.end : '',
    description: sanitize(e.description, 150),
    creator: username,
    color: /^#[0-9a-f]{6}$/i.test(e.color || '') ? e.color : '#10b981',
    createdAt: new Date().toISOString()
  })).filter(e => e.title && e.date);

  if (!imported.length) return res.status(400).json({ error: 'Aucun événement valide à importer.' });

  cal.events.push(...imported);
  writeData(data);

  const msg = `${username} a importé ${imported.length} événement(s).`;
  broadcastToCalendar(cal.code, { type: 'sync', events: cal.events });
  broadcastToCalendar(cal.code, { type: 'notification', notification: { id: crypto.randomUUID(), type: 'import', message: msg, timestamp: new Date().toISOString() } });
  sendPushToCalendar(cal.code, 'CoCalendar - Import', msg);

  res.json({ success: true, count: imported.length });
});

app.get('/api/calendar/:code/export', (req, res) => {
  const result = getCalendarWithData(req.params.code);
  if (!result) return res.status(404).json({ error: 'Calendrier introuvable.' });
  const { cal } = result;

  const format = req.query.format || 'ics';

  if (format === 'json') {
    return res.json(cal);
  }

  let ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CoCalendar//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:' + cal.name,
    'X-WR-CALDESC:CoCalendar - ' + cal.code
  ];

  for (const ev of cal.events) {
    const startIcs = ev.date.replace(/-/g, '') + 'T' + ev.start.replace(/:/g, '') + '00';
    const endDate = ev.end ? ev.date + 'T' + ev.end : ev.date + 'T' + (String(parseInt(ev.start.split(':')[0]) + 1).padStart(2, '0') + ':00');
    const endIcs = endDate.replace(/[-:]/g, '') + '00';

    ics.push('BEGIN:VEVENT');
    ics.push('UID:' + ev.id + '@cocalendar');
    ics.push('DTSTART:' + startIcs);
    ics.push('DTEND:' + endIcs);
    ics.push('SUMMARY:' + ev.title);
    if (ev.description) ics.push('DESCRIPTION:' + ev.description.replace(/\n/g, '\\n'));
    ics.push('CREATOR:' + ev.creator);
    ics.push('END:VEVENT');
  }

  ics.push('END:VCALENDAR');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${cal.code}.ics"`);
  res.send(ics.join('\r\n'));
});

app.post('/api/calendar/:code/restore', (req, res) => {
  const result = getCalendarWithData(req.params.code);
  if (!result) return res.status(404).json({ error: 'Calendrier introuvable.' });
  const { data, cal } = result;

  const backup = req.body;
  if (!backup || !backup.events || !Array.isArray(backup.events)) {
    return res.status(400).json({ error: 'Sauvegarde invalide.' });
  }

  const username = sanitize(req.body.restoredBy, 15) || 'Sauvegarde';
  if (!cal.members.includes(username)) cal.members.push(username);

  cal.events = backup.events.slice(0, 5000).map(e => ({
    id: crypto.randomUUID(),
    title: sanitize(e.title || e.titre, 40) || 'Événement',
    date: isValidDate(e.date) ? e.date : '2026-01-01',
    start: isValidTime(e.start) ? e.start : '12:00',
    end: e.end && isValidTime(e.end) ? e.end : '',
    description: sanitize(e.description || e.desc, 150),
    creator: sanitize(e.creator || username, 15),
    color: /^#[0-9a-f]{6}$/i.test(e.color || '') ? e.color : '#6366f1',
    createdAt: new Date().toISOString()
  }));
  writeData(data);

  broadcastToCalendar(cal.code, { type: 'sync', events: cal.events });
  broadcastToCalendar(cal.code, {
    type: 'notification',
    notification: { id: crypto.randomUUID(), type: 'import', message: `${cal.events.length} événements restaurés depuis une sauvegarde.`, timestamp: new Date().toISOString() }
  });

  res.json({ success: true, count: cal.events.length });
});

app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON invalide.' });
  }
  console.error('Server error:', err);
  res.status(500).json({ error: 'Erreur interne du serveur.' });
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws) => {
  ws.on('message', (messageStr) => {
    try {
      const msg = JSON.parse(messageStr);

      if (msg.type === 'join') {
        const code = msg.code?.toUpperCase();
        const username = msg.username;
        if (code && username) {
          clients.set(ws, { code, username });
          ws.send(JSON.stringify({ type: 'joined', code }));
        }
      }

      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch {}
  });

  ws.on('close', () => {
    const info = clients.get(ws);
    if (info) clients.delete(ws);
  });
});

const clientDistPath = path.resolve(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  }));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

if (!fs.existsSync(DATA_FILE)) {
  writeData({ calendars: {} });
  console.log('Initialized empty data.json');
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`  Local:   http://localhost:${PORT}`);
});
