const STORAGE_KEY = 'cocalendar_server_url';

function normalizeServerUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;

  let value = raw.trim();
  if (!value) return null;

  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }

  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function getSavedServerUrl() {
  return normalizeServerUrl(localStorage.getItem(STORAGE_KEY));
}

export function saveServerUrl(raw) {
  const normalized = normalizeServerUrl(raw);
  if (!normalized) {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }

  localStorage.setItem(STORAGE_KEY, normalized);
  return normalized;
}

function isViteDevServer() {
  return import.meta.env.DEV && window.location.port === '5173';
}

function isCapacitorApp() {
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

export function resolveServerOrigin() {
  const saved = getSavedServerUrl();
  if (saved) return saved;

  const envUrl = normalizeServerUrl(import.meta.env.VITE_SERVER_URL);
  if (envUrl) return envUrl;

  if (isViteDevServer()) {
    return 'http://localhost:3001';
  }

  if (isCapacitorApp()) {
    return null;
  }

  const { hostname, origin } = window.location;
  if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return origin;
  }

  return 'http://localhost:3001';
}

export function getApiBaseUrl(serverOrigin = resolveServerOrigin()) {
  if (!serverOrigin) return '';
  return serverOrigin.replace(/\/$/, '');
}

export function getWsBaseUrl(serverOrigin = resolveServerOrigin()) {
  const apiBase = getApiBaseUrl(serverOrigin);
  if (!apiBase) return '';

  if (apiBase.startsWith('https://')) {
    return apiBase.replace(/^https:\/\//, 'wss://');
  }

  if (apiBase.startsWith('http://')) {
    return apiBase.replace(/^http:\/\//, 'ws://');
  }

  return apiBase;
}

export async function testServerConnection(serverOrigin) {
  const apiBase = getApiBaseUrl(serverOrigin);
  if (!apiBase) {
    throw new Error('Adresse du serveur invalide.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${apiBase}/api/health`, {
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error('Le serveur ne répond pas correctement.');
    }

    return true;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Délai dépassé — vérifiez l\'adresse du serveur.');
    }
    throw new Error('Impossible de joindre le serveur. Vérifiez l\'adresse et votre connexion internet.');
  } finally {
    clearTimeout(timeout);
  }
}
