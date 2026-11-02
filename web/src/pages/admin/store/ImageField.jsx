import { useState } from 'react';
import { api } from '../../../api.js';
import { resizeImage } from '../../../components/image.js';

// Subir una foto (se achica en el navegador) y devolver su dirección.
export function ImageField({ value, onChange, onError, max = 1200, label = 'foto', wide = false }) {
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await resizeImage(file, max);
      const { url } = await api('/admin/uploads', { method: 'POST', body: { dataUrl } });
      onChange(url);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`img-field ${wide ? 'wide' : ''}`}>
      {value ? <img src={value} alt="" /> : <div className="img-empty">Sin {label}</div>}
      <div className="row">
        <label className="btn secondary small" style={{ width: 'auto', marginBottom: 0 }}>
          {busy ? 'Subiendo…' : value ? `Cambiar ${label}` : `Subir ${label}`}
          <input type="file" accept="image/*" onChange={pick} hidden disabled={busy} />
        </label>
        {value && <button type="button" className="btn secondary small" onClick={() => onChange('')}>Quitar</button>}
      </div>
    </div>
  );
}

// Varias fotos de un producto. La primera es la principal (la que se ve en la tienda y en las tarjetas).
export function GalleryField({ value, onChange, onError, max = 1200, limit = 10 }) {
  const [busy, setBusy] = useState(0);
  const pick = async (e) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    if (!files.length) return;
    const room = limit - value.length;
    if (room <= 0) { onError?.(`Se pueden cargar hasta ${limit} fotos por producto.`); return; }
    if (files.length > room) onError?.(`Solo se suben ${room} de las ${files.length} fotos (máximo ${limit} por producto).`);
    const chosen = files.slice(0, room);
    setBusy(chosen.length);
    for (const file of chosen) {
      try {
        const dataUrl = await resizeImage(file, max);
        const { url } = await api('/admin/uploads', { method: 'POST', body: { dataUrl } });
        onChange((cur) => [...cur, url]);
      } catch (err) {
        onError?.(err.message);
      } finally {
        setBusy((n) => n - 1);
      }
    }
  };
  const move = (from, to) => onChange((cur) => {
    if (to < 0 || to >= cur.length) return cur;
    const next = [...cur];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    return next;
  });
  const remove = (k) => onChange((cur) => cur.filter((_, i) => i !== k));
  return (
    <div className="gallery-field">
      <div className="gallery-head">
        <strong>Fotos</strong>
        <span className="muted small">{value.length}/{limit} · la primera es la principal</span>
      </div>
      {value.length > 0 && (
        <ul className="gallery-grid">
          {value.map((url, k) => (
            <li key={url} className={k === 0 ? 'is-main' : ''}>
              <img src={url} alt={`Foto ${k + 1}`} />
              {k === 0 && <span className="gallery-tag">Principal</span>}
              <div className="gallery-actions">
                <button type="button" onClick={() => move(k, k - 1)} disabled={k === 0} aria-label="Mover antes" title="Mover antes">◀</button>
                {k > 0 && <button type="button" onClick={() => move(k, 0)} aria-label="Hacer principal" title="Hacer principal">★</button>}
                <button type="button" onClick={() => move(k, k + 1)} disabled={k === value.length - 1} aria-label="Mover después" title="Mover después">▶</button>
                <button type="button" className="danger" onClick={() => remove(k)} aria-label="Borrar foto" title="Borrar foto">✕</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {value.length === 0 && <div className="img-empty gallery-empty">Sin fotos</div>}
      {value.length < limit && (
        <label className="btn secondary small" style={{ width: 'auto', marginBottom: 0, alignSelf: 'flex-start' }}>
          {busy ? `Subiendo ${busy}…` : value.length ? 'Agregar fotos' : 'Subir fotos'}
          <input type="file" accept="image/*" multiple onChange={pick} hidden disabled={!!busy} />
        </label>
      )}
    </div>
  );
}
