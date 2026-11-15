const STORAGE_PREFIX = 'marte_explorer_v1_';

export const STORAGE_KEYS = {
  SETTINGS: `${STORAGE_PREFIX}settings`,
};

export const storage = {
  removeLegacyDemoData() {
    try {
      ['trips', 'chat_history', 'alerts_state', 'activity_log'].forEach((key) => {
        window.localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
      });
    } catch (error) {
      console.error('[storage] Could not remove legacy demo data:', error);
    }
  },

  get(key, fallback = null) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (error) {
      console.error('[storage] Could not read local app data:', error);
      return fallback;
    }
  },

  set(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('[storage] Could not save local app data:', error);
      return false;
    }
  },

  remove(key) {
    try {
      window.localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error('[storage] Could not remove local app data:', error);
      return false;
    }
  },

  clearAllAppStorage() {
    try {
      Object.values(STORAGE_KEYS).forEach((key) => {
        window.localStorage.removeItem(key);
      });
      return true;
    } catch (error) {
      console.error('[storage] Could not clear local app data:', error);
      return false;
    }
  },

  getStorageUsageBytes() {
    let bytes = 0;
    try {
      Object.values(STORAGE_KEYS).forEach((key) => {
        const val = window.localStorage.getItem(key);
        if (val) bytes += val.length * 2;
      });
    } catch (error) {
      console.error('[storage] Could not estimate local app data usage:', error);
      return 0;
    }
    return bytes;
  },
};
