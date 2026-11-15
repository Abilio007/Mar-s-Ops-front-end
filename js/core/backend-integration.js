import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { backendApi } from './backend-api.js';
import { appState } from './state.js';
import { eventBus, showToast } from './events.js';
import { calculateMarsDistanceKm } from '../utils/helpers.js';

let echo = null;
const HEARTBEAT_INTERVAL_MS = 60_000;
let periodicHeartbeatTimer = null;
let periodicHeartbeatRunId = 0;
let periodicHeartbeatInProgress = false;

function emitConnectionChange() {
  eventBus.emit('backend:changed', {
    user: appState.backendUser,
    apiStatus: appState.apiStatus,
    reverbStatus: appState.reverbStatus,
  });
}

function emitPeriodicHeartbeatState() {
  eventBus.emit('heartbeat:state', appState.periodicHeartbeatEnabled);
}

function nearestRegion(latitude, longitude) {
  return appState.regions.reduce((nearest, region) => {
    const distance = calculateMarsDistanceKm(latitude, longitude, region.lat, region.lon);
    return !nearest || distance < nearest.distance
      ? { id: region.id, distance }
      : nearest;
  }, null)?.id || null;
}

function normalizeAlert(alert) {
  const hazard = alert.hazard || {};
  const severity = alert.severity === 'alarm' ? 'critico' : 'elevado';
  const category = {
    weather: 'ambiental',
    geology: 'instavel',
    terrain: 'instavel',
    radiation: 'ambiental',
    other: 'rota',
  }[hazard.category] || 'ambiental';

  return {
    id: `api-${alert.id}`,
    serverId: alert.id,
    priority: alert.severity === 'alarm' ? 'P1' : 'P2',
    type: alert.severity === 'alarm' ? 'Alarme de proximidade' : 'Aviso de proximidade',
    category,
    severity,
    regionId: nearestRegion(hazard.latitude, hazard.longitude),
    title: hazard.title || 'Perigo marciano',
    description: [
      hazard.description,
      `Distância: ${Number(alert.distance_km).toFixed(2)} km.`,
      hazard.source_name ? `Fonte: ${hazard.source_name}.` : '',
    ].filter(Boolean).join(' '),
    sourceUrl: hazard.source_url,
    expiresAt: hazard.expires_at,
    acknowledged: Boolean(alert.acknowledged_at),
    isBackendAlert: true,
  };
}

function replaceBackendAlerts(alerts) {
  appState.alerts = appState.backendUser ? alerts.map(normalizeAlert) : [];
  eventBus.emit('alerts:changed', appState.alerts);
}

function receiveAlert(payload) {
  const currentAlerts = appState.alerts.filter((alert) => alert.isBackendAlert);
  const existingIndex = currentAlerts.findIndex((alert) => alert.serverId === payload.id);

  if (payload.status === 'clear') {
    if (existingIndex !== -1) currentAlerts.splice(existingIndex, 1);
    replaceBackendAlerts(currentAlerts);
    showToast({
      title: 'Alerta de proximidade resolvido',
      message: payload.hazard?.title || '',
      variant: 'safe',
    });
    return;
  }

  const alert = normalizeAlert(payload);
  if (existingIndex === -1) currentAlerts.unshift(alert);
  else currentAlerts[existingIndex] = alert;
  replaceBackendAlerts(currentAlerts);

  if (appState.settings.notifications?.riskAlerts) {
    showToast({
      title: `${alert.priority} · ${alert.title}`,
      message: alert.description,
      variant: 'warn',
    });
  }
}

function startRealtime(userId) {
  stopRealtime();
  const key = import.meta.env.VITE_REVERB_APP_KEY;
  const apiHost = new URL(backendApi.apiBaseUrl, window.location.origin).hostname;
  const host = import.meta.env.VITE_REVERB_HOST || apiHost;
  const scheme = import.meta.env.VITE_REVERB_SCHEME || 'http';

  if (!key || !host) {
    appState.reverbStatus = 'not-configured';
    emitConnectionChange();
    return;
  }

  window.Pusher = Pusher;
  echo = new Echo({
    broadcaster: 'reverb',
    key,
    wsHost: host,
    wsPort: Number(import.meta.env.VITE_REVERB_PORT || (scheme === 'https' ? 443 : 8080)),
    wssPort: Number(import.meta.env.VITE_REVERB_PORT || 443),
    forceTLS: scheme === 'https',
    enabledTransports: ['ws', 'wss'],
    authEndpoint: `${backendApi.apiBaseUrl}/broadcasting/auth`,
    auth: {
      headers: {
        Authorization: `Bearer ${backendApi.accessToken}`,
        Accept: 'application/json',
      },
    },
  });

  const pusher = echo.connector.pusher;
  pusher.connection.bind('state_change', ({ current }) => {
    appState.reverbStatus = current;
    emitConnectionChange();
  });
  pusher.connection.bind('error', (error) => {
    appState.reverbStatus = 'error';
    eventBus.emit('backend:error', new Error(`Falha na ligação Reverb: ${error.message || 'erro desconhecido'}`));
    emitConnectionChange();
  });

  echo.private(`mars.user.${userId}`)
    .listen('.mars.alert', receiveAlert)
    .listen('.mars.route.progress', (progress) => {
      appState.routeProgress = progress;
      eventBus.emit('route:progress', progress);
    });

  appState.reverbStatus = 'connecting';
  emitConnectionChange();
}

