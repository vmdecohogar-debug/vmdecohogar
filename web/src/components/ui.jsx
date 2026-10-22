import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { LABELS } from '../format.js';

// Carga datos de la API y expone recarga, error y estado de carga.
export function useApi(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    setError(null);
    return api(path).then(setData, (e) => setError(e.message));
  }, [path]);
  useEffect(() => { load(); }, [load]);
  return { data, error, reload: load };
}

// Ejecuta una acción y muestra su resultado.
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const run = async (fn, okText) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      if (okText) setMsg({ type: 'ok', text: okText });
      return r;
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { busy, msg, run, setMsg };
}

export function Notice({ msg }) {
  if (!msg) return null;
  return <div className={`notice ${msg.type}`} role="status">{msg.text}</div>;
}

export function Loading({ error }) {
  if (error) return <div className="notice error">{error}</div>;
  return <p className="muted">Cargando…</p>;
}

export function Semaphore({ value }) {
  return <span className={`badge ${value}`}>{LABELS.semaphore[value] ?? value}</span>;
}

export function Badge({ children, tone = 'gris' }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Stat({ label, value, hint }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="muted small">{hint}</div>}
    </div>
  );
}

export function Qty({ value, onChange, max }) {
  return (
    <div className="qty">
      <button type="button" aria-label="Quitar uno" onClick={() => onChange(Math.max(0, value - 1))}>−</button>
      <span>{value}</span>
      <button type="button" aria-label="Agregar uno" onClick={() => onChange(max == null ? value + 1 : Math.min(max, value + 1))}>+</button>
    </div>
  );
}

const PATHS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  bag: 'M6 8h12l-1 12H7L6 8zm3 0V6a3 3 0 0 1 6 0v2',
  card: 'M3 6h18v12H3zM3 10h18',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 10a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 21a5 5 0 0 0-4-5',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  chat: 'M4 5h16v11H8l-4 4z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 12h2m12 0h2M12 4v2m0 12v2M6.3 6.3l1.4 1.4m8.6 8.6l1.4 1.4m0-11.4l-1.4 1.4M7.7 16.3l-1.4 1.4',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
};

export function Icon({ name }) {
  return (
    <svg className="ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
