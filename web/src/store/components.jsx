import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { pesos } from '../format.js';
import { useStore } from './StoreContext.jsx';
import { Ico } from './icons.jsx';

export function Price({ product, big = false }) {
  return (
    <div className={`s-price ${big ? 'big' : ''}`}>
      <span className="s-price-list">{pesos(product.list_price)}</span>
      {product.wholesale_price != null && <span className="s-price-wholesale">Mayorista {pesos(product.wholesale_price)}</span>}
    </div>
  );
}

export function ProductPhoto({ product, className = '' }) {
  if (product.image_url) return <img className={`s-photo ${className}`} src={product.image_url} alt={product.name} loading="lazy" decoding="async" />;
  const initials = product.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return <div className={`s-photo s-photo-empty ${className}`} aria-hidden="true">{initials}</div>;
}

export function ProductCard({ product }) {
  const { cart } = useStore();
  const url = `/producto/${product.slug}`;
  return (
    <article className="s-card">
      <Link to={url} className="s-card-img" tabIndex={-1} aria-hidden="true"><ProductPhoto product={product} /></Link>
      <div className="s-card-body">
        {product.category_name && <div className="s-card-cat">{product.category_name}</div>}
        <h3 className="s-card-title"><Link to={url}>{product.name}</Link></h3>
        <Price product={product} />
        <button type="button" className="s-btn s-btn-sm" onClick={() => cart.add(product)}>Agregar al carrito</button>
      </div>
    </article>
  );
}

export function ProductGrid({ items }) {
  return <div className="s-grid">{items.map((p) => <ProductCard key={p.id} product={p} />)}</div>;
}

// Carrusel de banners: pasa solo cada `seconds`, se pausa al pasar el mouse o tocar, flechas y puntos discretos.
export function Carousel({ banners, seconds = 5 }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = banners.length;
  const go = useCallback((d) => setI((cur) => (cur + d + n) % n), [n]);
  const touch = useRef(null);
  const reduced = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, []);

  useEffect(() => {
    if (n < 2 || paused || reduced) return undefined;
    const t = setInterval(() => go(1), Math.max(2, seconds) * 1000);
    return () => clearInterval(t);
  }, [n, paused, seconds, go, reduced, i]);

  if (n === 0) return null;
  const onTouchStart = (e) => { touch.current = e.touches[0].clientX; setPaused(true); };
  const onTouchEnd = (e) => {
    const dx = e.changedTouches[0].clientX - (touch.current ?? 0);
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    touch.current = null;
    setPaused(false);
  };

  return (
    <section
      className="s-carousel" aria-roledescription="carrusel" aria-label="Ofertas y destacados"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
    >
      <div className="s-slides" style={{ transform: `translateX(-${i * 100}%)` }}>
        {banners.map((b, k) => {
          const content = (
            <>
              <img src={b.image_url} alt={b.title || `Banner ${k + 1}`} loading={k === 0 ? 'eager' : 'lazy'} fetchpriority={k === 0 ? 'high' : undefined} />
              {(b.title || b.subtitle) && (
                <div className="s-slide-text">
                  {b.title && <div className="s-slide-title">{b.title}</div>}
                  {b.subtitle && <div className="s-slide-sub">{b.subtitle}</div>}
                </div>
              )}
            </>
          );
          const props = { className: 's-slide', 'aria-hidden': k !== i, tabIndex: k === i ? 0 : -1 };
          if (!b.link) return <div key={b.id} {...props}>{content}</div>;
          if (b.link.startsWith('/')) return <Link key={b.id} {...props} to={b.link}>{content}</Link>;
          return <a key={b.id} {...props} href={b.link} target="_blank" rel="noopener noreferrer">{content}</a>;
        })}
      </div>
      {n > 1 && (
        <>
          <button type="button" className="s-arrow left" onClick={() => go(-1)} aria-label="Banner anterior"><Ico name="left" size={20} /></button>
          <button type="button" className="s-arrow right" onClick={() => go(1)} aria-label="Banner siguiente"><Ico name="right" size={20} /></button>
          <div className="s-dots">
            {banners.map((b, k) => (
              <button type="button" key={b.id} className={k === i ? 'on' : ''} onClick={() => setI(k)} aria-label={`Ir al banner ${k + 1}`} aria-current={k === i} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// Tres categorías al azar (una grande y dos chicas) que cambian en cada visita.
export function CategoryMosaic({ categories }) {
  const pick = useMemo(() => {
    const withProducts = categories.filter((c) => c.product_count > 0);
    const pool = [...(withProducts.length >= 3 ? withProducts : categories)];
    for (let k = pool.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [pool[k], pool[j]] = [pool[j], pool[k]];
    }
    return pool.slice(0, 3);
  }, [categories]);
  if (pick.length < 3) return null;
  return (
    <section className="s-section s-wrap" aria-labelledby="cats-title">
      <h2 id="cats-title" className="s-section-title">Explorá por categoría</h2>
      <div className="s-mosaic">
        {pick.map((c, k) => (
          <Link key={c.id} to={`/categoria/${c.slug}`} className={`s-tile ${k === 0 ? 'big' : ''}`}>
            {c.image_url ? <img src={c.image_url} alt="" loading="lazy" /> : <span className="s-tile-ico" aria-hidden="true">{c.icon}</span>}
            <span className="s-tile-label">
              <span className="s-tile-name">{c.name}</span>
              <span className="s-tile-cta">Ver productos <Ico name="right" size={16} /></span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
