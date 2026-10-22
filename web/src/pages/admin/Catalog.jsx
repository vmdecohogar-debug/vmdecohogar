import { useMemo, useState } from 'react';
import { api } from '../../api.js';
import { pesos, toCents } from '../../format.js';
import { Badge, Loading, Notice, useAction, useApi } from '../../components/ui.jsx';
import { ProductImage } from '../../components/ProductImage.jsx';
import { resizeImage } from '../../components/image.js';

const EMPTY = { name: '', category: '', description: '', price: '', suggested_price: '', stock: '', sku: '', image_url: '' };
const toForm = (p) => ({
  id: p.id, name: p.name, category: p.category ?? '', description: p.description ?? '', sku: p.sku,
  price: String(p.price / 100), suggested_price: String(p.suggested_price / 100), stock: String(p.stock), image_url: p.image_url ?? '',
});

function ProductForm({ initial, categories, onDone, onCancel }) {
  const [form, setForm] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const { busy, msg, run, setMsg } = useAction();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const margin = form.price && form.suggested_price ? Math.round((1 - toCents(form.price) / toCents(form.suggested_price)) * 100) : null;

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await resizeImage(file);
      const { url } = await api('/admin/uploads', { method: 'POST', body: { dataUrl } });
      setForm((f) => ({ ...f, image_url: url }));
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setUploading(false);
    }
  };

  const save = (e) => {
    e.preventDefault();
    run(async () => {
      await api('/admin/products', {
        method: 'POST',
        body: {
          ...form,
          price: toCents(form.price),
          suggested_price: form.suggested_price ? toCents(form.suggested_price) : null,
          stock: form.stock === '' ? null : Number(form.stock),
        },
      });
      onDone(form.id ? 'Producto actualizado.' : 'Producto agregado.');
    });
  };

  return (
    <form className="card stack" onSubmit={save}>
      <h2>{form.id ? 'Editar producto' : 'Nuevo producto'}</h2>
      <Notice msg={msg} />
      <div className="photo-field">
        <ProductImage product={{ name: form.name || 'Foto', image_url: form.image_url }} />
        <div className="stack">
          <label className="btn secondary small" style={{ display: 'inline-block', width: 'auto', marginBottom: 0 }}>
            {uploading ? 'Subiendo…' : form.image_url ? 'Cambiar foto' : 'Agregar foto'}
            <input type="file" accept="image/*" onChange={pickPhoto} hidden />
          </label>
          {form.image_url && <button type="button" className="btn secondary small" onClick={() => setForm({ ...form, image_url: '' })}>Quitar foto</button>}
        </div>
      </div>
      <div><label htmlFor="p-name">Nombre</label><input id="p-name" value={form.name} onChange={set('name')} required /></div>
      <div className="grid two">
        <div>
          <label htmlFor="p-cat">Categoría</label>
          <input id="p-cat" list="categories" value={form.category} onChange={set('category')} placeholder="Velas, Textil, Cocina…" />
          <datalist id="categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <div><label htmlFor="p-sku">Código</label><input id="p-sku" value={form.sku} onChange={set('sku')} placeholder="Se genera solo" /></div>
      </div>
      <div><label htmlFor="p-desc">Descripción</label><textarea id="p-desc" rows={2} value={form.description} onChange={set('description')} placeholder="Medidas, material, aroma…" /></div>
      <div className="grid three">
        <div><label htmlFor="p-price">Precio a vendedora $</label><input id="p-price" inputMode="decimal" value={form.price} onChange={set('price')} required /></div>
        <div><label htmlFor="p-sug">Precio sugerido $</label><input id="p-sug" inputMode="decimal" value={form.suggested_price} onChange={set('suggested_price')} /></div>
        <div><label htmlFor="p-stock">Stock</label><input id="p-stock" inputMode="numeric" value={form.stock} onChange={set('stock')} /></div>
      </div>
      {margin != null && margin >= 0 && <p className="muted small">La vendedora gana {margin}% sobre el precio sugerido.</p>}
      <div className="row">
        <button className="btn" disabled={busy || uploading}>{busy ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="btn secondary" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

function ImportPanel({ onDone, onCancel }) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const { busy, msg, run } = useAction();

  const readFile = async (e) => {
    const file = e.target.files?.[0];
    if (file) setText(await file.text());
    setPreview(null);
  };
  const valid = preview?.filter((r) => r.errors.length === 0) ?? [];

  return (
    <div className="card stack">
      <h2>Importar lista de productos</h2>
      <p className="muted">
        Pegá la lista como la tenés: copiada de WhatsApp (una línea por producto, con nombre y precio, por ejemplo
        “Vela de soja 200 g $4.500 / $6.500”) o una planilla con columnas Nombre, Precio, Sugerido, Stock, Categoría.
        El primer precio es el de vendedora y el segundo, el sugerido. Los productos que ya existen se actualizan.
      </p>
      <Notice msg={msg} />
      <textarea rows={8} value={text} onChange={(e) => { setText(e.target.value); setPreview(null); }} placeholder={'Vela de soja 200 g $4.500 / $6.500\nMantel de lino $9.800 / $14.000'} />
      <div className="row">
        <label className="btn secondary small" style={{ width: 'auto', marginBottom: 0 }}>
          Subir archivo CSV
          <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={readFile} hidden />
        </label>
        <button className="btn small" disabled={busy || !text.trim()} onClick={() => run(async () => setPreview(await api('/admin/products/import/preview', { method: 'POST', body: { text } })))}>Ver vista previa</button>
        <button type="button" className="btn secondary small" onClick={onCancel}>Cancelar</button>
      </div>
      {preview && (
        <>
          <div className="table-wrap">
            <table className="responsive">
              <thead><tr><th>Producto</th><th>Vendedora</th><th>Sugerido</th><th>Stock</th><th>Resultado</th></tr></thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i}>
                    <td data-label="Producto">{r.name ?? '—'}{r.category && <div className="muted small">{r.category}</div>}</td>
                    <td data-label="Vendedora">{r.price ? pesos(r.price) : '—'}</td>
                    <td data-label="Sugerido">{r.suggested_price ? pesos(r.suggested_price) : 'igual'}</td>
                    <td data-label="Stock">{r.stock ?? '—'}</td>
                    <td data-label="Resultado">
                      {r.errors.length ? <Badge tone="rojo">{r.errors.join(' ')}</Badge> : r.existingId ? <Badge tone="amarillo">Actualiza {r.existingSku}</Badge> : <Badge tone="verde">Nuevo</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn" disabled={busy || valid.length === 0} onClick={() => run(async () => {
            const r = await api('/admin/products/import', { method: 'POST', body: { text } });
            onDone(`Listo: ${r.created} nuevos, ${r.updated} actualizados${r.skipped ? `, ${r.skipped} con errores salteados` : ''}. Agregales foto desde Editar.`);
          })}>Importar {valid.length} productos</button>
        </>
      )}
    </div>
  );
}

