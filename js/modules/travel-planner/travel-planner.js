import { appState, getRegionById } from '../../core/state.js';
import { setMarsStageMode } from '../home/mars-globe.js';
import { formatDate, formatDistance, getStatusLabel } from '../../utils/formatters.js';
import { escapeHtml } from '../../utils/helpers.js';
import { showPriorityConfirmSwal } from '../../utils/sweetalerts.js';
import { travelService } from './travel-service.js';
import { renderTripForm } from './travel-form.js';
import { createTravelMapView } from './travel-map.js';
import { createEarthTripsView } from './earth-trips.js';
import { renderMissionCalendar } from './travel-calendar.js';
import { showToast } from '../../core/events.js';

export function createTravelPlannerView() {
  let categoryFilter = 'all';
  let activeSubView = null;
  let routeSeed = null;

  function getMissionTypeLabel(value) {
    return appState.catalog.missionTypes.find((type) => type.value === value)?.label || value;
  }

  function getRiskToleranceLabel(value) {
    return appState.catalog.riskTolerances.find((risk) => risk.value === value)?.label || value;
  }

  function unmountActiveSubView() {
    if (activeSubView) {
      activeSubView.unmount();
      activeSubView = null;
    }
    setMarsStageMode('planner-bg', appState.settings);
  }

  function renderTripsList(stageEl, rootContainer) {
    const categories = [
      { key: 'planned', title: 'Viagens Planeadas' },
      { key: 'active', title: 'Viagens em Andamento' },
      { key: 'completed', title: 'Viagens Concluídas' },
    ];

    const visibleCats =
      categoryFilter === 'all' ? categories : categories.filter((c) => c.key === categoryFilter);

    stageEl.innerHTML = `
      <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-4);">
        <div class="segmented" role="group" aria-label="Filtrar categoria de viagem">
          <button type="button" class="segmented__btn ${categoryFilter === 'all' ? 'is-active' : ''}" data-cat="all">Todas (${appState.trips.length})</button>
          <button type="button" class="segmented__btn ${categoryFilter === 'planned' ? 'is-active' : ''}" data-cat="planned">Planeadas (${travelService.getByStatus('planned').length})</button>
          <button type="button" class="segmented__btn ${categoryFilter === 'active' ? 'is-active' : ''}" data-cat="active">Em Andamento (${travelService.getByStatus('active').length})</button>
          <button type="button" class="segmented__btn ${categoryFilter === 'completed' ? 'is-active' : ''}" data-cat="completed">Concluídas (${travelService.getByStatus('completed').length})</button>
        </div>

        <button type="button" class="btn btn--primary" id="btn-new-trip-inline" ${!appState.backendUser ? 'disabled' : ''}>+ Criar Viagem</button>
      </div>

      ${!appState.backendUser ? '<p class="panel__meta">Inicie sessão em Definições para consultar e gerir as suas missões no servidor.</p>' : ''}

      ${visibleCats
        .map((cat) => {
          const trips = travelService.getByStatus(cat.key);
          return `
            <section style="margin-bottom: var(--space-6);">
              <h2 class="panel__title" style="margin-bottom: var(--space-3);">${cat.title}</h2>
              ${
                trips.length === 0
                  ? `<div class="empty-state"><p>Nenhuma viagem na categoria "${cat.title}".</p></div>`
                  : `<div class="trips-grid">
                      ${trips
                        .map((trip) => {
                          const origin = getRegionById(trip.originId);
                          const dest = getRegionById(trip.destinationId);
                          const statusClass =
                            trip.status === 'completed'
                              ? 'status-text--safe'
                              : trip.status === 'active'
                              ? 'status-text--warn'
                              : 'status-text--muted';
                          return `
                            <article class="trip-card">
                              <div>
                                <div class="meta-line" style="margin-bottom: 6px;">
                                  <span class="status-text ${statusClass}">${escapeHtml(getStatusLabel(trip.status))}</span>
                                  <span class="meta-line__sep" aria-hidden="true">·</span>
                                  <span>${escapeHtml(getMissionTypeLabel(trip.missionType))}</span>
                                </div>
                                <h3 class="trip-card__title">${escapeHtml(trip.name)}</h3>
                                <p class="trip-card__route">${escapeHtml(origin.name)} → ${escapeHtml(dest.name)}</p>
                                <div class="meta-line" style="margin-top: var(--space-2);">
                                  <span>Partida: <span class="tabular-nums">${escapeHtml(formatDate(trip.departureDate))}</span></span>
                                  <span class="meta-line__sep" aria-hidden="true">·</span>
                                  <span class="tabular-nums">${escapeHtml(formatDistance(trip.distanceKm, appState.settings.distanceUnit))}</span>
                                </div>
                              </div>

                              <div class="trip-progress">
                                <div class="trip-progress__row">
                                  <span>Progresso</span>
                                  <span class="tabular-nums">${trip.progress || 0}%</span>
                                </div>
                                <div class="trip-progress__bar">
                                  <div class="trip-progress__fill" style="width: ${trip.progress || 0}%;"></div>
                                </div>
                              </div>

                              <div class="trip-card__actions">
                                <button type="button" class="btn btn--secondary btn--sm" data-trip-details="${escapeHtml(trip.id)}">Detalhes</button>
                                <button type="button" class="btn btn--ghost btn--sm" data-trip-edit="${escapeHtml(trip.id)}">Editar</button>
                                <button type="button" class="btn btn--danger btn--sm" data-trip-delete="${escapeHtml(trip.id)}">Eliminar</button>
                              </div>
                            </article>
                          `;
                        })
                        .join('')}
                    </div>`
              }
            </section>
          `;
        })
        .join('')}
    `;

    stageEl.querySelectorAll('[data-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        categoryFilter = btn.dataset.cat;
        renderTripsList(stageEl, rootContainer);
      });
    });

    stageEl.querySelector('#btn-new-trip-inline')?.addEventListener('click', () => {
      appState.editingTripId = null;
      appState.plannerSubTab = 'form';
      renderCurrentSubTab(rootContainer);
    });

    stageEl.querySelectorAll('[data-trip-details]').forEach((btn) => {
      btn.addEventListener('click', () => {
        appState.selectedTripId = btn.dataset.tripDetails;
        appState.plannerSubTab = 'details';
        renderCurrentSubTab(rootContainer);
      });
    });

    stageEl.querySelectorAll('[data-trip-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        appState.editingTripId = btn.dataset.tripEdit;
        appState.plannerSubTab = 'form';
        renderCurrentSubTab(rootContainer);
      });
    });

    stageEl.querySelectorAll('[data-trip-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const trip = travelService.getById(btn.dataset.tripDelete);
        if (!trip) return;
        const confirmed = await showPriorityConfirmSwal({
          priority: 'P2',
          title: 'Eliminar Viagem',
          text: `Tem a certeza de que pretende eliminar a missão "${trip.name}" do servidor?`,
          confirmText: 'Eliminar',
          cancelText: 'Cancelar',
        });
        if (confirmed) {
          try {
            await travelService.deleteTrip(trip.id);
            renderTripsList(stageEl, rootContainer);
          } catch (error) {
            showToast({ title: 'Não foi possível eliminar a missão', message: error.message, variant: 'warn' });
          }
        }
      });
    });
  }

  function renderTripDetails(stageEl, rootContainer) {
    const trip = travelService.getById(appState.selectedTripId);
    if (!trip) {
      appState.plannerSubTab = 'list';
      renderCurrentSubTab(rootContainer);
      return;
    }

    const summary = travelService.computeRouteSummary(trip.originId, trip.destinationId, trip.waypoints);
    const equipment = travelService.getDefaultEquipment(trip.missionType);
    const schedule = travelService.buildSchedule(trip);
    const readyCount = (trip.checklist || []).filter((c) => c.done).length;
    const totalChecklist = (trip.checklist || []).length;

    stageEl.innerHTML = `
      <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-4);">
        <button type="button" class="btn btn--ghost btn--sm" id="btn-back-to-trips">← Voltar às Viagens</button>
        <div style="display: flex; flex-wrap: wrap; gap: var(--space-2);">
          <button type="button" class="btn btn--secondary btn--sm" id="btn-open-route-map">Ver Rota no Globo 3D</button>
          <button type="button" class="btn btn--secondary btn--sm" id="btn-edit-this-trip">Editar</button>
        </div>
      </div>

      <div class="trip-details-grid">
        <article class="panel">
          <div class="panel__header">
            <h2 class="panel__title">${escapeHtml(trip.name)}</h2>
            <span class="status-text status-text--warn">${escapeHtml(getStatusLabel(trip.status))}</span>
          </div>
          <p class="panel__meta" style="margin-bottom: var(--space-4);">${escapeHtml(trip.objective)}</p>
          <div class="region-detail__grid">
            <div class="metric-cell">
              <div class="metric-cell__label">Participantes</div>
              <div class="metric-cell__value tabular-nums">${trip.participants} tripulantes</div>
            </div>
            <div class="metric-cell">
              <div class="metric-cell__label">Distância Total</div>
              <div class="metric-cell__value tabular-nums">${escapeHtml(formatDistance(trip.distanceKm, appState.settings.distanceUnit))}</div>
            </div>
            <div class="metric-cell">
              <div class="metric-cell__label">Tolerância de Risco</div>
              <div class="metric-cell__value">${escapeHtml(getRiskToleranceLabel(trip.riskTolerance))}</div>
            </div>
            <div class="metric-cell">
              <div class="metric-cell__label">Tipo de Missão</div>
              <div class="metric-cell__value">${escapeHtml(getMissionTypeLabel(trip.missionType))}</div>
            </div>
          </div>
          ${trip.notes ? `<p class="panel__meta"><strong>Observações:</strong> ${escapeHtml(trip.notes)}</p>` : ''}

          <div style="margin-top: var(--space-4); display: flex; flex-wrap: wrap; gap: var(--space-2);">
            <button type="button" class="btn btn--ghost btn--sm" data-set-status="planned">Marcar Planeada</button>
            <button type="button" class="btn btn--secondary btn--sm" data-set-status="active">Iniciar Viagem</button>
            <button type="button" class="btn btn--primary btn--sm" data-set-status="completed">Concluir Viagem</button>
          </div>
        </article>

        <article class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Rota Selecionada & Cronograma</h2>
          </div>
          <p class="panel__meta" style="margin-bottom: var(--space-3);">
            ${summary.regions.map((r) => escapeHtml(r.name)).join(' → ')}
          </p>
          <div class="waypoints-list">
            ${schedule
              .map(
                (item) => `
                <div class="waypoint-row">
                  <span>${escapeHtml(item.phase)}</span>
                  <span class="meta-line tabular-nums">${escapeHtml(formatDate(item.date))} · ${escapeHtml(item.status)}</span>
                </div>
              `
              )
              .join('')}
          </div>
        </article>

        <article class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Equipamentos Necessários</h2>
          </div>
          <ul class="waypoints-list">
            ${equipment.map((eq) => `<li class="waypoint-row"><span>${escapeHtml(eq)}</span></li>`).join('')}
          </ul>
        </article>

        <article class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Estado de Preparação</h2>
            <span class="panel__meta tabular-nums">${readyCount} / ${totalChecklist} prontos</span>
          </div>
          <div class="checklist">
            ${(trip.checklist || []).length
              ? (trip.checklist || [])
              .map(
                (item) => `
                <label class="checklist-item">
                  <input type="checkbox" data-check-item="${escapeHtml(item.id)}" ${item.done ? 'checked' : ''} />
                  <span>${escapeHtml(item.label)}</span>
                </label>
              `
              )
              .join('')
                : '<p class="panel__meta">O servidor não forneceu itens de preparação para esta missão.</p>'}
          </div>

          <div style="margin-top: var(--space-4);">
            <h3 class="panel__title" style="font-size: 0.95rem; margin-bottom: var(--space-2);">Alertas Associados à Rota</h3>
            ${
              summary.relatedAlerts.length === 0
                ? '<p class="panel__meta">Sem alertas do servidor associados às regiões da rota.</p>'
                : summary.relatedAlerts
                    .map(
                      (a) => `<p class="panel__meta" style="color: #ff8a8a; margin-bottom: 4px;">▲ ${escapeHtml(a.title)}</p>`
                    )
                    .join('')
            }
          </div>
        </article>
      </div>
    `;

    stageEl.querySelector('#btn-back-to-trips')?.addEventListener('click', () => {
      appState.plannerSubTab = 'list';
      renderCurrentSubTab(rootContainer);
    });

    stageEl.querySelector('#btn-edit-this-trip')?.addEventListener('click', () => {
      appState.editingTripId = trip.id;
      appState.plannerSubTab = 'form';
      renderCurrentSubTab(rootContainer);
    });

    stageEl.querySelector('#btn-open-route-map')?.addEventListener('click', () => {
      routeSeed = {
        tripId: trip.id,
        originId: trip.originId,
        destinationId: trip.destinationId,
        waypoints: trip.waypoints || [],
      };
      appState.plannerSubTab = 'routes';
      renderCurrentSubTab(rootContainer);
    });

    stageEl.querySelectorAll('[data-set-status]').forEach((btn) => {
      btn.addEventListener('click', () => {
        travelService.updateStatus(trip.id, btn.dataset.setStatus)
          .then(() => renderTripDetails(stageEl, rootContainer))
          .catch((error) => showToast({ title: 'Não foi possível atualizar a missão', message: error.message, variant: 'warn' }));
      });
    });

    stageEl.querySelectorAll('[data-check-item]').forEach((cb) => {
      cb.addEventListener('change', () => {
        travelService.toggleChecklistItem(trip.id, cb.dataset.checkItem)
          .then(() => renderTripDetails(stageEl, rootContainer))
          .catch((error) => showToast({ title: 'Não foi possível atualizar a lista', message: error.message, variant: 'warn' }));
      });
    });
  }

  function renderCurrentSubTab(rootContainer, extraParams = {}) {
    unmountActiveSubView();

    rootContainer.querySelectorAll('[data-planner-tab]').forEach((btn) => {
      const targetTab = btn.dataset.plannerTab;
      const isDetails = appState.plannerSubTab === 'details' && targetTab === 'list';
      btn.classList.toggle('is-active', targetTab === appState.plannerSubTab || isDetails);
    });

    const stageEl = rootContainer.querySelector('#planner-stage');
    if (!stageEl) return;

    if (appState.plannerSubTab === 'form') {
      const editingTrip = appState.editingTripId ? travelService.getById(appState.editingTripId) : null;
      const mergedTrip = editingTrip || (routeSeed && !extraParams.prefillDestinationId
        ? {
            name: '',
            originId: routeSeed.originId,
            destinationId: routeSeed.destinationId,
            waypoints: routeSeed.waypoints || [],
            departureDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
            arrivalDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
            participants: 4,
            missionType: 'Científica',
            objective: '',
            riskTolerance: 'baixo',
            notes: '',
          }
        : null);

      renderTripForm(stageEl, {
        editingTrip: editingTrip ? mergedTrip : null,
        prefillDestinationId: extraParams.prefillDestinationId || routeSeed?.destinationId,
        onSaved: (savedTrip) => {
          routeSeed = null;
          appState.editingTripId = null;
          appState.selectedTripId = savedTrip.id;
          appState.plannerSubTab = 'details';
          renderCurrentSubTab(rootContainer);
        },
        onCancel: () => {
          routeSeed = null;
          appState.editingTripId = null;
          appState.plannerSubTab = 'list';
          renderCurrentSubTab(rootContainer);
        },
        onPickOnMap: (originId, destinationId) => {
          routeSeed = { originId, destinationId, waypoints: [] };
          appState.plannerSubTab = 'routes';
          renderCurrentSubTab(rootContainer);
        },
      });
      return;
    }

    if (appState.plannerSubTab === 'routes') {
      activeSubView = createTravelMapView({
        onCreateTripWithRoute: (route) => {
          routeSeed = route;
          appState.editingTripId = null;
          appState.plannerSubTab = 'form';
          renderCurrentSubTab(rootContainer);
        },
      });
      activeSubView.mount(stageEl, routeSeed || {});
      return;
    }

    if (appState.plannerSubTab === 'earth') {
      activeSubView = createEarthTripsView();
      activeSubView.mount(stageEl);
      return;
    }

    if (appState.plannerSubTab === 'calendar') {
      renderMissionCalendar(stageEl, {
        onSelectTrip: (tripId) => {
          appState.selectedTripId = tripId;
          appState.plannerSubTab = 'details';
          renderCurrentSubTab(rootContainer);
        },
      });
      return;
    }

    if (appState.plannerSubTab === 'details') {
      renderTripDetails(stageEl, rootContainer);
      return;
    }

    renderTripsList(stageEl, rootContainer);
  }

  return {
    mount(container, params = {}) {
      if (params?.prefillDestinationId) {
        routeSeed = {
          originId: appState.regions.find((region) => region.id !== params.prefillDestinationId)?.id || null,
          destinationId: params.prefillDestinationId,
          waypoints: [],
        };
        appState.plannerSubTab = 'form';
      }

      container.innerHTML = `
        <section class="view-section" aria-label="Planeamento de Viagens em Marte">
          <header class="page-header">
            <div>
              <h1 class="page-header__title">Planeamento de Viagens</h1>
              <p class="page-header__subtitle">
                Organize expedições, trace rotas 3D com pontos de passagem e acompanhe o calendário de missões.
              </p>
            </div>

            <div class="segmented" role="tablist" aria-label="Submódulos do Planeamento de Viagens">
              <button type="button" class="segmented__btn" data-planner-tab="list">Viagens em Marte</button>
              <button type="button" class="segmented__btn" data-planner-tab="earth">Viagens terrestres</button>
              <button type="button" class="segmented__btn" data-planner-tab="form">Criar / Editar</button>
              <button type="button" class="segmented__btn" data-planner-tab="routes">Rotas 3D</button>
              <button type="button" class="segmented__btn" data-planner-tab="calendar">Calendário</button>
            </div>
          </header>

          <div id="planner-stage"></div>
        </section>
      `;

      container.querySelectorAll('[data-planner-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const tab = btn.dataset.plannerTab;
          if (tab === 'form') {
            appState.editingTripId = null;
          }
          appState.plannerSubTab = tab;
          renderCurrentSubTab(container);
        });
      });

      renderCurrentSubTab(container, params);
    },

    unmount() {
      unmountActiveSubView();
    },
  };
}
