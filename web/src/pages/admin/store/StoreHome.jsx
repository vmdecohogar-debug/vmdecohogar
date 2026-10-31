import { Link } from 'react-router-dom';
import { Loading, Stat, useApi } from '../../../components/ui.jsx';

export default function StoreHome() {
  const { data, error } = useApi('/admin/store/counts');
  if (!data) return <Loading error={error} />;
  const todo = [
    data.without_photo > 0 && [`${data.without_photo} productos sin foto`, '/admin/productos'],
    data.uncategorized > 0 && [`${data.uncategorized} productos sin categoría`, '/admin/productos'],
    data.banners === 0 && ['Todavía no cargaste banners para el inicio', '/admin/banners'],
  ].filter(Boolean);
  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Inicio</h1>
        <a className="btn small" href="/" target="_blank" rel="noopener noreferrer">Ver la tienda</a>
      </div>
      <div className="grid four" style={{ marginBottom: 16 }}>
        <Stat label="Productos en la tienda" value={data.products} />
        <Stat label="Categorías" value={data.categories} />
        <Stat label="Banners activos" value={data.banners} />
        <Stat label="Sin foto" value={data.without_photo} />
      </div>
      {todo.length > 0 && (
        <div className="card">
          <h2>Para completar</h2>
          <ul className="list">
            {todo.map(([text, to]) => <li key={text}><Link to={to}>{text}</Link></li>)}
          </ul>
        </div>
      )}
      <div className="card tint">
        <h2>Próximas etapas</h2>
        <p className="muted">Compra con Mercado Pago o transferencia, envío por zona, cuentas mayoristas, y el panel de pedidos con la lista de compras y el total vendido.</p>
      </div>
    </div>
  );
}
