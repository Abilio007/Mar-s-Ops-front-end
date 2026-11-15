const TOKEN_KEY = 'marte_api_token';
const CONVERSATION_KEY = 'marte_ai_conversation_id';
const CONVERSATION_OWNER_KEY = 'marte_ai_conversation_owner';

export const API_BASE_URL = String(
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'
).replace(/\/+$/, '');

function getToken() {
  return window.sessionStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  window.sessionStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  window.sessionStorage.removeItem(TOKEN_KEY);
}

function setConversationOwner(userId) {
  const ownerId = String(userId);
  if (window.sessionStorage.getItem(CONVERSATION_OWNER_KEY) !== ownerId) {
    window.sessionStorage.removeItem(CONVERSATION_KEY);
    window.sessionStorage.setItem(CONVERSATION_OWNER_KEY, ownerId);
  }
}

async function request(path, { method = 'GET', body, authenticated = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = authenticated ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(`Não foi possível contactar a API (${API_BASE_URL}). Verifique o servidor e o CORS.`, {
      cause: error,
    });
  }

  const responseText = await response.text();
  let payload = null;
  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch (error) {
      throw new Error(`A API devolveu uma resposta inválida (HTTP ${response.status}).`, { cause: error });
    }
  }

  if (!response.ok) {
    const validationErrors = Object.values(payload?.errors || {}).flat();
    const message = validationErrors[0] || payload?.message || `Pedido falhou (HTTP ${response.status}).`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return payload;
}

export const backendApi = {
  get apiBaseUrl() {
    return API_BASE_URL;
  },

  get hasToken() {
    return Boolean(getToken());
  },

  get accessToken() {
    return getToken();
  },

  get conversationId() {
    return window.sessionStorage.getItem(CONVERSATION_KEY);
  },

  clearSession: clearToken,

  async login(credentials) {
    const response = await request('/auth/login', {
      method: 'POST',
      body: credentials,
      authenticated: false,
    });
    setToken(response.token);
    setConversationOwner(response.data.id);
    return response.data;
  },

  async register(credentials) {
    const response = await request('/auth/register', {
      method: 'POST',
      body: credentials,
      authenticated: false,
    });
    setToken(response.token);
    setConversationOwner(response.data.id);
    return response.data;
  },

  async me() {
    const response = await request('/auth/me');
    setConversationOwner(response.data.id);
    return response.data;
  },

  async logout() {
    try {
      if (getToken()) await request('/auth/logout', { method: 'POST' });
    } finally {
      clearToken();
    }
  },

  async getAlerts() {
    const response = await request('/alerts');
    return response.data;
  },

  async acknowledgeAlert(alertId) {
    const response = await request(`/alerts/${encodeURIComponent(alertId)}/acknowledge`, { method: 'POST' });
    return response.data;
  },

  async getRegions() {
    const response = await request('/data/regions', { authenticated: false });
    return response.data;
  },

  async getCatalog() {
    const response = await request('/data/catalog', { authenticated: false });
    return response.data;
  },

  async getMissions() {
    const response = await request('/missions');
    return response.data;
  },

  async createMission(mission) {
    const response = await request('/missions', { method: 'POST', body: mission });
    return response.data;
  },

  async updateMission(missionId, mission) {
    const response = await request(`/missions/${encodeURIComponent(missionId)}`, {
      method: 'PUT',
      body: mission,
    });
    return response.data;
  },

  async deleteMission(missionId) {
    return request(`/missions/${encodeURIComponent(missionId)}`, { method: 'DELETE' });
  },

  async getEarthTrips() {
    const response = await request('/earth-trips');
    return response.data;
  },

  async createEarthTrip(name, start, destination) {
    const response = await request('/earth-trips', {
      method: 'POST',
      body: { name, start, destination },
    });
    return response.data;
  },

  async updateEarthTripStatus(tripId, status) {
    const response = await request(`/earth-trips/${encodeURIComponent(tripId)}/status`, {
      method: 'PATCH',
      body: { status },
    });
    return response.data;
  },

  async deleteEarthTrip(tripId) {
    return request(`/earth-trips/${encodeURIComponent(tripId)}`, { method: 'DELETE' });
  },

  async updateMissionStatus(missionId, status) {
    const response = await request(`/missions/${encodeURIComponent(missionId)}/status`, {
      method: 'PATCH',
      body: { status },
    });
    return response.data;
  },

  async updateMissionChecklistItem(missionId, itemId, done) {
    const response = await request(
      `/missions/${encodeURIComponent(missionId)}/checklist/${encodeURIComponent(itemId)}`,
      { method: 'PATCH', body: { done } },
    );
    return response.data;
  },

  async getConversationHistory() {
    const conversationId = this.conversationId;
    if (!conversationId) return [];
    const response = await request(
      `/assistant/conversation?conversation_id=${encodeURIComponent(conversationId)}`,
    );
    return response.data;
  },

  async getActiveRoute() {
    const response = await request('/routes/active');
    return response.data;
  },

  async getLatestHeartbeat() {
    const response = await request('/heartbeats/latest');
    return response.data;
  },

  async sendHeartbeat(latitude, longitude, accuracyM = null, coordinateSystem = 'mars') {
    return request('/heartbeats', {
      method: 'POST',
      body: {
        latitude,
        longitude,
        accuracy_m: accuracyM,
        coordinate_system: coordinateSystem,
      },
    });
  },

  async planRoute(start, destination) {
    const response = await request('/routes/plan', {
      method: 'POST',
      body: { start, destination },
    });
    return response.data;
  },

  async selectRoute(routeId, candidateIndex, acknowledgeHazards = false) {
    const response = await request(`/routes/${encodeURIComponent(routeId)}/select`, {
      method: 'POST',
      body: {
        candidate_index: candidateIndex,
        acknowledge_hazards: acknowledgeHazards,
      },
    });
    return response.data;
  },

  async sendChat(message) {
    const response = await request('/assistant/chat', {
      method: 'POST',
      body: {
        message,
        conversation_id: this.conversationId,
      },
    });
    if (response.data.conversation_id) {
      window.sessionStorage.setItem(CONVERSATION_KEY, response.data.conversation_id);
    }
    return response.data;
  },

  clearConversation() {
    window.sessionStorage.removeItem(CONVERSATION_KEY);
  },

  async deleteConversation() {
    const conversationId = this.conversationId;
    if (conversationId && getToken()) {
      await request(`/assistant/conversations/${encodeURIComponent(conversationId)}`, {
        method: 'DELETE',
      });
    }
    this.clearConversation();
  },
};
