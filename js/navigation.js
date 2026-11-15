import { appState, t } from './core/state.js';
import { escapeHtml } from './utils/helpers.js';

const NAV_ITEMS = [
  {
    id: 'home',
    labelKey: 'navHome',
    icon: '<path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5z"/>',
  },
  {
    id: 'ai',
    labelKey: 'navAi',
    icon: '<rect x="5" y="6" width="14" height="11" rx="3"/><path d="M9 17l-2 3v-3M12 3v3M9.5 11h.01M14.5 11h.01M9.5 14h5"/>',
  },
  {
    id: 'status',
    labelKey: 'navStatus',
    icon: '<path d="M3 12h4l2.5-6 4 12 2.5-6h5"/>',
  },
  {
    id: 'planner',
    labelKey: 'navPlanner',
    icon: '<path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/>',
  },
  {
    id: 'settings',
    labelKey: 'navSettings',
    icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.77 1.02 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  },
];

let renderedLanguage = null;
let listenersBound = false;

export function renderNavigation(navigateTo) {
  const headerEl = document.getElementById('app-header');
  const dockEl = document.getElementById('bottom-dock');
  const activeRoute = appState.currentRoute;
  const currentLang = appState.settings.language || 'pt';

  if (renderedLanguage !== currentLang) {
    renderedLanguage = currentLang;

    if (headerEl) {
      headerEl.innerHTML = `
        <a href="#home" class="brand-lockup" data-nav="home">
          <span class="brand-lockup__title">${escapeHtml(t('brand'))}</span>
          <span class="brand-lockup__subtitle">${escapeHtml(t('heroSubtitle'))}</span>
        </a>
        <div class="brand-header__center" id="brand-center-marte">${escapeHtml(t('brand'))}</div>
      `;
    }

    if (dockEl) {
      dockEl.innerHTML = NAV_ITEMS.map(
        (item) => `
        <button
          type="button"
          class="bottom-dock__btn"
          data-nav="${item.id}"
          aria-label="${escapeHtml(t(item.labelKey))}"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            ${item.icon}
          </svg>
          <span>${escapeHtml(t(item.labelKey))}</span>
        </button>
      `
      ).join('');
    }
  }

  // Show centered red MARTE wordmark on Home (as in reference image 1)
  const centerWordmark = document.getElementById('brand-center-marte');
  if (centerWordmark) {
    centerWordmark.hidden = activeRoute !== 'home';
  }

  if (!listenersBound) {
    listenersBound = true;

    headerEl?.addEventListener('click', (e) => {
      const navTarget = e.target.closest('[data-nav]');
      if (navTarget) {
        e.preventDefault();
        navigateTo(navTarget.dataset.nav);
      }
    });

    dockEl?.addEventListener('click', (e) => {
      const navTarget = e.target.closest('[data-nav]');
      if (navTarget) {
        navigateTo(navTarget.dataset.nav);
      }
    });
  }

  document.querySelectorAll('.bottom-dock__btn[data-nav]').forEach((el) => {
    const isActive = el.dataset.nav === activeRoute;
    el.classList.toggle('is-active', isActive);
    if (isActive) {
      el.setAttribute('aria-current', 'page');
    } else {
      el.removeAttribute('aria-current');
    }
  });
}
