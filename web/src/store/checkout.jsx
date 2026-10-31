import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.js';
import { pesos } from '../format.js';
import { useStore, waLink } from './StoreContext.jsx';
import { useData } from './pages.jsx';
import { Ico, WhatsAppIcon } from './icons.jsx';

const DRAFT = 'vm_checkout';
const readDraft = () => {
  try { return JSON.parse(localStorage.getItem(DRAFT)) ?? {}; } catch { return {}; }
};

export function Checkout() {
  const { cart } = useStore();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: opts, error } = useData('/store/checkout');
  const [quote, setQuote] = useState(null);
  const [f, setF] = useState(() => ({ name: '', phone: '', address: '', city: '', notes: '', zoneId: '', method: '', ...readDraft() }));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { document.title = 'Finalizar compra'; }, []);

  // Datos de la cuenta mayorista para no tipearlos de nuevo.
  useEffect(() => {
    if (user?.role === 'wholesale') {
      setF((x) => ({ ...x, name: x.name || user.name, phone: x.phone || (user.phone ?? '').replace(/^\+54/, ''), address: x.address || user.address || '', city: x.city || user.city || '' }));
    }
  }, [user]);
  useEffect(() => {
    const { notes: _n, ...keep } = f;
    try { localStorage.setItem(DRAFT, JSON.stringify(keep)); } catch { /* sin almacenamiento */ }
  }, [f]);
  const key = cart.items.map((i) => `${i.id}:${i.qty}`).join(',');
  useEffect(() => {
    if (!cart.items.length) return;
    api('/store/quote', { method: 'POST', body: { items: cart.items.map((i) => ({ productId: i.id, qty: i.qty })) } }).then(setQuote, () => {});
  }, [key, user?.id]);
  useEffect(() => {
    if (!opts) return;
    const methods = Object.entries(opts.methods).filter(([, on]) => on).map(([k]) => k);
    setF((x) => ({ ...x, method: methods.includes(x.method) ? x.method : methods[0] ?? '', zoneId: opts.zones.some((z) => String(z.id) === String(x.zoneId)) ? x.zoneId : '' }));
  }, [opts]);

  if (!cart.items.length) {
    return (
      <section className="s-section s-wrap s-narrow s-empty">
        <p>Tu carrito está vacío.</p>
        <Link to="/productos" className="s-btn">Ver productos</Link>
      </section>
    );
  }
  if (!opts) return <div className="s-wrap s-loading">{error ?? 'Cargando…'}</div>;

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const zone = opts.zones.find((z) => String(z.id) === String(f.zoneId));
  const subtotal = quote?.subtotal ?? cart.total;
  const total = subtotal + (zone?.price ?? 0);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await api('/store/orders', {
        method: 'POST',
        body: {
          items: cart.items.map((i) => ({ productId: i.id, qty: i.qty })),
          customer: { name: f.name, phone: f.phone, address: f.address, city: f.city, notes: f.notes },
          zoneId: Number(f.zoneId),
          paymentMethod: f.method,
        },
      });
      cart.clear();
      if (r.payUrl) window.location.href = r.payUrl;
      else navigate(`/pedido/${r.order.public_token}`);
    } catch (err) {
      setMsg(err.message);
      setBusy(false);
    }
  };

  return (
    <section className="s-section s-wrap">
      <nav className="s-crumbs" aria-label="Estás en"><Link to="/carrito">Carrito</Link> / <span>Finalizar compra</span></nav>
      <h1 className="s-page-title">Finalizar compra</h1>
      <form className="s-checkout" onSubmit={submit}>
        <div className="s-checkout-main">
          <fieldset className="s-box">
            <legend>Tus datos para la entrega</legend>
            <label htmlFor="k-name">Nombre y apellido</label>
            <input id="k-name" value={f.name} onChange={set('name')} required autoComplete="name" />
            <label htmlFor="k-phone">Teléfono (WhatsApp)</label>
            <input id="k-phone" value={f.phone} onChange={set('phone')} required inputMode="tel" autoComplete="tel" placeholder="11 2345 6789" />
            <label htmlFor="k-address">Dirección de entrega</label>
            <input id="k-address" value={f.address} onChange={set('address')} required autoComplete="street-address" placeholder="Calle, número, piso/depto" />
            <label htmlFor="k-city">Localidad</label>
            <input id="k-city" value={f.city} onChange={set('city')} autoComplete="address-level2" />
            <label htmlFor="k-notes">Aclaraciones (opcional)</label>
            <textarea id="k-notes" rows={2} value={f.notes} onChange={set('notes')} placeholder="Entre calles, horario, timbre…" />
          </fieldset>

          <fieldset className="s-box">
            <legend>Zona de envío</legend>
            {opts.zones.length === 0 && <p className="s-note">Todavía no hay zonas de envío cargadas. Escribinos por WhatsApp.</p>}
            {opts.zones.map((z) => (
              <label key={z.id} className={`s-option ${String(f.zoneId) === String(z.id) ? 'on' : ''}`}>
                <input type="radio" name="zone" value={z.id} checked={String(f.zoneId) === String(z.id)} onChange={set('zoneId')} required />
                <span className="s-option-text"><strong>{z.name}</strong>{z.description && <small>{z.description}</small>}</span>
                <span className="s-option-price">{z.price ? pesos(z.price) : 'Sin cargo'}</span>
              </label>
            ))}
          </fieldset>

          <fieldset className="s-box">
            <legend>Cómo pagás</legend>
            {opts.methods.mercadopago && (
              <label className={`s-option ${f.method === 'mercadopago' ? 'on' : ''}`}>
                <input type="radio" name="method" value="mercadopago" checked={f.method === 'mercadopago'} onChange={set('method')} />
                <span className="s-option-text"><strong>Mercado Pago</strong><small>Tarjeta de crédito, débito o dinero en cuenta. Te llevamos a Mercado Pago para pagar.</small></span>
                <Ico name="wallet" />
              </label>
            )}
            {opts.methods.transfer && (
              <label className={`s-option ${f.method === 'transfer' ? 'on' : ''}`}>
                <input type="radio" name="method" value="transfer" checked={f.method === 'transfer'} onChange={set('method')} />
                <span className="s-option-text"><strong>Transferencia</strong><small>Al confirmar te mostramos el alias y nos mandás el comprobante por WhatsApp.</small></span>
                <Ico name="bank" />
              </label>
            )}
            {!opts.methods.mercadopago && !opts.methods.transfer && <p className="s-note">Por ahora coordinamos el pago por WhatsApp.</p>}
          </fieldset>
        </div>

        <aside className="s-box s-summary">
          <h2>Tu pedido</h2>
          {quote?.priceType === 'wholesale' && <p className="s-pill">Precio mayorista</p>}
          <ul>
            {(quote?.lines ?? cart.items.map((i) => ({ productId: i.id, name: i.name, qty: i.qty, total: i.qty * i.list_price }))).map((l) => (
              <li key={l.productId}><span>{l.qty} × {l.name}</span><span>{pesos(l.total)}</span></li>
            ))}
          </ul>
          <div className="s-sum-row"><span>Subtotal</span><span>{pesos(subtotal)}</span></div>
          <div className="s-sum-row"><span>Envío</span><span>{zone ? (zone.price ? pesos(zone.price) : 'Sin cargo') : 'Elegí la zona'}</span></div>
          <div className="s-sum-row total"><span>Total</span><span>{pesos(total)}</span></div>
          {msg && <div className="notice error" role="alert">{msg}</div>}
          <button className="s-btn s-btn-block" disabled={busy || !f.method || !f.zoneId}>
            {busy ? 'Enviando…' : f.method === 'mercadopago' ? 'Ir a pagar con Mercado Pago' : 'Confirmar pedido'}
          </button>
          <p className="s-note"><Ico name="truck" size={18} /> Los pedidos se despachan de 1 a 3 días hábiles.</p>
        </aside>
      </form>
    </section>
  );
}

