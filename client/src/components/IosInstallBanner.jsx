import React, { useState } from 'react';
import { Share, X } from 'lucide-react';

export default function IosInstallBanner() {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('cocalendar_ios_hint_dismissed') === '1'
  );

  if (dismissed) return null;

  const dismiss = () => {
    localStorage.setItem('cocalendar_ios_hint_dismissed', '1');
    setDismissed(true);
  };

  return (
    <div className="ios-install-banner">
      <div className="ios-install-content">
        <Share size={18} color="var(--primary)" />
        <div>
          <strong>Installer sur iPhone</strong>
          <p>
            Touchez <strong>Partager</strong> puis <strong>Sur l'écran d'accueil</strong> pour
            ajouter CoCalendar comme une app.
          </p>
        </div>
      </div>
      <button type="button" className="btn-close-toast" onClick={dismiss} aria-label="Fermer">
        <X size={14} />
      </button>
    </div>
  );
}
