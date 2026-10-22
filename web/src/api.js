const TOKEN_KEY = 'rv_token';

export const session = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  set(token) { localStorage.setItem(TOKEN_KEY, token); },
  clear() { localStorage.removeItem(TOKEN_KEY); },
};

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && session.token) {
    session.clear();
    window.location.href = '/ingresar';
  }
  if (!res.ok) throw new Error(data.error ?? 'Algo salió mal. Probá de nuevo.');
  return data;
}
