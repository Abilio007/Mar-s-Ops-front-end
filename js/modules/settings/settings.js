import {
  appState,
  DEFAULT_SETTINGS,
  updateSettings,
} from '../../core/state.js';
import { eventBus, showToast } from '../../core/events.js';
import { storage } from '../../storage.js';
import { escapeHtml } from '../../utils/helpers.js';
import { showEmergencyCenterSwal, showPriorityConfirmSwal } from '../../utils/sweetalerts.js';
import { backendApi } from '../../core/backend-api.js';
import {
  loginBackend,
  logoutBackend,
  refreshBackendData,
  registerBackend,
  startPeriodicHeartbeat,
  stopPeriodicHeartbeat,
} from '../../core/backend-integration.js';

const SETTINGS_MENU = [
  {
    id: 'connection',
    label: 'Conta e ligação',
    icon: '<path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3A5 5 0 0 0 11 21.07l1.71-1.71"/>',
  },
  {
    id: 'general',
    label: 'Geral',
    icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.77 1.02 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  },
  {
    id: 'notifications',
    label: 'Notificações',
    icon: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  },
  {
    id: 'privacy',
    label: 'Privacidade',
    icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  },
  {
    id: 'about',
    label: 'Sobre o aplicativo',
    icon: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  },
];

