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
