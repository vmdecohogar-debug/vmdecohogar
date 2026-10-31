import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { pesos } from '../format.js';
import { useStore, waLink } from './StoreContext.jsx';
import { Carousel, CategoryMosaic, Price, ProductGrid, ProductPhoto } from './components.jsx';
import { Ico, WhatsAppIcon } from './icons.jsx';

function useData(path) {
  const [state, setState] = useState({ data: null, error: null });
  useEffect(() => {
    let live = true;
    setState((s) => ({ data: s.data, error: null }));
    api(path).then((data) => live && setState({ data, error: null }), (e) => live && setState({ data: null, error: e.message }));
    return () => { live = false; };
  }, [path]);
  return state;
}

// Título de pestaña del navegador al navegar dentro de la tienda (el servidor ya lo pone en la primera carga).
function useTitle(title) {
  const { config } = useStore();
  useEffect(() => {
    if (title) document.title = `${title} | ${config?.store?.name ?? 'VM Bazar y Deco'}`;
    else if (config?.store?.seo?.title) document.title = config.store.seo.title;
  }, [title, config]);
}

function Skeleton({ error }) {
  if (error) return <div className="s-wrap"><div className="notice error">{error}</div></div>;
  return <div className="s-wrap s-loading" aria-busy="true">Cargando…</div>;
}

function Hero() {
  const { config } = useStore();
  const s = config?.store ?? {};
  return (
    <section className="s-hero">
      <div className="s-hero-text">
        <div className="s-slide-title">{s.name}</div>
        {s.tagline && <div className="s-slide-sub">{s.tagline}</div>}
        <Link to="/productos" className="s-btn">Ver productos</Link>
      </div>
    </section>
  );
}

export function Home() {
  const { config } = useStore();
  const { data, error } = useData('/store/home');
  const [tab, setTab] = useState('best');
  useTitle(null);
  if (!data) return <Skeleton error={error} />;
  const list = tab === 'best' ? data.bestSellers : data.newest;
  return (
    <>
      <div className="s-wrap s-carousel-wrap">
        {data.banners.length ? <Carousel banners={data.banners} seconds={config?.store?.carouselSeconds ?? 5} /> : <Hero />}
      </div>
      <section className="s-section s-wrap" aria-label="Productos">
        <div className="s-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'best'} className={tab === 'best' ? 'on' : ''} onClick={() => setTab('best')}>Más vendidos</button>
          <button type="button" role="tab" aria-selected={tab === 'new'} className={tab === 'new' ? 'on' : ''} onClick={() => setTab('new')}>Lo nuevo</button>
        </div>
        <div role="tabpanel">
          {list.length ? <ProductGrid items={list} /> : <p className="s-empty">Pronto vas a ver productos acá.</p>}
        </div>
        <div className="s-center"><Link to="/productos" className="s-btn s-btn-ghost">Ver todos los productos</Link></div>
      </section>
      <CategoryMosaic categories={config?.categories ?? []} />
    </>
  );
}

const SORTS = [['new', 'Más nuevos'], ['price_asc', 'Menor precio'], ['price_desc', 'Mayor precio'], ['name', 'A – Z']];

export function Products() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const sort = params.get('orden') ?? 'new';
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const qs = new URLSearchParams({ ...(slug ? { category: slug } : {}), ...(q ? { q } : {}), sort, page: String(page) }).toString();
  const { data, error } = useData(`/store/products?${qs}`);
  useEffect(() => { setPage(1); setItems([]); }, [slug, q, sort]);
  useEffect(() => {
    if (data) setItems((cur) => (data.page === 1 ? data.items : [...cur, ...data.items.filter((x) => !cur.some((c) => c.id === x.id))]));
  }, [data]);
  const title = data?.category?.name ?? (q ? `Resultados para “${q}”` : 'Todos los productos');
  useTitle(data?.category?.name ?? (q ? `Buscar: ${q}` : 'Todos los productos'));
  if (!data && !items.length) return <Skeleton error={error} />;

  return (
    <section className="s-section s-wrap">
      <nav className="s-crumbs" aria-label="Estás en"><Link to="/">Inicio</Link> / <span>{data?.category?.name ?? 'Productos'}</span></nav>
      <div className="s-list-head">
        <h1 className="s-page-title">{data?.category?.icon && <span aria-hidden="true">{data.category.icon} </span>}{title}</h1>
        <label className="s-sort">
          <span>Ordenar</span>
          <select value={sort} onChange={(e) => { const p = new URLSearchParams(params); p.set('orden', e.target.value); setParams(p); }}>
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>
      <p className="s-count">{data?.total ?? items.length} productos</p>
      {items.length ? <ProductGrid items={items} /> : (
        <div className="s-empty">
          <p>No encontramos productos{q ? ` para “${q}”` : ''}.</p>
          <Link to="/productos" className="s-btn s-btn-ghost">Ver todos los productos</Link>
        </div>
      )}
      {data && data.page < data.pages && (
        <div className="s-center"><button type="button" className="s-btn s-btn-ghost" onClick={() => setPage(data.page + 1)}>Ver más productos</button></div>
      )}
    </section>
  );
}

