import { applyDocumentPreferences, appState } from './state.js';
import { eventBus, showToast } from './events.js';
import { createRouter } from '../router.js';
import { renderNavigation } from '../navigation.js';
import { getSharedMarsGlobe, initPersistentMarsStage } from '../modules/home/mars-globe.js';
import { createHomeView } from '../modules/home/home.js';
import { createAiView } from '../modules/ai/ai.js';
import { createStatusView } from '../modules/status/status.js';
import { createTravelPlannerView } from '../modules/travel-planner/travel-planner.js';
import { createSettingsView } from '../modules/settings/settings.js';
import { initializeBackendIntegration, initializePublicData } from './backend-integration.js';

export async function startApp() {
  applyDocumentPreferences();

  const mainContainer = document.getElementById('app-main');
  if (!mainContainer) return;

  let catalogError = null;
  try {
    await initializePublicData();
  } catch (error) {
    appState.catalogStatus = 'error';
    catalogError = error;
  }

  // Initialize single persistent 3D Mars globe once for instant tab transitions
  initPersistentMarsStage({
    autoRotate: appState.settings.autoRotateGlobe,
    showAtmosphere: appState.settings.showAtmosphere,
    reducedMotion: appState.settings.reducedMotion,
    selectedRegionId: appState.selectedRegionId,
  });

  const router = createRouter({
    container: mainContainer,
    routes: {
      home: createHomeView,
      ai: createAiView,
      status: createStatusView,
      planner: createTravelPlannerView,
      settings: createSettingsView,
    },
  });

  eventBus.on('settings:changed', (nextSettings) => {
    const globe = getSharedMarsGlobe();
    if (globe) {
      globe.setAutoRotate(nextSettings.autoRotateGlobe);
      globe.setAtmosphereVisible(nextSettings.showAtmosphere);
      globe.options.reducedMotion = nextSettings.reducedMotion;
    }
    renderNavigation(router.navigateTo);
    if (appState.currentRoute !== 'settings') {
      router.navigateTo(appState.currentRoute, { refresh: true });
    }
  });

  eventBus.on('alerts:changed', () => {
    if (['home', 'status'].includes(appState.currentRoute)) {
      router.navigateTo(appState.currentRoute, { refresh: true });
    }
  });

  eventBus.on('backend:changed', () => {
    if (['home', 'status', 'planner', 'ai'].includes(appState.currentRoute)) {
      router.navigateTo(appState.currentRoute, { refresh: true });
    }
  });

  eventBus.on('route:progress', () => {
    if (appState.currentRoute === 'status') {
      router.navigateTo('status', { refresh: true });
    }
  });

  eventBus.on('backend:error', (error) => {
    showToast({
      title: 'Falha de comunicação com o backend',
      message: error?.message || 'Ocorreu um erro inesperado.',
      variant: 'warn',
    });
  });

  router.init();
  if (catalogError) {
    eventBus.emit('backend:error', catalogError);
  }
  void initializeBackendIntegration();
}
