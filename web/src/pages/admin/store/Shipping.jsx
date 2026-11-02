import { useEffect, useState } from 'react';
import { api } from '../../../api.js';
import { pesos, toCents } from '../../../format.js';
import { Badge, Loading, Notice, useAction, useApi } from '../../../components/ui.jsx';

function ZoneForm({ initial, onDone, onCancel }) {
  const [f, setF] = useState(initial);
  const { busy, msg, run } = useAction();
  const save = (e) => {
    e.preventDefault();
    run(async () => {
      await api('/admin/store/zones', { method: 'POST', body: { ...f, price: f.price === '' ? 0 : toCents(f.price) } });
      onDone(f.id ? 'Zona actualizada.' : 'Zona agregada.');
    });
  };
  return (
    <form className="card stack" onSubmit={save}>
      <h2>{f.id ? 'Editar zona' : 'Nueva zona'}</h2>
      <Notice msg={msg} />
      <div className="grid two">
        <div><label htmlFor="z-name">Nombre</label><input id="z-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required placeholder="Ej.: Zona sur" /></div>
        <div><label htmlFor="z-price">Costo de envío $ (0 = sin cargo)</label><input id="z-price" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></div>
      </div>
      <div><label htmlFor="z-desc">Localidades o aclaración</label><input id="z-desc" value={f.description ?? ''} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Ej.: Lanús, Avellaneda, Quilmes" /></div>
      <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Se ofrece en la tienda</label>
      <div className="row">
        <button className="btn" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="btn secondary" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}


const money = (c) => (c ? String(c / 100) : '0');

// Tarifa por distancia: base + $/km + margen, desde la dirección del local.
function Rates({ onMode }) {
  const { data, error } = useApi('/admin/store/shipping');
  const [f, setF] = useState(null);
  const [tryCp, setTryCp] = useState({ postalCode: '', locality: '', address: '', options: [], result: null });
  const { busy, msg, run } = useAction();
  const loc = useAction();
  useEffect(() => {
    if (!data) return;
    setF({ ...data, baseFare: money(data.baseFare), perKm: money(data.perKm), minFare: money(data.minFare), freeFrom: money(data.freeFrom), origin: { ...data.origin, lat: String(data.origin.lat), lon: String(data.origin.lon) } });
    onMode(data.mode);
  }, [data]);
  if (!f) return <Loading error={error} />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setO = (k) => (e) => setF({ ...f, origin: { ...f.origin, [k]: e.target.value } });
  const body = () => ({
    ...f, baseFare: toCents(f.baseFare || 0), perKm: toCents(f.perKm || 0), minFare: toCents(f.minFare || 0), freeFrom: toCents(f.freeFrom || 0),
    marginPct: Number(String(f.marginPct).replace(',', '.')), maxKm: Number(String(f.maxKm).replace(',', '.')), roadFactor: Number(String(f.roadFactor).replace(',', '.')),
    origin: { ...f.origin, lat: Number(String(f.origin.lat).replace(',', '.')), lon: Number(String(f.origin.lon).replace(',', '.')) },
  });
  const save = (e) => {
    e.preventDefault();
    run(() => api('/admin/store/shipping', { method: 'PUT', body: body() }).then((d) => { onMode(d.mode); return d; }), 'Tarifa de envío guardada.');
  };
  const locate = () => loc.run(async () => {
    const r = await api('/admin/store/shipping/locate', { method: 'POST', body: f.origin });
    setF((x) => ({ ...x, origin: { ...x.origin, lat: String(r.lat), lon: String(r.lon) } }));
    return r;
  }, 'Listo, ubicamos la dirección. Revisá el mapa y guardá.');
  // Ejemplo con la tarifa actual (antes de guardar no se usa en la tienda).
  const km = 10;
  const b = body();
  const example = Math.ceil(Math.max((b.baseFare + b.perKm * km) * (1 + (b.marginPct || 0) / 100), b.minFare) / 10000) * 10000;
  const lookCp = async (cp) => {
    setTryCp((t) => ({ ...t, postalCode: cp, result: null }));
    if (!/^\D?\d{4}/.test(cp.trim())) return;
    const r = await api(`/store/shipping/cp/${encodeURIComponent(cp.trim())}`).catch(() => ({ localities: [] }));
    setTryCp((t) => ({ ...t, options: r.localities, locality: r.localities.includes(t.locality) ? t.locality : r.localities[0] ?? '' }));
  };
  const tryIt = () => loc.run(async () => {
    const r = await api('/admin/store/shipping/try', { method: 'POST', body: tryCp });
    setTryCp((t) => ({ ...t, result: r }));
  });
  const lat = Number(String(f.origin.lat).replace(',', '.'));
  const lon = Number(String(f.origin.lon).replace(',', '.'));
  return (
    <form className="card stack" onSubmit={save}>
      <h2>Cómo se calcula el envío</h2>
      <Notice msg={msg} />
      <label className="check"><input type="radio" name="ship-mode" checked={f.mode === 'postal'} onChange={() => setF({ ...f, mode: 'postal' })} /> Por código postal: el cliente pone su código postal y la tienda calcula el costo según la distancia</label>
      <label className="check"><input type="radio" name="ship-mode" checked={f.mode === 'zones'} onChange={() => setF({ ...f, mode: 'zones' })} /> Por zonas fijas: el cliente elige una de las zonas de abajo</label>

      <h3>Desde dónde salen los envíos</h3>
      <div className="grid two">
        <div><label htmlFor="o-addr">Calle y número</label><input id="o-addr" value={f.origin.address} onChange={setO('address')} /></div>
        <div><label htmlFor="o-loc">Localidad</label><input id="o-loc" value={f.origin.locality} onChange={setO('locality')} /></div>
        <div><label htmlFor="o-cp">Código postal</label><input id="o-cp" inputMode="numeric" value={f.origin.postalCode} onChange={setO('postalCode')} /></div>
        <div className="row" style={{ alignItems: 'flex-end' }}><button type="button" className="btn secondary" disabled={loc.busy} onClick={locate}>{loc.busy ? 'Buscando…' : 'Ubicar la dirección'}</button></div>
        <div><label htmlFor="o-lat">Latitud</label><input id="o-lat" value={f.origin.lat} onChange={setO('lat')} /></div>
        <div><label htmlFor="o-lon">Longitud</label><input id="o-lon" value={f.origin.lon} onChange={setO('lon')} /></div>
      </div>
      <Notice msg={loc.msg} />
      <p className="muted small">
        Si la ubicación no queda justa, en Google Maps tocá el local, copiá los dos números (por ejemplo -34.65, -58.79) y pegalos en latitud y longitud.{' '}
        {Number.isFinite(lat) && Number.isFinite(lon) && <a href={`https://www.google.com/maps?q=${lat},${lon}`} target="_blank" rel="noreferrer">Ver en el mapa</a>}
      </p>

      <h3>Tarifa (referencia: Uber Moto / DiDi Moto)</h3>
      <div className="grid two">
        <div><label htmlFor="r-base">Tarifa por uso $</label><input id="r-base" inputMode="decimal" value={f.baseFare} onChange={set('baseFare')} /></div>
        <div><label htmlFor="r-km">Precio por km $</label><input id="r-km" inputMode="decimal" value={f.perKm} onChange={set('perKm')} /></div>
        <div><label htmlFor="r-margin">Margen de seguridad %</label><input id="r-margin" inputMode="decimal" value={f.marginPct} onChange={set('marginPct')} /></div>
        <div><label htmlFor="r-min">Envío mínimo $</label><input id="r-min" inputMode="decimal" value={f.minFare} onChange={set('minFare')} /></div>
        <div><label htmlFor="r-max">Distancia máxima (km)</label><input id="r-max" inputMode="decimal" value={f.maxKm} onChange={set('maxKm')} /></div>
        <div><label htmlFor="r-free">Envío gratis desde $ (0 = nunca)</label><input id="r-free" inputMode="decimal" value={f.freeFrom} onChange={set('freeFrom')} /></div>
        <div><label htmlFor="r-road">Factor de recorrido</label><input id="r-road" inputMode="decimal" value={f.roadFactor} onChange={set('roadFactor')} /></div>
      </div>
      <p className="muted small">
        Costo = (tarifa por uso + precio por km × km) + margen, redondeado hacia arriba a $100. Los km se miden en línea recta y se multiplican por el factor de recorrido (1,3 = las calles dan un 30% más de vuelta).
        Ejemplo a {km} km: <strong>{pesos(example)}</strong>.
      </p>
      <button className="btn" disabled={busy} style={{ width: 'auto' }}>{busy ? 'Guardando…' : 'Guardar tarifa'}</button>

      <h3>Probar un código postal</h3>
      <p className="muted small">Usa la tarifa guardada.</p>
      <div className="grid two">
        <div><label htmlFor="t-cp">Código postal</label><input id="t-cp" value={tryCp.postalCode} onChange={(e) => lookCp(e.target.value)} placeholder="1744" /></div>
        <div>
          <label htmlFor="t-loc">Localidad</label>
          <select id="t-loc" value={tryCp.locality} onChange={(e) => setTryCp({ ...tryCp, locality: e.target.value, result: null })}>
            {tryCp.options.map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div><label htmlFor="t-addr">Calle y número (opcional)</label><input id="t-addr" value={tryCp.address} onChange={(e) => setTryCp({ ...tryCp, address: e.target.value, result: null })} /></div>
        <div className="row" style={{ alignItems: 'flex-end' }}><button type="button" className="btn secondary" disabled={loc.busy || !tryCp.locality} onClick={tryIt}>Calcular</button></div>
      </div>
      {tryCp.result && (
        <p><strong>{pesos(tryCp.result.price)}</strong> · {String(tryCp.result.km).replace('.', ',')} km · ubicado por {PRECISION[tryCp.result.precision]}</p>
      )}
    </form>
  );
}

export const PRECISION = { direccion: 'la dirección exacta', localidad: 'el centro de la localidad', codigo: 'el código postal (aproximado)' };

function Payments() {
  const { data, error } = useApi('/admin/store/checkout');
  const [c, setC] = useState(null);
  const { busy, msg, run } = useAction();
  useEffect(() => { if (data) setC(data); }, [data]);
  if (!c) return <Loading error={error} />;
  const setT = (k) => (e) => setC({ ...c, transferInfo: { ...c.transferInfo, [k]: e.target.value } });
  const save = (e) => {
    e.preventDefault();
    run(() => api('/admin/store/checkout', { method: 'PUT', body: c }).then(setC), 'Medios de pago guardados.');
  };
  return (
    <form className="card stack" onSubmit={save}>
      <h2>Medios de pago</h2>
      <Notice msg={msg} />
      <label className="check"><input type="checkbox" checked={c.mercadopago} onChange={(e) => setC({ ...c, mercadopago: e.target.checked })} /> Mercado Pago (tarjetas y dinero en cuenta)</label>
      {c.mercadopago && !c.mpConfigured && (
        <div className="notice warn">Falta conectar tu cuenta de Mercado Pago (la clave MP_ACCESS_TOKEN en el servidor). Hasta entonces la tienda solo ofrece transferencia. Te lo explico en la guía para publicar.</div>
      )}
      <label className="check"><input type="checkbox" checked={c.transfer} onChange={(e) => setC({ ...c, transfer: e.target.checked })} /> Transferencia</label>
      {c.transfer && (
        <div className="grid two">
          <div><label htmlFor="t-alias">Alias</label><input id="t-alias" value={c.transferInfo.alias ?? ''} onChange={setT('alias')} /></div>
          <div><label htmlFor="t-cbu">CBU / CVU</label><input id="t-cbu" inputMode="numeric" value={c.transferInfo.cbu ?? ''} onChange={setT('cbu')} /></div>
          <div><label htmlFor="t-holder">Titular</label><input id="t-holder" value={c.transferInfo.holder ?? ''} onChange={setT('holder')} /></div>
          <div><label htmlFor="t-bank">Banco o billetera</label><input id="t-bank" value={c.transferInfo.bank ?? ''} onChange={setT('bank')} /></div>
        </div>
      )}
      <div>
        <label htmlFor="t-msg">Mensaje de WhatsApp al enviar el comprobante</label>
        <input id="t-msg" value={c.whatsappOrderMessage ?? ''} onChange={(e) => setC({ ...c, whatsappOrderMessage: e.target.value })} />
        <p className="muted small">{'{pedido}'} se reemplaza por el número de pedido. El detalle de lo que compró no va en el mensaje: lo ves en el panel.</p>
      </div>
      <button className="btn" disabled={busy} style={{ width: 'auto' }}>{busy ? 'Guardando…' : 'Guardar medios de pago'}</button>
    </form>
  );
}

export default function Shipping() {
  const { data, error, reload } = useApi('/admin/store/zones');
  const [mode, setMode] = useState(null);
  const [shipMode, setShipMode] = useState(null);
  const { busy, msg, run, setMsg } = useAction();
  if (!data) return <Loading error={error} />;
  const done = (text) => { setMode(null); setMsg({ type: 'ok', text }); reload(); };
  return (
    <div>
      <h1>Envíos y pagos</h1>
      <Rates onMode={setShipMode} />
      <div className="row between" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Zonas de envío</h2>
        <button className="btn small" onClick={() => setMode({ name: '', description: '', price: '', active: true })}>Nueva zona</button>
      </div>
      <p className="muted">{shipMode === 'zones' ? 'El cliente elige su zona al finalizar la compra y se suma el costo de envío.' : 'Ahora el envío se calcula por código postal, así que estas zonas no se muestran en la tienda. Quedan guardadas por si volvés a usarlas.'}</p>
      <Notice msg={msg} />
      {mode && <ZoneForm key={mode.id ?? 'new'} initial={mode} onDone={done} onCancel={() => setMode(null)} />}
      <ul className="card list">
        {data.map((z) => (
          <li key={z.id} className="row between">
            <div>
              <strong>{z.name}</strong> {!z.active && <Badge tone="rojo">Oculta</Badge>}
              {z.description && <div className="muted small">{z.description}</div>}
            </div>
            <div className="row">
              <strong>{z.price ? pesos(z.price) : 'Sin cargo'}</strong>
              <button className="btn secondary small" onClick={() => setMode({ ...z, price: String(z.price / 100) })}>Editar</button>
              <button className="btn secondary small" disabled={busy} onClick={() => window.confirm(`¿Borrar la zona "${z.name}"?`) && run(() => api(`/admin/store/zones/${z.id}`, { method: 'DELETE' }).then(reload), 'Zona borrada.')}>Borrar</button>
            </div>
          </li>
        ))}
        {data.length === 0 && <li className="muted">No hay zonas. Sin zonas no se puede finalizar la compra.</li>}
      </ul>
      <Payments />
    </div>
  );
}
