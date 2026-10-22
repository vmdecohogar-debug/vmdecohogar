import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { fechaCorta, pesos } from '../../format.js';
import { Loading, Notice, Qty, useAction, useApi } from '../../components/ui.jsx';
import { ProductImage } from '../../components/ProductImage.jsx';

// Catálogo y carrito. Si la vendedora todavía no tiene kit, arma el kit de arranque.
export default function Shop() {
  const products = useApi('/products');
  const dash = useApi('/seller/dashboard');
  const [cart, setCart] = useState({});
  const [step, setStep] = useState('catalog');
  const [mode, setMode] = useState('credit');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliverTo, setDeliverTo] = useState('seller');
  const [category, setCategory] = useState('');
  const { busy, msg, run } = useAction();
  const navigate = useNavigate();

  const list = products.data ?? [];
  const categories = [...new Set(list.map((p) => p.category).filter(Boolean))];
  const lines = useMemo(() => list.filter((p) => cart[p.id] > 0).map((p) => ({ ...p, qty: cart[p.id] })), [list, cart]);
  const units = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);

  if (!products.data || !dash.data) return <Loading error={products.error ?? dash.error} />;
  const d = dash.data;
  const isKit = d.needsKit && !d.kit;
  if (d.needsKit && d.kit) return <div className="card"><h2>Tu kit ya está en camino</h2><p>Cuando cierres el kit con la segunda visita vas a poder hacer pedidos normales.</p></div>;
  if (d.blocked) return <div className="notice error">Tenés un pago atrasado: <Link to="/pagos">regularizalo</Link> para hacer pedidos nuevos.</div>;
  if (d.profile.status !== 'active') return <div className="notice warn">Tu cuenta todavía no está activa.</div>;

  const kitOver = isKit && (units > d.kitRules.maxUnits || subtotal > d.kitRules.maxAmount);
  const discount = !isKit && mode === 'prepaid' ? Math.round((subtotal * d.level.discountPct) / 100) : 0;
  const total = subtotal - discount;
  const creditPart = mode === 'credit' ? Math.min(total, d.credit.available) : 0;
  const setQty = (id, q) => setCart({ ...cart, [id]: q });

  const confirm = () => run(async () => {
    const items = lines.map((l) => ({ productId: l.id, qty: l.qty }));
    if (isKit) await api('/seller/kit', { method: 'POST', body: { items, deliveryDate, deliverTo } });
    else await api('/seller/orders', { method: 'POST', body: { items, mode, deliveryDate, deliverTo } });
    navigate('/pedidos');
  });

  if (step === 'checkout') {
    return (
      <div className="stack" style={{ maxWidth: 560 }}>
        <button className="btn secondary small" onClick={() => setStep('catalog')}>← Volver al catálogo</button>
        <h1>{isKit ? 'Confirmar kit' : 'Confirmar pedido'}</h1>
        <Notice msg={msg} />
        <div className="card">
          <ul className="list">
            {lines.map((l) => <li key={l.id} className="row between"><span>{l.qty} × {l.name}</span><strong>{pesos(l.qty * l.price)}</strong></li>)}
          </ul>
        </div>

        {!isKit && (
          <div className="card stack">
            <h3>¿Cómo pagás?</h3>
            {d.level.code !== 'inicial' && (
              <label className="check"><input type="radio" name="mode" checked={mode === 'credit'} onChange={() => setMode('credit')} />
                <span>A crédito: pagás en {d.level.termDays} días desde la entrega. Cupo disponible {pesos(d.credit.available)}.</span></label>
            )}
            <label className="check"><input type="radio" name="mode" checked={mode === 'prepaid'} onChange={() => setMode('prepaid')} />
              <span>Pago antes de recibir{d.level.discountPct > 0 ? ` con ${d.level.discountPct}% de descuento` : ''}.</span></label>
            <label className="check"><input type="radio" name="mode" checked={mode === 'on_delivery'} onChange={() => setMode('on_delivery')} />
              <span>Contra entrega, en efectivo o Mercado Pago.</span></label>
          </div>
        )}

        <div className="card stack">
          <h3>Entrega</h3>
          <div className="row">
            {d.deliveryOptions.map((o) => (
              <button key={o} type="button" className={`btn small ${deliveryDate === o ? '' : 'secondary'}`} onClick={() => setDeliveryDate(o)}>{fechaCorta(o)}</button>
            ))}
          </div>
          <label className="check"><input type="radio" name="to" checked={deliverTo === 'seller'} onChange={() => setDeliverTo('seller')} /><span>En mi casa</span></label>
          <label className="check"><input type="radio" name="to" checked={deliverTo === 'leader'} onChange={() => setDeliverTo('leader')} /><span>En la casa de mi jefa zonal</span></label>
        </div>

        <div className="card tint">
          <div className="row between"><span>Subtotal</span><span>{pesos(subtotal)}</span></div>
          {discount > 0 && <div className="row between"><span>Descuento</span><span>−{pesos(discount)}</span></div>}
          {d.balanceCredit > 0 && <div className="row between muted"><span>Saldo a favor que se aplica</span><span>−{pesos(Math.min(d.balanceCredit, total))}</span></div>}
          <div className="row between" style={{ fontSize: 20, fontWeight: 800 }}><span>Total</span><span>{pesos(isKit ? subtotal : total)}</span></div>
          {isKit && <p className="muted small">No pagás ahora: en la segunda visita pagás solo lo que te quedás.</p>}
          {mode === 'credit' && !isKit && total > creditPart && <p className="muted small">{pesos(total - creditPart)} superan tu cupo y se pagan contra entrega.</p>}
        </div>
        <button className="btn block" disabled={busy || !deliveryDate} onClick={confirm}>{busy ? 'Enviando…' : deliveryDate ? 'Confirmar' : 'Elegí el día de entrega'}</button>
      </div>
    );
  }

  return (
    <div>
      <h1>{isKit ? 'Armá tu kit de arranque' : 'Catálogo'}</h1>
      {isKit && <p className="muted">Hasta {d.kitRules.maxUnits} productos o {pesos(d.kitRules.maxAmount)}. Llevás {units} productos y {pesos(subtotal)}.</p>}
      {kitOver && <div className="notice error">Te pasaste del límite del kit.</div>}
      {categories.length > 1 && (
        <div className="chips" role="group" aria-label="Categorías">
          <button className={`btn small ${category ? 'secondary' : ''}`} onClick={() => setCategory('')}>Todo</button>
          {categories.map((c) => <button key={c} className={`btn small ${category === c ? '' : 'secondary'}`} onClick={() => setCategory(c)}>{c}</button>)}
        </div>
      )}
      <div className="products" style={{ marginBottom: 80 }}>
        {list.filter((p) => !category || p.category === category).map((p) => (
          <div key={p.id} className="card product">
            <ProductImage product={p} />
            <strong>{p.name}</strong>
            {p.description && <div className="muted small">{p.description}</div>}
            <div className="row between">
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{pesos(p.price)}</div>
                <div className="muted small">Precio sugerido {pesos(p.suggested_price)}</div>
              </div>
              {p.stock > 0 ? <Qty value={cart[p.id] ?? 0} max={p.stock} onChange={(q) => setQty(p.id, q)} /> : <span className="badge gris">Sin stock</span>}
            </div>
            {p.stock > 0 && p.stock < 5 && <div className="muted small">Quedan {p.stock}</div>}
          </div>
        ))}
      </div>
      {units > 0 && (
        <div className="cartbar">
          <span>{units} productos · <strong>{pesos(subtotal)}</strong></span>
          <button className="btn small" disabled={kitOver} onClick={() => setStep('checkout')}>Continuar</button>
        </div>
      )}
    </div>
  );
}
