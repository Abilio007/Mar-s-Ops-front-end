import { appState } from '../../core/state.js';
import { escapeHtml } from '../../utils/helpers.js';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function renderMissionCalendar(container, { onSelectTrip }) {
  const now = new Date();
  let viewDate = new Date(now.getFullYear(), now.getMonth(), 1);

  function render() {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const monthName = viewDate.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });

    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push({ day: null, dateStr: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const mm = String(month + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      cells.push({ day: d, dateStr: `${year}-${mm}-${dd}` });
    }

    container.innerHTML = `
      <div class="panel">
        <div class="calendar-header">
          <div>
            <h2 class="panel__title" style="text-transform: capitalize;">${escapeHtml(monthName)}</h2>
            <p class="panel__meta">Datas de partida e chegada das missões planeadas, ativas e concluídas.</p>
          </div>
          <div style="display: flex; gap: var(--space-2);">
            <button type="button" class="btn btn--secondary btn--sm" id="cal-prev">← Anterior</button>
            <button type="button" class="btn btn--secondary btn--sm" id="cal-next">Seguinte →</button>
          </div>
        </div>

        <div class="calendar-weekdays">
          ${WEEKDAYS.map((w) => `<div>${w}</div>`).join('')}
        </div>

        <div class="calendar-days">
          ${cells
            .map((cell) => {
              if (!cell.day) {
                return `<div class="calendar-cell calendar-cell--muted" aria-hidden="true"></div>`;
              }

              const events = appState.trips.filter(
                (t) => t.departureDate === cell.dateStr || t.arrivalDate === cell.dateStr
              );

              return `
                <div class="calendar-cell ${events.length ? 'calendar-cell--has-event' : ''}">
                  <span class="calendar-cell__day tabular-nums">${cell.day}</span>
                  ${events
                    .map((ev) => {
                      const tag = ev.departureDate === cell.dateStr ? 'Partida' : 'Chegada';
                      const cls =
                        ev.status === 'active'
                          ? 'calendar-event-btn--active'
                          : ev.status === 'completed'
                          ? 'calendar-event-btn--done'
                          : '';
                      return `
                        <button
                          type="button"
                          class="calendar-event-btn ${cls}"
                          data-cal-trip="${escapeHtml(ev.id)}"
                          title="${escapeHtml(`${tag}: ${ev.name}`)}"
                        >
                          ${escapeHtml(tag)}: ${escapeHtml(ev.name)}
                        </button>
                      `;
                    })
                    .join('')}
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `;

    container.querySelector('#cal-prev')?.addEventListener('click', () => {
      viewDate = new Date(year, month - 1, 1);
      render();
    });

    container.querySelector('#cal-next')?.addEventListener('click', () => {
      viewDate = new Date(year, month + 1, 1);
      render();
    });

    container.querySelectorAll('[data-cal-trip]').forEach((btn) => {
      btn.addEventListener('click', () => {
        onSelectTrip?.(btn.dataset.calTrip);
      });
    });
  }

  render();
}
