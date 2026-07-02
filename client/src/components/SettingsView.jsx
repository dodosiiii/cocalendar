import React, { useState, useRef } from 'react';
import { Share2, Users, Upload, Check, AlertCircle, LogOut, Globe, Smartphone } from 'lucide-react';
import { parseIcs } from '../utils/IcsParser';
import { shouldShowIosInstallHint, isNativeApp } from '../utils/platform';

export default function SettingsView({ calendar, username, apiBaseUrl, serverOrigin, onImportSuccess, onLeave }) {
  const [copied, setCopied] = useState(false);
  const [importedEvents, setImportedEvents] = useState([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const copyCode = () => {
    navigator.clipboard.writeText(calendar.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    setError('');

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const parsed = parseIcs(text);
        
        if (parsed.length === 0) {
          setError("Aucun événement valide n'a pu être extrait de ce fichier ICS.");
          setImportedEvents([]);
        } else {
          setImportedEvents(parsed);
        }
      } catch (err) {
        setError("Erreur lors de la lecture du fichier ICS: " + err.message);
        setImportedEvents([]);
      }
    };
    reader.readAsText(file);
  };

  const triggerFileSelect = () => {
    fileInputRef.current.click();
  };

  const handleImportSubmit = async () => {
    if (importedEvents.length === 0) return;

    setImporting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/api/calendar/${calendar.code}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: importedEvents, username })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erreur d'importation");

      alert(`${importedEvents.length} événements importés avec succès !`);
      onImportSuccess(data);
      setImportedEvents([]);
      setFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/calendar/${calendar.code}/export?format=ics`);
      if (!response.ok) throw new Error("Erreur d'export");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${calendar.code}.ics`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Erreur d'export: " + err.message);
    }
  };

  return (
    <div className="settings-container">
      {shouldShowIosInstallHint() && (
        <div className="settings-card">
          <h4>
            <Smartphone size={18} color="var(--secondary)" />
            Installer sur iPhone
          </h4>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Ouvrez cette page dans <strong>Safari</strong>, touchez le bouton <strong>Partager</strong>,
            puis choisissez <strong>Sur l'écran d'accueil</strong>. L'app se connectera au serveur
            pour votre compte et votre calendrier.
          </p>
        </div>
      )}

      {isNativeApp() && serverOrigin && (
        <div className="settings-card">
          <h4>
            <Smartphone size={18} color="var(--success)" />
            Application Android
          </h4>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Connectée au serveur pour la synchronisation du calendrier en temps réel.
          </p>
        </div>
      )}

      {/* Server Info */}
      {serverOrigin && (
        <div className="settings-card">
          <h4>
            <Globe size={18} color="var(--primary)" />
            Serveur connecté
          </h4>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
            {serverOrigin}
          </p>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
            L'app fonctionne partout tant que ce serveur est en ligne.
          </p>
        </div>
      )}

      {/* Code Sharing Card */}
      <div className="settings-card">
        <h4>
          <Share2 size={18} color="var(--primary)" />
          Partager le Calendrier
        </h4>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Donnez ce code aux personnes avec qui vous souhaitez partager votre calendrier.
        </p>
        <div className="calendar-code-box">
          <span className="calendar-code-text">{calendar.code}</span>
          <button type="button" className="btn-copy" onClick={copyCode}>
            {copied ? <Check size={14} /> : null}
            {copied ? 'Copié !' : 'Copier'}
          </button>
        </div>
      </div>

      {/* Members List */}
      <div className="settings-card">
        <h4>
          <Users size={18} color="var(--secondary)" />
          Membres du Calendrier ({calendar.members ? calendar.members.length : 0})
        </h4>
        <div className="member-list">
          {calendar.members && calendar.members.map((member, idx) => (
            <div key={idx} className="member-item">
              <div className="member-avatar">
                {member.substring(0, 2).toUpperCase()}
              </div>
              <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                {member} {member === username ? '(vous)' : ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Export */}
      <div className="settings-card">
        <h4>
          <Share2 size={18} color="var(--primary)" />
          Exporter le Calendrier
        </h4>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Téléchargez vos événements au format ICS pour les importer ailleurs.
        </p>
        <button type="button" className="btn-secondary" style={{ width: '100%' }} onClick={handleExport}>
          <Upload size={16} /> Télécharger .ics
        </button>
      </div>

      {/* ICS Import */}
      <div className="settings-card">
        <h4>
          <Upload size={18} color="var(--success)" />
          Importer un Calendrier (.ics)
        </h4>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Importez vos événements existants au format iCalendar standard.
        </p>

        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          accept=".ics"
          onChange={handleFileChange}
        />

        <div className="file-dropzone" onClick={triggerFileSelect}>
          <Upload size={32} color="var(--text-dim)" />
          {fileName ? (
            <div>
              <p style={{ color: 'var(--text-main)', fontWeight: 600 }}>{fileName}</p>
              <p style={{ fontSize: '0.75rem' }}>Cliquez pour changer de fichier</p>
            </div>
          ) : (
            <div>
              <p style={{ color: 'var(--text-main)', fontWeight: 500 }}>Sélectionnez un fichier .ics</p>
              <p style={{ fontSize: '0.75rem' }}>Taille max conseillée : 5 Mo</p>
            </div>
          )}
        </div>

        {error && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '1rem', color: 'var(--danger)', fontSize: '0.8rem' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {importedEvents.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <p style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Aperçu des événements ({importedEvents.length}) :
            </p>
            <div className="import-preview-list">
              {importedEvents.map((evt, index) => (
                <div key={index} className="import-preview-item">
                  <span className="import-preview-title">{evt.title}</span>
                  <span className="import-preview-date">
                    {evt.date} à {evt.start}
                  </span>
                </div>
              ))}
            </div>
            
            <button 
              type="button" 
              className="btn-primary" 
              style={{ width: '100%', marginTop: '1rem' }}
              onClick={handleImportSubmit}
              disabled={importing}
            >
              {importing ? 'Importation en cours...' : `Confirmer l'importation de ${importedEvents.length} événements`}
            </button>
          </div>
        )}
      </div>

      {/* Leave Calendar Button */}
      <button 
        type="button" 
        className="btn-secondary" 
        style={{ color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}
        onClick={onLeave}
      >
        <LogOut size={16} />
        Quitter le calendrier
      </button>
    </div>
  );
}