export default function AdminCatalog() {
  const { data, error, reload } = useApi('/admin/products');
  const [mode, setMode] = useState(null); // null | 'import' | producto en edición
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [showPaused, setShowPaused] = useState(true);
  const { busy, msg, run, setMsg } = useAction();

  const list = useMemo(() => (data?.products ?? []).filter((p) =>
    (!cat || p.category === cat) && (showPaused || p.active) && `${p.name} ${p.sku} ${p.category ?? ''}`.toLowerCase().includes(q.toLowerCase())), [data, q, cat, showPaused]);

  if (!data) return <Loading error={error} />;
  const done = (text) => { setMode(null); setMsg({ type: 'ok', text }); reload(); window.scrollTo(0, 0); };

  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Catálogo</h1>
        <div className="row">
          <button className="btn small" onClick={() => setMode({ ...EMPTY })}>Nuevo producto</button>
          <button className="btn secondary small" onClick={() => setMode('import')}>Importar lista</button>
        </div>
      </div>
      <Notice msg={msg} />
      {mode === 'import' && <ImportPanel onDone={done} onCancel={() => setMode(null)} />}
      {mode && mode !== 'import' && <ProductForm key={mode.id ?? 'new'} initial={mode} categories={data.categories} onDone={done} onCancel={() => setMode(null)} />}

      <div className="grid three" style={{ marginBottom: 16 }}>
        <input placeholder="Buscar producto o código" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {data.categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="check" style={{ alignItems: 'center' }}>
          <input type="checkbox" checked={showPaused} onChange={(e) => setShowPaused(e.target.checked)} /> Mostrar pausados
        </label>
      </div>
      <p className="muted small">{list.length} productos · {data.products.filter((p) => p.active).length} visibles para las vendedoras</p>

      <div className="products">
        {list.map((p) => (
          <div key={p.id} className={`card product ${p.active ? '' : 'paused'}`}>
            <ProductImage product={p} />
            <div className="row between">
              <strong>{p.name}</strong>
              {!p.active && <Badge>Pausado</Badge>}
            </div>
            <div className="muted small">{p.sku}{p.category ? ` · ${p.category}` : ''}</div>
            {p.description && <div className="small">{p.description}</div>}
            <div className="row between">
              <span><strong>{pesos(p.price)}</strong> <span className="muted small">/ {pesos(p.suggested_price)}</span></span>
              <Badge tone={p.stock === 0 ? 'rojo' : p.stock < 5 ? 'amarillo' : 'gris'}>stock {p.stock}</Badge>
            </div>
            <div className="row">
              <button className="btn secondary small" onClick={() => { setMode(toForm(p)); window.scrollTo(0, 0); }}>Editar</button>
              <button className="btn secondary small" disabled={busy} onClick={() => run(() => api(`/admin/products/${p.id}/active`, { method: 'POST', body: { active: !p.active } }).then(reload))}>
                {p.active ? 'Pausar' : 'Activar'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