function stopRealtime() {
  if (echo) {
    echo.disconnect();
    echo = null;
  }
  appState.reverbStatus = 'disconnected';
}

function getDeviceCoordinates() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Este navegador não disponibiliza a localização do dispositivo.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracyM: coords.accuracy,
      }),
      (error) => {
        const messages = {
          1: 'Permita o acesso à localização do dispositivo para iniciar o envio automático.',
          2: 'Não foi possível determinar a localização do dispositivo.',
          3: 'A localização do dispositivo demorou demasiado tempo a responder.',
        };
        const locationError = new Error(messages[error.code] || 'Falha ao obter a localização do dispositivo.');
        locationError.code = error.code;
        reject(locationError);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
  });
}

async function sendPeriodicHeartbeat(runId, coordinateSystem) {
  if (
    periodicHeartbeatInProgress
    || runId !== periodicHeartbeatRunId
    || !appState.periodicHeartbeatEnabled
    || !appState.backendUser
    || !backendApi.hasToken
  ) return;

  periodicHeartbeatInProgress = true;
  try {
    const coordinates = await getDeviceCoordinates();
    if (
      runId !== periodicHeartbeatRunId
      || !appState.periodicHeartbeatEnabled
      || !appState.backendUser
      || !backendApi.hasToken
    ) return;

    const response = await backendApi.sendHeartbeat(
      coordinates.latitude,
      coordinates.longitude,
      coordinates.accuracyM,
      coordinateSystem,
    );
    if (runId !== periodicHeartbeatRunId) return;
    if (response.trip_progress) {
      appState.earthTripProgress = response.trip_progress;
      eventBus.emit('earth:progress', response.trip_progress);
    }

    const errors = await refreshBackendData();
    if (errors.length) eventBus.emit('backend:error', errors[0]);
  } finally {
    periodicHeartbeatInProgress = false;
  }
}

function schedulePeriodicHeartbeat(runId, coordinateSystem) {
  periodicHeartbeatTimer = window.setInterval(() => {
    sendPeriodicHeartbeat(runId, coordinateSystem).catch(async (error) => {
      if (error.status === 401) {
        await refreshBackendData();
        eventBus.emit('backend:error', error);
        return;
      }
      if (error.code === 1) stopPeriodicHeartbeat();
      eventBus.emit('backend:error', error);
    });
  }, HEARTBEAT_INTERVAL_MS);
}

export async function startPeriodicHeartbeat(coordinateSystem = 'mars') {
  if (!appState.backendUser || !backendApi.hasToken) {
    throw new Error('Inicie sessão antes de ativar o envio automático.');
  }
  if (!['mars', 'earth'].includes(coordinateSystem)) {
    throw new Error('Sistema de coordenadas inválido para o heartbeat.');
  }
  if (
    appState.periodicHeartbeatEnabled
    && appState.periodicHeartbeatCoordinateSystem === coordinateSystem
  ) return;
  if (appState.periodicHeartbeatEnabled) stopPeriodicHeartbeat();

  appState.periodicHeartbeatEnabled = true;
  appState.periodicHeartbeatCoordinateSystem = coordinateSystem;
  const runId = ++periodicHeartbeatRunId;
  emitPeriodicHeartbeatState();
  emitConnectionChange();

  try {
    await sendPeriodicHeartbeat(runId, coordinateSystem);
  } catch (error) {
    stopPeriodicHeartbeat();
    throw error;
  }

  if (runId === periodicHeartbeatRunId && appState.periodicHeartbeatEnabled) {
    schedulePeriodicHeartbeat(runId, coordinateSystem);
  }
}

