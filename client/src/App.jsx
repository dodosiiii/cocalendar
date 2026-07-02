import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Calendar as CalendarIcon, Settings, Bell, X, RefreshCw } from 'lucide-react';
import JoinCreateView from './components/JoinCreateView';
import CalendarView from './components/CalendarView';
import SettingsView from './components/SettingsView';
import IosInstallBanner from './components/IosInstallBanner';
import { getApiBaseUrl, getWsBaseUrl, resolveServerOrigin } from './config/serverUrl';
import { shouldShowIosInstallHint } from './utils/platform';
import './App.css';

export default function App() {
  const [serverOrigin, setServerOrigin] = useState(() => resolveServerOrigin());
  const [calendar, setCalendar] = useState(null);
  const [username, setUsername] = useState('');
  const [activeTab, setActiveTab] = useState('calendar'); // 'calendar' or 'settings'
  const [notifications, setNotifications] = useState([]);
  const [wsStatus, setWsStatus] = useState('disconnected'); // 'connecting', 'connected', 'disconnected'

  const API_BASE_URL = useMemo(() => getApiBaseUrl(serverOrigin), [serverOrigin]);
  const WS_BASE_URL = useMemo(() => getWsBaseUrl(serverOrigin), [serverOrigin]);
  
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  // 1. Restore session on mount
  useEffect(() => {
    const savedCode = localStorage.getItem('cocalendar_code');
    const savedUser = localStorage.getItem('cocalendar_user');

    if (savedCode && savedUser && API_BASE_URL) {
      setUsername(savedUser);
      fetchCalendar(savedCode, savedUser);
    }
  }, [API_BASE_URL]);

  // 2. Fetch full calendar state (used during initialization and manual refresh)
  const fetchCalendar = async (code, user) => {
    try {
      setWsStatus('connecting');
      const response = await fetch(`${API_BASE_URL}/api/calendar/${code.toUpperCase()}`);
      if (!response.ok) {
        throw new Error("Impossible de charger ce calendrier.");
      }
      const data = await response.json();
      setCalendar(data);
      setUsername(user);
      
      // Save to localStorage
      localStorage.setItem('cocalendar_code', data.code);
      localStorage.setItem('cocalendar_user', user);
    } catch (err) {
      console.error(err);
      // If code doesn't exist anymore, clear local storage
      localStorage.removeItem('cocalendar_code');
      localStorage.removeItem('cocalendar_user');
      setCalendar(null);
    }
  };

  // 3. Play a beautiful synthetic chime sound (no file dependency)
  const playNotificationSound = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      
      const audioCtx = new AudioContext();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      
      // Beautiful modern notification chime (C5 then E5 then G5 quickly)
      const now = audioCtx.currentTime;
      oscillator.frequency.setValueAtTime(523.25, now); // C5
      oscillator.frequency.setValueAtTime(659.25, now + 0.08); // E5
      oscillator.frequency.setValueAtTime(783.99, now + 0.16); // G5

      gainNode.gain.setValueAtTime(0.12, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      oscillator.start(now);
      oscillator.stop(now + 0.4);
    } catch (e) {
      console.warn("Audio Context blocked or unsupported:", e);
    }
  };

  // 4. Handle System Notifications (Web Push API helper)
  const showSystemNotification = (message) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('CoCalendar', {
        body: message,
        icon: '/favicon.ico'
      });
    }
  };

  // Request browser notification permissions on first load or first socket connection
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [calendar]);

  // 5. Connect and manage WebSockets
  useEffect(() => {
    if (!calendar || !username || !WS_BASE_URL) return;

    const connectWebSocket = () => {
      if (wsRef.current) {
        wsRef.current.close();
      }

      console.log('Connecting to WebSocket at:', WS_BASE_URL);
      setWsStatus('connecting');
      const ws = new WebSocket(WS_BASE_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket Connected');
        setWsStatus('connected');
        // Register to the calendar room
        ws.send(JSON.stringify({
          type: 'join',
          code: calendar.code,
          username: username
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'sync') {
            // Update calendar events
            setCalendar(prev => prev ? { ...prev, events: data.events } : null);
          }
          
          if (data.type === 'notification' && data.notification) {
            const { message, type, id } = data.notification;
            
            // Add toast notification
            setNotifications(prev => [...prev, { id, type, message }]);
            
            // Play sound and trigger vibration
            playNotificationSound();
            if ('vibrate' in navigator) {
              navigator.vibrate([100, 50, 100]);
            }

            // Trigger OS level push notification
            showSystemNotification(message);
            
            // Auto remove toast after 4s
            setTimeout(() => {
              removeNotification(id);
            }, 4000);
          }
        } catch (e) {
          console.error('Error parsing WS message:', e);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket Disconnected, attempting reconnect in 5s...');
        setWsStatus('disconnected');
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 5000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket Error:', err);
        ws.close();
      };
    };

    connectWebSocket();

    // Clean up
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [calendar?.code, username, WS_BASE_URL]);

  const removeNotification = (id) => {
    // Start fadeout animation first
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, fading: true } : n));
    
    // Remove from state after animation finishes (300ms)
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 300);
  };

  const handleJoined = (calendarData, user) => {
    setCalendar(calendarData);
    setUsername(user);
  };

  const handleLeaveCalendar = () => {
    if (window.confirm("Voulez-vous vraiment quitter ce calendrier ?")) {
      if (wsRef.current) wsRef.current.close();
      localStorage.removeItem('cocalendar_code');
      localStorage.removeItem('cocalendar_user');
      setCalendar(null);
      setUsername('');
      setActiveTab('calendar');
    }
  };

  const handleAddEventLocally = (newEvent) => {
    setCalendar(prev => {
      const updatedEvents = [...(prev.events || []), newEvent];
      return { ...prev, events: updatedEvents };
    });
  };

  const handleDeleteEventLocally = (eventId) => {
    setCalendar(prev => {
      const updatedEvents = (prev.events || []).filter(e => e.id !== eventId);
      return { ...prev, events: updatedEvents };
    });
  };

  const handleImportSuccess = (importResult) => {
    // Reload full calendar
    fetchCalendar(calendar.code, username);
  };

  // If not connected to any calendar, show Join/Create Auth screen
  if (!calendar) {
    return (
      <div className="app-phone-container">
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
    <div className="app-phone-container">
      {shouldShowIosInstallHint() && <IosInstallBanner />}

      {/* Toast Notification Layer */}
      <div className="notification-container">
        {notifications.map(n => (
          <div 
            key={n.id} 
            className={`notification-toast type-${n.type} ${n.fading ? 'fade-out' : ''}`}
          >
            <Bell size={16} />
            <span>{n.message}</span>
            <button 
              type="button" 
              className="btn-close-toast" 
              onClick={() => removeNotification(n.id)}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Main Header */}
      <header className="app-header">
        <div className="app-title-group">
          <h1>{calendar.name}</h1>
          <p>Connecté en tant que <strong>{username}</strong></p>
        </div>
        
        {/* Status Indicator */}
        <div 
          className="calendar-badge"
          onClick={() => fetchCalendar(calendar.code, username)}
          title="Actualiser et forcer la reconnexion"
        >
          {wsStatus === 'connected' ? (
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--success)' }} />
          ) : (
            <RefreshCw size={12} className={wsStatus === 'connecting' ? 'spin-anim' : ''} style={{ animation: wsStatus === 'connecting' ? 'spin 1.5s linear infinite' : 'none' }} />
          )}
          <span>{calendar.code}</span>
        </div>
      </header>

      {/* Main Scrollable Body Content */}
      <main className="app-content">
        {activeTab === 'calendar' ? (
          <CalendarView 
            calendar={calendar} 
            username={username}
            apiBaseUrl={API_BASE_URL}
            onAddEvent={handleAddEventLocally}
            onDeleteEvent={handleDeleteEventLocally}
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

      {/* Floating Bottom Nav Bar */}
      <nav className="app-navbar">
        <button 
          type="button"
          className={`nav-item ${activeTab === 'calendar' ? 'active' : ''}`}
          onClick={() => setActiveTab('calendar')}
        >
          <div className="nav-icon-wrapper">
            <CalendarIcon size={20} />
          </div>
          <span>Calendrier</span>
        </button>

        <button 
          type="button"
          className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <div className="nav-icon-wrapper">
            <Settings size={20} />
          </div>
          <span>Réglages</span>
        </button>
      </nav>

      {/* Add global inline animation styles for custom spins */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
