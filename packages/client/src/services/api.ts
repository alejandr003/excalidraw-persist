const API_BASE_URL = '/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

type RequestBody = Record<string, unknown> | unknown[];

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let lastActivity = Date.now();
const HEARTBEAT_INTERVAL = 60000;
const ACTIVITY_TIMEOUT = 300000;

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>;
    if (err.message) return String(err.message);
    if (err.status) return `Request failed with status ${err.status}`;
  }
  return 'Network error — please check your connection';
}

/** Retry a fetch-based operation up to `attempts` times with exponential backoff */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelay = 800): Promise<T> {
  if (attempts < 1) throw new Error('attempts must be at least 1');

  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const result = await fn();
      lastActivity = Date.now();
      return result;
    } catch (err) {
      lastError = err;
      if (err instanceof Error) {
        if (/Request failed with status [45]/.test(err.message)) {
          throw err;
        }
        if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
          lastActivity = Date.now();
        }
      }
      if (i < attempts - 1) {
        await new Promise(resolve => setTimeout(resolve, baseDelay * 2 ** i));
      }
    }
  }
  throw lastError ?? new Error('Request failed');
}

export const api = {
  async get<T>(endpoint: string): Promise<T> {
    return withRetry(async () => {
      const response = await fetch(`${API_BASE_URL}${endpoint}`);
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      const data: ApiResponse<T> = await response.json();
      return (data.data ?? data) as T;
    });
  },

  async post<T>(endpoint: string, body?: RequestBody): Promise<T> {
    return withRetry(async () => {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      const data: ApiResponse<T> = await response.json();
      if (!data.success) throw new Error(data.message || 'Request failed');
      return data.data as T;
    });
  },

  async put<T>(endpoint: string, body: RequestBody): Promise<T> {
    return withRetry(async () => {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      const data: ApiResponse<T> = await response.json();
      if (!data.success) throw new Error(data.message || 'Request failed');
      return data.data as T;
    });
  },

  async patch<T>(endpoint: string, body: RequestBody): Promise<T> {
    return withRetry(async () => {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      const data: ApiResponse<T> = await response.json();
      if (!data.success) throw new Error(data.message || 'Request failed');
      return data.data as T;
    });
  },

  async delete(endpoint: string): Promise<void> {
    return withRetry(async () => {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      const data: ApiResponse<void> = await response.json();
      if (!data.success) throw new Error(data.message || 'Request failed');
    });
  },

  extractErrorMessage,
  startHeartbeat,
  stopHeartbeat,
  isSessionValid,
};

async function startHeartbeat(): Promise<void> {
  if (heartbeatInterval) return;

  heartbeatInterval = setInterval(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/health`, {
        method: 'GET',
        cache: 'no-cache',
      });
      if (response.ok) {
        lastActivity = Date.now();
      }
    } catch {
      // Network error - don't update lastActivity
    }
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

function isSessionValid(): boolean {
  return Date.now() - lastActivity < ACTIVITY_TIMEOUT;
}
