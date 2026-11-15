import { storage, STORAGE_KEYS } from '../storage.js';
import { eventBus, showToast } from './events.js';
import { backendApi } from './backend-api.js';

storage.removeLegacyDemoData();

export const PRIORITY_META = {
  P1: {
    level: 'P1',
    order: 1,
    label: 'P1 · Crítica',
    fullLabel: 'Prioridade 1 · Emergência Crítica',
    color: '#FF2929',
    swalIcon: 'error',
  },
  P2: {
    level: 'P2',
    order: 2,
    label: 'P2 · Alta',
    fullLabel: 'Prioridade 2 · Alerta Elevado',
    color: '#E9692C',
    swalIcon: 'warning',
  },
  P3: {
    level: 'P3',
    order: 3,
    label: 'P3 · Moderada',
    fullLabel: 'Prioridade 3 · Prioridade Operacional',
    color: '#A6B0B8',
    swalIcon: 'info',
  },
};

export const DEFAULT_SETTINGS = {
  language: 'pt',
  theme: 'dark',
  autoRotateGlobe: true,
  showAtmosphere: true,
  reducedMotion: false,
  distanceUnit: 'km',
  temperatureUnit: 'C',
  notifications: {
    riskAlerts: true,
    tripUpdates: true,
    routeChanges: true,
    missionMilestones: true,
  },
};

const TRANSLATIONS = {
  pt: {
    brand: 'MARTE',
    navHome: 'Home',
    navAi: 'IA',
    navStatus: 'Estado atual',
    navPlanner: 'Viagens',
    navSettings: 'Definições',
    navQuickPlan: 'Nova Viagem',
    heroSubtitle: 'Rastreador de Exploração',
    heroHeadline: 'Tenha o mapa de Marte em sua mão',
    heroDesc: 'Explore com segurança. A informação certa, no momento certo.',
  },
  en: {
    brand: 'MARTE',
    navHome: 'Home',
    navAi: 'AI',
    navStatus: 'Current status',
    navPlanner: 'Trips',
    navSettings: 'Settings',
    navQuickPlan: 'New Trip',
    heroSubtitle: 'Exploration Tracker',
    heroHeadline: 'Hold the map of Mars in your hand',
    heroDesc: 'Explore safely. The right information, at the right moment.',
  },
  es: {
    brand: 'MARTE',
    navHome: 'Inicio',
    navAi: 'IA',
    navStatus: 'Estado actual',
    navPlanner: 'Viajes',
    navSettings: 'Ajustes',
    navQuickPlan: 'Nuevo Viaje',
    heroSubtitle: 'Rastreador de Exploración',
    heroHeadline: 'Ten el mapa de Marte en tu mano',
    heroDesc: 'Explora con seguridad. La información correcta, en el momento adecuado.',
  },
};

function mergeSettings(saved) {
  if (!saved || typeof saved !== 'object') return structuredClone(DEFAULT_SETTINGS);
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    notifications: {
      ...DEFAULT_SETTINGS.notifications,
      ...(saved.notifications || {}),
    },
  };
}

export const appState = {
  currentRoute: 'home',
  selectedRegionId: null,
  selectedTripId: null,
  editingTripId: null,
  plannerSubTab: 'list', // 'list' | 'form' | 'routes' | 'calendar' | 'details' | 'earth'
  settingsSubTab: 'general', // 'general' | 'notifications' | 'privacy' | 'about'
  settings: mergeSettings(storage.get(STORAGE_KEYS.SETTINGS)),
  regions: [],
  catalog: { missionTypes: [], riskTolerances: [], equipmentByMissionType: {}, cruiseSpeedKmPerHour: 0 },
  catalogStatus: 'loading',
  trips: [],
  alerts: [],
  chatHistory: [],
  backendUser: null,
  apiStatus: 'disconnected',
  reverbStatus: 'disconnected',
  activeBackendRoute: null,
  latestHeartbeat: null,
  periodicHeartbeatEnabled: false,
  periodicHeartbeatCoordinateSystem: 'mars',
  routeProgress: null,
  earthTripProgress: null,
  selectedStatusTripId: null,
};

export function t(key) {
  const lang = appState.settings.language || 'pt';
  return TRANSLATIONS[lang]?.[key] || TRANSLATIONS.pt[key] || key;
}

export function getRegionById(regionId) {
  return appState.regions.find((region) => region.id === regionId) || null;
}

export function notifyIfEnabled(categoryKey, payload) {
  if (appState.settings.notifications?.[categoryKey]) {
    showToast(payload);
  }
}

export function updateSettings(partial) {
  appState.settings = mergeSettings({
    ...appState.settings,
    ...partial,
    notifications: {
      ...appState.settings.notifications,
      ...(partial.notifications || {}),
    },
  });
  storage.set(STORAGE_KEYS.SETTINGS, appState.settings);
  applyDocumentPreferences();
  eventBus.emit('settings:changed', appState.settings);
}

export function applyDocumentPreferences() {
  const html = document.documentElement;
  html.lang = appState.settings.language || 'pt';

  if (appState.settings.theme === 'high-contrast') {
    html.classList.add('theme-high-contrast');
  } else {
    html.classList.remove('theme-high-contrast');
  }

  if (appState.settings.reducedMotion) {
    html.classList.add('reduced-motion');
  } else {
    html.classList.remove('reduced-motion');
  }
}

export async function acknowledgeAlert(alertId) {
  const alert = appState.alerts.find((a) => a.id === alertId);
  if (!alert?.serverId || !appState.backendUser) return;
  const updated = await backendApi.acknowledgeAlert(alert.serverId);
  alert.acknowledged = updated.acknowledged;
  eventBus.emit('alerts:changed', appState.alerts);
}

export function getAlertsSortedByPriority(alerts = appState.alerts) {
  return [...alerts].sort((a, b) => {
    if (Boolean(a.acknowledged) !== Boolean(b.acknowledged)) {
      return a.acknowledged ? 1 : -1;
    }
    const orderA = PRIORITY_META[a.priority]?.order ?? 9;
    const orderB = PRIORITY_META[b.priority]?.order ?? 9;
    return orderA - orderB;
  });
}

export function getHighestPriorityAlert() {
  return getAlertsSortedByPriority()[0] || null;
}
