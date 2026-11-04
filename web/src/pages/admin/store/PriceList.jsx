import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loading, useApi } from '../../../components/ui.jsx';
import { pesos } from '../../../format.js';
import { groupPriceList, priceListCsv } from '../../../priceList.js';

// Lista de precios mayorista siempre al día, sacada de los productos cargados.
// Se descarga como PDF (con el "Guardar como PDF" del navegador) o como Excel.
export default function PriceList() {
  const { data, error } = useApi('/admin/store/products');
  const { data: config } = useApi('/store/config');
  const [includeList, setIncludeList] = useState(true);
  const groups = useMemo(() => (data ? groupPriceList(data.products, data.categories) : []), [data]);

  if (!data) return <Loading error={error} />;
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const today = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
  const fileDate = new Date().toISOString().slice(0, 10);
  const minOrder = config?.store?.wholesaleMinOrder;

  const downloadExcel = () => {
    const blob = new Blob([priceListCsv(groups, { includeList })], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: `lista-precios-mayorista-${fileDate}.csv` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadPdf = () => {
    const prev = document.title;
    document.title = `Lista de precios mayorista VM Bazar y Deco ${fileDate}`;
    window.print();
    document.title = prev;
  };

  return (
    <div className={`price-list${includeList ? '' : ' no-list'}`}>
      <div className="no-print">
        <p className="muted small"><Link to="/admin/productos">← Productos</Link></p>
        <h1 style={{ marginTop: 4 }}>Lista de precios</h1>
        <p className="muted">Sale de los productos visibles en la tienda, con los precios y descuentos de hoy. Los pausados no aparecen.</p>
        <div className="row" style={{ marginBottom: 8 }}>
          <button className="btn" onClick={downloadPdf}>Descargar PDF</button>
          <button className="btn secondary" onClick={downloadExcel}>Descargar Excel</button>
        </div>
        <label className="check"><input id="pl-list" type="checkbox" checked={includeList} onChange={(e) => setIncludeList(e.target.checked)} /> Mostrar también el precio de lista</label>
        <p className="muted small">Para el PDF se abre la ventana de imprimir: elegí <strong>Guardar como PDF</strong> como destino.</p>
      </div>

      <div className="card pl-sheet">
        <div className="pl-head">
          <img src="/logo.png" alt="" width="64" height="64" />
          <div>
            <div className="pl-eyebrow">Lista de precios mayorista · {today}</div>
            <div className="pl-title">VM Bazar y Deco</div>
            <div className="muted small">
              {total} productos{minOrder > 0 && <> · Compra mínima {pesos(minOrder)}</>} · Despacho en 1 a 3 días hábiles
            </div>
          </div>
        </div>

        {groups.map((g) => (
          <section key={g.name} className="pl-cat">
            <h2>{g.name} <span className="muted small">{g.items.length}</span></h2>
            <table>
              <thead><tr><th /><th>Producto</th><th className="num">Mayorista</th><th className="num pl-list">Lista</th></tr></thead>
              <tbody>
                {g.items.map((it) => (
                  <tr key={it.sku}>
                    <td className="pl-img">{it.image_url ? <img src={it.image_url} alt="" loading="lazy" /> : <span className="img-empty mini" />}</td>
                    <td>
                      <strong>{it.name}</strong>
                      <div className="muted small">
                        {it.sku}
                        {it.discount && <> · <span className="pl-off">{it.discount}% OFF</span></>}
                        {it.out_of_stock && <> · Sin stock</>}
                      </div>
                    </td>
                    <td className="num pl-w">{pesos(it.wholesale)}</td>
                    <td className="num pl-list muted">{pesos(it.list)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}

        <p className="muted small pl-foot">Precios en pesos argentinos. Pueden cambiar sin aviso: vale el precio de la tienda al confirmar el pedido. Para comprar al precio mayorista necesitás tu cuenta de cliente mayorista.</p>
      </div>
    </div>
  );
}
