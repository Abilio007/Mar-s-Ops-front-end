import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';
import {
  acknowledgeAlert,
  appState,
  getAlertsSortedByPriority,
  getRegionById,
  PRIORITY_META,
} from '../core/state.js';
import { formatCoordinates } from './formatters.js';
import { escapeHtml } from './helpers.js';
import { showToast } from '../core/events.js';

function getPriorityMeta(priority = 'P2') {
  return PRIORITY_META[priority] || PRIORITY_META.P2;
}

function buildCustomClasses(priority = 'P2', isPrimaryOrange = false) {
  return {
    container: 'marte-swal-container',
    backdrop: 'marte-swal-backdrop',
    popup: `marte-swal-popup marte-swal-popup--${priority}`,
    title: 'marte-swal-title',
    htmlContainer: 'marte-swal-html',
    actions: 'marte-swal-actions',
    confirmButton: `marte-swal-btn ${isPrimaryOrange ? 'marte-swal-btn--orange' : 'marte-swal-btn--primary'}`,
    denyButton: 'marte-swal-btn marte-swal-btn--secondary',
    cancelButton: 'marte-swal-btn marte-swal-btn--ghost',
  };
}

/**
 * Displays a SweetAlert2 modal for a priority-classified Mars emergency or alert.
 */
export async function showEmergencySweetAlert({
  alert = null,
  priority = alert?.priority || 'P1',
  title = alert?.title || 'Alerta de Emergência',
  message = alert?.description || '',
  regionId = alert?.regionId || null,
  protocol = alert?.protocol || null,
  confirmText = alert?.acknowledged ? 'Manter Verificado' : 'Confirmar Protocolo',
  denyText = regionId ? 'Focar no Globo 3D' : '',
  cancelText = 'Fechar',
  onAcknowledge = null,
  onFocusGlobe = null,
} = {}) {
  const meta = getPriorityMeta(priority);
  const region = regionId ? getRegionById(regionId) : null;
  const resolvedProtocol = protocol || alert?.protocol || '';

  const html = `
    <div>
      <span class="swal-priority-badge swal-priority-badge--${meta.level}">
        ${escapeHtml(meta.fullLabel)}
      </span>
      <p style="color: var(--color-text-primary); margin-bottom: 8px;">${escapeHtml(message)}</p>
      ${
        region
          ? `<div class="swal-emergency-box">
              <div class="swal-emergency-box__label">Região Afetada</div>
              <div class="swal-emergency-box__text">
                <strong>${escapeHtml(region.name)}</strong> · <span class="tabular-nums">${escapeHtml(formatCoordinates(region.lat, region.lon))}</span>
              </div>
            </div>`
          : ''
      }
      ${resolvedProtocol ? `
        <div class="swal-emergency-box">
          <div class="swal-emergency-box__label">Protocolo</div>
          <div class="swal-emergency-box__text">${escapeHtml(resolvedProtocol)}</div>
        </div>
      ` : ''}
    </div>
  `;

  const result = await Swal.fire({
    icon: meta.swalIcon,
    title: escapeHtml(title),
    html,
    showConfirmButton: Boolean(confirmText),
    confirmButtonText: confirmText,
    showDenyButton: Boolean(denyText),
    denyButtonText: denyText,
    showCancelButton: Boolean(cancelText),
    cancelButtonText: cancelText,
    buttonsStyling: false,
    focusConfirm: true,
    customClass: buildCustomClasses(meta.level, meta.level === 'P2'),
  });

  if (result.isConfirmed) {
    if (alert && !alert.acknowledged) {
      try {
        await acknowledgeAlert(alert.id);
      } catch (error) {
        showToast({
          title: 'Não foi possível confirmar a leitura no servidor',
          message: error.message,
          variant: 'warn',
        });
        return result;
      }
    }
    if (typeof onAcknowledge === 'function') {
      onAcknowledge(alert);
    }
  } else if (result.isDenied && regionId && typeof onFocusGlobe === 'function') {
    onFocusGlobe(regionId);
  }

  return result;
}

/**
 * Displays a SweetAlert2 priority confirmation dialog (destructive / risky overrides).
 */
