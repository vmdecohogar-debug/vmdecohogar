import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

const read = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* modo privado: el carrito vive solo en esta pestaña */ }
};

// Colores y tipografías del panel → variables CSS. El modo oscuro usa su propia paleta.
export function applyTheme(theme) {
  if (!theme) return;
  const vars = (set) => Object.entries(set ?? {}).map(([k, v]) => `--c-${k}: ${v};`).join(' ');
  const fonts = Object.entries(theme.fonts ?? {})
    .map(([slot, f]) => `--f-${slot}: '${String(f.family).replace(/'/g, '')}', system-ui, sans-serif;`).join(' ');
  let style = document.getElementById('theme-vars');
  if (!style) {
    style = document.createElement('style');
    style.id = 'theme-vars';
    document.head.appendChild(style);
  }
  style.textContent = `:root { ${vars(theme.light)} ${fonts} } :root[data-theme='dark'] { ${vars(theme.dark)} }`;
  const urls = [...new Set(Object.values(theme.fonts ?? {}).map((f) => f.url).filter(Boolean))];
  document.querySelectorAll('link[data-font]').forEach((l) => { if (!urls.includes(l.href)) l.remove(); });
  for (const url of urls) {
    if (document.querySelector(`link[data-font][href="${CSS.escape(url)}"]`)) continue;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.dataset.font = '1';
    document.head.appendChild(link);
  }
}

// Modo claro/oscuro: lo que elija la persona o, si no eligió, lo del dispositivo.
function useColorMode() {
  const [mode, setMode] = useState(() => read('vm_mode', null));
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return undefined;
    const on = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const dark = mode ? mode === 'dark' : systemDark;
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);
  const toggle = () => {
    const next = dark ? 'light' : 'dark';
    setMode(next);
    write('vm_mode', next);
  };
  return { dark, toggle };
}

function useCart() {
  const [items, setItems] = useState(() => read('vm_cart', []));
  useEffect(() => write('vm_cart', items), [items]);
  const add = useCallback((p, qty = 1) => setItems((cur) => {
    const found = cur.find((i) => i.id === p.id);
    if (found) return cur.map((i) => (i.id === p.id ? { ...i, qty: i.qty + qty } : i));
    return [...cur, { id: p.id, slug: p.slug, name: p.name, image_url: p.image_url, list_price: p.list_price, wholesale_price: p.wholesale_price, qty }];
  }), []);
  const setQty = useCallback((id, qty) => setItems((cur) => (qty <= 0 ? cur.filter((i) => i.id !== id) : cur.map((i) => (i.id === id ? { ...i, qty } : i)))), []);
  const clear = useCallback(() => setItems([]), []);
  const count = items.reduce((s, i) => s + i.qty, 0);
  const total = items.reduce((s, i) => s + i.qty * i.list_price, 0);
  return { items, add, setQty, clear, count, total };
}

export function StoreProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  const colorMode = useColorMode();
  const cart = useCart();
  const [toast, setToast] = useState(null);

  const load = useCallback(() => api('/store/config').then((c) => { setConfig(c); applyTheme(c.theme); }, (e) => setError(e.message)), []);
  useEffect(() => {
    load();
    window.addEventListener('store-config', load);
    return () => window.removeEventListener('store-config', load);
  }, [load]);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const addToCart = useCallback((p, qty = 1) => {
    cart.add(p, qty);
    setToast(`Agregaste ${p.name} al carrito`);
  }, [cart.add]);

  const value = useMemo(() => ({ config, error, ...colorMode, cart: { ...cart, add: addToCart }, toast }), [config, error, colorMode, cart, addToCart, toast]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Link de WhatsApp a la tienda con un mensaje.
export function waLink(number, text) {
  const n = String(number ?? '').replace(/\D/g, '');
  if (!n) return null;
  const full = n.startsWith('54') ? n : `549${n.replace(/^0/, '')}`;
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
