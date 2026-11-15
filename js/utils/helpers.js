const MARS_RADIUS_KM = 3389.5;

export function escapeHtml(value) {
  const str = String(value ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generateId(prefix = 'id') {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${randomPart}`;
}

export function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

export function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Computes surface great-circle distance on Mars (R = 3389.5 km).
 */
export function calculateMarsDistanceKm(lat1, lon1, lat2, lon2) {
  const phi1 = degToRad(lat1);
  const phi2 = degToRad(lat2);
  const dPhi = degToRad(lat2 - lat1);
  const dLambda = degToRad(lon2 - lon1);

  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return MARS_RADIUS_KM * c;
}

/**
 * Computes total route distance across an ordered array of regions.
 */
export function calculateRouteMetrics(points, speedKmPerHour) {
  if (!Number.isFinite(speedKmPerHour) || speedKmPerHour <= 0) {
    throw new RangeError('Route speed must be supplied by the backend catalog.');
  }
  if (!Array.isArray(points) || points.length < 2) {
    return { distanceKm: 0, durationDays: 0, durationHours: 0 };
  }

  let totalKm = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a && b) {
      totalKm += calculateMarsDistanceKm(a.lat, a.lon, b.lat, b.lon);
    }
  }

  const hours = totalKm / speedKmPerHour;
  const days = Math.max(1, Math.ceil(hours / 24.62)); // Martian Sol = 24.62h
  return {
    distanceKm: Math.round(totalKm),
    durationHours: Math.round(hours),
    durationDays: days,
  };
}

/**
 * Converts Martian latitude/longitude (degrees) to 3D Cartesian coordinates on a sphere.
 */
export function latLonToVector3Args(latDeg, lonDeg, radius = 1) {
  const phi = degToRad(90 - latDeg);
  const theta = degToRad(lonDeg + 180);

  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  return [x, y, z];
}

/**
 * Opens an accessible in-page modal dialog (never window.alert / window.confirm).
 */
export function openModal({ title, bodyHtml, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false, onConfirm = null }) {
  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return;

  modalRoot.innerHTML = `
    <div class="modal-card" role="document">
      <div class="modal-card__header">
        <h3 class="modal-card__title">${escapeHtml(title)}</h3>
        <button type="button" class="btn btn--ghost btn--sm" data-modal-close aria-label="Fechar janela">Fechar</button>
      </div>
      <div class="modal-card__body">${bodyHtml}</div>
      <div class="modal-card__actions">
        ${cancelLabel ? `<button type="button" class="btn btn--ghost" data-modal-close>${escapeHtml(cancelLabel)}</button>` : ''}
        ${onConfirm ? `<button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-modal-confirm>${escapeHtml(confirmLabel)}</button>` : ''}
      </div>
    </div>
  `;

  modalRoot.hidden = false;

  const close = () => {
    modalRoot.hidden = true;
    modalRoot.innerHTML = '';
    document.removeEventListener('keydown', onKeyDown);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      close();
    }
  };

  document.addEventListener('keydown', onKeyDown);

  modalRoot.addEventListener(
    'click',
    (event) => {
      if (event.target === modalRoot) {
        close();
      }
    },
    { once: true }
  );

  modalRoot.querySelectorAll('[data-modal-close]').forEach((btn) => {
    btn.addEventListener('click', close);
  });

  const confirmBtn = modalRoot.querySelector('[data-modal-confirm]');
  if (confirmBtn && typeof onConfirm === 'function') {
    confirmBtn.addEventListener('click', () => {
      onConfirm();
      close();
    });
  }
}