export function createSettingsView() {
  let activePanelOpen = false;
  let authMode = 'login';
  let unsubscribeHeartbeatState = null;

  function renderCategoryContent(container) {
    const bodyEl = container.querySelector('#settings-content');
    if (!bodyEl) return;

    container.querySelectorAll('[data-settings-tab]').forEach((btn) => {
      btn.classList.toggle('is-active', activePanelOpen && btn.dataset.settingsTab === appState.settingsSubTab);
    });

    if (!activePanelOpen) {
      bodyEl.innerHTML = '';
      return;
    }

    const s = appState.settings;

    if (appState.settingsSubTab === 'connection') {
      const user = appState.backendUser;
      const statusLabels = {
        connected: 'Ligada',
        connecting: 'A ligar…',
        disconnected: 'Desligada',
        error: 'Erro de ligação',
        'not-configured': 'Não configurado',
      };

      bodyEl.innerHTML = `
        <div class="panel">
          <div class="panel__header">
            <div>
              <h2 class="panel__title">Conta e ligação</h2>
              <p class="panel__meta">API Laravel, conversas e alertas em tempo real.</p>
            </div>
            ${user ? '<button type="button" class="btn btn--ghost btn--sm" id="btn-backend-logout">Terminar sessão</button>' : ''}
          </div>

          <div class="settings-group">
            <div class="setting-row">
              <div class="setting-row__info">
                <div class="setting-row__title">API</div>
                <div class="setting-row__desc">${escapeHtml(backendApi.apiBaseUrl)}</div>
              </div>
              <span class="status-text ${appState.apiStatus === 'connected' ? 'status-text--safe' : 'status-text--warn'}">
                ${escapeHtml(statusLabels[appState.apiStatus] || appState.apiStatus)}
              </span>
            </div>
            <div class="setting-row">
              <div class="setting-row__info">
                <div class="setting-row__title">Reverb</div>
                <div class="setting-row__desc">Canal privado de alertas e progresso da rota.</div>
              </div>
              <span class="status-text ${appState.reverbStatus === 'connected' ? 'status-text--safe' : 'status-text--warn'}">
                ${escapeHtml(statusLabels[appState.reverbStatus] || appState.reverbStatus)}
              </span>
            </div>
          </div>

          ${
            user
              ? `
                <p class="panel__meta" style="margin-top: var(--space-3);">
                  Sessão de <strong>${escapeHtml(user.name)}</strong> (${escapeHtml(user.email)}).
                  O token fica guardado apenas nesta sessão do navegador.
                </p>
                <div class="settings-group">
                  <div class="setting-row">
                    <div class="setting-row__info">
                      <div class="setting-row__title">Última posição comunicada</div>
                      <div class="setting-row__desc">
                        ${
                          appState.latestHeartbeat
                            ? `${Number(appState.latestHeartbeat.latitude).toFixed(3)}, ${Number(appState.latestHeartbeat.longitude).toFixed(3)}`
                            : 'Nenhuma posição enviada.'
                        }
                      </div>
                    </div>
                  </div>
                  <div class="setting-row">
                    <div class="setting-row__info">
                      <div class="setting-row__title">Rota ativa</div>
                      <div class="setting-row__desc">
                        ${appState.activeBackendRoute ? `Estado: ${escapeHtml(appState.activeBackendRoute.status)} · ${Number(appState.activeBackendRoute.progress_percent).toFixed(1)}%` : 'Nenhuma rota ativa.'}
                      </div>
                    </div>
                  </div>
                </div>
                <div class="settings-group">
                  <p class="panel__meta">
                    O envio automático usa a localização atual do dispositivo, interpretada como coordenadas de Marte.
                    Requer autorização do navegador e uma ligação segura (HTTPS ou localhost); mantém-se ativo enquanto esta página estiver aberta.
                  </p>
                  <div class="field__error" id="backend-periodic-heartbeat-error" role="alert"></div>
                  <button type="button" class="btn btn--secondary btn--sm" id="btn-periodic-heartbeat">
                    ${appState.periodicHeartbeatEnabled ? 'Parar envio automático' : 'Ativar envio automático (a cada 60 s)'}
                  </button>
                </div>
                <form id="backend-heartbeat-form" class="settings-group" novalidate>
                  <p class="panel__meta">Envie apenas coordenadas marcianas observadas por si. A aplicação não verifica a origem física da posição.</p>
                  <div class="planner-form-grid">
                    <div class="field">
                      <label class="field__label" for="backend-latitude">Latitude (−90 a 90)</label>
                      <input class="field__control" id="backend-latitude" name="latitude" type="number" step="any" min="-90" max="90" required />
                    </div>
                    <div class="field">
                      <label class="field__label" for="backend-longitude">Longitude (−180 a 180)</label>
                      <input class="field__control" id="backend-longitude" name="longitude" type="number" step="any" min="-180" max="180" required />
                    </div>
                  </div>
                  <div class="field__error" id="backend-heartbeat-error" role="alert"></div>
                  <button type="submit" class="btn btn--secondary btn--sm">Enviar posição e atualizar alertas</button>
                </form>
                <button type="button" class="btn btn--ghost btn--sm" id="btn-backend-refresh">Atualizar dados do servidor</button>
              `
              : `
                <p class="panel__meta" style="margin-top: var(--space-3);">
                  Inicie sessão para sincronizar alertas, planear rotas no servidor e conversar com o assistente.
                </p>
                <div class="segmented" role="group" aria-label="Tipo de conta">
                  <button type="button" class="segmented__btn ${authMode === 'login' ? 'is-active' : ''}" data-auth-mode="login">Iniciar sessão</button>
                  <button type="button" class="segmented__btn ${authMode === 'register' ? 'is-active' : ''}" data-auth-mode="register">Criar conta</button>
                </div>
                <form id="backend-auth-form" class="settings-group" novalidate>
                  ${
                    authMode === 'register'
                      ? `
                        <div class="field">
                          <label class="field__label" for="backend-name">Nome</label>
                          <input class="field__control" id="backend-name" name="name" type="text" maxlength="120" required />
                        </div>
                      `
                      : ''
                  }
                  <div class="field">
                    <label class="field__label" for="backend-email">Email</label>
                    <input class="field__control" id="backend-email" name="email" type="email" autocomplete="email" required />
                  </div>
                  <div class="field">
                    <label class="field__label" for="backend-password">Palavra-passe</label>
                    <input class="field__control" id="backend-password" name="password" type="password" minlength="12" autocomplete="${authMode === 'login' ? 'current-password' : 'new-password'}" required />
                    ${authMode === 'register' ? '<span class="panel__meta">Mínimo de 12 caracteres.</span>' : ''}
                  </div>
                  <div class="field__error" id="backend-auth-error" role="alert"></div>
                  <button type="submit" class="btn btn--primary">
                    ${authMode === 'login' ? 'Iniciar sessão' : 'Criar conta'}
                  </button>
                </form>
              `
          }
        </div>
      `;

      bodyEl.querySelectorAll('[data-auth-mode]').forEach((button) => {
        button.addEventListener('click', () => {
          authMode = button.dataset.authMode;
          renderCategoryContent(container);
        });
      });

      bodyEl.querySelector('#backend-auth-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const errorEl = bodyEl.querySelector('#backend-auth-error');
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        try {
          const credentials = {
            email: form.elements.email.value.trim(),
            password: form.elements.password.value,
          };
          if (authMode === 'register') {
            credentials.name = form.elements.name.value.trim();
            credentials.password_confirmation = credentials.password;
            await registerBackend(credentials);
          } else {
            await loginBackend(credentials);
          }
          showToast({ title: 'Ligação ao backend estabelecida', variant: 'safe' });
          renderCategoryContent(container);
        } catch (error) {
          errorEl.textContent = error.message;
        } finally {
          submitButton.disabled = false;
        }
      });

      bodyEl.querySelector('#btn-backend-logout')?.addEventListener('click', async () => {
        try {
          await logoutBackend();
          showToast({ title: 'Sessão terminada', variant: 'info' });
        } catch (error) {
          showToast({ title: 'Sessão terminada localmente', message: error.message, variant: 'warn' });
        }
        renderCategoryContent(container);
      });

      bodyEl.querySelector('#btn-periodic-heartbeat')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        const errorEl = bodyEl.querySelector('#backend-periodic-heartbeat-error');
        button.disabled = true;
        errorEl.textContent = '';

        try {
          if (appState.periodicHeartbeatEnabled) {
            stopPeriodicHeartbeat();
            showToast({ title: 'Envio automático da localização parado', variant: 'info' });
          } else {
            await startPeriodicHeartbeat();
            showToast({
              title: 'Envio automático da localização ativado',
              message: 'A posição atual foi enviada; os próximos envios serão feitos a cada 60 segundos.',
              variant: 'safe',
            });
          }
          renderCategoryContent(container);
        } catch (error) {
          errorEl.textContent = error.message;
        } finally {
          button.disabled = false;
        }
      });

      bodyEl.querySelector('#btn-backend-refresh')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
          const errors = await refreshBackendData();
          showToast({
            title: errors.length ? 'Sincronização parcial' : 'Dados atualizados',
            message: errors[0]?.message || '',
            variant: errors.length ? 'warn' : 'safe',
          });
          renderCategoryContent(container);
        } finally {
          button.disabled = false;
        }
      });

      bodyEl.querySelector('#backend-heartbeat-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const errorEl = bodyEl.querySelector('#backend-heartbeat-error');
        const latitude = Number(form.elements.latitude.value);
        const longitude = Number(form.elements.longitude.value);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
          errorEl.textContent = 'Introduza coordenadas válidas para Marte.';
          return;
        }

        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        errorEl.textContent = '';
        try {
          await backendApi.sendHeartbeat(latitude, longitude);
          const errors = await refreshBackendData();
          showToast({
            title: errors.length ? 'Posição enviada; sincronização parcial' : 'Posição enviada; alertas atualizados',
            message: errors[0]?.message || '',
            variant: errors.length ? 'warn' : 'safe',
          });
          renderCategoryContent(container);
        } catch (error) {
          errorEl.textContent = error.message;
        } finally {
          button.disabled = false;
        }
      });

      return;
    }

    if (appState.settingsSubTab === 'general') {
      bodyEl.innerHTML = `
        <div class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Geral</h2>
            <button type="button" class="btn btn--ghost btn--sm" id="settings-close-panel">Fechar</button>
          </div>

          <div class="settings-group">
            <div class="setting-row">
              <div class="setting-row__info">
                <div class="setting-row__title">Idioma</div>
                <div class="setting-row__desc">Altera o idioma principal da interface.</div>
              </div>
              <div class="setting-row__control">
                <select id="set-language" class="field__control">
                  <option value="pt" ${s.language === 'pt' ? 'selected' : ''}>Português</option>
                  <option value="en" ${s.language === 'en' ? 'selected' : ''}>English</option>
                  <option value="es" ${s.language === 'es' ? 'selected' : ''}>Español</option>
                </select>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-row__info">
                <div class="setting-row__title">Tema</div>
                <div class="setting-row__desc">Contraste dos painéis sobre o fundo espacial.</div>
              </div>
              <div class="setting-row__control">
                <select id="set-theme" class="field__control">
                  <option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Espacial Escuro</option>
                  <option value="high-contrast" ${s.theme === 'high-contrast' ? 'selected' : ''}>Alto Contraste</option>
                </select>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-row__info">
                <div class="setting-row__title">Unidades de Distância</div>
                <div class="setting-row__desc">Aplicado às rotas e monitorização.</div>
              </div>
              <div class="setting-row__control">
                <select id="set-distance" class="field__control">
                  <option value="km" ${s.distanceUnit === 'km' ? 'selected' : ''}>Quilómetros (km)</option>
                  <option value="mi" ${s.distanceUnit === 'mi' ? 'selected' : ''}>Milhas (mi)</option>
                </select>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-row__info">
                <div class="setting-row__title">Unidades de Temperatura</div>
                <div class="setting-row__desc">Exibição térmica nos marcadores e telemetria.</div>
              </div>
              <div class="setting-row__control">
                <select id="set-temp" class="field__control">
                  <option value="C" ${s.temperatureUnit === 'C' ? 'selected' : ''}>Celsius (°C)</option>
                  <option value="K" ${s.temperatureUnit === 'K' ? 'selected' : ''}>Kelvin (K)</option>
                  <option value="F" ${s.temperatureUnit === 'F' ? 'selected' : ''}>Fahrenheit (°F)</option>
                </select>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-row__info">
                <div class="setting-row__title">Rotação Automática do Globo</div>
                <div class="setting-row__desc">Mantém Marte em rotação contínua.</div>
              </div>
              <label class="switch">
                <input type="checkbox" id="set-autorotate" ${s.autoRotateGlobe ? 'checked' : ''} />
                <span class="switch__track"><span class="switch__thumb"></span></span>
              </label>
            </div>

            <div class="setting-row">
              <div class="setting-row__info">
                <div class="setting-row__title">Atmosfera 3D</div>
                <div class="setting-row__desc">Camada atmosférica luminosa ao redor de Marte.</div>
              </div>
              <label class="switch">
                <input type="checkbox" id="set-atmosphere" ${s.showAtmosphere ? 'checked' : ''} />
                <span class="switch__track"><span class="switch__thumb"></span></span>
              </label>
            </div>

            <div class="setting-row">
              <div class="setting-row__info">
                <div class="setting-row__title">Movimento Reduzido</div>
                <div class="setting-row__desc">Reduz animações e avanços automáticos.</div>
              </div>
              <label class="switch">
                <input type="checkbox" id="set-reduced-motion" ${s.reducedMotion ? 'checked' : ''} />
                <span class="switch__track"><span class="switch__thumb"></span></span>
              </label>
            </div>
          </div>
        </div>
      `;

      bodyEl.querySelector('#settings-close-panel')?.addEventListener('click', () => {
        activePanelOpen = false;
        renderCategoryContent(container);
      });

      bodyEl.querySelector('#set-language')?.addEventListener('change', (e) => {
        updateSettings({ language: e.target.value });
        showToast({ title: 'Idioma atualizado', variant: 'safe' });
      });

      bodyEl.querySelector('#set-theme')?.addEventListener('change', (e) => {
        updateSettings({ theme: e.target.value });
        showToast({ title: 'Tema atualizado', variant: 'safe' });
      });

      bodyEl.querySelector('#set-distance')?.addEventListener('change', (e) => {
        updateSettings({ distanceUnit: e.target.value });
        showToast({ title: 'Unidade de distância atualizada', variant: 'safe' });
      });

      bodyEl.querySelector('#set-temp')?.addEventListener('change', (e) => {
        updateSettings({ temperatureUnit: e.target.value });
        showToast({ title: 'Unidade de temperatura atualizada', variant: 'safe' });
      });

      bodyEl.querySelector('#set-autorotate')?.addEventListener('change', (e) => {
        updateSettings({ autoRotateGlobe: e.target.checked });
      });

      bodyEl.querySelector('#set-atmosphere')?.addEventListener('change', (e) => {
        updateSettings({ showAtmosphere: e.target.checked });
      });

      bodyEl.querySelector('#set-reduced-motion')?.addEventListener('change', (e) => {
        updateSettings({ reducedMotion: e.target.checked });
      });
      return;
    }

    if (appState.settingsSubTab === 'notifications') {
      const n = s.notifications;
      bodyEl.innerHTML = `
        <div class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Notificações</h2>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
              <button type="button" class="btn btn--danger btn--sm" id="btn-show-alerts">Alertas do servidor</button>
              <button type="button" class="btn btn--ghost btn--sm" id="settings-close-panel">Fechar</button>
            </div>
          </div>

          <div class="settings-group">
            <div class="setting-row">
              <div class="setting-row__info">
                <div class="setting-row__title">Alertas de Risco</div>
                <div class="setting-row__desc">Avisos recebidos do backend quando existem eventos ativos.</div>
              </div>
              <label class="switch">
                <input type="checkbox" data-notif="riskAlerts" ${n.riskAlerts ? 'checked' : ''} />
                <span class="switch__track"><span class="switch__thumb"></span></span>
              </label>
            </div>

            <div class="setting-row">
              <div class="setting-row__info">
                <div class="setting-row__title">Notificações de Viagens</div>
                <div class="setting-row__desc">Confirmação ao criar, editar ou eliminar viagens.</div>
              </div>
              <label class="switch">
                <input type="checkbox" data-notif="tripUpdates" ${n.tripUpdates ? 'checked' : ''} />
                <span class="switch__track"><span class="switch__thumb"></span></span>
              </label>
            </div>

            <div class="setting-row">
              <div class="setting-row__info">
                <div class="setting-row__title">Avisos de Alterações nas Rotas</div>
                <div class="setting-row__desc">Notificações ao recalcular pontos de passagem.</div>
              </div>
              <label class="switch">
                <input type="checkbox" data-notif="routeChanges" ${n.routeChanges ? 'checked' : ''} />
                <span class="switch__track"><span class="switch__thumb"></span></span>
              </label>
            </div>

            <div class="setting-row">
              <div class="setting-row__info">
                <div class="setting-row__title">Notificações de Missões</div>
                <div class="setting-row__desc">Avisos de progresso recebidos do backend.</div>
              </div>
              <label class="switch">
                <input type="checkbox" data-notif="missionMilestones" ${n.missionMilestones ? 'checked' : ''} />
                <span class="switch__track"><span class="switch__thumb"></span></span>
              </label>
            </div>
          </div>
        </div>
      `;

      bodyEl.querySelector('#settings-close-panel')?.addEventListener('click', () => {
        activePanelOpen = false;
        renderCategoryContent(container);
      });

      bodyEl.querySelectorAll('[data-notif]').forEach((input) => {
        input.addEventListener('change', () => {
          updateSettings({ notifications: { [input.dataset.notif]: input.checked } });
        });
      });

      bodyEl.querySelector('#btn-show-alerts')?.addEventListener('click', () => {
        showEmergencyCenterSwal();
      });
      return;
    }

    if (appState.settingsSubTab === 'privacy') {
      const kb = (storage.getStorageUsageBytes() / 1024).toFixed(2);

      bodyEl.innerHTML = `
        <div class="panel">
          <div class="panel__header">
            <div>
              <h2 class="panel__title">Privacidade</h2>
              <span class="panel__meta tabular-nums">Dados locais: ${kb} KB</span>
            </div>
            <button type="button" class="btn btn--ghost btn--sm" id="settings-close-panel">Fechar</button>
          </div>

          <div class="settings-group">
            <div class="setting-row">
              <div class="setting-row__info">
                <div class="setting-row__title">Origem e retenção dos dados</div>
                <div class="setting-row__desc">Missões, alertas, posições e conversas são obtidos do servidor. Preferências visuais ficam neste navegador.</div>
              </div>
              <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                <button type="button" class="btn btn--danger btn--sm" id="btn-reset-local-settings">Limpar preferências locais</button>
              </div>
            </div>
          </div>
        </div>
      `;

      bodyEl.querySelector('#settings-close-panel')?.addEventListener('click', () => {
        activePanelOpen = false;
        renderCategoryContent(container);
      });

      bodyEl.querySelector('#btn-reset-local-settings')?.addEventListener('click', async () => {
        const confirmed = await showPriorityConfirmSwal({
          priority: 'P1',
          title: 'Limpar Preferências Locais',
          text: 'Esta ação não altera missões, alertas ou conversas guardados no servidor.',
          confirmText: 'Limpar Preferências',
          cancelText: 'Cancelar',
        });
        if (confirmed) {
          storage.clearAllAppStorage();
          updateSettings(structuredClone(DEFAULT_SETTINGS));
          showToast({ title: 'Preferências locais limpas', variant: 'safe' });
          renderCategoryContent(container);
        }
      });
      return;
    }

    bodyEl.innerHTML = `
      <div class="panel">
        <div class="panel__header">
          <h2 class="panel__title">Sobre o aplicativo</h2>
          <button type="button" class="btn btn--ghost btn--sm" id="settings-close-panel">Fechar</button>
        </div>

        <p style="color: var(--color-text-secondary); line-height: 1.6; font-size: 0.9rem;">
          <strong>MARTE — Rastreador de Exploração</strong> é uma plataforma web modular de acompanhamento e planeamento de missões em Marte, com globo 3D interativo, monitorização através de dados recebidos do backend, assistente e planeador.
        </p>

        <div class="about-specs">
          <div class="metric-cell">
            <div class="metric-cell__label">Nome</div>
            <div class="metric-cell__value">MARTE</div>
          </div>
          <div class="metric-cell">
            <div class="metric-cell__label">Versão</div>
            <div class="metric-cell__value tabular-nums">1.0.0</div>
          </div>
          <div class="metric-cell">
            <div class="metric-cell__label">Tecnologias</div>
            <div class="metric-cell__value" style="font-size: 0.82rem;">HTML5, CSS3, ES6+, Three.js, Laravel API, Reverb</div>
          </div>
          <div class="metric-cell">
            <div class="metric-cell__label">Créditos</div>
            <div class="metric-cell__value" style="font-size: 0.82rem;">Arquitetura modular MARTE</div>
          </div>
        </div>
      </div>
    `;

    bodyEl.querySelector('#settings-close-panel')?.addEventListener('click', () => {
      activePanelOpen = false;
      renderCategoryContent(container);
    });
  }

  return {
    mount(container) {
      unsubscribeHeartbeatState = eventBus.on('heartbeat:state', (enabled) => {
        const button = container.querySelector('#btn-periodic-heartbeat');
        if (button) {
          button.textContent = enabled
            ? 'Parar envio automático'
            : 'Ativar envio automático (a cada 60 s)';
        }
      });

      container.innerHTML = `
        <section class="view-section settings-stage" aria-label="Definições">
          <h1 class="settings-hero-title">DEFINIÇÕES</h1>

          <div class="settings-layout">
            <nav class="settings-menu-card" aria-label="Categorias de definições">
              ${SETTINGS_MENU.map(
                (item) => `
                <button type="button" class="settings-menu-btn" data-settings-tab="${item.id}">
                  <span class="settings-menu-btn__left">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      ${item.icon}
                    </svg>
                    <span>${escapeHtml(item.label)}</span>
                  </span>
                  <span class="settings-menu-btn__arrow" aria-hidden="true">&rsaquo;</span>
                </button>
              `
              ).join('')}
            </nav>

            <div id="settings-content"></div>
          </div>
        </section>
      `;

      container.querySelectorAll('[data-settings-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const tab = btn.dataset.settingsTab;
          if (activePanelOpen && appState.settingsSubTab === tab) {
            activePanelOpen = false;
          } else {
            appState.settingsSubTab = tab;
            activePanelOpen = true;
          }
          renderCategoryContent(container);
        });
      });

      renderCategoryContent(container);
    },

    unmount() {
      unsubscribeHeartbeatState?.();
      unsubscribeHeartbeatState = null;
    },
  };
}