export function stopPeriodicHeartbeat() {
  periodicHeartbeatRunId += 1;
  if (periodicHeartbeatTimer !== null) {
    window.clearInterval(periodicHeartbeatTimer);
    periodicHeartbeatTimer = null;
  }
  appState.periodicHeartbeatEnabled = false;
  emitPeriodicHeartbeatState();
  emitConnectionChange();
}

export async function refreshBackendData() {
  if (!appState.backendUser) {
    appState.trips = [];
    replaceBackendAlerts([]);
    return [];
  }

  const [alertsResult, routeResult, heartbeatResult, missionsResult] = await Promise.allSettled([
    backendApi.getAlerts(),
    backendApi.getActiveRoute(),
    backendApi.getLatestHeartbeat(),
    backendApi.getMissions(),
  ]);
  const errors = [];

  if (alertsResult.status === 'fulfilled') {
    replaceBackendAlerts(alertsResult.value);
  } else {
    errors.push(alertsResult.reason);
  }
  if (routeResult.status === 'fulfilled') appState.activeBackendRoute = routeResult.value;
  else errors.push(routeResult.reason);
  if (heartbeatResult.status === 'fulfilled') appState.latestHeartbeat = heartbeatResult.value;
  else errors.push(heartbeatResult.reason);
  if (missionsResult.status === 'fulfilled') appState.trips = missionsResult.value;
  else errors.push(missionsResult.reason);

  if (errors.some((error) => error.status === 401)) {
    stopPeriodicHeartbeat();
    stopRealtime();
    backendApi.clearSession();
    appState.backendUser = null;
    appState.apiStatus = 'error';
    appState.activeBackendRoute = null;
    appState.latestHeartbeat = null;
    appState.trips = [];
    replaceBackendAlerts([]);
  } else if (errors.length) {
    appState.apiStatus = 'error';
    eventBus.emit('backend:error', errors[0]);
  } else {
    appState.apiStatus = 'connected';
  }

  emitConnectionChange();
  return errors;
}

export async function loginBackend(credentials) {
  appState.chatHistory = [];
  appState.backendUser = await backendApi.login(credentials);
  appState.apiStatus = 'connected';
  await refreshBackendData();
  if (appState.backendUser) startRealtime(appState.backendUser.id);
  emitConnectionChange();
}

export async function registerBackend(credentials) {
  appState.chatHistory = [];
  appState.backendUser = await backendApi.register(credentials);
  appState.apiStatus = 'connected';
  await refreshBackendData();
  if (appState.backendUser) startRealtime(appState.backendUser.id);
  emitConnectionChange();
}

export async function logoutBackend() {
  let logoutError;
  try {
    await backendApi.logout();
  } catch (error) {
    logoutError = error;
  }

  stopPeriodicHeartbeat();
  stopRealtime();
  appState.backendUser = null;
  appState.apiStatus = 'disconnected';
  appState.activeBackendRoute = null;
  appState.latestHeartbeat = null;
  appState.routeProgress = null;
  appState.chatHistory = [];
  replaceBackendAlerts([]);
  emitConnectionChange();

  if (logoutError) throw logoutError;
}

export async function initializeBackendIntegration() {
  if (!backendApi.hasToken) {
    appState.apiStatus = 'disconnected';
    appState.reverbStatus = 'disconnected';
    return;
  }

  appState.apiStatus = 'connecting';
  emitConnectionChange();

  try {
    appState.backendUser = await backendApi.me();
    appState.apiStatus = 'connected';
    await refreshBackendData();
    if (appState.backendUser) startRealtime(appState.backendUser.id);
  } catch (error) {
    if (error.status === 401) backendApi.clearSession();
    appState.apiStatus = 'error';
    eventBus.emit('backend:error', error);
    emitConnectionChange();
  }
}

export async function initializePublicData() {
  const [regions, catalog] = await Promise.all([
    backendApi.getRegions(),
    backendApi.getCatalog(),
  ]);
  if (!Number.isFinite(catalog.cruiseSpeedKmPerHour) || catalog.cruiseSpeedKmPerHour <= 0) {
    throw new Error('The backend catalog did not provide a valid route speed.');
  }
  appState.regions = regions;
  appState.catalog = catalog;
  appState.catalogStatus = 'ready';
  if (!appState.selectedRegionId && regions.length) {
    appState.selectedRegionId = regions[0].id;
  }
}

export { receiveAlert, startRealtime, stopRealtime };
