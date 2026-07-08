import React, { useState } from 'react';
import { Users, Copy, Check, Share2, Clock } from 'lucide-react';

export default function MembersView({ calendar, username }) {
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText(calendar.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareCode = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `CoCalendar - ${calendar.name}`,
          text: `Rejoins mon calendrier "${calendar.name}" avec le code : ${calendar.code}`,
        });
      } catch {}
    } else {
      copyCode();
    }
  };

  const lastActivity = calendar.lastActivity
    ? new Date(calendar.lastActivity + 'T12:00:00').toLocaleDateString('fr-FR', {
        day: 'numeric', month: 'long', year: 'numeric'
      })
    : null;

  return (
    <div className="settings-container">
      <div className="settings-card">
        <h4><Users size={18} color="var(--primary)" /> Membres ({calendar.members?.length || 0})</h4>
        <div className="member-list">
          {calendar.members?.map((member, idx) => (
            <div key={idx} className="member-item">
              <div className="member-avatar">{member.substring(0, 2).toUpperCase()}</div>
              <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{member} {member === username ? '(vous)' : ''}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="settings-card">
        <h4><Share2 size={18} color="var(--primary)" /> Partager le calendrier</h4>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          Donnez ce code aux personnes que vous souhaitez inviter :
        </p>
        <div className="calendar-code-box">
          <span className="calendar-code-text">{calendar.code}</span>
          <button type="button" className="btn-copy" onClick={copyCode}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copié !' : 'Copier'}
          </button>
        </div>
        <button type="button" className="btn-primary" onClick={shareCode} style={{ marginTop: '0.75rem', width: '100%' }}>
          <Share2 size={16} /> Partager
        </button>
      </div>

      {lastActivity && (
        <div className="settings-card" style={{ borderColor: 'transparent', background: 'transparent', padding: '0.5rem 1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            <Clock size={12} />
            <span>Dernière activité : {lastActivity}</span>
          </div>
        </div>
      )}
    </div>
  );
}