export function Product() {
  const { slug } = useParams();
  const { config, cart } = useStore();
  const { data, error } = useData(`/store/products/${slug}`);
  const [qty, setQty] = useState(1);
  useEffect(() => setQty(1), [slug]);
  useTitle(data?.product?.name);
  if (!data) return <Skeleton error={error} />;
  const p = data.product;
  const wa = waLink(config?.store?.whatsapp, `Hola! Quería consultar por: ${p.name} (${p.sku})`);
  return (
    <>
      <section className="s-section s-wrap">
        <nav className="s-crumbs" aria-label="Estás en">
          <Link to="/">Inicio</Link> / {p.category_slug ? <Link to={`/categoria/${p.category_slug}`}>{p.category_name}</Link> : <Link to="/productos">Productos</Link>} / <span>{p.name}</span>
        </nav>
        <div className="s-detail">
          <ProductPhoto product={p} className="s-detail-photo" />
          <div className="s-detail-info">
            <h1 className="s-detail-title">{p.name}</h1>
            <div className="s-sku">Código {p.sku}</div>
            <Price product={p} big />
            {p.description && <p className="s-desc">{p.description}</p>}
            <div className="s-buy">
              <div className="s-qty" aria-label="Cantidad">
                <button type="button" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Quitar uno">−</button>
                <span aria-live="polite">{qty}</span>
                <button type="button" onClick={() => setQty(qty + 1)} aria-label="Agregar uno">+</button>
              </div>
              <button type="button" className="s-btn" onClick={() => cart.add(p, qty)}>Agregar al carrito</button>
            </div>
            {config?.store?.dispatchNote && <p className="s-note"><Ico name="truck" size={18} /> {config.store.dispatchNote}</p>}
            {wa && <a className="s-link-wa" href={wa} target="_blank" rel="noopener noreferrer"><WhatsAppIcon size={18} /> Consultar por WhatsApp</a>}
          </div>
        </div>
      </section>
      {data.related.length > 0 && (
        <section className="s-section s-wrap">
          <h2 className="s-section-title">También te puede gustar</h2>
          <ProductGrid items={data.related} />
        </section>
      )}
    </>
  );
}

export function Cart() {
  const { cart, config } = useStore();
  useTitle('Carrito');
  return (
    <section className="s-section s-wrap s-narrow">
      <h1 className="s-page-title">Tu carrito</h1>
      {cart.items.length === 0 ? (
        <div className="s-empty">
          <p>Tu carrito está vacío.</p>
          <Link to="/productos" className="s-btn">Ver productos</Link>
        </div>
      ) : (
        <>
          <ul className="s-cart">
            {cart.items.map((i) => (
              <li key={i.id}>
                <Link to={`/producto/${i.slug}`} className="s-cart-img"><ProductPhoto product={i} /></Link>
                <div className="s-cart-info">
                  <Link to={`/producto/${i.slug}`} className="s-cart-name">{i.name}</Link>
                  <div className="s-cart-unit">{pesos(i.list_price)} c/u</div>
                  <div className="s-qty small">
                    <button type="button" onClick={() => cart.setQty(i.id, i.qty - 1)} aria-label="Quitar uno">−</button>
                    <span>{i.qty}</span>
                    <button type="button" onClick={() => cart.setQty(i.id, i.qty + 1)} aria-label="Agregar uno">+</button>
                  </div>
                </div>
                <div className="s-cart-right">
                  <strong>{pesos(i.qty * i.list_price)}</strong>
                  <button type="button" className="s-iconbtn" onClick={() => cart.setQty(i.id, 0)} aria-label={`Quitar ${i.name}`}><Ico name="trash" size={18} /></button>
                </div>
              </li>
            ))}
          </ul>
          <div className="s-cart-total">
            <span>Subtotal</span>
            <strong>{pesos(cart.total)}</strong>
          </div>
          <p className="s-note">El envío se calcula según tu zona en el próximo paso. {config?.store?.dispatchNote}</p>
          <button type="button" className="s-btn s-btn-block" disabled title="Se habilita en la próxima etapa">Finalizar compra (próximamente)</button>
          <div className="s-center"><Link to="/productos">Seguir comprando</Link></div>
        </>
      )}
    </section>
  );
}

export function Contact() {
  const { config } = useStore();
  const s = config?.store ?? {};
  const c = s.contact ?? {};
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  useTitle('Contacto');
  const wa = waLink(s.whatsapp);
  const send = (e) => {
    e.preventDefault();
    window.open(waLink(s.whatsapp, `Hola! Soy ${name}. ${msg}`), '_blank', 'noopener');
  };
  return (
    <section className="s-section s-wrap s-narrow">
      <h1 className="s-page-title">Contacto</h1>
      <p>¿Tenés una consulta sobre un producto, envíos o compras por mayor? Escribinos.</p>
      <div className="s-contact">
        <ul className="s-contact-list">
          {wa && <li><WhatsAppIcon size={22} /><a href={wa} target="_blank" rel="noopener noreferrer">WhatsApp</a></li>}
          {c.phone && <li><Ico name="phone" /><a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}>{c.phone}</a></li>}
          {c.email && <li><Ico name="mail" /><a href={`mailto:${c.email}`}>{c.email}</a></li>}
          {(c.address || c.city) && <li><Ico name="pin" /><span>{[c.address, c.city].filter(Boolean).join(', ')}</span></li>}
          {c.hours && <li><Ico name="clock" /><span>{c.hours}</span></li>}
        </ul>
        {wa && (
          <form className="s-contact-form" onSubmit={send}>
            <label htmlFor="c-name">Tu nombre</label>
            <input id="c-name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
            <label htmlFor="c-msg">Tu consulta</label>
            <textarea id="c-msg" rows={4} value={msg} onChange={(e) => setMsg(e.target.value)} required />
            <button className="s-btn s-btn-block"><WhatsAppIcon size={18} /> Enviar por WhatsApp</button>
          </form>
        )}
      </div>
    </section>
  );
}

export function NotFound() {
  useTitle('Página no encontrada');
  return (
    <section className="s-section s-wrap s-empty">
      <h1 className="s-page-title">No encontramos esta página</h1>
      <Link to="/" className="s-btn">Volver al inicio</Link>
    </section>
  );
}
