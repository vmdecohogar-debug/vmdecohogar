import { Link } from 'react-router-dom';
import { Loading, Stat, useApi } from '../../../components/ui.jsx';

export default function StoreHome() {
  const { data, error } = useApi('/admin/store/counts');
  if (!data) return <Loading error={error} />;
  const todo = [
    data.new_orders > 0 && [`${data.new_orders} ${data.new_orders === 1 ? 'pedido nuevo' : 'pedidos nuevos'} para preparar`, '/admin/pedidos'],
    data.to_confirm > 0 && [`${data.to_confirm} ${data.to_confirm === 1 ? 'comprobante' : 'comprobantes'} de transferencia para revisar`, '/admin/pedidos'],
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
        <Stat label="Pedidos para preparar" value={data.new_orders} />
        <Stat label="Productos en la tienda" value={data.products} />
        <Stat label="Categorías" value={data.categories} />
        <Stat label="Banners activos" value={data.banners} />
      </div>
      {todo.length > 0 && (
        <div className="card">
          <h2>Pendientes</h2>
          <ul className="list">
            {todo.map(([text, to]) => <li key={text}><Link to={to}>{text}</Link></li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