function CopyRow({ label, value }) {
  const [ok, setOk] = useState(false);
  if (!value) return null;
  const copy = () => navigator.clipboard?.writeText(value).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); });
  return (
    <div className="s-copy">
      <span><small>{label}</small><strong>{value}</strong></span>
      <button type="button" className="s-btn s-btn-ghost s-btn-xs" onClick={copy}>{ok ? 'Copiado' : 'Copiar'}</button>
    </div>
  );
}

const PAY_STATUS = { pending: 'Pendiente de pago', proof_sent: 'Comprobante enviado, lo estamos revisando', paid: 'Pagado', rejected: 'Pago rechazado' };

export function OrderStatus() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const [state, setState] = useState({ data: null, error: null });
  const load = () => api(`/store/orders/${token}`).then((data) => setState({ data, error: null }), (e) => setState({ data: null, error: e.message }));
  useEffect(() => { load(); document.title = 'Tu pedido'; }, [token]);
  // Al volver de Mercado Pago el aviso del pago puede tardar unos segundos.
  useEffect(() => {
    if (params.get('status') !== 'approved' || state.data?.order.payment_status === 'paid') return undefined;
    const t = setTimeout(load, 4000);
    return () => clearTimeout(t);
  }, [params, state.data]);
  const { data, error } = state;
  if (!data) return <div className="s-wrap s-loading">{error ?? 'Cargando…'}</div>;
  const { order: o, items, transferInfo: t } = data;
  const wa = waLink(data.whatsapp, data.whatsappText);
  const sendProof = () => {
    api(`/store/orders/${token}/proof`, { method: 'POST' }).then(load, () => {});
    if (wa) window.open(wa, '_blank', 'noopener');
  };
  const mpFailed = o.payment_method === 'mercadopago' && o.payment_status !== 'paid' && ['rejected', 'failure', 'null'].includes(params.get('status'));

  return (
    <section className="s-section s-wrap s-narrow">
      <div className="s-thanks">
        <div className="s-thanks-ico" aria-hidden="true">✓</div>
        <h1 className="s-page-title">¡Gracias, {o.customer_name.split(' ')[0]}! Recibimos tu pedido #{o.id}</h1>
        <p className="s-dispatch"><Ico name="truck" /> {data.dispatchNote}</p>
        <p className="s-pill">{PAY_STATUS[o.payment_status]}</p>
      </div>

      {o.payment_method === 'transfer' && o.payment_status !== 'paid' && (
        <div className="s-box">
          <h2>Pagá por transferencia</h2>
          <p>Transferí <strong>{pesos(o.total)}</strong> a esta cuenta y mandanos el comprobante por WhatsApp.</p>
          <CopyRow label="Alias" value={t?.alias} />
          <CopyRow label="CBU / CVU" value={t?.cbu} />
          {t?.holder && <p className="s-note">Titular: {t.holder}{t.bank ? ` · ${t.bank}` : ''}</p>}
          {wa ? (
            <button type="button" className="s-btn s-btn-block s-btn-wa" onClick={sendProof}><WhatsAppIcon size={20} /> Enviar comprobante por WhatsApp</button>
          ) : <p className="s-note">Mandanos el comprobante por WhatsApp indicando el pedido #{o.id}.</p>}
          <p className="s-note">El mensaje solo dice tu número de pedido; el detalle ya nos llegó.</p>
        </div>
      )}
      {o.payment_method === 'mercadopago' && o.payment_status === 'pending' && (
        <div className="s-box">
          {mpFailed
            ? <p>El pago con Mercado Pago no se completó. Escribinos por WhatsApp y lo resolvemos.</p>
            : <p>Si ya pagaste con Mercado Pago, en unos segundos se confirma acá.</p>}
          {wa && <a className="s-link-wa" href={waLink(data.whatsapp, `Hola! Hice el pedido #${o.id} por la página.`)} target="_blank" rel="noopener noreferrer"><WhatsAppIcon size={18} /> Escribinos por WhatsApp</a>}
        </div>
      )}

      <div className="s-box s-summary">
        <h2>Detalle</h2>
        <ul>{items.map((i) => <li key={i.sku + i.name}><span>{i.qty} × {i.name}</span><span>{pesos(i.qty * i.unit_price)}</span></li>)}</ul>
        <div className="s-sum-row"><span>Envío ({o.zone_name})</span><span>{o.shipping ? pesos(o.shipping) : 'Sin cargo'}</span></div>
        <div className="s-sum-row total"><span>Total</span><span>{pesos(o.total)}</span></div>
        <p className="s-note">Entrega en {o.address}{o.city ? `, ${o.city}` : ''}.</p>
      </div>
      <p className="s-note">Guardá este enlace para ver el estado de tu pedido.</p>
      <div className="s-center"><Link to="/" className="s-btn s-btn-ghost">Volver a la tienda</Link></div>
    </section>
  );
}

