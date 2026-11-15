import {
  acknowledgeAlert,
  appState,
  getAlertsSortedByPriority,
  getHighestPriorityAlert,
  getRegionById,
  PRIORITY_META,
} from '../../core/state.js';
import { getMarsThumbnailDataUrl } from '../home/mars-globe.js';
import { formatCoordinates, formatDistance } from '../../utils/formatters.js';
import { escapeHtml, calculateMarsDistanceKm } from '../../utils/helpers.js';
import { showEmergencyCenterSwal, showEmergencySweetAlert } from '../../utils/sweetalerts.js';
import { showToast } from '../../core/events.js';

export function createStatusView({ navigateTo }) {
  let showAlertsDrawer = false;

  function getMonitoredTrip() {
    const activeTrips = appState.trips.filter((t) => t.status === 'active');
    const selected = appState.trips.find((t) => t.id === appState.selectedStatusTripId);
    return selected || activeTrips[0] || appState.trips[0] || null;
  }

  function renderTelemetry(container) {
    const trip = getMonitoredTrip();
    const distUnit = appState.settings.distanceUnit;

    const mainCardEl = container.querySelector('#status-telemetry-card');
    const arrivalCardEl = container.querySelector('#status-arrival-card');
    const extraGridEl = container.querySelector('#status-extra-grid');
    if (!mainCardEl || !arrivalCardEl || !extraGridEl) return;

    if (!trip) {
      mainCardEl.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">${appState.backendUser ? 'O servidor não tem missões para esta conta.' : 'Inicie sessão para consultar as suas missões.'}</div>`;
      arrivalCardEl.innerHTML = '';
      extraGridEl.innerHTML = '';
      return;
    }

    const origin = getRegionById(trip.originId);
    const dest = getRegionById(trip.destinationId);
    if (!origin || !dest) {
      mainCardEl.innerHTML = '<div class="empty-state">A origem ou o destino já não existe no catálogo do servidor.</div>';
      arrivalCardEl.innerHTML = '';
      extraGridEl.innerHTML = '';
      return;
    }

    const heartbeat = appState.latestHeartbeat;
    const effectiveProgress = trip.status === 'completed'
      ? 100
      : Number(trip.progress || 0);
    const remainingDistKm = heartbeat
      ? calculateMarsDistanceKm(heartbeat.latitude, heartbeat.longitude, dest.lat, dest.lon)
      : null;
    const missionStatusText =
      trip.status === 'completed'
        ? 'Chegada Concluída'
        : trip.status === 'planned'
        ? 'Em Preparação'
        : 'Em Trânsito Marciano';

    const radius = 46;
    const circ = 2 * Math.PI * radius;
    const offset = circ - (effectiveProgress / 100) * circ;
    const thumbUrl = getMarsThumbnailDataUrl();

    mainCardEl.innerHTML = `
      <div class="status-gauge-block">
        <div class="status-rocket-ring" aria-label="Progresso da missão recebido do servidor: ${effectiveProgress}%">
          <svg viewBox="0 0 112 112">
            <circle class="status-rocket-ring__bg" cx="56" cy="56" r="${radius}"></circle>
            <circle
              class="status-rocket-ring__fill"
              cx="56"
              cy="56"
              r="${radius}"
              stroke-dasharray="${circ.toFixed(2)}"
              stroke-dashoffset="${offset.toFixed(2)}"
            ></circle>
          </svg>
          <div class="status-rocket-ring__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
              <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
              <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
            </svg>
          </div>
        </div>

        <div>
          <div class="status-days__kicker">Tempo Estimado de Viagem</div>
          <div class="status-days__number tabular-nums">${trip.estimatedDays} Sóis</div>
          <div class="status-days__sub">estimativa guardada no servidor · progresso ${effectiveProgress}%</div>
        </div>
      </div>

      <div class="status-metrics-col">
        <div class="status-metric-item">
          <svg class="status-metric-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          <div>
            <div class="status-metric-item__label">Distância até Destino</div>
            <div class="status-metric-item__val tabular-nums">${heartbeat ? escapeHtml(formatDistance(remainingDistKm, distUnit)) : 'Sem posição comunicada'}</div>
          </div>
        </div>

        <div class="status-metric-item">
          <svg class="status-metric-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>
          </svg>
          <div>
            <div class="status-metric-item__label">Última posição comunicada</div>
            <div class="status-metric-item__val tabular-nums">${heartbeat ? escapeHtml(formatCoordinates(heartbeat.latitude, heartbeat.longitude)) : 'Sem heartbeat recebido'}</div>
          </div>
        </div>

        <div class="status-metric-item">
          <svg class="status-metric-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
          </svg>
          <div>
            <div class="status-metric-item__label">Fonte do destino</div>
            <div class="status-metric-item__val">${escapeHtml(dest.sourceName || 'Não indicada')}</div>
          </div>
        </div>
      </div>
    `;

    arrivalCardEl.innerHTML = `
      <div class="arrival-card__title">Ponto de Chegada</div>

      <div class="arrival-row">
        <div class="arrival-row__left">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#F2A65A" stroke-width="2" aria-hidden="true">
            <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
          </svg>
          <div>
            <div style="font-family: var(--font-display); font-weight: 600; letter-spacing: 0.08em;">${escapeHtml(dest.name)}</div>
            <div class="panel__meta" style="font-size: 0.8rem;">
              ${escapeHtml(dest.sourceName || 'Região do catálogo do servidor')}
            </div>
          </div>
        </div>
        <img src="${thumbUrl}" alt="Marte" class="mars-orb-thumb" />
      </div>

      <div class="arrival-row__divider"></div>

      <button type="button" class="arrival-risk-btn" id="btn-toggle-risk-drawer">
        <span class="arrival-row__left">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FF2929" stroke-width="2" aria-hidden="true">
            <circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>
          </svg>
          <span>
            <span style="display: block; font-weight: 600; color: var(--color-text-primary);">Zonas de Risco &amp; Alertas</span>
            <span class="panel__meta" style="font-size: 0.8rem;">Consulte os alertas de segurança (${appState.alerts.length})</span>
          </span>
        </span>
        <span class="alert-hero-card__chevron" aria-hidden="true">&rsaquo;</span>
      </button>
    `;

    arrivalCardEl.querySelector('#btn-toggle-risk-drawer')?.addEventListener('click', () => {
      showAlertsDrawer = !showAlertsDrawer;
      const drawer = container.querySelector('#status-alerts-drawer');
      if (drawer) drawer.hidden = !showAlertsDrawer;
    });

    extraGridEl.innerHTML = `
      <div class="telemetry-mini-card">
        <div class="telemetry-mini-card__label">Estado da Missão</div>
        <div class="telemetry-mini-card__val">${escapeHtml(missionStatusText)}</div>
      </div>
      <div class="telemetry-mini-card">
        <div class="telemetry-mini-card__label">Partida</div>
        <div class="telemetry-mini-card__val">${escapeHtml(origin.name)}</div>
      </div>
      <div class="telemetry-mini-card">
        <div class="telemetry-mini-card__label">Duração Estimada</div>
        <div class="telemetry-mini-card__val tabular-nums">${trip.estimatedDays} Sóis</div>
      </div>
      <div class="telemetry-mini-card">
        <div class="telemetry-mini-card__label">Tripulação</div>
        <div class="telemetry-mini-card__val tabular-nums">${trip.participants} participantes</div>
      </div>
    `;
  }

  function renderTopAlert(container) {
    const alertCard = container.querySelector('#status-top-alert');
    if (!alertCard) return;

    const topAlert = getHighestPriorityAlert();
    if (!topAlert) {
      alertCard.disabled = true;
      alertCard.innerHTML = '<div class="alert-hero-card__title">Sem alertas ativos fornecidos pelo servidor.</div>';
      alertCard.onclick = null;
      return;
    }
    alertCard.disabled = false;
    const pMeta = PRIORITY_META[topAlert.priority || 'P2'] || PRIORITY_META.P2;

    alertCard.innerHTML = `
      <div class="alert-hero-card__head" style="justify-content: space-between;">
        <span style="display: inline-flex; align-items: center; gap: var(--space-2);">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" aria-hidden="true">
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
        onAcknowledge: () => {
          renderAlertsBoard(container);
          renderTopAlert(container);
        },
        onFocusGlobe: (regionId) => {
          appState.selectedRegionId = regionId;
          navigateTo('home');
        },
      });
    };
  }

  function renderAlertsBoard(container) {
    const gridEl = container.querySelector('#status-alerts-grid');
    if (!gridEl) return;

    const sorted = getAlertsSortedByPriority(appState.alerts);
    const filtered = sorted;

    gridEl.innerHTML = filtered.length ? filtered
      .map((alert) => {
        const region = getRegionById(alert.regionId);
        const pMeta = PRIORITY_META[alert.priority || 'P2'] || PRIORITY_META.P2;
        const isCritical = alert.priority === 'P1' || alert.severity === 'critico';
        return `
          <article class="security-alert ${isCritical ? 'security-alert--critical' : ''}">
            <div class="security-alert__head">
              <span class="meta-line">
                <span class="tabular-nums" style="color: ${pMeta.color}; font-weight: 700;">${escapeHtml(pMeta.label)}</span>
                <span class="meta-line__sep" aria-hidden="true">·</span>
                <span>${escapeHtml(region?.name || 'Sem região associada')}</span>
              </span>
              <span class="status-text ${
                alert.acknowledged
                  ? 'status-text--safe'
                  : isCritical
                  ? 'status-text--danger'
                  : 'status-text--warn'
              }">
                ${alert.acknowledged ? '● Verificado' : isCritical ? '✖ Crítico' : '▲ Ativo'}
              </span>
            </div>
            <h3 class="security-alert__title">${escapeHtml(alert.title)}</h3>
            <p class="security-alert__desc">${escapeHtml(alert.description)}</p>
            <div class="security-alert__foot">
              <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                <button type="button" class="btn btn--ghost btn--sm" data-focus-region="${escapeHtml(region.id)}">
                  Ver no Globo
                </button>
                <button type="button" class="btn btn--secondary btn--sm" data-open-swal="${escapeHtml(alert.id)}">
                  Protocolo
                </button>
              </div>
              <button type="button" class="btn ${alert.acknowledged ? 'btn--secondary' : 'btn--danger'} btn--sm" data-ack-alert="${escapeHtml(alert.id)}">
                ${alert.acknowledged ? 'Reabrir Alerta' : 'Confirmar Leitura'}
              </button>
            </div>
          </article>
        `;
      })
      .join('') : '<div class="empty-state">Não há alertas fornecidos pelo servidor.</div>';

    gridEl.querySelectorAll('[data-ack-alert]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await acknowledgeAlert(btn.dataset.ackAlert);
          renderAlertsBoard(container);
          renderTopAlert(container);
        } catch (error) {
          showToast({ title: 'Não foi possível atualizar o alerta', message: error.message, variant: 'warn' });
          btn.disabled = false;
        }
      });
    });

    gridEl.querySelectorAll('[data-open-swal]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const alert = appState.alerts.find((a) => a.id === btn.dataset.openSwal);
        if (!alert) return;
        showEmergencySweetAlert({
          alert,
          onAcknowledge: () => {
            renderAlertsBoard(container);
            renderTopAlert(container);
          },
          onFocusGlobe: (regionId) => {
            appState.selectedRegionId = regionId;
            navigateTo('home');
          },
        });
      });
    });

    gridEl.querySelectorAll('[data-focus-region]').forEach((btn) => {
      btn.addEventListener('click', () => {
        appState.selectedRegionId = btn.dataset.focusRegion;
        navigateTo('home');
      });
    });
  }

  return {
    mount(container) {
      container.innerHTML = `
        <section class="view-section status-stage" aria-label="Estado Atual da Missão">
          <div class="status-top-row">
            <div>
              <h1 class="status-hero-title">
                ESTADO
                <span class="status-hero-title__red">ATUAL</span>
              </h1>
              <p class="status-hero-sub">Missões, alertas e posições recebidos do backend.</p>
              <p class="status-sim-note">A posição é atualizada apenas quando uma coordenada é enviada manualmente.</p>

              <div style="display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-3);">
                <label for="status-trip-select" class="sr-only">Selecionar missão monitorizada</label>
                <select id="status-trip-select" class="field__control" style="width: auto; min-width: 230px; min-height: 36px; font-size: 0.84rem;" ${appState.trips.length ? '' : 'disabled'}>
                  ${appState.trips
                    .map(
                      (trip) => `
                      <option value="${escapeHtml(trip.id)}" ${
                        getMonitoredTrip()?.id === trip.id ? 'selected' : ''
                      }>
                        ${escapeHtml(trip.name)}
                      </option>
                    `
                    )
                    .join('')}
                </select>
                <button type="button" class="btn btn--danger btn--sm" id="btn-status-emergencies">
                  Emergências &amp; Prioridades
                </button>
              </div>
            </div>

            <div class="status-top-right">
              <button type="button" class="alert-hero-card" id="status-top-alert"></button>
            </div>
          </div>

          <div class="status-main-grid">
            <article class="status-telemetry-card" id="status-telemetry-card"></article>
            <article class="arrival-card" id="status-arrival-card"></article>
          </div>

          <div class="status-extra-grid" id="status-extra-grid"></div>

          <section class="panel" id="status-alerts-drawer" ${showAlertsDrawer ? '' : 'hidden'}>
            <div class="panel__header">
              <div>
                <h2 class="panel__title">Sistema de Alertas de Segurança (Ordenado por Prioridade)</h2>
                <p class="panel__meta">Alertas ativos fornecidos pelo backend.</p>
              </div>
            </div>
            <div class="alerts-board__grid" id="status-alerts-grid"></div>
          </section>
        </section>
      `;

      renderTopAlert(container);
      renderTelemetry(container);
      renderAlertsBoard(container);

      container.querySelector('#status-trip-select')?.addEventListener('change', (e) => {
        appState.selectedStatusTripId = e.target.value;
        renderTelemetry(container);
      });

      container.querySelector('#btn-status-emergencies')?.addEventListener('click', () => {
        showEmergencyCenterSwal({
          onFocusGlobe: (regionId) => {
            appState.selectedRegionId = regionId;
            navigateTo('home');
          },
          onAlertsUpdated: () => {
            renderTopAlert(container);
            renderAlertsBoard(container);
            renderTelemetry(container);
          },
        });
      });

    },

    unmount() {},
  };
}
