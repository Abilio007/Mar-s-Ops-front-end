import { appState } from './core/state.js';
import { renderNavigation } from './navigation.js';
import { setMarsStageMode } from './modules/home/mars-globe.js';

const STAGE_MODE_MAP = {
  home: 'home',
  ai: 'ai',
  status: 'status',
  planner: 'planner-bg',
  settings: 'settings',
};

export function createRouter({ container, routes }) {
  let currentModule = null;

  function navigateTo(routeId, params = {}) {
    const targetId = routes[routeId] ? routeId : 'home';
    const hasExtraParams = params && Object.keys(params).length > 0;

    if (currentModule && targetId === appState.currentRoute && !hasExtraParams) {
      return;
    }

    if (currentModule && typeof currentModule.unmount === 'function') {
      currentModule.unmount();
      currentModule = null;
    }

    appState.currentRoute = targetId;
    if (window.location.hash !== `#${targetId}`) {
      window.history.replaceState(null, '', `#${targetId}`);
    }

    const stageMode =
      targetId === 'planner' && appState.plannerSubTab === 'routes'
        ? 'planner-routes'
        : STAGE_MODE_MAP[targetId] || 'home';
    setMarsStageMode(stageMode, appState.settings);

    renderNavigation(navigateTo);

    const viewFactory = routes[targetId];
    currentModule = viewFactory({ navigateTo });
    container.innerHTML = '';
    currentModule.mount(container, params);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function init() {
    const initialHash = window.location.hash.replace('#', '').trim();
    const initialRoute = routes[initialHash] ? initialHash : 'home';
    navigateTo(initialRoute, { initial: true });

    window.addEventListener('hashchange', () => {
      const next = window.location.hash.replace('#', '').trim();
      if (routes[next] && next !== appState.currentRoute) {
        navigateTo(next);
      }
    });
  }

  return { init, navigateTo };
}
