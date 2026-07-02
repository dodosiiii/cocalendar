import React, { useState, useRef } from 'react';
import { Share2, Users, Upload, Download, Check, AlertCircle, LogOut, Globe, Smartphone, HardDrive, RefreshCw } from 'lucide-react';
import { parseIcs } from '../utils/IcsParser';
import { shouldShowIosInstallHint, isNativeApp } from '../utils/platform';

export default function SettingsView({ calendar, username, apiBaseUrl, serverOrigin, onImportSuccess, onLeave }) {
  const [copied, setCopied] = useState(false);
  const [importedEvents, setImportedEvents] = useState([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [backupStatus, setBackupStatus] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const restoreInputRef = useRef(null);

  const copyCode = () => {
    navigator.clipboard.writeText(calendar.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBackup = () => {
    try {
      const data = { code: calendar.code, name: calendar.name, events: calendar.events, savedAt: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CoCalendar-${calendar.code}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setBackupStatus('ok');
      setTimeout(() => setBackupStatus(''), 3000);
    } catch {
      setBackupStatus('error');
    }
  };

  const triggerRestoreSelect = () => restoreInputRef.current?.click();

  const handleRestoreFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setRestoring(true);
    setError('');

    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      if (!backup.events || !Array.isArray(backup.events)) throw new Error('Fichier de sauvegarde invalide.');

      if (!window.confirm(`Restaurer ${backup.events.length} événements dans "${calendar.name}" ? Cela remplacera tous les événements actuels.`)) return;

      const res = await fetch(`${apiBaseUrl}/api/calendar/${calendar.code}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: backup.events, restoredBy: username })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur de restauration');

      alert(`${data.count} événements restaurés !`);
      onImportSuccess(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setRestoring(false);
      if (restoreInputRef.current) restoreInputRef.current.value = '';
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    setError('');

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = parseIcs(event.target.result);
        if (parsed.length === 0) {
          setError("Aucun événement valide extrait.");
          setImportedEvents([]);
        } else {
          setImportedEvents(parsed);
        }
      } catch (err) {
        setError("Erreur de lecture: " + err.message);
        setImportedEvents([]);
      }
    };
    reader.readAsText(file);
  };

  const triggerFileSelect = () => fileInputRef.current?.click();

  const handleImportSubmit = async () => {
    if (!importedEvents.length) return;
    setImporting(true);
    setError('');

    try {
      const res = await fetch(`${apiBaseUrl}/api/calendar/${calendar.code}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: importedEvents, username })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur d'importation");

      alert(`${importedEvents.length} événements importés !`);
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
      const res = await fetch(`${apiBaseUrl}/api/calendar/${calendar.code}/export?format=ics`);
      if (!res.ok) throw new Error("Erreur d'export");
      const blob = await res.blob();
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
          <h4><Smartphone size={18} color="var(--secondary)" /> Installer sur iPhone</h4>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Ouvrez dans <strong>Safari</strong>, touchez <strong>Partager</strong> → <strong>Sur l'écran d'accueil</strong>.
          </p>
        </div>
      )}

      {isNativeApp() && serverOrigin && (
        <div className="settings-card">
          <h4><Smartphone size={18} color="var(--success)" /> Application Android</h4>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Connectée au serveur pour la synchronisation.</p>
        </div>
      )}

      {serverOrigin && (
        <div className="settings-card">
          <h4><Globe size={18} color="var(--primary)" /> Serveur</h4>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>{serverOrigin}</p>
        </div>
      )}

      <div className="settings-card">
        <h4><Share2 size={18} color="var(--primary)" /> Partager</h4>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Donnez ce code pour inviter :</p>
        <div className="calendar-code-box">
          <span className="calendar-code-text">{calendar.code}</span>
          <button type="button" className="btn-copy" onClick={copyCode}>
            {copied ? <Check size={14} /> : null} {copied ? 'Copié !' : 'Copier'}
          </button>
        </div>
      </div>

      <div className="settings-card">
        <h4><Users size={18} color="var(--secondary)" /> Membres ({calendar.members?.length || 0})</h4>
        <div className="member-list">
          {calendar.members?.map((member, idx) => (
            <div key={idx} className="member-item">
              <div className="member-avatar">{member.substring(0, 2).toUpperCase()}</div>
              <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{member} {member === username ? '(vous)' : ''}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="settings-card" style={{ borderColor: 'rgba(16, 185, 129, 0.3)' }}>
        <h4><HardDrive size={18} color="#10b981" /> Sauvegarde locale</h4>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          Sauvegardez votre calendrier sur votre appareil pour le restaurer en cas de problème.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="btn-secondary" style={{ flex: 1, gap: '0.35rem' }} onClick={handleBackup}>
            <Download size={16} /> Sauvegarder
          </button>
          <button type="button" className="btn-secondary" style={{ flex: 1, gap: '0.35rem', borderColor: 'rgba(245, 158, 11, 0.3)' }} onClick={triggerRestoreSelect} disabled={restoring}>
            {restoring ? <><RefreshCw size={16} className="spin" /> Restauration...</> : <><Upload size={16} /> Restaurer</>}
          </button>
        </div>
        {backupStatus === 'ok' && <p style={{ fontSize: '0.75rem', color: '#10b981', marginTop: '0.5rem' }}>Sauvegarde téléchargée ✓</p>}
        {backupStatus === 'error' && <p style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.5rem' }}>Erreur de sauvegarde</p>}
        <input type="file" ref={restoreInputRef} style={{ display: 'none' }} accept=".json" onChange={handleRestoreFile} />
      </div>

      <div className="settings-card">
        <h4><Share2 size={18} color="var(--primary)" /> Exporter</h4>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Format ICS pour vos autres calendriers.</p>
        <button type="button" className="btn-secondary" style={{ width: '100%' }} onClick={handleExport}>
          <Download size={16} /> Télécharger .ics
        </button>
      </div>

      <div className="settings-card">
        <h4><Upload size={18} color="#10b981" /> Importer .ics</h4>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Importez depuis un autre calendrier.</p>

        <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".ics" onChange={handleFileChange} />

        <div className="file-dropzone" onClick={triggerFileSelect}>
          <Upload size={28} color="var(--text-dim)" />
          {fileName ? (
            <div><p style={{ color: 'var(--text-main)', fontWeight: 600 }}>{fileName}</p><p style={{ fontSize: '0.75rem' }}>Cliquez pour changer</p></div>
          ) : (
            <div><p style={{ color: 'var(--text-main)', fontWeight: 500 }}>Choisir un fichier .ics</p><p style={{ fontSize: '0.75rem' }}>Maximum 5 Mo</p></div>
          )}
        </div>

        {error && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.75rem', color: 'var(--danger)', fontSize: '0.8rem' }}>
            <AlertCircle size={16} /><span>{error}</span>
          </div>
        )}

        {importedEvents.length > 0 && (
          <div style={{ marginTop: '0.75rem' }}>
            <p style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Aperçu ({importedEvents.length}) :</p>
            <div className="import-preview-list">
              {importedEvents.map((evt, i) => (
                <div key={i} className="import-preview-item">
                  <span className="import-preview-title">{evt.title}</span>
                  <span className="import-preview-date">{evt.date} à {evt.start}</span>
                </div>
              ))}
            </div>
            <button type="button" className="btn-primary" style={{ width: '100%', marginTop: '0.75rem' }} onClick={handleImportSubmit} disabled={importing}>
              {importing ? 'Importation...' : `Importer ${importedEvents.length} événements`}
            </button>
          </div>
        )}
      </div>

      <button type="button" className="btn-secondary"
        style={{ color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
        onClick={onLeave}>
        <LogOut size={16} /> Quitter le calendrier
      </button>
    </div>
  );
}
