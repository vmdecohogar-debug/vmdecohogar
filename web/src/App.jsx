import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { api, session } from './api.js';
import { Icon } from './components/ui.jsx';
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
  ['/admin/vendedoras', 'users', 'Vendedoras'],
  ['/admin/catalogo', 'list', 'Catálogo'],
  ['/admin/pedidos', 'box', 'Pedidos'],
  ['/admin/pagos', 'card', 'Pagos'],
  ['/admin/alertas', 'bell', 'Alertas'],
  ['/admin/ajustes', 'gear', 'Ajustes'],
];

function Layout({ children }) {
  const { user, logout } = useAuth();
  const nav = user.role === 'admin' ? ADMIN_NAV : [...SELLER_NAV, ...(user.isLeader ? [['/red', 'star', 'Mi red']] : [])];
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
        {nav.map(([to, icon, label]) => (
          <NavLink key={to} to={to} end={to === '/'}>
            <Icon name={icon} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <main className="main">{children}</main>
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
