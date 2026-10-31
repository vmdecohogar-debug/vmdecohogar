import { useState } from 'react';
import { api } from '../../../api.js';
import { Badge, Loading, Notice, useAction, useApi } from '../../../components/ui.jsx';
import { ImageField } from './ImageField.jsx';

function BannerForm({ initial, categories, onDone, onCancel }) {
  const [f, setF] = useState(initial);
  const { busy, msg, run, setMsg } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = (e) => {
    e.preventDefault();
    if (!f.image_url) { setMsg({ type: 'error', text: 'Subí la imagen del banner.' }); return; }
    run(async () => {
      await api('/admin/store/banners', { method: 'POST', body: f });
      onDone(f.id ? 'Banner actualizado.' : 'Banner agregado.');
    });
  };
  return (
    <form className="card stack" onSubmit={save}>
      <h2>{f.id ? 'Editar banner' : 'Nuevo banner'}</h2>
      <Notice msg={msg} />
      <div>
        <label>Imagen</label>
        <p className="muted small">Ideal horizontal, 1920 × 730 px (en el celular se recorta un poco a los costados). Dejá lo importante en el centro.</p>
        <ImageField wide max={1920} label="imagen" value={f.image_url} onChange={(url) => setF((x) => ({ ...x, image_url: url }))} onError={(text) => setMsg({ type: 'error', text })} />
      </div>
      <div className="grid two">
        <div><label htmlFor="b-title">Título (opcional)</label><input id="b-title" value={f.title ?? ''} onChange={set('title')} placeholder="Ej.: Hot Sale 20% OFF" /></div>
        <div><label htmlFor="b-sub">Bajada (opcional)</label><input id="b-sub" value={f.subtitle ?? ''} onChange={set('subtitle')} placeholder="Ej.: Solo esta semana en cocina" /></div>
      </div>
      <p className="muted small">Si la imagen ya tiene el texto escrito, dejá título y bajada vacíos.</p>
      <div>
        <label htmlFor="b-link">Al tocar el banner, ir a…</label>
        <select value={categories.some((c) => `/categoria/${c.slug}` === f.link) || f.link === '/productos' || !f.link ? (f.link ?? '') : 'otro'}
          onChange={(e) => setF({ ...f, link: e.target.value === 'otro' ? 'https://' : e.target.value })} aria-label="Destino">
          <option value="">No lleva a ningún lado</option>
          <option value="/productos">Todos los productos</option>
          {categories.map((c) => <option key={c.id} value={`/categoria/${c.slug}`}>Categoría: {c.name}</option>)}
          <option value="otro">Otro link (producto o página web)…</option>
        </select>
        <input id="b-link" style={{ marginTop: 8 }} value={f.link ?? ''} onChange={set('link')} placeholder="/producto/… o https://…" />
        <p className="muted small">Para un producto, abrilo en la tienda y copiá la dirección desde /producto/…</p>
      </div>
      <label className="check"><input type="checkbox" checked={f.active} onChange={set('active')} /> Visible en el carrusel</label>
      <div className="row">
        <button className="btn" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="btn secondary" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

export default function StoreBanners() {
  const { data, error, reload } = useApi('/admin/store/banners');
  const { data: cats } = useApi('/admin/store/categories');
  const [mode, setMode] = useState(null);
  const { busy, msg, run, setMsg } = useAction();
  if (!data || !cats) return <Loading error={error} />;
  const done = (text) => { setMode(null); setMsg({ type: 'ok', text }); reload(); };
  const move = (idx, d) => {
    const ids = data.map((b) => b.id);
    [ids[idx], ids[idx + d]] = [ids[idx + d], ids[idx]];
    run(() => api('/admin/store/banners/order', { method: 'PUT', body: { ids } }).then(reload));
  };
  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Banners del inicio</h1>
        <button className="btn small" onClick={() => setMode({ image_url: '', title: '', subtitle: '', link: '', active: true })}>Nuevo banner</button>
      </div>
      <p className="muted">Pasan solos en el carrusel del inicio, en este orden. El tiempo entre uno y otro se cambia en Tienda.</p>
      <Notice msg={msg} />
      {mode && <BannerForm key={mode.id ?? 'new'} initial={mode} categories={cats} onDone={done} onCancel={() => setMode(null)} />}
      {data.length === 0 && !mode && <div className="card muted">Todavía no hay banners. Mientras tanto, el inicio muestra el nombre de la tienda con un botón a los productos.</div>}
      <ul className="card list sortable">
        {data.map((b, idx) => (
          <li key={b.id}>
            <div className="order-btns">
              <button type="button" disabled={busy || idx === 0} onClick={() => move(idx, -1)} aria-label="Subir">▲</button>
              <button type="button" disabled={busy || idx === data.length - 1} onClick={() => move(idx, 1)} aria-label="Bajar">▼</button>
            </div>
            <img className="banner-thumb" src={b.image_url} alt="" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{b.title || 'Sin título'}</strong> {!b.active && <Badge tone="rojo">Oculto</Badge>}
              <div className="muted small" style={{ overflowWrap: 'anywhere' }}>{b.link ? `Lleva a ${b.link}` : 'Sin link'}</div>
            </div>
            <div className="row">
              <button className="btn secondary small" onClick={() => { setMode({ ...b }); window.scrollTo(0, 0); }}>Editar</button>
              <button className="btn secondary small" disabled={busy} onClick={() => window.confirm('¿Borrar este banner?') && run(() => api(`/admin/store/banners/${b.id}`, { method: 'DELETE' }).then(reload), 'Banner borrado.')}>Borrar</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