export async function showPriorityConfirmSwal({
  priority = 'P2',
  title = 'Confirmação Operacional',
  text = '',
  html = '',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
} = {}) {
  const meta = getPriorityMeta(priority);
  const bodyHtml =
    html ||
    `
      <div>
        <span class="swal-priority-badge swal-priority-badge--${meta.level}">
          ${escapeHtml(meta.fullLabel)}
        </span>
        <p style="color: var(--color-text-primary);">${escapeHtml(text)}</p>
      </div>
    `;

  const result = await Swal.fire({
    icon: meta.swalIcon,
    title: escapeHtml(title),
    html: bodyHtml,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    buttonsStyling: false,
    reverseButtons: true,
    customClass: buildCustomClasses(meta.level, meta.level === 'P2'),
  });

  return Boolean(result.isConfirmed);
}

/**
 * Displays the General Emergency & Priority Dispatch Center using SweetAlert2.
 * Allows inspecting active emergencies ordered by P1 -> P2 -> P3 or triggering a protocol.
 */
export async function showEmergencyCenterSwal({ onFocusGlobe = null, onAlertsUpdated = null } = {}) {
  const sortedAlerts = getAlertsSortedByPriority();

  const html = `
    <div>
      <p style="font-size: 0.84rem; color: var(--color-text-secondary); margin-bottom: 10px;">
        Alertas ordenados por prioridade operacional (<strong>P1 Crítica</strong> → <strong>P2 Alta</strong> → <strong>P3 Moderada</strong>).
      </p>

      <div class="swal-emergency-box__label">Emergências Ativas (${sortedAlerts.filter((a) => !a.acknowledged).length})</div>
      ${
        sortedAlerts.length
          ? `<div class="swal-center-list">
        ${sortedAlerts
          .map((alert) => {
            const meta = getPriorityMeta(alert.priority);
            const region = getRegionById(alert.regionId);
            return `
              <button type="button" class="swal-center-item" data-swal-alert-id="${escapeHtml(alert.id)}">
                <div>
                  <div class="swal-center-item__title">${escapeHtml(alert.title)}</div>
                  <div class="swal-center-item__meta">
                    ${escapeHtml(region?.name || 'Sem região associada')} · ${alert.acknowledged ? 'Verificado' : 'Ativo'}
                  </div>
                </div>
                <span class="swal-priority-badge swal-priority-badge--${meta.level}" style="margin-bottom: 0; flex-shrink: 0;">
                  ${escapeHtml(meta.label)}
                </span>
              </button>
            `;
          })
          .join('')}
      </div>`
          : '<p class="panel__meta">Não há alertas ativos fornecidos pelo servidor.</p>'
      }
    </div>
  `;

  let selectedAlert = null;

  await Swal.fire({
    title: 'Central de Emergências & Prioridades',
    html,
    width: 640,
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: 'Fechar',
    buttonsStyling: false,
    customClass: buildCustomClasses('P1', false),
    didOpen: (popupEl) => {
      popupEl.querySelectorAll('[data-swal-alert-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          selectedAlert = appState.alerts.find((a) => a.id === btn.dataset.swalAlertId) || null;
          Swal.close();
        });
      });

    },
  });

  if (selectedAlert) {
    await showEmergencySweetAlert({
      alert: selectedAlert,
      onAcknowledge: () => onAlertsUpdated?.(),
      onFocusGlobe: (regionId) => onFocusGlobe?.(regionId),
    });
    return;
  }

}

/**
 * Non-blocking SweetAlert2 priority toast for quick in-context feedback.
 */
export function showPriorityToastSwal({ priority = 'P2', title, message = '' } = {}) {
  const meta = getPriorityMeta(priority);
  return Swal.fire({
    toast: true,
    position: 'top-end',
    icon: meta.swalIcon,
    title: escapeHtml(title),
    text: message,
    showConfirmButton: false,
    timer: 4200,
    timerProgressBar: true,
    customClass: {
      popup: `marte-swal-popup marte-swal-popup--${meta.level}`,
      title: 'marte-swal-title',
    },
  });
}
