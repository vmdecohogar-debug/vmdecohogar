import { useState } from 'react';
import { api } from '../../api.js';
import { fecha, pesos } from '../../format.js';
import { Badge, Notice, useAction, useApi } from '../../components/ui.jsx';
import { resizeImage } from '../../components/image.js';

const STATUS = {
  pending: ['amarillo', 'En revisión'],
  approved: ['verde', 'Aprobado: te lo cambiamos en la próxima entrega'],
  resolved: ['verde', 'Resuelto'],
  rejected: ['rojo', 'No aprobado'],
};

function ClaimForm({ data, onDone, onCancel }) {
  const [itemId, setItemId] = useState(String(data.items[0]?.item_id ?? ''));
  const [qty, setQty] = useState(1);
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState(null);
  const { busy, msg, run, setMsg } = useAction();
  const item = data.items.find((i) => String(i.item_id) === itemId);

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setPhoto(await resizeImage(file));
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="card tint stack">
      <h3>Reportar una falla de fábrica</h3>
      <p className="muted small">Se aceptan fallas de fábrica, no roturas: todo se controla antes de salir. Tenés {data.windowDays} días desde que lo recibiste.</p>
      <Notice msg={msg} />
      <div>
        <label htmlFor="cl-item">Producto</label>
        <select id="cl-item" value={itemId} onChange={(e) => { setItemId(e.target.value); setQty(1); }}>
          {data.items.map((i) => <option key={i.item_id} value={i.item_id}>{i.product} · pedido #{i.order_id} (hasta el {fecha(i.claim_until)})</option>)}
        </select>
      </div>
      {item?.max_qty > 1 && (
        <div>
          <label htmlFor="cl-qty">Unidades con falla</label>
          <select id="cl-qty" value={qty} onChange={(e) => setQty(Number(e.target.value))}>
            {Array.from({ length: item.max_qty }, (_, k) => k + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      )}
      <div><label htmlFor="cl-desc">¿Qué falla tiene?</label><textarea id="cl-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej.: la mecha está suelta, el esmalte vino con burbujas" /></div>
      <div className="photo-field">
        {photo && <img className="product-img" src={photo} alt="Foto de la falla" />}
        <label className="btn secondary small" style={{ display: 'inline-block', width: 'auto', marginBottom: 0 }}>
          {photo ? 'Cambiar foto' : 'Sacar o elegir foto'}
          <input type="file" accept="image/*" capture="environment" onChange={pickPhoto} hidden />
        </label>
      </div>
      <div className="row">
        <button className="btn" disabled={busy || !item || !photo || !description.trim()} onClick={() => run(() => api('/seller/claims', {
          method: 'POST', body: { itemId: item.item_id, qty, description, photo },
        }).then(onDone), 'Listo, lo revisamos y te avisamos por WhatsApp.')}>Enviar reclamo</button>
        <button type="button" className="btn secondary" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

export default function Claims() {
  const { data, reload } = useApi('/seller/claims');
  const [open, setOpen] = useState(false);
  const { msg, setMsg } = useAction();
  if (!data || (data.items.length === 0 && data.claims.length === 0)) return null;

  return (
    <div className="stack" style={{ marginBottom: 16 }}>
      <Notice msg={msg} />
      {open
        ? <ClaimForm data={data} onCancel={() => setOpen(false)} onDone={() => { setOpen(false); setMsg({ type: 'ok', text: 'Listo, lo revisamos y te avisamos por WhatsApp.' }); reload(); }} />
        : data.items.length > 0 && <button className="btn secondary small" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>¿Te llegó algo con falla? Reportalo</button>}
      {data.claims.length > 0 && (
        <div className="card">
          <h3>Mis reclamos</h3>
          <ul className="list">
            {data.claims.map((c) => (
              <li key={c.id}>
                <div className="row between">
                  <span>{c.qty} × {c.product}<div className="muted small">{fecha(c.created_at)} · {pesos(c.amount)}</div></span>
                  <Badge tone={STATUS[c.status][0]}>{c.status === 'resolved' && c.resolution === 'credit' ? 'Te lo descontamos' : STATUS[c.status][1]}</Badge>
                </div>
                {c.status === 'rejected' && c.admin_note && <div className="small">Motivo: {c.admin_note}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
