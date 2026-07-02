import React, { useState } from 'react';
import { Calendar, Plus, ArrowRight, Globe, ChevronDown, ChevronUp, Check, AlertCircle } from 'lucide-react';
import { saveServerUrl, testServerConnection } from '../config/serverUrl';
import { isNativeApp } from '../utils/platform';

export default function JoinCreateView({ onJoined, apiBaseUrl, serverOrigin, onServerOriginChange }) {
  const [activeTab, setActiveTab] = useState('join'); // 'join' or 'create'
  const [username, setUsername] = useState('');
  const [calendarName, setCalendarName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showServerConfig, setShowServerConfig] = useState(!apiBaseUrl || isNativeApp());
  const [serverInput, setServerInput] = useState(serverOrigin || '');
  const [serverStatus, setServerStatus] = useState(null); // 'ok' | 'error' | 'testing'
  const [serverMessage, setServerMessage] = useState('');

  const handleSaveServer = async () => {
    setServerStatus('testing');
    setServerMessage('');

    try {
      const normalized = saveServerUrl(serverInput);
      if (!normalized) {
        throw new Error('Adresse invalide. Exemple : https://mon-calendrier.onrender.com');
      }

      await testServerConnection(normalized);
      onServerOriginChange(normalized);
      setServerInput(normalized);
      setServerStatus('ok');
      setServerMessage('Serveur connecté — vous pouvez utiliser l\'app partout.');
      setShowServerConfig(false);
    } catch (err) {
      setServerStatus('error');
      setServerMessage(err.message);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!apiBaseUrl) {
      setError('Configurez d\'abord l\'adresse du serveur ci-dessous.');
      setShowServerConfig(true);
      return;
    }
    if (!username.trim() || !code.trim()) {
      setError('Veuillez remplir tous les champs.');
      return;
    }
    
    setError('');
    setLoading(true);
    
    try {
      const formattedCode = code.trim().toUpperCase();
      const response = await fetch(`${apiBaseUrl}/api/calendar/${formattedCode}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la connexion.');
      }
      
      onJoined(data, username.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!apiBaseUrl) {
      setError('Configurez d\'abord l\'adresse du serveur ci-dessous.');
      setShowServerConfig(true);
      return;
    }
    if (!username.trim() || !calendarName.trim()) {
      setError('Veuillez remplir tous les champs.');
      return;
    }
    
    setError('');
    setLoading(true);
    
    try {
      const response = await fetch(`${apiBaseUrl}/api/calendar/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: calendarName.trim(),
          creator: username.trim()
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la création.');
      }
      
      // After creating, automatically join it
      const joinResponse = await fetch(`${apiBaseUrl}/api/calendar/${data.code}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() })
      });
      
      const joinData = await joinResponse.json();
      if (!joinResponse.ok) {
        throw new Error(joinData.error || 'Erreur lors du raccordement.');
      }
      
      onJoined(joinData, username.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-logo pulse-glow">
        <Calendar size={40} color="white" />
      </div>
      
      <div className="auth-welcome">
        <h2>CoCalendar</h2>
        <p>Partagez votre calendrier en temps réel avec vos proches</p>
      </div>

      <div className="auth-card">
        <div className="auth-tabs">
          <button 
            type="button"
            className={`auth-tab-btn ${activeTab === 'join' ? 'active' : ''}`}
            onClick={() => { setActiveTab('join'); setError(''); }}
          >
            Rejoindre
          </button>
          <button 
            type="button"
            className={`auth-tab-btn ${activeTab === 'create' ? 'active' : ''}`}
            onClick={() => { setActiveTab('create'); setError(''); }}
          >
            Créer
          </button>
        </div>

        {error && <div style={{ color: 'var(--danger)', fontSize: '0.85rem', fontWeight: 600 }}>{error}</div>}

        {activeTab === 'join' ? (
          <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="input-group">
              <label htmlFor="join-username">Votre Pseudo</label>
              <input 
                id="join-username"
                className="input-field" 
                type="text" 
                placeholder="Ex: Sophie" 
                value={username}
                onChange={e => setUsername(e.target.value)}
                maxLength={15}
                required
              />
            </div>
            
            <div className="input-group">
              <label htmlFor="join-code">Code du Calendrier</label>
              <input 
                id="join-code"
                className="input-field" 
                type="text" 
                placeholder="Ex: CAL-A8B9C2" 
                value={code}
                onChange={e => setCode(e.target.value)}
                autoCapitalize="characters"
                required
              />
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Connexion...' : 'Rejoindre le Calendrier'}
              <ArrowRight size={18} />
            </button>
          </form>
        ) : (
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="input-group">
              <label htmlFor="create-username">Votre Pseudo</label>
              <input 
                id="create-username"
                className="input-field" 
                type="text" 
                placeholder="Ex: Pierre" 
                value={username}
                onChange={e => setUsername(e.target.value)}
                maxLength={15}
                required
              />
            </div>
            
            <div className="input-group">
              <label htmlFor="create-name">Nom du Calendrier</label>
              <input 
                id="create-name"
                className="input-field" 
                type="text" 
                placeholder="Ex: Famille Dupont" 
                value={calendarName}
                onChange={e => setCalendarName(e.target.value)}
                maxLength={25}
                required
              />
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Création...' : 'Créer un Calendrier'}
              <Plus size={18} />
            </button>
          </form>
        )}
      </div>

      <div className="settings-card" style={{ marginTop: '1rem' }}>
        <button
          type="button"
          className="server-config-toggle"
          onClick={() => setShowServerConfig(prev => !prev)}
        >
          <Globe size={16} color="var(--primary)" />
          <span>
            Serveur {apiBaseUrl ? '(connecté)' : isNativeApp() ? '(obligatoire)' : '(requis hors Wi-Fi)'}
          </span>
          {showServerConfig ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showServerConfig && (
          <div className="server-config-panel">
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              {isNativeApp()
                ? "L'app Android se connecte à votre serveur en ligne pour le compte et le calendrier partagé."
                : "Pour utiliser l'app en dehors de chez vous, entrez l'adresse de votre serveur en ligne."}
            </p>
            <div className="input-group">
              <label htmlFor="server-url">Adresse du serveur</label>
              <input
                id="server-url"
                className="input-field"
                type="url"
                placeholder="https://mon-calendrier.onrender.com"
                value={serverInput}
                onChange={(e) => {
                  setServerInput(e.target.value);
                  setServerStatus(null);
                  setServerMessage('');
                }}
              />
            </div>

            {serverMessage && (
              <div
                className={`server-status-msg ${serverStatus === 'ok' ? 'ok' : 'error'}`}
                style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.8rem', marginBottom: '0.75rem' }}
              >
                {serverStatus === 'ok' ? <Check size={14} /> : <AlertCircle size={14} />}
                <span>{serverMessage}</span>
              </div>
            )}

            <button
              type="button"
              className="btn-secondary"
              style={{ width: '100%' }}
              onClick={handleSaveServer}
              disabled={serverStatus === 'testing' || !serverInput.trim()}
            >
              {serverStatus === 'testing' ? 'Test de connexion...' : 'Enregistrer et tester'}
            </button>

            {apiBaseUrl && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.75rem' }}>
                Connecté à : {apiBaseUrl}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
