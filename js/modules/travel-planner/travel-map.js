import { appState, getRegionById, notifyIfEnabled } from '../../core/state.js';
import { getSharedMarsGlobe, setMarsStageMode } from '../home/mars-globe.js';
import { travelService } from './travel-service.js';
import { formatCoordinates, formatDistance } from '../../utils/formatters.js';
import { escapeHtml } from '../../utils/helpers.js';
import { showPriorityConfirmSwal } from '../../utils/sweetalerts.js';
import { backendApi } from '../../core/backend-api.js';
import { refreshBackendData } from '../../core/backend-integration.js';
import { showToast } from '../../core/events.js';
import {
  hideMapLocationTooltip,
  positionMapLocationTooltip,
  showMapLocationTooltip,
} from '../map-location-tooltip.js';

export function createTravelMapView({ onCreateTripWithRoute }) {
  let originId = null;
  let destinationId = null;
  let waypoints = [];
  let activeTripId = null;
  let apiRoute = null;
  let apiBusy = false;
  let apiError = '';
  let selectedTooltipRegionId = null;

  function updateGlobeRoute() {
    const globe = getSharedMarsGlobe();
    if (!globe) return;
    const ordered = [originId, ...waypoints, destinationId].filter(Boolean);
    globe.setRoute(ordered);
    globe.setSelectedRegion(destinationId, false);
    if (ordered.length > 1) {
      globe.fitRouteToView(ordered);
    } else if (destinationId) {
      globe.setSelectedRegion(destinationId, true);
    }
  }

  function getRouteRole(regionId) {
    if (regionId === originId) return 'Partida';
    if (regionId === destinationId) return 'Destino';
    const waypointIndex = waypoints.indexOf(regionId);
    return waypointIndex >= 0 ? `Ponto de passagem ${waypointIndex + 1}` : 'Ainda não incluído na rota';
  }

  function renderRouteTooltip(regionId = selectedTooltipRegionId) {
    const globe = getSharedMarsGlobe();
    const region = getRegionById(regionId);
    if (!globe || !region) return;

    showMapLocationTooltip(regionId, {
      routeRole: getRouteRole(regionId),
      actions: [
        {
          label: 'Definir como partida',
          variant: 'secondary',
          onSelect: () => {
            if (regionId === destinationId) {
              showToast({ title: 'Partida e destino iguais', message: 'Escolha outro local para a partida.', variant: 'warn' });
              return;
            }
            originId = regionId;
            appState.selectedRegionId = regionId;
            waypoints = waypoints.filter((waypointId) => waypointId !== originId && waypointId !== destinationId);
            apiRoute = null;
            apiError = '';
            updateGlobeRoute();
            renderPanel(containerRef);
          },
        },
        {
          label: 'Definir como destino',
          variant: 'primary',
          onSelect: () => {
            if (regionId === originId) {
              showToast({ title: 'Partida e destino iguais', message: 'Escolha outro local para o destino.', variant: 'warn' });
              return;
            }
            destinationId = regionId;
            appState.selectedRegionId = regionId;
            waypoints = waypoints.filter((waypointId) => waypointId !== originId && waypointId !== destinationId);
            apiRoute = null;
            apiError = '';
            updateGlobeRoute();
            renderPanel(containerRef);
          },
        },
        {
          label: 'Adicionar passagem',
          variant: 'secondary',
          disabled: regionId === originId || regionId === destinationId || waypoints.includes(regionId),
          onSelect: () => {
            if (regionId === originId || regionId === destinationId || waypoints.includes(regionId)) return;
            waypoints.push(regionId);
            apiRoute = null;
            apiError = '';
            updateGlobeRoute();
            renderPanel(containerRef);
          },
        },
      ],
    });
    positionMapLocationTooltip(globe);
  }

  let containerRef = null;

  function renderPanel(container) {
    const summary = travelService.computeRouteSummary(originId, destinationId, waypoints);
    const dest = getRegionById(destinationId);
    const origin = getRegionById(originId);
    const distUnit = appState.settings.distanceUnit;

    const summaryEl = container.querySelector('#route-summary-panel');
    if (!summaryEl) return;
    if (!origin || !dest) {
      summaryEl.innerHTML = '<div class="empty-state">O servidor ainda não disponibilizou regiões para planeamento.</div>';
      return;
    }

    summaryEl.innerHTML = `
      <div class="panel__header">
        <div>
          <h2 class="panel__title">Planeamento de Rota 3D</h2>
          <p class="panel__meta">Clique numa região para a inspecionar e escolher partida, destino ou ponto de passagem no tooltip.</p>
        </div>
      </div>

      <div class="planner-form-grid" style="gap: var(--space-3);">
        <div class="field">
          <label class="field__label" for="route-origin">Origem</label>
          <select id="route-origin" class="field__control">
            ${appState.regions.map(
              (r) => `<option value="${r.id}" ${originId === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`
            ).join('')}
          </select>
        </div>

        <div class="field">
          <label class="field__label" for="route-destination">Destino</label>
          <select id="route-destination" class="field__control">
            ${appState.regions.map(
              (r) => `<option value="${r.id}" ${destinationId === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`
            ).join('')}
          </select>
        </div>
      </div>

      <ol class="route-itinerary" aria-label="Sequência completa da rota">
        ${[originId, ...waypoints, destinationId].map((regionId, index, stops) => {
          const region = getRegionById(regionId);
          if (!region) return '';
          const isOrigin = index === 0;
          const isDestination = index === stops.length - 1;
          const role = isOrigin ? 'Partida' : isDestination ? 'Destino' : `Passagem ${index}`;
          const markerRole = isOrigin ? 'origin' : isDestination ? 'destination' : 'waypoint';
          return `
            <li class="route-itinerary__stop">
              <span class="route-itinerary__marker route-itinerary__marker--${markerRole}" aria-hidden="true"></span>
              <div class="route-itinerary__details">
                <span class="route-itinerary__role">${role}</span>
                <strong>${escapeHtml(region.name)}</strong>
                <span class="route-itinerary__coordinates tabular-nums">${escapeHtml(formatCoordinates(region.lat, region.lon))}</span>
              </div>
            </li>
          `;
        }).join('')}
      </ol>

      <div style="margin-top: var(--space-4);">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
          <span class="field__label">Pontos de Passagem (${waypoints.length})</span>
          <div style="display: flex; gap: 6px;">
            <select id="route-add-wp-select" class="field__control" style="min-height: 36px; padding: 4px 8px; font-size: 0.82rem;">
              ${appState.regions.filter((r) => r.id !== originId && r.id !== destinationId && !waypoints.includes(r.id))
                .map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`)
                .join('')}
            </select>
            <button type="button" class="btn btn--secondary btn--sm" id="btn-add-waypoint">Adicionar</button>
          </div>
        </div>

        <div class="waypoints-list">
          ${
            waypoints.length === 0
              ? '<div class="panel__meta">Rota direta sem pontos de passagem intermédios.</div>'
              : waypoints
                  .map((wpId, idx) => {
                    const reg = getRegionById(wpId);
                    return `
                      <div class="waypoint-row">
                        <span>${idx + 1}. ${escapeHtml(reg.name)} · <span class="tabular-nums">${escapeHtml(formatCoordinates(reg.lat, reg.lon))}</span></span>
                        <div class="waypoint-row__controls">
                          <button type="button" class="btn btn--ghost btn--sm" data-wp-up="${idx}" ${idx === 0 ? 'disabled' : ''} aria-label="Mover para cima">↑</button>
                          <button type="button" class="btn btn--ghost btn--sm" data-wp-down="${idx}" ${idx === waypoints.length - 1 ? 'disabled' : ''} aria-label="Mover para baixo">↓</button>
                          <button type="button" class="btn btn--danger btn--sm" data-wp-del="${idx}" aria-label="Remover ponto">×</button>
                        </div>
                      </div>
                    `;
                  })
                  .join('')
          }
        </div>
      </div>

      <div class="route-summary">
        <div class="metric-cell">
          <div class="metric-cell__label">Distância Estimada</div>
          <div class="metric-cell__value tabular-nums">${escapeHtml(formatDistance(summary.distanceKm, distUnit))}</div>
        </div>
        <div class="metric-cell">
          <div class="metric-cell__label">Duração Estimada</div>
          <div class="metric-cell__value tabular-nums">${summary.estimatedDays} Sóis (${summary.estimatedHours} h)</div>
        </div>
        <div class="metric-cell">
          <div class="metric-cell__label">Alertas nos pontos selecionados</div>
          <div class="metric-cell__value">${summary.relatedAlerts.length}</div>
        </div>
      </div>

      <p class="panel__meta" style="margin-top: var(--space-3);">
        O cálculo geométrico não avalia perigos. Use o planeador do servidor para consultar os dados cartografados disponíveis.
      </p>

      <div class="planner-form__actions">
        ${
          activeTripId
            ? `<button type="button" class="btn btn--secondary" id="btn-save-route-to-trip">Atualizar Rota da Viagem</button>`
            : ''
        }
        <button type="button" class="btn btn--primary" id="btn-use-route-new-trip" ${!appState.backendUser ? 'disabled' : ''}>
          Criar Viagem com esta Rota
        </button>
      </div>

      <section class="panel" style="margin-top: var(--space-4);" aria-label="Planeamento de rota no servidor">
        <div class="panel__header">
          <div>
            <h2 class="panel__title">Planeador do servidor</h2>
            <p class="panel__meta">Gera alternativas com dados importados e o assistente configurado no backend.</p>
          </div>
          <button type="button" class="btn btn--secondary btn--sm" id="btn-plan-server-route" ${!appState.backendUser || apiBusy ? 'disabled' : ''}>
            ${apiBusy ? 'A calcular…' : 'Calcular rota com IA'}
          </button>
        </div>
        ${
          !appState.backendUser
            ? '<p class="panel__meta">Inicie sessão em Definições → Conta e ligação para usar o planeador remoto.</p>'
            : ''
        }
        ${apiError ? `<p class="field__error" role="alert">${escapeHtml(apiError)}</p>` : ''}
        ${
          apiRoute
            ? `
              <p class="panel__meta">Cobertura: ${apiRoute.data_coverage.hazard_records_loaded} perigos e ${apiRoute.data_coverage.terrain_cells_loaded} células de terreno. Cobertura incompleta não significa ausência de risco.</p>
              <div class="waypoints-list">
                ${apiRoute.candidates.map((candidate, index) => {
                  const crossed = candidate.hazards_crossed || [];
                  const isSelected = apiRoute.selected_index === index;
                  return `
                    <article class="waypoint-row" style="align-items: flex-start;">
                      <div>
                        <strong>${escapeHtml(candidate.name)}</strong>
                        <p class="panel__meta">${escapeHtml(candidate.rationale)}</p>
                        <p class="panel__meta">
                          ${escapeHtml(formatDistance(candidate.distance_km, distUnit))} ·
                          Adequação ${Number(candidate.score).toFixed(0)}/100 ·
                          risco estimado: ${escapeHtml(candidate.risk_level)}
                        </p>
                        ${crossed.length ? `<p class="field__error">Cruza ${crossed.length} perigo(s) cartografado(s); requer confirmação explícita.</p>` : ''}
                        ${candidate.steep_terrain_cells ? `<p class="panel__meta">Células com declive ≥ 15°: ${candidate.steep_terrain_cells}.</p>` : ''}
                        <button type="button" class="btn ${isSelected ? 'btn--secondary' : 'btn--primary'} btn--sm" data-select-server-route="${index}" ${isSelected || apiBusy ? 'disabled' : ''}>
                          ${isSelected ? 'Rota ativa' : 'Selecionar rota'}
                        </button>
                      </div>
                    </article>
                  `;
                }).join('')}
              </div>
            `
            : ''
        }
      </section>
    `;

    summaryEl.querySelector('#route-origin')?.addEventListener('change', (e) => {
      originId = e.target.value;
      waypoints = waypoints.filter((w) => w !== originId && w !== destinationId);
      apiRoute = null;
      apiError = '';
      updateGlobeRoute();
      renderPanel(container);
    });

    summaryEl.querySelector('#route-destination')?.addEventListener('change', (e) => {
      destinationId = e.target.value;
      waypoints = waypoints.filter((w) => w !== originId && w !== destinationId);
      apiRoute = null;
      apiError = '';
      updateGlobeRoute();
      renderPanel(container);
    });

    summaryEl.querySelector('#btn-add-waypoint')?.addEventListener('click', () => {
      const sel = summaryEl.querySelector('#route-add-wp-select');
      if (sel && sel.value) {
        waypoints.push(sel.value);
        updateGlobeRoute();
        renderPanel(container);
      }
    });

    summaryEl.querySelectorAll('[data-wp-up]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.wpUp);
        if (idx > 0) {
          [waypoints[idx - 1], waypoints[idx]] = [waypoints[idx], waypoints[idx - 1]];
          updateGlobeRoute();
          renderPanel(container);
        }
      });
    });

    summaryEl.querySelectorAll('[data-wp-down]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.wpDown);
        if (idx < waypoints.length - 1) {
          [waypoints[idx + 1], waypoints[idx]] = [waypoints[idx], waypoints[idx + 1]];
          updateGlobeRoute();
          renderPanel(container);
        }
      });
    });

    summaryEl.querySelectorAll('[data-wp-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.wpDel);
        waypoints.splice(idx, 1);
        updateGlobeRoute();
        renderPanel(container);
      });
    });

    summaryEl.querySelector('#btn-save-route-to-trip')?.addEventListener('click', async () => {
      const trip = travelService.getById(activeTripId);
      if (trip && appState.backendUser) {
        try {
          await travelService.saveTrip({
            ...trip,
            originId,
            destinationId,
            waypoints: [...waypoints],
          }, trip.id);
          notifyIfEnabled('routeChanges', {
            title: 'Alteração de Rota Guardada',
            message: `A nova rota de ${trip.name} foi guardada no servidor.`,
            variant: 'safe',
          });
        } catch (error) {
          showToast({ title: 'Não foi possível guardar a rota', message: error.message, variant: 'warn' });
        }
      }
    });

    summaryEl.querySelector('#btn-use-route-new-trip')?.addEventListener('click', () => {
      onCreateTripWithRoute?.({ originId, destinationId, waypoints: [...waypoints] });
    });

    summaryEl.querySelector('#btn-plan-server-route')?.addEventListener('click', async () => {
      if (!appState.backendUser || apiBusy) return;
      apiBusy = true;
      apiError = '';
      renderPanel(container);
      try {
        apiRoute = await backendApi.planRoute(
          { latitude: origin.lat, longitude: origin.lon },
          { latitude: dest.lat, longitude: dest.lon },
        );
      } catch (error) {
        apiError = error.message;
      } finally {
        apiBusy = false;
        renderPanel(container);
      }
    });

    summaryEl.querySelectorAll('[data-select-server-route]').forEach((button) => {
      button.addEventListener('click', async () => {
        const candidateIndex = Number(button.dataset.selectServerRoute);
        const candidate = apiRoute?.candidates[candidateIndex];
        if (!apiRoute || !candidate || apiBusy) return;

        const hasCrossedHazards = (candidate.hazards_crossed || []).length > 0;
        if (hasCrossedHazards) {
          const confirmed = await showPriorityConfirmSwal({
            priority: 'P1',
            title: 'Rota cruza perigos cartografados',
            text: 'A seleção será registada com confirmação explícita. Os dados são incompletos e não certificam segurança.',
            confirmText: 'Confirmar risco e selecionar',
            cancelText: 'Escolher outra rota',
          });
          if (!confirmed) return;
        }

        apiBusy = true;
        apiError = '';
        renderPanel(container);
        try {
          apiRoute = await backendApi.selectRoute(apiRoute.id, candidateIndex, hasCrossedHazards);
          appState.activeBackendRoute = apiRoute;
          await refreshBackendData();
        } catch (error) {
          apiError = error.message;
        } finally {
          apiBusy = false;
          renderPanel(container);
        }
      });
    });

    if (selectedTooltipRegionId) renderRouteTooltip();
  }

  return {
    mount(container, initialRoute = {}) {
      containerRef = container;
      destinationId = initialRoute.destinationId || appState.selectedRegionId || appState.regions[0]?.id || null;
      originId = initialRoute.originId
        || appState.regions.find((region) => region.id !== destinationId)?.id
        || null;
      if (originId === destinationId) originId = appState.regions.find((region) => region.id !== destinationId)?.id || null;
      waypoints = Array.isArray(initialRoute.waypoints) ? [...initialRoute.waypoints] : [];
      activeTripId = initialRoute.tripId || null;
      apiRoute = null;
      apiBusy = false;
      apiError = '';

      setMarsStageMode('planner-routes', appState.settings);

      container.innerHTML = `
        <div class="route-planner-layout">
          <div class="route-globe-spacer">
            <div class="route-globe-spacer__hud">
              <span class="panel__meta">Localizações do catálogo do servidor</span>
              <div style="display: flex; gap: 6px;">
                <button type="button" class="btn btn--secondary btn--sm" id="route-globe-fit">Enquadrar Rota</button>
                <button type="button" class="btn btn--ghost btn--sm" id="route-globe-reset">Repor Vista</button>
              </div>
            </div>
            <div class="route-legend" aria-label="Legenda da rota">
              <span class="legend-item"><span class="legend-swatch legend-swatch--origin"></span>Partida</span>
              <span class="legend-item"><span class="legend-swatch legend-swatch--waypoint"></span>Passagem</span>
              <span class="legend-item"><span class="legend-swatch legend-swatch--destination"></span>Destino</span>
            </div>
          </div>

          <div class="panel" id="route-summary-panel"></div>
        </div>
      `;

      const globe = getSharedMarsGlobe();
      if (globe) {
        globe.setOnRegionSelect((regionId) => {
          selectedTooltipRegionId = regionId;
          appState.selectedRegionId = regionId;
          if (regionId !== originId) {
            destinationId = regionId;
            waypoints = waypoints.filter((w) => w !== destinationId);
          }
          updateGlobeRoute();
          renderPanel(container);
          renderRouteTooltip(regionId);
        });
        globe.setOnFrame(() => positionMapLocationTooltip(globe));
        updateGlobeRoute();
      }

      renderPanel(container);

      container.querySelector('#route-globe-reset')?.addEventListener('click', () => getSharedMarsGlobe()?.resetView());
      container.querySelector('#route-globe-fit')?.addEventListener('click', () => {
        const globe = getSharedMarsGlobe();
        const ordered = [originId, ...waypoints, destinationId].filter(Boolean);
        if (ordered.length > 1) globe?.fitRouteToView(ordered);
        else globe?.resetView();
      });
    },

    unmount() {
      hideMapLocationTooltip();
      selectedTooltipRegionId = null;
      containerRef = null;
      const globe = getSharedMarsGlobe();
      if (globe) {
        globe.setOnRegionSelect(null);
        globe.setOnFrame(null);
        globe.setRoute([]);
      }
    },
  };
}