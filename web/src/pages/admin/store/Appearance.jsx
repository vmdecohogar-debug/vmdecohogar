import { useEffect, useState } from 'react';
import { api } from '../../../api.js';
import { Loading, Notice, useAction, useApi } from '../../../components/ui.jsx';
import { applyTheme } from '../../../store/StoreContext.jsx';

const COLORS = [
  ['primary', 'Botones y links'],
  ['onPrimary', 'Texto sobre botones'],
  ['primarySoft', 'Fondo suave (botones al pasar)'],
  ['accent', 'Detalles y precio mayorista'],
  ['accentSoft', 'Franja superior y fondos de fotos'],
  ['bg', 'Fondo de la página'],
  ['surface', 'Tarjetas y encabezado'],
  ['text', 'Texto principal'],
  ['textSoft', 'Texto secundario'],
  ['line', 'Bordes y líneas'],
  ['footerBg', 'Fondo del pie de página'],
  ['footerText', 'Texto del pie de página'],
];

// Paleta original (celeste, lavanda y gris) para volver atrás.
export const DEFAULT_THEME = {
  light: {
    primary: '#2f7fa6', onPrimary: '#ffffff', primarySoft: '#e2f2f9', accent: '#8e7cc3', accentSoft: '#efebf8',
    bg: '#f6f7f9', surface: '#ffffff', text: '#3d424d', textSoft: '#6b7280', line: '#e2e5ea', footerBg: '#3d424d', footerText: '#f1f2f5',
  },
  dark: {
    primary: '#7cc6e6', onPrimary: '#10232c', primarySoft: '#1d3440', accent: '#b4a6e0', accentSoft: '#2b2740',
    bg: '#15171c', surface: '#1e2128', text: '#e6e8ec', textSoft: '#a2a8b4', line: '#30343d', footerBg: '#0f1115', footerText: '#d4d7de',
  },
};

const FONTS = [
  ['brand', 'Nombre de la marca', 'VM Bazar y Deco'],
  ['title', 'Títulos de producto y menús', 'Set de cubiertos x24 en caja'],
  ['body', 'Descripciones y textos', 'Acero inoxidable, 4 tipos de rallado. 22 × 9 cm.'],
  ['banner', 'Títulos de banners', 'Ofertas de temporada'],
  ['bannerSub', 'Bajadas de banners', 'HASTA 30% OFF EN COCINA'],
];

const familyFromUrl = (url) => {
  const m = /[?&]family=([^:&]+)/.exec(url ?? '');
  return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
};

