import { useMemo, useState } from 'react';
import { api } from '../../../api.js';
import { pesos, toCents } from '../../../format.js';
import { Badge, Loading, Notice, useAction, useApi } from '../../../components/ui.jsx';
import { discountedPrice, marginOf, priceFromCost } from '../../../pricing.js';
import { ImageField } from './ImageField.jsx';

const money = (c) => (c == null ? '' : String(c / 100).replace('.', ','));
const EMPTY = {
  name: '', sku: '', category_id: '', description: '', image_url: '', price_mode: 'margin', cost: '',
  list_margin: '', wholesale_margin: '', list_price: '', wholesale_price: '', stock: '', featured: false, discount_pct: '',
};
const toForm = (p) => ({
  id: p.id, name: p.name, sku: p.sku, category_id: p.category_id ?? '', description: p.description ?? '', image_url: p.image_url ?? '',
  price_mode: p.price_mode, cost: money(p.cost), list_margin: p.list_margin ?? '', wholesale_margin: p.wholesale_margin ?? '',
  list_price: money(p.list_price), wholesale_price: money(p.wholesale_price), stock: String(p.stock ?? ''), featured: p.featured,
  discount_pct: p.discount_pct ?? '',
});

function ProductForm({ initial, categories, settings, onDone, onCancel }) {
  const [f, setF] = useState(initial);
  const { busy, msg, run, setMsg } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const cost = f.cost ? toCents(f.cost) : null;
  const { margins, rounding } = settings;
  const listM = f.list_margin === '' ? margins.list : Number(f.list_margin);
  const wholeM = f.wholesale_margin === '' ? margins.wholesale : Number(f.wholesale_margin);
  const list = f.price_mode === 'margin' ? priceFromCost(cost, listM, rounding) : (f.list_price ? toCents(f.list_price) : null);
  const whole = f.price_mode === 'margin' ? priceFromCost(cost, wholeM, rounding) : (f.wholesale_price ? toCents(f.wholesale_price) : list);
  const promoList = discountedPrice(list, f.discount_pct, rounding);
  const promoWhole = discountedPrice(whole, f.discount_pct, rounding);

  const save = (e) => {
    e.preventDefault();
    run(async () => {
      await api('/admin/store/products', {
        method: 'POST',
        body: {
          ...f,
          category_id: f.category_id ? Number(f.category_id) : null,
          cost: cost,
          list_price: f.list_price ? toCents(f.list_price) : null,
          wholesale_price: f.wholesale_price ? toCents(f.wholesale_price) : null,
          list_margin: f.list_margin === '' ? null : Number(f.list_margin),
          wholesale_margin: f.wholesale_margin === '' ? null : Number(f.wholesale_margin),
          stock: f.stock === '' ? null : Number(f.stock),
          discount_pct: f.discount_pct === '' ? null : f.discount_pct,
        },
      });
      onDone(f.id ? 'Producto actualizado.' : 'Producto agregado.');
    });
  };

  return (
    <form className="card stack" onSubmit={save}>
      <h2>{f.id ? 'Editar producto' : 'Nuevo producto'}</h2>
      <Notice msg={msg} />
      <ImageField value={f.image_url} onChange={(url) => setF((x) => ({ ...x, image_url: url }))} onError={(text) => setMsg({ type: 'error', text })} />
      <div><label htmlFor="p-name">Nombre</label><input id="p-name" value={f.name} onChange={set('name')} required /></div>
      <div className="grid two">
        <div>
          <label htmlFor="p-cat">Categoría</label>
          <select id="p-cat" value={f.category_id} onChange={set('category_id')}>
            <option value="">Sin categoría</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
        </div>
        <div><label htmlFor="p-sku">Código</label><input id="p-sku" value={f.sku} onChange={set('sku')} placeholder="Se genera solo (VM-…)" /></div>
      </div>
      <div><label htmlFor="p-desc">Descripción</label><textarea id="p-desc" rows={3} value={f.description} onChange={set('description')} placeholder="Medidas, material, colores…" /></div>

      <fieldset className="price-box">
        <legend>Precio</legend>
        <div className="seg" role="radiogroup" aria-label="Cómo se calcula el precio">
          <label className={f.price_mode === 'margin' ? 'on' : ''}><input type="radio" name="mode" value="margin" checked={f.price_mode === 'margin'} onChange={set('price_mode')} /> Calcular desde el costo</label>
          <label className={f.price_mode === 'manual' ? 'on' : ''}><input type="radio" name="mode" value="manual" checked={f.price_mode === 'manual'} onChange={set('price_mode')} /> Poner el precio a mano</label>
        </div>
        <div className="grid three">
          <div><label htmlFor="p-cost">Costo $</label><input id="p-cost" inputMode="decimal" value={f.cost} onChange={set('cost')} required={f.price_mode === 'margin'} /></div>
          {f.price_mode === 'margin' ? (
            <>
              <div><label htmlFor="p-lm">Margen lista %</label><input id="p-lm" inputMode="decimal" value={f.list_margin} onChange={set('list_margin')} placeholder={`${margins.list} (general)`} /></div>
              <div><label htmlFor="p-wm">Margen mayorista %</label><input id="p-wm" inputMode="decimal" value={f.wholesale_margin} onChange={set('wholesale_margin')} placeholder={`${margins.wholesale} (general)`} /></div>
            </>
          ) : (
            <>
              <div><label htmlFor="p-lp">Precio de lista $</label><input id="p-lp" inputMode="decimal" value={f.list_price} onChange={set('list_price')} required /></div>
              <div><label htmlFor="p-wp">Precio mayorista $</label><input id="p-wp" inputMode="decimal" value={f.wholesale_price} onChange={set('wholesale_price')} placeholder="Igual al de lista" /></div>
            </>
          )}
        </div>
        <div className="price-preview">
          <div><span className="muted small">Precio de lista</span><strong>{list ? pesos(list) : '—'}</strong>{cost && list ? <span className="muted small">ganás {pesos(list - cost)} ({marginOf(list, cost)}%)</span> : null}</div>
          <div><span className="muted small">Precio mayorista</span><strong>{whole ? pesos(whole) : '—'}</strong>{cost && whole ? <span className="muted small">ganás {pesos(whole - cost)} ({marginOf(whole, cost)}%)</span> : null}</div>
        </div>
        {f.price_mode === 'margin' && <p className="muted small">Se redondea hacia arriba a los ${rounding}. Los márgenes generales se cambian en Tienda.</p>}
      </fieldset>

      <fieldset className="price-box">
        <legend>Descuento</legend>
        <div className="grid two">
          <div>
            <label htmlFor="p-disc">Descuento %</label>
            <input id="p-disc" inputMode="decimal" value={f.discount_pct} onChange={set('discount_pct')} placeholder="Sin descuento" />
          </div>
          {f.discount_pct !== '' && <button type="button" className="btn secondary small" style={{ alignSelf: 'end' }} onClick={() => setF({ ...f, discount_pct: '' })}>Quitar descuento</button>}
        </div>
        {promoList ? (
          <div className="price-preview">
            <div><span className="muted small">Lista en promo</span><span><s className="muted">{pesos(list)}</s> <strong>{pesos(promoList)}</strong></span>{cost ? <span className="muted small">ganás {pesos(promoList - cost)} ({marginOf(promoList, cost)}%)</span> : null}</div>
            <div><span className="muted small">Mayorista en promo</span><span>{promoWhole ? <><s className="muted">{pesos(whole)}</s> <strong>{pesos(promoWhole)}</strong></> : <strong>{whole ? pesos(whole) : '—'}</strong>}</span>{cost && (promoWhole ?? whole) ? <span className="muted small">ganás {pesos((promoWhole ?? whole) - cost)} ({marginOf(promoWhole ?? whole, cost)}%)</span> : null}</div>
          </div>
        ) : (
          <p className="muted small">{f.discount_pct !== '' && list ? 'Con ese % y el redondeo el precio no baja: probá con un % más alto.' : 'En la tienda se ve el precio anterior tachado y el precio de promo. Se aplica a lista y mayorista.'}</p>
        )}
      </fieldset>

      <div className="grid two">
        <div><label htmlFor="p-stock">Stock</label><input id="p-stock" inputMode="numeric" value={f.stock} onChange={set('stock')} /></div>
        <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={f.featured} onChange={set('featured')} /> Destacado (aparece primero en Más vendidos)</label>
      </div>
      <div className="row">
        <button className="btn" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="btn secondary" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

export default function StoreProducts() {
  const { data, error, reload } = useApi('/admin/store/products');
  const { data: settings } = useApi('/admin/store/settings');
  const [mode, setMode] = useState(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const { busy, msg, run, setMsg } = useAction();
  const [disc, setDisc] = useState(null); // { id, pct } mientras se edita el descuento de una fila

  const list = useMemo(() => (data?.products ?? []).filter((p) =>
    (!cat || String(p.category_id ?? 'none') === cat) && `${p.name} ${p.sku}`.toLowerCase().includes(q.toLowerCase())), [data, q, cat]);

  if (!data || !settings) return <Loading error={error} />;
  const done = (text) => { setMode(null); setMsg({ type: 'ok', text }); reload(); window.scrollTo(0, 0); };
  const applyDiscount = (p, pct) => run(async () => {
    await api(`/admin/store/products/${p.id}/discount`, { method: 'POST', body: { discount_pct: pct } });
    setDisc(null);
    reload();
  }, pct ? `Descuento del ${pct}% aplicado a ${p.name}.` : `Se quitó el descuento de ${p.name}.`);
  const strike = (normal, promo) => (promo ? <><s className="muted small">{pesos(normal)}</s><br /><strong>{pesos(promo)}</strong></> : (normal ? pesos(normal) : '—'));

  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Productos</h1>
        <button className="btn small" onClick={() => { setMode({ ...EMPTY }); window.scrollTo(0, 0); }}>Nuevo producto</button>
      </div>
      <Notice msg={msg} />
      {mode && <ProductForm key={mode.id ?? 'new'} initial={mode} categories={data.categories} settings={settings.store} onDone={done} onCancel={() => setMode(null)} />}

      <div className="grid two" style={{ marginBottom: 12 }}>
        <input placeholder="Buscar por nombre o código" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {data.categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          <option value="none">Sin categoría</option>
        </select>
      </div>
      <p className="muted small">{list.length} productos · {data.products.filter((p) => p.active).length} visibles en la tienda</p>

      <div className="table-wrap card" style={{ padding: 0 }}>
        <table className="responsive admin-products">
          <thead><tr><th>Producto</th><th>Costo</th><th>Lista</th><th>Mayorista</th><th>Stock</th><th /></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className={p.active ? '' : 'paused'}>
                <td data-label="Producto">
                  <div className="prod-cell">
                    {p.image_url ? <img src={p.image_url} alt="" /> : <span className="img-empty mini" />}
                    <div>
                      <strong>{p.name}</strong>
                      <div className="muted small">{p.sku} · {p.category_name ?? 'Sin categoría'}</div>
                      <div className="row" style={{ gap: 4, marginTop: 4 }}>
                        <Badge tone={p.price_mode === 'manual' ? 'amarillo' : 'gris'}>{p.price_mode === 'manual' ? 'Precio a mano' : 'Por margen'}</Badge>
                        {p.featured && <Badge tone="verde">Destacado</Badge>}
                        {p.promo_list_price && <Badge tone="rojo">-{Math.round(p.discount_pct)}%</Badge>}
                        {!p.active && <Badge tone="rojo">Pausado</Badge>}
                      </div>
                    </div>
                  </div>
                </td>
                <td data-label="Costo">{p.cost ? pesos(p.cost) : '—'}</td>
                <td data-label="Lista">{strike(p.list_price, p.promo_list_price)}</td>
                <td data-label="Mayorista">{strike(p.wholesale_price, p.promo_wholesale_price)}</td>
                <td data-label="Stock">{p.stock}</td>
                <td data-label="">
                  {disc?.id === p.id ? (
                    <form className="row discount-edit" style={{ justifyContent: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); applyDiscount(p, disc.pct); }}>
                      <input aria-label="Descuento %" inputMode="decimal" placeholder="%" value={disc.pct} onChange={(e) => setDisc({ ...disc, pct: e.target.value })} autoFocus style={{ width: 70 }} />
                      <button className="btn small" disabled={busy || !disc.pct}>Aplicar</button>
                      {p.discount_pct && <button type="button" className="btn secondary small" disabled={busy} onClick={() => applyDiscount(p, null)}>Quitar</button>}
                      <button type="button" className="btn secondary small" onClick={() => setDisc(null)}>Cancelar</button>
                    </form>
                  ) : (
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn secondary small" onClick={() => { setMode(toForm(p)); window.scrollTo(0, 0); }}>Editar</button>
                    <button className="btn secondary small" disabled={!p.list_price} onClick={() => setDisc({ id: p.id, pct: p.discount_pct ? String(p.discount_pct) : '' })}>% Descuento</button>
                    <button className="btn secondary small" disabled={busy} onClick={() => run(() => api(`/admin/products/${p.id}/active`, { method: 'POST', body: { active: !p.active } }).then(reload))}>
                      {p.active ? 'Pausar' : 'Activar'}
                    </button>
                  </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
