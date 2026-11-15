import { escapeHtml } from '../utils/helpers.js';

const listeners = new Map();

export const eventBus = {
  on(eventName, handler) {
    if (!listeners.has(eventName)) {
      listeners.set(eventName, new Set());
    }
    listeners.get(eventName).add(handler);
    return () => this.off(eventName, handler);
  },

  off(eventName, handler) {
    const set = listeners.get(eventName);
    if (set) {
      set.delete(handler);
    }
  },

  emit(eventName, payload) {
    const set = listeners.get(eventName);
    if (!set) return;
    set.forEach((handler) => {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[eventBus] Error in listener for "${eventName}":`, err);
      }
    });
  },
};

/**
 * Renders a non-blocking toast notification.
 */
export function showToast({ title, message = '', variant = 'info', duration = 4200 }) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast--${variant}`;
  toast.setAttribute('role', 'status');
  toast.innerHTML = `
    <div>
      <div class="toast__title">${escapeHtml(title)}</div>
      ${message ? `<div class="toast__body">${escapeHtml(message)}</div>` : ''}
    </div>
    <button type="button" class="toast__close" aria-label="Fechar notificação">&times;</button>
  `;

  const removeToast = () => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  };

  toast.querySelector('.toast__close')?.addEventListener('click', removeToast);
  container.appendChild(toast);

  if (duration > 0) {
    window.setTimeout(removeToast, duration);
  }
}