// Contraste WCAG entre dos colores (para avisar si un texto no se va a leer).
function contrast(a, b) {
  const lum = (hex) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
const PAIRS = [['onPrimary', 'primary', 'Texto de botones'], ['text', 'bg', 'Texto sobre el fondo'], ['text', 'surface', 'Texto en tarjetas'], ['footerText', 'footerBg', 'Texto del pie']];

export default function Appearance() {
  const { data, error } = useApi('/admin/store/settings');
  const [theme, setTheme] = useState(null);
  const [mode, setMode] = useState('light');
  const { busy, msg, run } = useAction();
  useEffect(() => { if (data) setTheme(data.theme ?? { ...DEFAULT_THEME, fonts: {} }); }, [data]);
  // Vista previa en vivo: la página entera toma los colores mientras se eligen.
  useEffect(() => { if (theme) applyTheme(theme); }, [theme]);
  // Al salir: vuelve a lo guardado y al modo claro/oscuro que tenía la persona.
  useEffect(() => () => {
    window.dispatchEvent(new Event('store-config'));
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('vm_mode')); } catch { /* sin preferencia guardada */ }
    const dark = saved ? saved === 'dark' : window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, []);
  if (!theme) return <Loading error={error} />;

  const setColor = (k, v) => setTheme({ ...theme, [mode]: { ...theme[mode], [k]: v } });
  const setFont = (slot, url) => setTheme({ ...theme, fonts: { ...theme.fonts, [slot]: { url, family: familyFromUrl(url) || theme.fonts[slot]?.family } } });
  const setFamily = (slot, family) => setTheme({ ...theme, fonts: { ...theme.fonts, [slot]: { ...theme.fonts[slot], family } } });
  const save = () => run(async () => {
    await api('/admin/store/theme', { method: 'PUT', body: theme });
    window.dispatchEvent(new Event('store-config'));
  }, 'Apariencia guardada. Ya se ve así en la tienda.');
  const warnings = PAIRS.filter(([a, b]) => contrast(theme[mode][a], theme[mode][b]) < 4.5);

  return (
    <div>
      <h1>Apariencia</h1>
      <p className="muted">Los colores están separados por uso. Cambialos y mirá la vista previa; recién al guardar se ven en la tienda.</p>
      <Notice msg={msg} />

      <section className="card stack">
        <div className="row between">
          <h2 style={{ margin: 0 }}>Colores</h2>
          <div className="seg small" role="tablist">
            <button type="button" className={mode === 'light' ? 'on' : ''} onClick={() => { setMode('light'); document.documentElement.dataset.theme = 'light'; }}>Modo claro</button>
            <button type="button" className={mode === 'dark' ? 'on' : ''} onClick={() => { setMode('dark'); document.documentElement.dataset.theme = 'dark'; }}>Modo oscuro</button>
          </div>
        </div>
        <div className="colors">
          {COLORS.map(([k, label]) => (
            <label key={k} className="color-row">
              <input type="color" value={theme[mode][k]} onChange={(e) => setColor(k, e.target.value)} />
              <span><strong>{label}</strong><span className="muted small"> {theme[mode][k]}</span></span>
            </label>
          ))}
        </div>
        {warnings.length > 0 && (
          <div className="notice warn">Ojo, puede costar leer: {warnings.map((w) => w[2]).join(', ')}. Probá un color más oscuro o más claro.</div>
        )}
        <div className="theme-preview">
          <div className="tp-top">Envíos en 1 a 3 días hábiles</div>
          <div className="tp-body">
            <div className="tp-card">
              <div className="tp-img" />
              <div className="tp-cat">Cocina</div>
              <div className="tp-title">Rallador 4 caras</div>
              <div className="tp-price">$7.700 <span>Mayorista $6.900</span></div>
              <span className="tp-btn">Agregar al carrito</span>
            </div>
            <p className="tp-text">Texto principal <span>y texto secundario</span></p>
          </div>
          <div className="tp-foot">Pie de página · Medios de pago</div>
        </div>
        <button type="button" className="btn secondary small" style={{ width: 'auto' }} onClick={() => setTheme({ ...theme, light: DEFAULT_THEME.light, dark: DEFAULT_THEME.dark })}>
          Volver a la paleta original (celeste, lavanda y gris)
        </button>
      </section>

      <section className="card stack">
        <h2>Tipografías</h2>
        <p className="muted small">
          Elegí una letra en <a href="https://fonts.google.com/?lang=es_Latn" target="_blank" rel="noopener noreferrer">Google Fonts</a>, tocá “Get font” y “Get embed code”,
          y pegá acá el enlace que empieza con https://fonts.googleapis.com/css2?family=…
        </p>
        <p className="muted small">
          Dream Avenue y Beautifully Delicious son de Canva y su licencia no permite usarlas en una página web. Alternativas libres parecidas:
          Cormorant Garamond o Bodoni Moda (elegantes, como Dream Avenue) y Dancing Script o Sacramento (manuscritas, como Beautifully Delicious; mejor solo para títulos cortos).
        </p>
        {FONTS.map(([slot, label, sample]) => (
          <div key={slot} className="font-row">
            <div className="font-sample" style={{ fontFamily: `'${theme.fonts?.[slot]?.family ?? ''}', system-ui` }}>{sample}</div>
            <div className="grid two">
              <div><label htmlFor={`f-${slot}`}>{label}: enlace</label><input id={`f-${slot}`} value={theme.fonts?.[slot]?.url ?? ''} onChange={(e) => setFont(slot, e.target.value.trim())} placeholder="https://fonts.googleapis.com/css2?family=…" /></div>
              <div><label htmlFor={`fam-${slot}`}>Nombre de la letra</label><input id={`fam-${slot}`} value={theme.fonts?.[slot]?.family ?? ''} onChange={(e) => setFamily(slot, e.target.value)} /></div>
            </div>
          </div>
        ))}
      </section>

      <div className="savebar">
        <button className="btn" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar apariencia'}</button>
      </div>
    </div>
  );
}
