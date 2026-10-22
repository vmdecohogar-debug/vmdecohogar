import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, session } from './api.js';
import { Icon } from './components/ui.jsx';
import { Onboarding } from './components/Onboarding.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import PayPage from './pages/PayPage.jsx';
import SellerHome from './pages/seller/Home.jsx';
import Shop from './pages/seller/Shop.jsx';
import SellerOrders from './pages/seller/Orders.jsx';
import SellerPayments from './pages/seller/Payments.jsx';
import Referrals from './pages/seller/Referrals.jsx';
import Network from './pages/leader/Network.jsx';
import AdminHome from './pages/admin/Home.jsx';
import AdminSellers from './pages/admin/Sellers.jsx';
import AdminOrders from './pages/admin/Orders.jsx';
import AdminPayments from './pages/admin/Payments.jsx';
import AdminAlerts from './pages/admin/Alerts.jsx';
import AdminSettings from './pages/admin/Settings.jsx';
import AdminCatalog from './pages/admin/Catalog.jsx';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

const SELLER_NAV = [
  ['/', 'home', 'Inicio'],
  ['/comprar', 'bag', 'Comprar'],
  ['/pedidos', 'box', 'Pedidos'],
  ['/pagos', 'card', 'Pagos'],
  ['/referidas', 'users', 'Referidas'],
];
const ADMIN_NAV = [
  ['/', 'home', 'Inicio'],
  ['/admin/vendedoras', 'users', 'Vendedoras', (c) => c.sellers_pending],
  ['/admin/catalogo', 'list', 'Catálogo'],
  ['/admin/pedidos', 'box', 'Pedidos', (c) => c.orders_to_deliver + c.kit_changes],
  ['/admin/pagos', 'card', 'Pagos', (c) => c.payments_to_confirm],
  ['/admin/alertas', 'bell', 'Alertas', (c) => c.admin_alerts],
  ['/admin/ajustes', 'gear', 'Ajustes'],
];

// Lo que espera a administración (pedidos para entregar, cambios de kit, pagos, altas). Se actualiza al navegar y cada minuto.
function useAdminCounts(enabled) {
  const [counts, setCounts] = useState(null);
  const { pathname } = useLocation();
  useEffect(() => {
    if (!enabled) return undefined;
    const load = () => api('/admin/counts').then(setCounts).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    window.addEventListener('admin-counts', load);
    return () => { clearInterval(t); window.removeEventListener('admin-counts', load); };
  }, [enabled, pathname]);
  return counts;
}

function Layout({ children }) {
  const { user, logout } = useAuth();
  const nav = user.role === 'admin' ? ADMIN_NAV : [...SELLER_NAV, ...(user.isLeader ? [['/red', 'star', 'Mi red']] : [])];
  const counts = useAdminCounts(user.role === 'admin');
  const navigate = useNavigate();
  // Bienvenida: sola la primera vez que entra una vendedora; después, desde "Cómo funciona" en Inicio.
  const [guide, setGuide] = useState(user.role === 'seller' && !user.onboarded ? 'first' : null);
  useEffect(() => {
    const open = () => setGuide('again');
    window.addEventListener('open-guide', open);
    return () => window.removeEventListener('open-guide', open);
  }, []);
  return (
    <div className="app">
      <header className="topbar">
        <img src="/logo.jpg" alt="VM Bazar y Deco" />
        <span className="brand">VM Bazar y Deco</span>
        <span className="who">
          {user.role === 'admin' ? 'Administración' : (
            <>
              {user.name}
              <br />
              {user.isLeader ? 'Jefa zonal' : 'Vendedora'}
            </>
          )}
        </span>
        <button className="btn secondary small" onClick={logout}>Salir</button>
      </header>
      <nav className="nav" aria-label="Secciones">
        {nav.map(([to, icon, label, count]) => {
          const n = counts && count ? count(counts) : 0;
          return (
            <NavLink key={to} to={to} end={to === '/'}>
              <span className="nav-icon"><Icon name={icon} />{n > 0 && <span className="nav-count" aria-label={`${n} pendientes`}>{n > 99 ? '99+' : n}</span>}</span>
              <span>{label}</span>
            </NavLink>
          );
        })}
      </nav>
      <main className="main">{children}</main>
      {guide && <Onboarding finishTo={guide === 'first' ? '/comprar' : null} onClose={(to) => { setGuide(null); if (to) navigate(to); }} />}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined);
  const navigate = useNavigate();

  const refresh = () => (session.token ? api('/me').then(setUser, () => setUser(null)) : Promise.resolve(setUser(null)));
  useEffect(() => { refresh(); }, []);

  const login = (token, u) => {
    session.set(token);
    setUser(u);
    return refresh().then(() => navigate('/'));
  };
  const logout = () => {
    session.clear();
    setUser(null);
    navigate('/ingresar');
  };

  if (user === undefined) return <p className="main muted">Cargando…</p>;

  return (
    <AuthCtx.Provider value={{ user, login, logout, refresh }}>
      <Routes>
        <Route path="/ingresar" element={user ? <Navigate to="/" /> : <Login />} />
        <Route path="/registro" element={user ? <Navigate to="/" /> : <Register />} />
        <Route path="/r/:code" element={user ? <Navigate to="/" /> : <Register />} />
        {!user && <Route path="*" element={<Navigate to="/ingresar" />} />}
        {user && (
          <Route
            path="*"
            element={
              <Layout>
                {user.role === 'admin' ? (
                  <Routes>
                    <Route path="/" element={<AdminHome />} />
                    <Route path="/admin/vendedoras" element={<AdminSellers />} />
                    <Route path="/admin/catalogo" element={<AdminCatalog />} />
                    <Route path="/admin/pedidos" element={<AdminOrders />} />
                    <Route path="/admin/pagos" element={<AdminPayments />} />
                    <Route path="/admin/alertas" element={<AdminAlerts />} />
                    <Route path="/admin/ajustes" element={<AdminSettings />} />
                    <Route path="/pagar/:id" element={<PayPage />} />
                    <Route path="*" element={<Navigate to="/" />} />
                  </Routes>
                ) : (
                  <Routes>
                    <Route path="/" element={<SellerHome />} />
                    <Route path="/comprar" element={<Shop />} />
                    <Route path="/pedidos" element={<SellerOrders />} />
                    <Route path="/pagos" element={<SellerPayments />} />
                    <Route path="/referidas" element={<Referrals />} />
                    <Route path="/pagar/:id" element={<PayPage />} />
                    {user.isLeader && <Route path="/red" element={<Network />} />}
                    <Route path="*" element={<Navigate to="/" />} />
                  </Routes>
                )}
              </Layout>
            }
          />
        )}
      </Routes>
    </AuthCtx.Provider>
  );
}
