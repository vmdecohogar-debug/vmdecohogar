import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useStore, waLink } from './StoreContext.jsx';
import { Ico, WhatsAppIcon } from './icons.jsx';

function SearchBox({ className = '' }) {
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const navigate = useNavigate();
  useEffect(() => setQ(params.get('q') ?? ''), [params]);
  const submit = (e) => {
    e.preventDefault();
    navigate(q.trim() ? `/productos?q=${encodeURIComponent(q.trim())}` : '/productos');
  };
  return (
    <form role="search" className={`s-search ${className}`} onSubmit={submit}>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="¿Qué estás buscando?" aria-label="Buscar productos" />
      <button type="submit" aria-label="Buscar"><Ico name="search" size={20} /></button>
    </form>
  );
}

function Header() {
  const { config, dark, toggle, cart } = useStore();
  const store = config?.store ?? {};
  return (
    <header className="s-header">
      {store.dispatchNote && <div className="s-topnote"><Ico name="truck" size={16} /> {store.dispatchNote}</div>}
      <div className="s-header-row s-wrap">
        <Link to="/" className="s-brand" aria-label={`${store.name ?? 'VM Bazar y Deco'}, inicio`}>
          <img src="/logo.jpg" alt="" width="44" height="44" />
          <span>{store.name ?? 'VM Bazar y Deco'}</span>
        </Link>
        <SearchBox className="s-search-desktop" />
        <div className="s-actions">
          <button type="button" className="s-iconbtn" onClick={toggle} aria-label={dark ? 'Usar modo claro' : 'Usar modo oscuro'} title={dark ? 'Modo claro' : 'Modo oscuro'}>
            <Ico name={dark ? 'sun' : 'moon'} />
          </button>
          <Link to="/ingresar" className="s-iconbtn" aria-label="Ingresar" title="Ingresar"><Ico name="user" /></Link>
          <Link to="/carrito" className="s-iconbtn s-cartbtn" aria-label={`Carrito, ${cart.count} productos`} title="Carrito">
            <Ico name="cart" />
            {cart.count > 0 && <span className="s-badge">{cart.count > 99 ? '99+' : cart.count}</span>}
          </Link>
        </div>
      </div>
      <div className="s-wrap s-search-mobile-wrap"><SearchBox className="s-search-mobile" /></div>
      <nav className="s-cats" aria-label="Categorías">
        <ul className="s-wrap">
          {(config?.categories ?? []).map((c) => (
            <li key={c.id}>
              <NavLink to={`/categoria/${c.slug}`}>
                <span className="s-cat-ico" aria-hidden="true">{c.icon}</span>{c.name}
              </NavLink>
            </li>
          ))}
          <li>
            <NavLink to="/productos" end>
              <span className="s-cat-ico" aria-hidden="true"><Ico name="grid" size={16} /></span>Todos los productos
            </NavLink>
          </li>
        </ul>
      </nav>
    </header>
  );
}

const PAYMENTS = [
  ['mercadopago', 'wallet', 'Mercado Pago'],
  ['cards', 'card', 'Tarjetas de crédito y débito'],
  ['transfer', 'bank', 'Transferencia bancaria'],
  ['cash', 'cash', 'Efectivo'],
];
const SOCIAL = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok']];

function Footer() {
  const { config } = useStore();
  const s = config?.store ?? {};
  const c = s.contact ?? {};
  const social = SOCIAL.filter(([k]) => s.social?.[k]);
  const wa = waLink(s.whatsapp);
  return (
    <footer className="s-footer">
      <div className="s-wrap s-footer-grid">
        <div>
          <div className="s-footer-brand">{s.name}</div>
          {s.tagline && <p>{s.tagline}</p>}
          <ul className="s-footer-links">
            <li><Link to="/">Inicio</Link></li>
            <li><Link to="/productos">Productos</Link></li>
            <li><Link to="/contacto">Contacto</Link></li>
          </ul>
        </div>
        <div>
          <h2>Medios de pago</h2>
          <ul className="s-footer-list">
            {PAYMENTS.filter(([k]) => s.payments?.[k]).map(([k, icon, label]) => <li key={k}><Ico name={icon} size={20} /> {label}</li>)}
          </ul>
        </div>
        <div>
          <h2>Redes sociales</h2>
          {social.length ? (
            <ul className="s-footer-social">
              {social.map(([k, label]) => (
                <li key={k}><a href={s.social[k]} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}><Ico name={k} /></a></li>
              ))}
            </ul>
          ) : <p className="s-footer-muted">Próximamente</p>}
        </div>
        <div>
          <h2>Contactanos</h2>
          <ul className="s-footer-list">
            {wa && <li><WhatsAppIcon size={20} /> <a href={wa} target="_blank" rel="noopener noreferrer">WhatsApp</a></li>}
            {c.phone && <li><Ico name="phone" size={20} /> <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}>{c.phone}</a></li>}
            {c.email && <li><Ico name="mail" size={20} /> <a href={`mailto:${c.email}`}>{c.email}</a></li>}
            {(c.address || c.city) && <li><Ico name="pin" size={20} /> {[c.address, c.city].filter(Boolean).join(', ')}</li>}
            {c.hours && <li><Ico name="clock" size={20} /> {c.hours}</li>}
          </ul>
        </div>
      </div>
      <div className="s-wrap s-footer-bottom">© {new Date().getFullYear()} {s.name}. Todos los derechos reservados.</div>
    </footer>
  );
}

export default function StoreLayout({ children }) {
  const { config, error, toast } = useStore();
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  const wa = waLink(config?.store?.whatsapp, config?.store?.whatsappMessage);
  return (
    <div className="s-app">
      <a href="#contenido" className="s-skip">Saltar al contenido</a>
      <Header />
      <main id="contenido" className="s-main">
        {error && !config ? <div className="s-wrap"><div className="notice error">{error}</div></div> : children}
      </main>
      <Footer />
      {wa && (
        <a className="s-wa" href={wa} target="_blank" rel="noopener noreferrer" aria-label="Escribinos por WhatsApp" title="Escribinos por WhatsApp">
          <WhatsAppIcon />
        </a>
      )}
      {toast && <div className="s-toast" role="status">{toast} · <Link to="/carrito">Ver carrito</Link></div>}
    </div>
  );
}
