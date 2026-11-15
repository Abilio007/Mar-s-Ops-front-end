import { appState, getHighestPriorityAlert, getRegionById, PRIORITY_META, t } from '../../core/state.js';
import { getMarsThumbnailDataUrl, getSharedMarsGlobe } from './mars-globe.js';
import { formatCoordinates, formatDistance } from '../../utils/formatters.js';
import { escapeHtml } from '../../utils/helpers.js';
import { showEmergencyCenterSwal, showEmergencySweetAlert } from '../../utils/sweetalerts.js';
import { calculateMarsDistanceKm } from '../../utils/helpers.js';
import {
  hideMapLocationTooltip,
  positionMapLocationTooltip,
  showMapLocationTooltip,
} from '../map-location-tooltip.js';

export function createHomeView({ navigateTo }) {
  let currentFilter = 'all';
  let autoRotate = appState.settings.autoRotateGlobe;
  let calloutRaf = 0;

  function showRegionTooltip(regionId) {
    const region = getRegionById(regionId);
    if (!region) return;

    showMapLocationTooltip(regionId, {
      actions: [
        {
          label: 'Planear viagem',
          variant: 'primary',
          onSelect: () => {
            appState.plannerSubTab = 'form';
            appState.editingTripId = null;
            navigateTo('planner', { prefillDestinationId: region.id });
          },
        },
        {
          label: 'Consultar IA',
          variant: 'secondary',
          onSelect: () => navigateTo('ai', {
            initialPrompt: `Analisa as condições e riscos de exploração em ${region.name}.`,
          }),
        },
      ],
    });
    const globe = getSharedMarsGlobe();
    if (globe) positionMapLocationTooltip(globe);
  }

  function renderDestinationCard(container) {
    const cardEl = container.querySelector('#home-dest-card');
    if (!cardEl) return;

    const region = getRegionById(appState.selectedRegionId);
    if (!region) {
      cardEl.innerHTML = '<div class="empty-state">O catálogo de regiões do servidor está vazio.</div>';
      return;
    }
    const thumbUrl = getMarsThumbnailDataUrl();

    const activeTrip = appState.trips.find((tr) => tr.status === 'active') || appState.trips[0];
    const origin = activeTrip ? getRegionById(activeTrip.originId) : null;
    const distLabel = origin
      ? formatDistance(
          calculateMarsDistanceKm(origin.lat, origin.lon, region.lat, region.lon),
          appState.settings.distanceUnit,
        )
      : '—';

    const regionAlertsCount = appState.alerts.filter((a) => a.regionId === region.id).length;

    cardEl.innerHTML = `
      <div class="mars-dest-card__top">
        <img src="${thumbUrl}" alt="Marte" class="mars-orb-thumb" />
        <div>
          <div class="mars-dest-card__brand">MARTE</div>
          <div class="meta-line">
            <span class="tabular-nums">${escapeHtml(formatCoordinates(region.lat, region.lon))}</span>
          </div>
        </div>
      </div>

      <div class="region-chips-scroll" aria-label="Selecionar região em Marte">
        ${appState.regions.filter((r) => (
          currentFilter === 'all' ||
          appState.alerts.some((alert) => alert.regionId === r.id)
        ))
          .map(
            (r) => `
            <button
              type="button"
              class="region-chip-btn ${r.id === region.id ? 'is-active' : ''}"
              data-region-id="${escapeHtml(r.id)}"
            >
              ${escapeHtml(r.name)}
            </button>
          `
          )
          .join('')}
      </div>

      <div class="mars-dest-card__rows">
        <div class="mars-dest-card__row">
          <span class="mars-dest-card__key">Destino</span>
          <span class="mars-dest-card__val">${escapeHtml(region.name)}</span>
        </div>
        <div class="mars-dest-card__row">
          <span class="mars-dest-card__key">${appState.settings.distanceUnit === 'mi' ? 'Distância estimada da origem' : 'Distância estimada da origem'}</span>
          <span class="mars-dest-card__val tabular-nums">${escapeHtml(distLabel)}</span>
        </div>
        <div class="mars-dest-card__row">
          <span class="mars-dest-card__key">Fonte</span>
          <span class="mars-dest-card__val">${escapeHtml(region.sourceName || 'Fonte não indicada')}</span>
        </div>
        <div class="mars-dest-card__row">
          <span class="mars-dest-card__key">Alertas</span>
          <span class="mars-dest-card__val">
            ${regionAlertsCount
              ? `${regionAlertsCount} alerta(s) associados`
              : appState.backendUser ? 'Sem alertas associados' : 'Inicie sessão para consultar alertas'}
          </span>
        </div>
      </div>

      <p class="panel__meta" style="font-size: 0.8rem; line-height: 1.45;">
        <a href="${escapeHtml(region.sourceUrl)}" target="_blank" rel="noopener noreferrer">Abrir fonte do catálogo</a>
      </p>

      <div style="display: flex; gap: var(--space-2); flex-wrap: wrap;">
        <button type="button" class="btn btn--primary btn--sm" id="btn-plan-selected-region" style="flex: 1;">
          Planear Viagem
        </button>
        <button type="button" class="btn btn--secondary btn--sm" id="btn-ask-ai-region">
          Consultar IA
        </button>
      </div>
    `;

    cardEl.querySelectorAll('[data-region-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        focusRegionOnGlobe(container, btn.dataset.regionId);
      });
    });

    cardEl.querySelector('#btn-plan-selected-region')?.addEventListener('click', () => {
      appState.plannerSubTab = 'form';
      appState.editingTripId = null;
      navigateTo('planner', { prefillDestinationId: region.id });
    });

    cardEl.querySelector('#btn-ask-ai-region')?.addEventListener('click', () => {
      navigateTo('ai', { initialPrompt: `Analisa as condições e riscos de exploração em ${region.name}.` });
    });
  }

  function focusRegionOnGlobe(container, regionId) {
    appState.selectedRegionId = regionId;
    autoRotate = false;
    getSharedMarsGlobe()?.setAutoRotate(false);
    const rotateButton = container.querySelector('#globe-toggle-rotate');
    if (rotateButton) rotateButton.textContent = 'Rodar Globo';
    getSharedMarsGlobe()?.setSelectedRegion(regionId, true);
    renderDestinationCard(container);
    showRegionTooltip(regionId);
  }

  function renderTopAlertCard(container) {
    const alertCard = container.querySelector('#home-alert-card');
    if (!alertCard) return;

    const topAlert = getHighestPriorityAlert();
    if (!topAlert) {
      alertCard.disabled = true;
      alertCard.innerHTML = `
        <div class="alert-hero-card__head"><span>ALERTAS</span></div>
        <div class="alert-hero-card__row">
          <div class="alert-hero-card__title">${appState.backendUser ? 'Sem alertas ativos no servidor' : 'Inicie sessão para consultar alertas'}</div>
        </div>
      `;
      alertCard.onclick = null;
      return;
    }
    alertCard.disabled = false;
    const pMeta = PRIORITY_META[topAlert.priority || 'P2'] || PRIORITY_META.P2;

    alertCard.innerHTML = `
      <div class="alert-hero-card__head" style="justify-content: space-between;">
        <span style="display: inline-flex; align-items: center; gap: var(--space-2);">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span>ALERTAS</span>
        </span>
        <span class="tabular-nums" style="font-size: 0.72rem; letter-spacing: 0.08em; color: ${pMeta.color};">
          ${escapeHtml(pMeta.label)}
        </span>
      </div>
      <div class="alert-hero-card__row">
        <div>
          <div class="alert-hero-card__title">${escapeHtml(topAlert.type)}</div>
          <p class="alert-hero-card__desc">${escapeHtml(topAlert.description)}</p>
        </div>
        <span class="alert-hero-card__chevron" aria-hidden="true">&rsaquo;</span>
      </div>
    `;

    alertCard.onclick = () => {
      showEmergencySweetAlert({
        alert: topAlert,
        onAcknowledge: () => renderTopAlertCard(container),
        onFocusGlobe: (regionId) => focusRegionOnGlobe(container, regionId),
      });
    };
  }

  function updateProjectedCallouts(container) {
    const overlay = container.querySelector('#home-callouts-overlay');
    const safeTag = container.querySelector('#callout-safe');
    const dangerTag = container.querySelector('#callout-danger');
    const globe = getSharedMarsGlobe();
    if (!overlay || !safeTag || !dangerTag || !globe) return;

    const stageEl = document.getElementById('mars-persistent-stage');
    if (!stageEl) return;
    const w = stageEl.clientWidth || window.innerWidth;
    const h = stageEl.clientHeight || window.innerHeight;
    const stageRect = stageEl.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    const scaleX = stageRect.width / w;
    const scaleY = stageRect.height / h;

    const clampVal = (v, min, max) => Math.min(Math.max(v, min), max);
    const maxW = Math.max(120, overlayRect.width - 72);
    const maxH = Math.max(60, overlayRect.height - 16);

    const selectedRegion = getRegionById(appState.selectedRegionId);
    const alert = getHighestPriorityAlert();
    const alertRegion = alert ? getRegionById(alert.regionId) : null;

    const safeProj = selectedRegion ? globe.getProjectedMarker(selectedRegion.id, w, h) : null;
    if (safeProj?.visible && currentFilter === 'all') {
      const vx = stageRect.left + safeProj.x * scaleX;
      const vy = stageRect.top + safeProj.y * scaleY;
      safeTag.style.display = 'inline-flex';
      safeTag.style.left = `${clampVal(vx - overlayRect.left, 72, maxW)}px`;
      safeTag.style.top = `${clampVal(vy - overlayRect.top - 16, 36, maxH)}px`;
      safeTag.querySelector('[data-label]').textContent = `Região · ${selectedRegion.name}`;
      safeTag.dataset.regionId = selectedRegion.id;
    } else {
      safeTag.style.display = 'none';
    }

    const dangerProj = alertRegion ? globe.getProjectedMarker(alertRegion.id, w, h) : null;
    if (dangerProj?.visible && currentFilter === 'all') {
      const vx = stageRect.left + dangerProj.x * scaleX;
      const vy = stageRect.top + dangerProj.y * scaleY;
      dangerTag.style.display = 'inline-flex';
      dangerTag.style.left = `${clampVal(vx - overlayRect.left, 72, maxW)}px`;
      dangerTag.style.top = `${clampVal(vy - overlayRect.top - 16, 36, maxH)}px`;
      dangerTag.querySelector('[data-label]').textContent = `Alerta · ${alertRegion.name}`;
      dangerTag.dataset.regionId = alertRegion.id;
    } else {
      dangerTag.style.display = 'none';
    }
  }

  return {
    mount(container) {
      autoRotate = appState.settings.autoRotateGlobe;

      container.innerHTML = `
        <section class="view-section home-stage" aria-label="Mapa de Marte">
          <div class="home-left">
            <div>
              <h1 class="home-hero__headline">${escapeHtml(t('heroHeadline'))}</h1>
              <p class="home-hero__desc">${escapeHtml(t('heroDesc'))}</p>
              <p class="panel__meta">Regiões vêm do catálogo do servidor; alertas dependem de registos importados e da sua sessão.</p>
            </div>

            <div class="home-globe-controls" role="toolbar" aria-label="Controlos do mapa 3D">
              <div class="segmented" role="group" aria-label="Filtrar marcadores">
                <button type="button" class="segmented__btn is-active" data-marker-filter="all">Todas</button>
                <button type="button" class="segmented__btn" data-marker-filter="with-alerts">Com alertas</button>
              </div>
              <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                <button type="button" class="btn btn--secondary btn--sm" id="globe-zoom-in" aria-label="Aproximar">+</button>
                <button type="button" class="btn btn--secondary btn--sm" id="globe-zoom-out" aria-label="Afastar">−</button>
                <button type="button" class="btn btn--secondary btn--sm" id="globe-toggle-rotate">
                  ${autoRotate ? 'Pausar Rotação' : 'Rodar Globo'}
                </button>
                <button type="button" class="btn btn--ghost btn--sm" id="globe-reset">Repor</button>
                <button type="button" class="btn btn--danger btn--sm" id="btn-home-emergencies">Emergências</button>
              </div>
            </div>
          </div>

          <div class="home-center-overlay" id="home-callouts-overlay">
            <button type="button" class="globe-callout globe-callout--region" id="callout-safe" style="display: none;">
              <span class="globe-callout__dot" aria-hidden="true"></span>
              <span data-label>Local recomendado</span>
            </button>
            <button type="button" class="globe-callout globe-callout--danger" id="callout-danger" style="display: none;">
              <span class="globe-callout__dot" aria-hidden="true"></span>
              <span data-label>Pouso proibido</span>
            </button>
          </div>

          <aside class="home-right" aria-label="Alertas e informações do destino">
            <button type="button" class="alert-hero-card" id="home-alert-card"></button>
            <article class="mars-dest-card" id="home-dest-card"></article>
          </aside>
        </section>
      `;

      renderTopAlertCard(container);
      renderDestinationCard(container);

      const globe = getSharedMarsGlobe();
      if (globe) {
        globe.setMarkerFilter(currentFilter);
        globe.setSelectedRegion(appState.selectedRegionId, false);
        globe.setOnRegionSelect((regionId) => focusRegionOnGlobe(container, regionId));
        globe.setOnFrame(() => {
          updateProjectedCallouts(container);
          positionMapLocationTooltip(globe);
        });
      }

      calloutRaf = requestAnimationFrame(() => updateProjectedCallouts(container));

      container.querySelector('#callout-safe')?.addEventListener('click', (e) => {
        const regionId = e.currentTarget.dataset.regionId;
        if (!regionId) return;
        focusRegionOnGlobe(container, regionId);
      });

      container.querySelector('#callout-danger')?.addEventListener('click', (e) => {
        const regionId = e.currentTarget.dataset.regionId;
        if (!regionId) return;
        focusRegionOnGlobe(container, regionId);
        const matchingAlert = appState.alerts.find((a) => a.regionId === regionId) || null;
        if (!matchingAlert) return;
        showEmergencySweetAlert({
          alert: matchingAlert,
          title: matchingAlert.title,
          message: matchingAlert.description,
          regionId,
          onAcknowledge: () => renderTopAlertCard(container),
          onFocusGlobe: (id) => focusRegionOnGlobe(container, id),
        });
      });

      container.querySelector('#btn-home-emergencies')?.addEventListener('click', () => {
        showEmergencyCenterSwal({
          onFocusGlobe: (regionId) => focusRegionOnGlobe(container, regionId),
          onAlertsUpdated: () => {
            renderTopAlertCard(container);
            renderDestinationCard(container);
          },
        });
      });

      container.querySelectorAll('[data-marker-filter]').forEach((btn) => {
        btn.addEventListener('click', () => {
          currentFilter = btn.dataset.markerFilter;
          container.querySelectorAll('[data-marker-filter]').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.markerFilter === currentFilter);
          });
          getSharedMarsGlobe()?.setMarkerFilter(currentFilter);
          renderDestinationCard(container);
        });
      });

      container.querySelector('#globe-zoom-in')?.addEventListener('click', () => getSharedMarsGlobe()?.zoomBy(0.84));
      container.querySelector('#globe-zoom-out')?.addEventListener('click', () => getSharedMarsGlobe()?.zoomBy(1.18));
      container.querySelector('#globe-reset')?.addEventListener('click', () => getSharedMarsGlobe()?.resetView());

      const rotateBtn = container.querySelector('#globe-toggle-rotate');
      rotateBtn?.addEventListener('click', () => {
        autoRotate = !autoRotate;
        getSharedMarsGlobe()?.setAutoRotate(autoRotate);
        rotateBtn.textContent = autoRotate ? 'Pausar Rotação' : 'Rodar Globo';
      });
    },

    unmount() {
      if (calloutRaf) cancelAnimationFrame(calloutRaf);
      hideMapLocationTooltip();
      const globe = getSharedMarsGlobe();
      if (globe) {
        globe.setOnFrame(null);
        globe.setOnRegionSelect(null);
      }
    },
  };
}