export function WholesalePage() {
  const { user, login } = useAuth();
  const [params] = useSearchParams();
  const invite = params.get('inv') ?? '';
  const [f, setF] = useState({ name: '', business: '', phone: '', email: '', city: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { document.title = 'Compras mayoristas'; }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await api('/store/wholesale/register', { method: 'POST', body: { ...f, invite } });
      if (r.token) await login(r.token, r.user);
      else setMsg({ type: 'ok', text: '¡Listo! Recibimos tu pedido de cuenta mayorista. Te avisamos por WhatsApp cuando esté habilitada.' });
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };
  if (user?.role === 'wholesale') {
    return (
      <section className="s-section s-wrap s-narrow s-empty">
        <h1 className="s-page-title">Hola, {user.name.split(' ')[0]}</h1>
        <p>Tu cuenta mayorista está activa: ya ves los precios mayoristas en toda la tienda.</p>
        <Link to="/productos" className="s-btn">Ver productos</Link>
      </section>
    );
  }
  return (
    <section className="s-section s-wrap s-narrow">
      <h1 className="s-page-title">Compras mayoristas</h1>
      <p>Con una cuenta mayorista ves y pagás los precios por mayor en toda la tienda.</p>
      <div className="s-contact">
        <div className="s-box">
          <h2>¿Ya tenés cuenta?</h2>
          <p>Ingresá con tu celular y contraseña.</p>
          <Link to="/ingresar" className="s-btn s-btn-block">Ingresar</Link>
        </div>
        <form className="s-box s-contact-form" onSubmit={submit}>
          <h2>{invite ? 'Creá tu cuenta mayorista' : 'Pedí tu cuenta mayorista'}</h2>
          {!invite && <p className="s-note">La revisamos y te avisamos por WhatsApp cuando esté habilitada.</p>}
          {msg && <div className={`notice ${msg.type}`} role="status">{msg.text}</div>}
          <label htmlFor="w-name">Nombre y apellido</label>
          <input id="w-name" value={f.name} onChange={set('name')} required autoComplete="name" />
          <label htmlFor="w-business">Nombre del comercio (opcional)</label>
          <input id="w-business" value={f.business} onChange={set('business')} />
          <label htmlFor="w-phone">Celular (WhatsApp)</label>
          <input id="w-phone" value={f.phone} onChange={set('phone')} required inputMode="tel" autoComplete="tel" placeholder="11 2345 6789" />
          <label htmlFor="w-city">Localidad</label>
          <input id="w-city" value={f.city} onChange={set('city')} autoComplete="address-level2" />
          <label htmlFor="w-email">Email (opcional)</label>
          <input id="w-email" type="email" value={f.email} onChange={set('email')} autoComplete="email" />
          <label htmlFor="w-pass">Contraseña (mínimo 6)</label>
          <input id="w-pass" type="password" value={f.password} onChange={set('password')} required minLength={6} autoComplete="new-password" />
          <button className="s-btn s-btn-block" disabled={busy}>{busy ? 'Enviando…' : invite ? 'Crear cuenta' : 'Enviar'}</button>
        </form>
      </div>
    </section>
  );
}
