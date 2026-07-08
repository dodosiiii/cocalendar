import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Calendar as CalendarIcon, Settings, Bell, X, RefreshCw, Plus, List, Users } from 'lucide-react';
import { App as CapacitorApp } from '@capacitor/app';
import JoinCreateView from './components/JoinCreateView';
import CalendarView from './components/CalendarView';
import AgendaView from './components/AgendaView';
import MembersView from './components/MembersView';
import SettingsView from './components/SettingsView';
import IosInstallBanner from './components/IosInstallBanner';
import { getApiBaseUrl, getWsBaseUrl, resolveServerOrigin } from './config/serverUrl';
import { shouldShowIosInstallHint, isNativeApp } from './utils/platform';
import './App.css';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(ch => ch.charCodeAt(0)));
}

let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  return audioCtx;
}

function playNotificationSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(523.25, now);
    osc.frequency.setValueAtTime(659.25, now + 0.08);
    osc.frequency.setValueAtTime(783.99, now + 0.16);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.start(now);
    osc.stop(now + 0.4);
  } catch {}
}

export default function App() {
  const [serverOrigin, setServerOrigin] = useState(() => resolveServerOrigin());
  const [calendar, setCalendar] = useState(null);
  const [username, setUsername] = useState('');
  const [activeTab, setActiveTab] = useState('calendar');
  const [notifications, setNotifications] = useState([]);
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [restoring, setRestoring] = useState(true);
  const [fetchError, setFetchError] = useState('');

  const [addTrigger, setAddTrigger] = useState(0);
  const [navigateDate, setNavigateDate] = useState(null);

  const API_BASE_URL = useMemo(() => getApiBaseUrl(serverOrigin), [serverOrigin]);
  const WS_BASE_URL = useMemo(() => getWsBaseUrl(serverOrigin), [serverOrigin]);

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const pingIntervalRef = useRef(null);
  const pushRegisteredRef = useRef(false);
  const restoringRef = useRef(true);
  const calendarRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => { calendarRef.current = calendar; }, [calendar]);

  // Ajustement de la hauteur quand le clavier virtuel s'ouvre (mobile)
  useEffect(() => {
    if (!window.visualViewport) return;
    const handler = () => {
      if (containerRef.current) {
        containerRef.current.style.height = `${window.visualViewport.height}px`;
      }
    };
    window.visualViewport.addEventListener('resize', handler);
    return () => window.visualViewport.removeEventListener('resize', handler);
  }, []);

  // Sauvegarde des données en cache pour récupération immédiate après veille Render
  useEffect(() => {
    if (calendar) {
      try { sessionStorage.setItem('cocalendar_cache', JSON.stringify(calendar)); } catch {}
    }
  }, [calendar]);

  // Keep-alive HTTP pour éviter que Render ne mette le serveur en veille
  useEffect(() => {
    if (!API_BASE_URL) return;
    const keepAlive = setInterval(() => {
      fetch(`${API_BASE_URL}/api/health`).catch(() => {});
    }, 600000);
    fetch(`${API_BASE_URL}/api/health`).catch(() => {});
    return () => clearInterval(keepAlive);
  }, [API_BASE_URL]);

  const fetchCalendar = useCallback(async (code, user) => {
    try {
      setFetchError('');
      setWsStatus('connecting');
      const response = await fetch(`${API_BASE_URL}/api/calendar/${code.toUpperCase()}`);
      if (!response.ok) throw new Error("Impossible de charger ce calendrier.");
      const data = await response.json();
      setCalendar(data);
      setUsername(user);
      localStorage.setItem('cocalendar_code', data.code);
      localStorage.setItem('cocalendar_user', user);
      setRestoring(false);
    } catch (err) {
      if (calendarRef.current) {
        setWsStatus('disconnected');
      } else {
        setCalendar(null);
        setRestoring(false);
        if (!restoringRef.current) setFetchError(err.message);
      }
    }
  }, [API_BASE_URL]);

  const reconnectWithToken = useCallback(async (code, user, token) => {
    try {
      setFetchError('');
      setWsStatus('connecting');
      const response = await fetch(`${API_BASE_URL}/api/calendar/${code.toUpperCase()}/reconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, token })
      });
      if (!response.ok) throw new Error("Session expirée.");
      const data = await response.json();
      setCalendar(data);
      setUsername(user);
      setRestoring(false);
    } catch (err) {
      if (calendarRef.current) {
        setWsStatus('disconnected');
      } else {
        setCalendar(null);
        setRestoring(false);
        if (!restoringRef.current) setFetchError(err.message);
      }
    }
  }, [API_BASE_URL]);

  useEffect(() => {
    restoringRef.current = true;
    setRestoring(true);
    setFetchError('');
    const savedCode = localStorage.getItem('cocalendar_code');
    const savedUser = localStorage.getItem('cocalendar_user');
    const savedToken = localStorage.getItem('cocalendar_token');

    if (savedCode && savedUser && API_BASE_URL) {
      setUsername(savedUser);

      try {
        const cached = sessionStorage.getItem('cocalendar_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.code === savedCode) {
            setCalendar(parsed);
            setRestoring(false);
          }
        }
      } catch {}

      const doFetch = savedToken
        ? reconnectWithToken(savedCode, savedUser, savedToken)
        : fetchCalendar(savedCode, savedUser);

      doFetch.then(() => { restoringRef.current = false; }, () => { restoringRef.current = false; });
    } else {
      setRestoring(false);
      restoringRef.current = false;
    }
  }, [API_BASE_URL, fetchCalendar, reconnectWithToken]);

  useEffect(() => {
    if (!isNativeApp()) return;
    let handler;
    CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        const savedCode = localStorage.getItem('cocalendar_code');
        const savedUser = localStorage.getItem('cocalendar_user');
        if (savedCode && savedUser && calendar) {
          fetchCalendar(savedCode, savedUser);
        }
        // Force reconnexion WebSocket au retour sur l'app native
        if (wsRef.current && wsRef.current.readyState !== WebSocket.OPEN) {
          reconnectAttemptRef.current = 0;
          if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
          wsRef.current.close();
        }
      }
    }).then(h => { handler = h; });
    return () => { handler?.remove(); };
  }, [calendar, fetchCalendar]);

  const VAPID_PUBLIC_KEY = 'BMrRdVqYlDFYjOMZvK6VDFPJ8FS3jDodY_yOZkLDSlVDD1g6OKQYpqewo5EAET12nR7PG_6D5N52N2xqxArQCys';

  const registerPush = useCallback(async () => {
    if (pushRegisteredRef.current) return;
    pushRegisteredRef.current = true;

    try {
      if (isNativeApp()) {
        // Native push (Firebase) requires google-services.json in android/app/
        // Skipped by default to avoid native crash. To enable:
        // 1. Create Firebase project, download google-services.json
        // 2. Place in client/android/app/
        // 3. Uncomment below and rebuild
        // const perm = await PushNotifications.requestPermissions();
        // if (perm.receive === 'granted') {
        //   await PushNotifications.register();
        //   PushNotifications.addListener('pushNotificationReceived', (n) => {
        //     setNotifications(prev => [...prev, { id: Math.random().toString(36).substring(2), type: 'add', message: n.body || n.title || '' }]);
        //     playNotificationSound();
        //   });
        // }
      } else if ('serviceWorker' in navigator && 'PushManager' in window && VAPID_PUBLIC_KEY) {
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
          });
        }
        await fetch(`${API_BASE_URL}/api/push/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON() })
        });
      }
    } catch {}
  }, [API_BASE_URL]);

  useEffect(() => {
    if (calendar && !pushRegisteredRef.current) registerPush();
  }, [calendar, registerPush]);

  const showSystemNotification = (message) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('CoCalendar', { body: message, icon: '/favicon.svg' });
    }
  };

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const code = calendar?.code;
    if (!code || !username || !WS_BASE_URL) return;

    reconnectAttemptRef.current = 0;

    const connectWebSocket = () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }

      setWsStatus('connecting');
      const ws = new WebSocket(WS_BASE_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus('connected');
        reconnectAttemptRef.current = 0;
        ws.send(JSON.stringify({ type: 'join', code, username }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'joined') {
            const savedToken = localStorage.getItem('cocalendar_token');
            const fetchOpts = savedToken
              ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, token: savedToken }) }
              : {};
            const url = savedToken
              ? `${API_BASE_URL}/api/calendar/${code}/reconnect`
              : `${API_BASE_URL}/api/calendar/${code}`;
            fetch(url, fetchOpts)
              .then(r => r.json())
              .then(calData => {
                setCalendar(prev => prev ? { ...prev, events: calData.events } : null);
              })
              .catch(() => {});
          }

          if (data.type === 'sync') {
            setCalendar(prev => prev ? { ...prev, events: data.events } : null);
          }

          if (data.type === 'notification' && data.notification) {
            const { message, type, id } = data.notification;
            setNotifications(prev => {
              if (prev.some(n => n.id === id)) return prev;
              return [...prev, { id, type, message }];
            });
            playNotificationSound();
            if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
            showSystemNotification(message);
            setTimeout(() => removeNotification(id), 4000);
          }
        } catch {}
      };

      ws.onclose = () => {
        setWsStatus('disconnected');
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000);
        reconnectAttemptRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay + Math.random() * 1000);
      };

      ws.onerror = () => { ws.close(); };
    };

    connectWebSocket();

    pingIntervalRef.current = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000);

    const handleOnline = () => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        reconnectAttemptRef.current = 0;
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        connectWebSocket();
      }
    };
    window.addEventListener('online', handleOnline);

    window.addEventListener('offline', () => setWsStatus('disconnected'));

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          reconnectAttemptRef.current = 0;
          if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
          connectWebSocket();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(pingIntervalRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    };
  }, [calendar?.code, username, WS_BASE_URL, API_BASE_URL]);

  const removeNotification = (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, fading: true } : n));
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 300);
  };

  const handleJoined = (calendarData, user, token) => {
    setCalendar(calendarData);
    setUsername(user);
    localStorage.setItem('cocalendar_code', calendarData.code);
    localStorage.setItem('cocalendar_user', user);
    if (token) localStorage.setItem('cocalendar_token', token);
  };

  const handleLeaveCalendar = async () => {
    if (!window.confirm("Voulez-vous vraiment quitter ce calendrier ?")) return;
    if (wsRef.current) wsRef.current.close();
    try {
      await fetch(`${API_BASE_URL}/api/calendar/${calendar.code}/member/${encodeURIComponent(username)}`, { method: 'DELETE' });
    } catch {}
    localStorage.removeItem('cocalendar_code');
    localStorage.removeItem('cocalendar_user');
    localStorage.removeItem('cocalendar_token');
    try { sessionStorage.removeItem('cocalendar_cache'); } catch {}
    setCalendar(null);
    setUsername('');
    setActiveTab('calendar');
  };

  const handleAddEventLocally = (newEvent) => {
    setCalendar(prev => {
      if (!prev) return prev;
      if (prev.events?.some(e => e.id === newEvent.id)) return prev;
      return { ...prev, events: [...(prev.events || []), newEvent] };
    });
  };

  const handleUpdateEventLocally = (updatedEvent) => {
    setCalendar(prev => {
      if (!prev) return prev;
      const events = (prev.events || []).map(e => e.id === updatedEvent.id ? updatedEvent : e);
      return { ...prev, events };
    });
  };

  const handleDeleteEventLocally = (eventId) => {
    setCalendar(prev => {
      if (!prev) return prev;
      return { ...prev, events: (prev.events || []).filter(e => e.id !== eventId) };
    });
  };

  const handleImportSuccess = () => {
    fetchCalendar(calendar?.code, username);
  };

  if (restoring) {
    return (
      <div className="app-phone-container" ref={containerRef}>
        <div className="loading-screen">
          <div className="loading-spinner" />
          <p>Restauration de votre session...</p>
        </div>
      </div>
    );
  }

  if (!calendar && fetchError) {
    const savedCode = localStorage.getItem('cocalendar_code');
    const savedUser = localStorage.getItem('cocalendar_user');
    return (
      <div className="app-phone-container" ref={containerRef}>
        <div className="loading-screen">
          <div className="auth-logo pulse-glow" style={{ marginBottom: '1.5rem' }}>
            <CalendarIcon size={40} color="white" />
          </div>
          <p style={{ color: '#ef4444', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.95rem' }}>
            Serveur injoignable
          </p>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.85rem', textAlign: 'center', maxWidth: 300 }}>
            {fetchError}. Vérifiez que votre serveur est en ligne.
          </p>
          <button type="button" className="btn-primary" onClick={() => fetchCalendar(savedCode, savedUser)} style={{ marginBottom: '0.75rem' }}>
            <RefreshCw size={18} /> Réessayer
          </button>
          <button type="button" className="btn-secondary" onClick={() => {
            localStorage.removeItem('cocalendar_code');
            localStorage.removeItem('cocalendar_user');
            localStorage.removeItem('cocalendar_token');
            try { sessionStorage.removeItem('cocalendar_cache'); } catch {}
            setCalendar(null);
            setFetchError('');
          }}>
            Changer de calendrier
          </button>
        </div>
      </div>
    );
  }

  if (!calendar) {
    return (
      <div className="app-phone-container" ref={containerRef}>
        {shouldShowIosInstallHint() && <IosInstallBanner />}
        <JoinCreateView
          onJoined={handleJoined}
          apiBaseUrl={API_BASE_URL}
          serverOrigin={serverOrigin}
          onServerOriginChange={setServerOrigin}
        />
      </div>
    );
  }

  return (
    <div className="app-phone-container" ref={containerRef}>
      {shouldShowIosInstallHint() && <IosInstallBanner />}

      <div className="notification-container">
        {notifications.map(n => (
          <div key={n.id} className={`notification-toast type-${n.type} ${n.fading ? 'fade-out' : ''}`}>
            <Bell size={16} />
            <span>{n.message}</span>
            <button type="button" className="btn-close-toast" onClick={() => removeNotification(n.id)}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <header className="app-header">
        <div className="app-title-group">
          <h1>{calendar.name}</h1>
          <p>Connecté en tant que <strong>{username}</strong></p>
        </div>
        <div className="calendar-badge" onClick={() => fetchCalendar(calendar.code, username)} title="Actualiser">
          {wsStatus === 'connected' ? (
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--success)' }} />
          ) : (
            <RefreshCw size={12} style={{ animation: wsStatus === 'connecting' ? 'spin 1.5s linear infinite' : 'none' }} />
          )}
          <span>{calendar.code}</span>
        </div>
      </header>

      <main className="app-content">
        {activeTab === 'calendar' ? (
          <CalendarView
            calendar={calendar}
            username={username}
            apiBaseUrl={API_BASE_URL}
            onAddEvent={handleAddEventLocally}
            onUpdateEvent={handleUpdateEventLocally}
            onDeleteEvent={handleDeleteEventLocally}
            addTrigger={addTrigger}
            goToDate={navigateDate}
          />
        ) : activeTab === 'agenda' ? (
          <AgendaView
            events={calendar.events || []}
            username={username}
            onNavigateToDate={(dateStr) => {
              setNavigateDate(dateStr);
              setActiveTab('calendar');
            }}
          />
        ) : activeTab === 'members' ? (
          <MembersView
            calendar={calendar}
            username={username}
          />
        ) : (
          <SettingsView
            calendar={calendar}
            username={username}
            apiBaseUrl={API_BASE_URL}
            serverOrigin={serverOrigin}
            onImportSuccess={handleImportSuccess}
            onLeave={handleLeaveCalendar}
          />
        )}
      </main>

      <nav className="app-navbar">
        <button type="button" className={`nav-item ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}>
          <div className="nav-icon-wrapper"><CalendarIcon size={20} /></div>
          <span>Calendrier</span>
        </button>
        <button type="button" className={`nav-item ${activeTab === 'agenda' ? 'active' : ''}`} onClick={() => setActiveTab('agenda')}>
          <div className="nav-icon-wrapper"><List size={20} /></div>
          <span>Agenda</span>
        </button>
        <button type="button" className={`nav-item ${activeTab === 'members' ? 'active' : ''}`} onClick={() => setActiveTab('members')}>
          <div className="nav-icon-wrapper"><Users size={20} /></div>
          <span>Membres</span>
        </button>
        <button type="button" className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
          <div className="nav-icon-wrapper"><Settings size={20} /></div>
          <span>Réglages</span>
        </button>
        <button type="button" className="nav-fab" onClick={() => {
          setActiveTab('calendar');
          setAddTrigger(t => t + 1);
        }} aria-label="Ajouter un événement">
          <Plus size={22} />
        </button>
      </nav>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
