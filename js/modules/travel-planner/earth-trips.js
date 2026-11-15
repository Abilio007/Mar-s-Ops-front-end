import { backendApi } from '../../core/backend-api.js';
import { eventBus, showToast } from '../../core/events.js';
import { startPeriodicHeartbeat, stopPeriodicHeartbeat } from '../../core/backend-integration.js';
import { appState } from '../../core/state.js';
import { escapeHtml } from '../../utils/helpers.js';

function formatDistance(meters) {
  return meters >= 1000
    ? `${(meters / 1000).toLocaleString('pt-PT', { maximumFractionDigits: 1 })} km`
    : `${Math.round(meters).toLocaleString('pt-PT')} m`;
}

function formatDuration(seconds) {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours ? `${hours} h ${remainingMinutes} min` : `${remainingMinutes} min`;
}

function renderRouteSvg(points, tripName) {
  if (!Array.isArray(points) || points.length < 2) {
    return '<p class="panel__meta">O servidor não devolveu a geometria da rota.</p>';
  }

  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const latitudeSpan = maxLatitude - minLatitude || 0.00001;
  const longitudeSpan = maxLongitude - minLongitude || 0.00001;
  const path = points.map((point, index) => {
    const x = 24 + ((point.longitude - minLongitude) / longitudeSpan) * 552;
    const y = 206 - ((point.latitude - minLatitude) / latitudeSpan) * 182;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');

  return `
    <svg class="earth-trip-route" viewBox="0 0 600 230" role="img" aria-label="Geometria rodoviária da viagem ${escapeHtml(tripName)}">
      <path class="earth-trip-route__line" d="${path}" />
      <circle class="earth-trip-route__point earth-trip-route__point--start" cx="${(24).toFixed(2)}" cy="${(206 - ((points[0].latitude - minLatitude) / latitudeSpan) * 182).toFixed(2)}" r="6" />
      <circle class="earth-trip-route__point earth-trip-route__point--end" cx="${(24 + ((points[points.length - 1].longitude - minLongitude) / longitudeSpan) * 552).toFixed(2)}" cy="${(206 - ((points[points.length - 1].latitude - minLatitude) / latitudeSpan) * 182).toFixed(2)}" r="6" />
      <text x="24" y="224" class="earth-trip-route__label">Partida</text>
      <text x="576" y="224" text-anchor="end" class="earth-trip-route__label">Destino</text>
    </svg>
  `;
}

function locationErrorMessage(error) {
  return ({
    1: 'Permita a localização no navegador para iniciar o acompanhamento GPS.',
    2: 'Não foi possível determinar a localização do dispositivo.',
    3: 'A localização demorou demasiado tempo a responder.',
  })[error.code] || 'Este navegador não disponibiliza a localização do dispositivo.';
}

function getDeviceCoordinates() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Este navegador não disponibiliza a localização do dispositivo.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      (error) => reject(new Error(locationErrorMessage(error))),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
  });
}

