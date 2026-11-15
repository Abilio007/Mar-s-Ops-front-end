import { appState, getRegionById } from '../core/state.js';
import { formatCoordinates } from '../utils/formatters.js';
import { escapeHtml } from '../utils/helpers.js';

const ROOT_ID = 'map-location-tooltip-root';

function renderSource(region) {
  const label = region.sourceName || 'Abrir fonte';
  if (!region.sourceUrl) return escapeHtml(region.sourceName || 'Fonte não indicada');

  try {
    const url = new URL(region.sourceUrl, window.location.origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return escapeHtml(label);
    return `<a href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  } catch {
    return escapeHtml(label);
  }
}

export function showMapLocationTooltip(regionId, { routeRole = '', actions = [] } = {}) {
  const root = document.getElementById(ROOT_ID);
  const region = getRegionById(regionId);
  if (!root || !region) return false;

  const regionAlerts = appState.alerts.filter((alert) => alert.regionId === regionId);
  const alertSummary = regionAlerts.length
    ? regionAlerts.map((alert) => alert.title || alert.priority || 'Alerta ativo').join(', ')
    : 'Sem alertas associados.';
  const source = renderSource(region);

  root.dataset.regionId = String(regionId);
  root.innerHTML = `
    <article class="map-location-tooltip" role="dialog" aria-label="Informações de ${escapeHtml(region.name)}">
      <header class="map-location-tooltip__header">
        <div>
          <span class="map-location-tooltip__eyebrow">LOCALIZAÇÃO MARCIANA</span>
          <h2 class="map-location-tooltip__title">${escapeHtml(region.name)}</h2>
          <p class="map-location-tooltip__coordinates tabular-nums">${escapeHtml(formatCoordinates(region.lat, region.lon))}</p>
        </div>
        <button type="button" class="map-location-tooltip__close" data-close-location-tooltip aria-label="Fechar informações do local">×</button>
      </header>
      <p class="map-location-tooltip__description">${escapeHtml(region.description || 'Localização fornecida pelo catálogo de Marte.')}</p>
      <dl class="map-location-tooltip__details">
        <div>
          <dt>Alertas</dt>
          <dd>${escapeHtml(alertSummary)}</dd>
        </div>
        <div>
          <dt>Fonte</dt>
          <dd>${source}</dd>
        </div>
        ${routeRole ? `<div><dt>Na rota</dt><dd>${escapeHtml(routeRole)}</dd></div>` : ''}
      </dl>
      ${
        actions.length
          ? `<div class="map-location-tooltip__actions">
              ${actions.map((action, index) => `
                <button
                  type="button"
                  class="btn ${action.variant === 'primary' ? 'btn--primary' : 'btn--secondary'} btn--sm"
                  data-location-action="${index}"
                  ${action.disabled ? 'disabled' : ''}
                >${escapeHtml(action.label)}</button>
              `).join('')}
            </div>`
          : ''
      }
    </article>
  `;
  root.hidden = false;

  root.querySelector('[data-close-location-tooltip]')?.addEventListener('click', hideMapLocationTooltip);
  root.querySelectorAll('[data-location-action]').forEach((button) => {
    const action = actions[Number(button.dataset.locationAction)];
    button.addEventListener('click', () => action?.onSelect?.());
  });

  return true;
}

export function positionMapLocationTooltip(globe) {
  const root = document.getElementById(ROOT_ID);
  const tooltip = root?.querySelector('.map-location-tooltip');
  const stage = document.getElementById('mars-persistent-stage');
  const regionId = root?.dataset.regionId;
  if (!globe || !root || !tooltip || !stage || !regionId || !stage.clientWidth || !stage.clientHeight) return;

  const projected = globe.getProjectedMarker(regionId, stage.clientWidth, stage.clientHeight);
  if (!projected?.visible) {
    root.hidden = true;
    return;
  }

  root.hidden = false;
  const stageBounds = stage.getBoundingClientRect();
  const x = stageBounds.left + projected.x * (stageBounds.width / stage.clientWidth);
  const y = stageBounds.top + projected.y * (stageBounds.height / stage.clientHeight);
  const margin = 12;
  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;
  const placeLeft = x + width + 20 > window.innerWidth - margin;
  const desiredLeft = placeLeft ? x - width - 20 : x + 20;

  tooltip.style.left = `${Math.max(margin, Math.min(desiredLeft, window.innerWidth - width - margin))}px`;
  tooltip.style.top = `${Math.max(margin, Math.min(y - height / 2, window.innerHeight - height - margin))}px`;
  tooltip.classList.toggle('map-location-tooltip--left', placeLeft);
}

export function hideMapLocationTooltip() {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  root.hidden = true;
  delete root.dataset.regionId;
  root.innerHTML = '';
}
