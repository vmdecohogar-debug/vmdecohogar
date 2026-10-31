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
  const { busy, msg, run, setMsg } = useAction();
  if (!data) return <Loading error={error} />;
  const done = (text) => { setMode(null); setMsg({ type: 'ok', text }); reload(); };
  return (
    <div>
      <h1>Envíos y pagos</h1>
      <div className="row between" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Zonas de envío</h2>
        <button className="btn small" onClick={() => setMode({ name: '', description: '', price: '', active: true })}>Nueva zona</button>
      </div>
      <p className="muted">El cliente elige su zona al finalizar la compra y se suma el costo de envío.</p>
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