export function createEarthTripsView() {
  let container;
  let trips = [];
  let unsubscribeProgress;

  function render() {
    if (!container) return;

    container.innerHTML = `
      <section class="panel earth-trips-panel">
        <div class="panel__header">
          <div>
            <h2 class="panel__title">Viagens terrestres por estrada</h2>
            <p class="panel__meta">A rota é calculada pelo serviço OSRM configurado no backend. A localização GPS é enviada apenas à API deste projeto.</p>
          </div>
        </div>
        ${!backendApi.hasToken ? '<p class="empty-state">Inicie sessão para criar e acompanhar uma viagem terrestre.</p>' : `
          <form id="earth-trip-form" class="earth-trip-form" novalidate>
            <div class="field">
              <label class="field__label" for="earth-trip-name">Nome da viagem</label>
              <input class="field__control" id="earth-trip-name" name="name" maxlength="160" required />
            </div>
            <div class="planner-form-grid">
              <div class="field">
                <label class="field__label" for="earth-trip-destination-latitude">Latitude do destino</label>
                <input class="field__control" id="earth-trip-destination-latitude" name="latitude" type="number" step="any" min="-90" max="90" required />
              </div>
              <div class="field">
                <label class="field__label" for="earth-trip-destination-longitude">Longitude do destino</label>
                <input class="field__control" id="earth-trip-destination-longitude" name="longitude" type="number" step="any" min="-180" max="180" required />
              </div>
            </div>
            <p class="panel__meta">Ao calcular a rota, o navegador pedirá autorização para usar o GPS e obter a origem. Não há fallback para uma linha reta.</p>
            <div class="field__error" id="earth-trip-error" role="alert"></div>
            <button type="submit" class="btn btn--primary">Calcular rota e criar viagem</button>
          </form>
        `}
      </section>

      <section class="earth-trips-list" aria-label="Viagens terrestres guardadas">
        ${trips.length ? trips.map((trip) => `
          <article class="panel earth-trip-card">
            <div class="panel__header">
              <div>
                <h3 class="panel__title">${escapeHtml(trip.name)}</h3>
                <p class="panel__meta">${escapeHtml(trip.status)} · ${formatDistance(trip.distanceMeters)} · ${formatDuration(trip.durationSeconds)}</p>
              </div>
              <strong class="tabular-nums">${trip.progressPercent}%</strong>
            </div>
            <div class="trip-progress__bar"><div class="trip-progress__fill" style="width: ${trip.progressPercent}%"></div></div>
            ${renderRouteSvg(trip.geometry, trip.name)}
            <ol class="earth-trip-steps">
              ${trip.steps.map((step) => `
                <li>
                  <span>${escapeHtml(step.instruction)}</span>
                  <small>${formatDistance(step.distance_m)} · ${formatDuration(step.duration_s)}</small>
                </li>
              `).join('')}
            </ol>
            <div class="earth-trip-actions">
              ${trip.status === 'planned' ? `<button type="button" class="btn btn--primary btn--sm" data-earth-start="${escapeHtml(trip.id)}">Iniciar com GPS</button>` : ''}
              ${trip.status === 'active' ? `<button type="button" class="btn btn--secondary btn--sm" data-earth-complete="${escapeHtml(trip.id)}">Concluir viagem</button>` : ''}
              <button type="button" class="btn btn--ghost btn--sm" data-earth-delete="${escapeHtml(trip.id)}">Eliminar</button>
            </div>
          </article>
        `).join('') : '<p class="empty-state">Ainda não existem viagens terrestres.</p>'}
      </section>
    `;

    container.querySelector('#earth-trip-form')?.addEventListener('submit', createTrip);
    container.querySelectorAll('[data-earth-start]').forEach((button) => {
      button.addEventListener('click', () => updateTripStatus(button.dataset.earthStart, 'active'));
    });
    container.querySelectorAll('[data-earth-complete]').forEach((button) => {
      button.addEventListener('click', () => updateTripStatus(button.dataset.earthComplete, 'completed'));
    });
    container.querySelectorAll('[data-earth-delete]').forEach((button) => {
      button.addEventListener('click', () => deleteTrip(button.dataset.earthDelete));
    });
  }

  async function loadTrips() {
    if (!backendApi.hasToken) return;
    try {
      trips = await backendApi.getEarthTrips();
      render();
    } catch (error) {
      showToast({ title: 'Não foi possível carregar as viagens terrestres', message: error.message, variant: 'warn' });
    }
  }

  async function createTrip(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const errorEl = container.querySelector('#earth-trip-error');
    const button = form.querySelector('button[type="submit"]');
    const name = form.elements.name.value.trim();
    const latitude = Number(form.elements.latitude.value);
    const longitude = Number(form.elements.longitude.value);

    if (!name || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      errorEl.textContent = 'Indique um nome e coordenadas de destino válidas.';
      return;
    }

    button.disabled = true;
    errorEl.textContent = '';
    try {
      const start = await getDeviceCoordinates();
      await backendApi.createEarthTrip(name, start, { latitude, longitude });
      await loadTrips();
      showToast({ title: 'Viagem terrestre criada', message: 'A rota rodoviária e as instruções foram calculadas pelo servidor.', variant: 'safe' });
      form.reset();
    } catch (error) {
      errorEl.textContent = error.message;
      showToast({ title: 'Não foi possível criar a viagem', message: error.message, variant: 'warn' });
    } finally {
      button.disabled = false;
    }
  }

  async function updateTripStatus(tripId, status) {
    try {
      if (status === 'active') {
        await backendApi.updateEarthTripStatus(tripId, 'active');
        try {
          await startPeriodicHeartbeat('earth');
        } catch (error) {
          await backendApi.updateEarthTripStatus(tripId, 'planned');
          throw error;
        }
      } else {
        await backendApi.updateEarthTripStatus(tripId, status);
        if (appState.periodicHeartbeatCoordinateSystem === 'earth') stopPeriodicHeartbeat();
      }
      await loadTrips();
    } catch (error) {
      showToast({ title: 'Não foi possível atualizar a viagem', message: error.message, variant: 'warn' });
    }
  }

  async function deleteTrip(tripId) {
    try {
      await backendApi.deleteEarthTrip(tripId);
      if (trips.find((trip) => trip.id === tripId)?.status === 'active'
        && appState.periodicHeartbeatCoordinateSystem === 'earth') {
        stopPeriodicHeartbeat();
      }
      await loadTrips();
    } catch (error) {
      showToast({ title: 'Não foi possível eliminar a viagem', message: error.message, variant: 'warn' });
    }
  }

  return {
    mount(target) {
      container = target;
      render();
      unsubscribeProgress = eventBus.on('earth:progress', loadTrips);
      loadTrips();
    },
    unmount() {
      unsubscribeProgress?.();
      unsubscribeProgress = null;
      container = null;
    },
  };
}
