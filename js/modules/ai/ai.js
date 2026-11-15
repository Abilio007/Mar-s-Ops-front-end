import { appState } from '../../core/state.js';
import { validateChatMessage } from '../../utils/validators.js';
import { formatTimestamp } from '../../utils/formatters.js';
import { escapeHtml } from '../../utils/helpers.js';
import { backendApi } from '../../core/backend-api.js';
import { showToast } from '../../core/events.js';

const SUGGESTED_PROMPTS = [
  'Zonas mais seguras para pouso',
  'Atmosfera e temperaturas em Marte',
  'Geografia do Monte Olimpo e Valles Marineris',
  'Analisar minhas viagens atuais',
];

const ROBOT_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="4" y="6" width="16" height="12" rx="3"/>
    <path d="M9 18l-2 3v-3M12 3v3M9 11h.01M15 11h.01M9 14.5h6"/>
  </svg>
`;

export function createAiView() {
  let isProcessing = false;

  function renderMessages(container) {
    const listEl = container.querySelector('#ai-messages');
    if (!listEl) return;

    listEl.innerHTML = appState.chatHistory.length
      ? appState.chatHistory
      .map((msg) => {
        const isUser = msg.role === 'user';
        const cardsHtml =
          Array.isArray(msg.cards) && msg.cards.length > 0
            ? `<div class="ai-cards">
                ${msg.cards
                  .map(
                    (card) => `
                    <div class="ai-data-card">
                      <div class="ai-data-card__title">${escapeHtml(card.title)}</div>
                      <p class="ai-data-card__body">${escapeHtml(card.body)}</p>
                      ${
                        Array.isArray(card.stats)
                          ? `<div class="ai-data-card__stats">${card.stats
                              .map((s) => `<span>${escapeHtml(s)}</span>`)
                              .join('')}</div>`
                          : ''
                      }
                    </div>
                  `
                  )
                  .join('')}
              </div>`
            : '';

        return `
          <div class="chat-row chat-row--${isUser ? 'user' : 'assistant'}">
            ${
              !isUser
                ? `<div class="chat-avatar" aria-hidden="true">${ROBOT_ICON}</div>`
                : ''
            }
            <div class="chat-msg__body-wrap">
              <div class="chat-msg__bubble">${escapeHtml(msg.text)}</div>
              ${cardsHtml}
              <div class="chat-msg__meta tabular-nums">${isUser ? 'Você' : 'IA'} · ${escapeHtml(formatTimestamp(msg.timestamp))}</div>
            </div>
          </div>
        `;
      })
      .join('')
      : `<div class="empty-state">${appState.backendUser ? 'Ainda não há mensagens nesta conversa.' : 'Inicie sessão para consultar o assistente no servidor.'}</div>`;

    if (isProcessing) {
      const processingDiv = document.createElement('div');
      processingDiv.className = 'ai-typing';
      processingDiv.textContent = 'A consultar o assistente no servidor...';
      listEl.appendChild(processingDiv);
    }

    listEl.scrollTop = listEl.scrollHeight;
  }

  async function handleSend(container, rawText) {
    if (isProcessing) return;

    const validation = validateChatMessage(rawText);
    const errorEl = container.querySelector('#ai-input-error');
    if (!validation.isValid) {
      if (errorEl) errorEl.textContent = validation.error;
      return;
    }
    if (errorEl) errorEl.textContent = '';
    if (!appState.backendUser) {
      showToast({
        title: 'Inicie sessão para usar o assistente',
        message: 'A aplicação não mantém respostas locais de demonstração.',
        variant: 'warn',
      });
      return;
    }

    const inputEl = container.querySelector('#ai-message-input');
    if (inputEl) inputEl.value = '';

    isProcessing = true;
    renderMessages(container);

    try {
      await backendApi.sendChat(validation.value);
      appState.chatHistory = await backendApi.getConversationHistory();
    } catch (error) {
      showToast({
        title: 'Não foi possível obter resposta',
        message: error.message,
        variant: 'warn',
      });
    } finally {
      isProcessing = false;
      renderMessages(container);
    }
  }

  return {
    mount(container, params = {}) {
      container.innerHTML = `
        <section class="view-section ai-stage" aria-label="Assistente IA de Marte">
          <div class="ai-chat-card">
            <div class="ai-chat-card__header">
              <div class="ai-brand-title">
                ${ROBOT_ICON}
                <span>IA</span>
              </div>
              <div class="meta-line">
                <span class="status-text ${appState.backendUser ? 'status-text--safe' : 'status-text--warn'}">
                  ${appState.backendUser ? '● Assistente no servidor' : '● Sessão necessária'}
                </span>
                <span class="meta-line__sep" aria-hidden="true">·</span>
                <button type="button" class="btn btn--ghost btn--sm" id="ai-clear-chat" ${!appState.backendUser ? 'disabled' : ''}>Limpar</button>
              </div>
            </div>

            <div class="ai-chat-messages" id="ai-messages" aria-live="polite"></div>
            <p class="panel__meta">As respostas são informativas; não certificam segurança de rotas nem substituem a equipa da missão.</p>

            <div class="ai-suggestions" aria-label="Sugestões rápidas">
              ${SUGGESTED_PROMPTS.map(
                (prompt) => `
                <button type="button" class="ai-suggestion-btn" data-prompt="${escapeHtml(prompt)}">
                  ${escapeHtml(prompt)}
                </button>
              `
              ).join('')}
            </div>

            <form class="ai-composer-wrap" id="ai-chat-form" novalidate>
              <div class="ai-composer">
                <label for="ai-message-input" class="sr-only">Digite sua mensagem</label>
                <input
                  id="ai-message-input"
                  type="text"
                  class="ai-composer__input"
                  placeholder="Digite sua mensagem..."
                  autocomplete="off"
                  ${!appState.backendUser ? 'disabled' : ''}
                />
                <button type="submit" class="ai-composer__send" aria-label="Enviar mensagem" ${!appState.backendUser ? 'disabled' : ''}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
              <div class="field__error" id="ai-input-error" role="alert"></div>
            </form>
          </div>
        </section>
      `;

      renderMessages(container);
      if (appState.backendUser) {
        backendApi.getConversationHistory()
          .then((messages) => {
            appState.chatHistory = messages;
            renderMessages(container);
          })
          .catch((error) => showToast({
            title: 'Não foi possível carregar a conversa',
            message: error.message,
            variant: 'warn',
          }));
      }

      container.querySelector('#ai-chat-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = container.querySelector('#ai-message-input');
        handleSend(container, input?.value || '');
      });

      container.querySelectorAll('.ai-suggestion-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          handleSend(container, btn.dataset.prompt || '');
        });
      });

      container.querySelector('#ai-clear-chat')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
          await backendApi.deleteConversation();
        } catch (error) {
          showToast({
            title: 'Não foi possível apagar a conversa no servidor',
            message: error.message,
            variant: 'warn',
          });
          button.disabled = false;
          return;
        }
        appState.chatHistory = [];
        renderMessages(container);
        button.disabled = false;
      });

      if (params?.initialPrompt) {
        handleSend(container, params.initialPrompt);
      }
    },

    unmount() {},
  };
}
