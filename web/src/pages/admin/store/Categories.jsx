import { useState } from 'react';
import { api } from '../../../api.js';
import { Badge, Loading, Notice, useAction, useApi } from '../../../components/ui.jsx';
import { ImageField } from './ImageField.jsx';

const ICONS = ['🍳', '🍽️', '☕', '🔪', '🛁', '🧴', '🪥', '🪴', '🕯️', '🖼️', '🛋️', '🧺', '📦', '🗄️', '🧽', '🧹', '🫧', '💄', '💅', '🌸', '🎄', '🎁', '⭐', '🏠', '🌿', '🧸', '🍼', '🐾', '🎉', '💡'];

function CategoryForm({ initial, onDone, onCancel }) {
  const [f, setF] = useState(initial);
  const { busy, msg, run, setMsg } = useAction();
  const save = (e) => {
    e.preventDefault();
    run(async () => {
      await api('/admin/store/categories', { method: 'POST', body: f });
      onDone(f.id ? 'Categoría actualizada.' : 'Categoría agregada.');
    });
  };
  return (
    <form className="card stack" onSubmit={save}>
      <h2>{f.id ? 'Editar categoría' : 'Nueva categoría'}</h2>
      <Notice msg={msg} />
      <div className="grid two">
        <div><label htmlFor="c-name">Nombre</label><input id="c-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
        <div><label htmlFor="c-icon">Ícono</label><input id="c-icon" value={f.icon ?? ''} onChange={(e) => setF({ ...f, icon: e.target.value })} placeholder="Elegí uno de abajo o pegá un emoji" /></div>
      </div>
      <div className="icon-pick" role="group" aria-label="Íconos sugeridos">
        {ICONS.map((i) => <button type="button" key={i} className={f.icon === i ? 'on' : ''} onClick={() => setF({ ...f, icon: i })}>{i}</button>)}
      </div>
      <div>
        <label>Foto para el inicio (opcional)</label>
        <p className="muted small">Se usa en los cuadros de categorías del inicio. Si no subís una, se usa la foto de un producto de la categoría.</p>
        <ImageField value={f.image_url ?? ''} onChange={(url) => setF((x) => ({ ...x, image_url: url }))} onError={(text) => setMsg({ type: 'error', text })} />
      </div>
      <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Visible en la tienda</label>
      <div className="row">
        <button className="btn" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="btn secondary" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

export default function StoreCategories() {
  const { data, error, reload } = useApi('/admin/store/categories');
  const [mode, setMode] = useState(null);
  const { busy, msg, run, setMsg } = useAction();
  if (!data) return <Loading error={error} />;
  const refresh = () => { reload(); window.dispatchEvent(new Event('store-config')); };
  const done = (text) => { setMode(null); setMsg({ type: 'ok', text }); refresh(); };
  const move = (idx, d) => {
    const ids = data.map((c) => c.id);
    [ids[idx], ids[idx + d]] = [ids[idx + d], ids[idx]];
    run(() => api('/admin/store/categories/order', { method: 'PUT', body: { ids } }).then(refresh));
  };
  const remove = (c) => {
    const extra = c.product_count ? ` Sus ${c.product_count} productos quedan sin categoría (no se borran).` : '';
    if (!window.confirm(`¿Borrar la categoría "${c.name}"?${extra}`)) return;
    run(() => api(`/admin/store/categories/${c.id}`, { method: 'DELETE' }).then(refresh), 'Categoría borrada.');
  };

  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Categorías</h1>
        <button className="btn small" onClick={() => setMode({ name: '', icon: '', image_url: '', active: true })}>Nueva categoría</button>
      </div>
      <p className="muted">Son las que aparecen en la barra de arriba de la tienda, en este orden.</p>
      <Notice msg={msg} />
      {mode && <CategoryForm key={mode.id ?? 'new'} initial={mode} onDone={done} onCancel={() => setMode(null)} />}
      <ul className="card list sortable">
        {data.map((c, idx) => (
          <li key={c.id}>
            <div className="order-btns">
              <button type="button" disabled={busy || idx === 0} onClick={() => move(idx, -1)} aria-label={`Subir ${c.name}`}>▲</button>
              <button type="button" disabled={busy || idx === data.length - 1} onClick={() => move(idx, 1)} aria-label={`Bajar ${c.name}`}>▼</button>
            </div>
            <span className="cat-icon" aria-hidden="true">{c.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{c.name}</strong> {!c.active && <Badge tone="rojo">Oculta</Badge>}
              <div className="muted small">{c.product_count} productos · /categoria/{c.slug}</div>
            </div>
            <div className="row">
              <button className="btn secondary small" onClick={() => { setMode({ ...c, image_url: c.own_image_url ?? '' }); window.scrollTo(0, 0); }}>Editar</button>
              <button className="btn secondary small" disabled={busy} onClick={() => remove(c)}>Borrar</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
