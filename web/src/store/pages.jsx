import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.js';
import { pesos } from '../format.js';
import { useStore, waLink } from './StoreContext.jsx';
import { Carousel, CategoryMosaic, MinimumBar, Price, ProductGrid, ProductPhoto, SkeletonGrid, SkeletonLines } from './components.jsx';
import { Ico, WhatsAppIcon } from './icons.jsx';

// Los precios dependen de quién mira (público o mayorista): al ingresar o salir se vuelve a pedir.
export function useData(path) {
  const { user } = useAuth();
  const who = user?.id ?? 0;
  const [state, setState] = useState({ data: null, error: null });
  useEffect(() => {
    let live = true;
    setState((s) => ({ data: s.data, error: null }));
    api(path).then((data) => live && setState({ data, error: null }), (e) => live && setState({ data: null, error: e.message }));
    return () => { live = false; };
  }, [path, who]);
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

// Mientras carga se ve la forma de la página (banner, título, grilla o detalle) en vez de un "Cargando…".
export function Skeleton({ error, kind = 'list' }) {
  if (error) return <div className="s-wrap"><div className="notice error">{error}</div></div>;
  return (
    <div className="s-wrap s-section" aria-busy="true" aria-label="Cargando">
      {kind === 'home' && <div className="s-skel s-skel-banner" />}
      {kind === 'product' ? (
        <div className="s-detail">
          <div className="s-skel s-skel-detail-photo" />
          <div><div className="s-skel s-skel-title" /><SkeletonLines lines={5} /><div className="s-skel s-skel-btn" /></div>
        </div>
      ) : kind === 'box' ? (
        <div className="s-narrow"><div className="s-skel s-skel-title" /><SkeletonLines lines={6} /></div>
      ) : (
        <>
          {kind !== 'home' && <div className="s-skel s-skel-title" />}
          <div style={{ height: 16 }} />
          <SkeletonGrid count={8} />
        </>
      )}
    </div>
  );
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
  if (!data) return <Skeleton error={error} kind="home" />;
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
  if (!data && !items.length && /no encontrad/i.test(error ?? '')) return <NotFound />;
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
  if (!data && /no encontrad/i.test(error ?? '')) return <NotFound />;
  if (!data) return <Skeleton error={error} kind="product" />;
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
            {p.out_of_stock ? (
              <div className="s-soldout-note">Sin stock por ahora. Consultanos por WhatsApp cuándo vuelve.</div>
            ) : (
              <div className="s-buy">
                <div className="s-qty" aria-label="Cantidad">
                  <button type="button" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Quitar uno">−</button>
                  <span aria-live="polite">{qty}</span>
                  <button type="button" onClick={() => setQty(qty + 1)} aria-label="Agregar uno">+</button>
                </div>
                <button type="button" className="s-btn" onClick={() => cart.add(p, qty)}>Agregar al carrito</button>
              </div>
            )}
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
  const { cart } = useStore();
  const [quote, setQuote] = useState(null);
  const { user } = useAuth();
  useTitle('Carrito');
  const key = cart.items.map((i) => `${i.id}:${i.qty}`).join(',');
  useEffect(() => {
    if (!cart.items.length) { setQuote(null); return undefined; }
    let live = true;
    api('/store/quote', { method: 'POST', body: { items: cart.items.map((i) => ({ productId: i.id, qty: i.qty })) } })
      .then((q) => live && setQuote(q), () => {});
    return () => { live = false; };
  }, [key, user?.id]);
  const line = (id) => quote?.lines.find((l) => l.productId === id);
  const wholesale = quote?.priceType === 'wholesale';

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
          {wholesale && <p className="s-pill">Estás comprando con precio mayorista</p>}
          {quote?.errors?.length > 0 && <div className="notice warn">{quote.errors.join(' ')} Lo sacamos del total.</div>}
          <ul className="s-cart">
            {cart.items.map((i) => {
              const l = line(i.id);
              const unit = l?.unit_price ?? i.list_price;
              return (
                <li key={i.id} className={quote && !l ? 's-unavailable' : ''}>
                  <Link to={`/producto/${i.slug}`} className="s-cart-img"><ProductPhoto product={i} /></Link>
                  <div className="s-cart-info">
                    <Link to={`/producto/${i.slug}`} className="s-cart-name">{i.name}</Link>
                    <div className="s-cart-unit">{quote && !l ? 'Sin stock o no disponible: quitalo para seguir' : `${pesos(unit)} c/u`}</div>
                    <div className="s-qty small">
                      <button type="button" onClick={() => cart.setQty(i.id, i.qty - 1)} aria-label="Quitar uno">−</button>
                      <span>{i.qty}</span>
                      <button type="button" onClick={() => cart.setQty(i.id, i.qty + 1)} aria-label="Agregar uno">+</button>
                    </div>
                  </div>
                  <div className="s-cart-right">
                    <strong>{pesos(i.qty * unit)}</strong>
                    <button type="button" className="s-iconbtn" onClick={() => cart.setQty(i.id, 0)} aria-label={`Quitar ${i.name}`}><Ico name="trash" size={18} /></button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="s-cart-total">
            <span>Subtotal</span>
            <strong>{pesos(quote?.subtotal ?? cart.total)}</strong>
          </div>
          <MinimumBar minimum={quote?.minimum} />
          <p className="s-note">El envío se calcula con tu código postal en el próximo paso.</p>
          {quote?.minimum && !quote.minimum.reached
            ? <button type="button" className="s-btn s-btn-block" disabled>Finalizar compra</button>
            : <Link to="/finalizar" className="s-btn s-btn-block">Finalizar compra</Link>}
          {!user && <p className="s-note s-center-text">¿Comprás por mayor? <Link to="/mayoristas">Ingresá o pedí tu cuenta</Link> para ver precios mayoristas.</p>}
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
  const { config } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  useTitle('Página no encontrada');
  const cats = (config?.categories ?? []).filter((c) => c.product_count > 0).slice(0, 8);
  const search = (e) => {
    e.preventDefault();
    if (q.trim()) navigate(`/productos?q=${encodeURIComponent(q.trim())}`);
  };
  return (
    <section className="s-section s-wrap s-404">
      <div className="s-404-num" aria-hidden="true">4<span>0</span>4</div>
      <h1 className="s-page-title">Esta página no está en nuestras estanterías</h1>
      <p>Puede que el producto ya no esté o que el enlace tenga un error. Buscá lo que querías o mirá las categorías.</p>
      <form className="s-404-search" onSubmit={search} role="search">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar productos" aria-label="Buscar productos" />
        <button className="s-btn">Buscar</button>
      </form>
      {cats.length > 0 && (
        <div className="s-404-cats">
          {cats.map((c) => <Link key={c.id} to={`/categoria/${c.slug}`}>{c.icon} {c.name}</Link>)}
        </div>
      )}
      <div className="row" style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link to="/" className="s-btn">Volver al inicio</Link>
        <Link to="/productos" className="s-btn s-btn-ghost">Ver todos los productos</Link>
      </div>
    </section>
  );
}
