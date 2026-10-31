import { useEffect, useState } from 'react';
import { api } from '../../../api.js';
import { Loading, Notice, useAction, useApi } from '../../../components/ui.jsx';

const PAYMENTS = [['mercadopago', 'Mercado Pago'], ['cards', 'Tarjetas de crédito y débito'], ['transfer', 'Transferencia'], ['cash', 'Efectivo']];

export default function StoreSettings() {
  const { data, error } = useApi('/admin/store/settings');
  const [s, setS] = useState(null);
  const [saved, setSaved] = useState(null);
  const { busy, msg, run, setMsg } = useAction();
  useEffect(() => { if (data) { setS(data.store); setSaved(data.store); } }, [data]);
  if (!s) return <Loading error={error} />;

  const set = (path) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    const [a, b] = path.split('.');
    setS(b ? { ...s, [a]: { ...s[a], [b]: v } } : { ...s, [a]: v });
  };
  const marginsChanged = saved && (Number(s.margins.list) !== Number(saved.margins.list) || Number(s.margins.wholesale) !== Number(saved.margins.wholesale) || Number(s.rounding) !== Number(saved.rounding));

  const save = (e) => {
    e.preventDefault();
    run(async () => {
      const r = await api('/admin/store/settings', { method: 'PUT', body: s });
      let extra = '';
      if (marginsChanged && window.confirm('Cambiaste los márgenes o el redondeo. ¿Recalculo ahora los precios de los productos “por margen”? (Los cargados a mano no se tocan.)')) {
        const { updated } = await api('/admin/store/products/recalc', { method: 'POST' });
        extra = ` Se recalcularon ${updated} productos.`;
      }
      setS(r);
      setSaved(r);
      window.dispatchEvent(new Event('store-config'));
      return extra;
    }).then((extra) => {
      if (extra === undefined) return;
      setMsg({ type: 'ok', text: `Guardado.${extra}` });
      window.scrollTo(0, 0);
    });
  };

  return (
    <form onSubmit={save}>
      <h1>Datos de la tienda</h1>
      <Notice msg={msg} />

      <section className="card stack">
        <h2>Precios</h2>
        <div className="grid three">
          <div><label htmlFor="m-list">Margen de lista (público) %</label><input id="m-list" inputMode="decimal" value={s.margins.list} onChange={set('margins.list')} /></div>
          <div><label htmlFor="m-whole">Margen mayorista %</label><input id="m-whole" inputMode="decimal" value={s.margins.wholesale} onChange={set('margins.wholesale')} /></div>
          <div><label htmlFor="m-round">Redondear a los $</label><input id="m-round" inputMode="numeric" value={s.rounding} onChange={set('rounding')} /></div>
        </div>
        <p className="muted small">Ejemplo: costo $1.000 → lista {`$${Math.ceil(1000 * (1 + s.margins.list / 100) / (s.rounding || 1)) * (s.rounding || 1)}`} y mayorista {`$${Math.ceil(1000 * (1 + s.margins.wholesale / 100) / (s.rounding || 1)) * (s.rounding || 1)}`}. Cada producto puede tener su propio margen o precio a mano.</p>
      </section>

      <section className="card stack">
        <h2>Marca y WhatsApp</h2>
        <div className="grid two">
          <div><label htmlFor="s-name">Nombre</label><input id="s-name" value={s.name} onChange={set('name')} /></div>
          <div><label htmlFor="s-tag">Frase de la marca</label><input id="s-tag" value={s.tagline ?? ''} onChange={set('tagline')} /></div>
        </div>
        <div className="grid two">
          <div><label htmlFor="s-wa">WhatsApp de la tienda</label><input id="s-wa" inputMode="tel" value={s.whatsapp ?? ''} onChange={set('whatsapp')} placeholder="11 2345 6789" /></div>
          <div><label htmlFor="s-wam">Mensaje del botón de WhatsApp</label><input id="s-wam" value={s.whatsappMessage ?? ''} onChange={set('whatsappMessage')} /></div>
        </div>
        <p className="muted small">Sin número, el botón flotante de WhatsApp no aparece.</p>
        <div><label htmlFor="s-dispatch">Aviso de envío (franja de arriba)</label><input id="s-dispatch" value={s.dispatchNote ?? ''} onChange={set('dispatchNote')} /></div>
        <div><label htmlFor="s-car">Segundos entre banners del carrusel</label><input id="s-car" inputMode="numeric" value={s.carouselSeconds} onChange={set('carouselSeconds')} style={{ maxWidth: 120 }} /></div>
      </section>

      <section className="card stack">
        <h2>Contactanos (pie de página y Contacto)</h2>
        <div className="grid two">
          <div><label htmlFor="c-phone">Teléfono</label><input id="c-phone" value={s.contact.phone ?? ''} onChange={set('contact.phone')} /></div>
          <div><label htmlFor="c-email">Email</label><input id="c-email" type="email" value={s.contact.email ?? ''} onChange={set('contact.email')} /></div>
          <div><label htmlFor="c-addr">Dirección</label><input id="c-addr" value={s.contact.address ?? ''} onChange={set('contact.address')} /></div>
          <div><label htmlFor="c-city">Localidad</label><input id="c-city" value={s.contact.city ?? ''} onChange={set('contact.city')} /></div>
        </div>
        <div><label htmlFor="c-hours">Horarios</label><input id="c-hours" value={s.contact.hours ?? ''} onChange={set('contact.hours')} placeholder="Lunes a viernes de 9 a 18" /></div>
      </section>

      <section className="card stack">
        <h2>Redes sociales</h2>
        <div className="grid three">
          <div><label htmlFor="r-ig">Instagram</label><input id="r-ig" value={s.social.instagram ?? ''} onChange={set('social.instagram')} placeholder="https://instagram.com/…" /></div>
          <div><label htmlFor="r-fb">Facebook</label><input id="r-fb" value={s.social.facebook ?? ''} onChange={set('social.facebook')} placeholder="https://facebook.com/…" /></div>
          <div><label htmlFor="r-tt">TikTok</label><input id="r-tt" value={s.social.tiktok ?? ''} onChange={set('social.tiktok')} placeholder="https://tiktok.com/@…" /></div>
        </div>
      </section>

      <section className="card stack">
        <h2>Medios de pago que se muestran</h2>
        {PAYMENTS.map(([k, label]) => (
          <label key={k} className="check"><input type="checkbox" checked={!!s.payments[k]} onChange={set(`payments.${k}`)} /> {label}</label>
        ))}
      </section>

      <section className="card stack">
        <h2>Google (SEO)</h2>
        <div><label htmlFor="seo-t">Título de la página de inicio ({(s.seo.title ?? '').length}/70)</label><input id="seo-t" maxLength={70} value={s.seo.title ?? ''} onChange={set('seo.title')} /></div>
        <div><label htmlFor="seo-d">Descripción para Google ({(s.seo.description ?? '').length}/170)</label><textarea id="seo-d" rows={3} maxLength={170} value={s.seo.description ?? ''} onChange={set('seo.description')} /></div>
        <p className="muted small">Cada producto y categoría ya sale con su propio título y descripción.</p>
      </section>

      <div className="savebar"><button className="btn" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button></div>
    </form>
  );
}
