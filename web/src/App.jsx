import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { api, session } from './api.js';
import { Icon } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import StoreHome from './pages/admin/store/StoreHome.jsx';
import StoreProducts from './pages/admin/store/Products.jsx';
import StoreCategories from './pages/admin/store/Categories.jsx';
import StoreBanners from './pages/admin/store/Banners.jsx';
import Appearance from './pages/admin/store/Appearance.jsx';
import StoreSettings from './pages/admin/store/StoreSettings.jsx';
import { StoreProvider } from './store/StoreContext.jsx';
import StoreLayout from './store/StoreLayout.jsx';
import { Cart, Contact, Home, NotFound, Product, Products } from './store/pages.jsx';
import './store/store.css';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

const ADMIN_NAV = [
  ['/admin', 'home', 'Inicio'],
  ['/admin/productos', 'bag', 'Productos'],
  ['/admin/categorias', 'list', 'Categorías'],
  ['/admin/banners', 'star', 'Banners'],
  ['/admin/apariencia', 'brush', 'Apariencia'],
  ['/admin/tienda', 'gear', 'Tienda'],
];

function AdminLayout({ children }) {
  const { logout } = useAuth();
  return (
    <div className="app">
      <header className="topbar">
        <img src="/logo.jpg" alt="VM Bazar y Deco" />
        <span className="brand">VM Bazar y Deco</span>
        <span className="who">Administración</span>
        <a className="btn secondary small" href="/" target="_blank" rel="noopener noreferrer">Ver tienda</a>
        <button className="btn secondary small" onClick={logout}>Salir</button>
      </header>
      <nav className="nav" aria-label="Secciones">
        {ADMIN_NAV.map(([to, icon, label]) => (
          <NavLink key={to} to={to} end={to === '/admin'}>
            <span className="nav-icon"><Icon name={icon} /></span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}

function Admin() {
  const { user } = useAuth();
  if (user === undefined) return <p className="main muted">Cargando…</p>;
  if (!user) return <Navigate to="/ingresar" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return (
    <AdminLayout>
      <Routes>
        <Route index element={<StoreHome />} />
        <Route path="productos" element={<StoreProducts />} />
        <Route path="categorias" element={<StoreCategories />} />
        <Route path="banners" element={<StoreBanners />} />
        <Route path="apariencia" element={<Appearance />} />
        <Route path="tienda" element={<StoreSettings />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </AdminLayout>
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
    navigate(u.role === 'admin' ? '/admin' : '/');
    return refresh();
  };
  const logout = () => {
    session.clear();
    setUser(null);
    navigate('/');
  };

  return (
    <AuthCtx.Provider value={{ user, login, logout, refresh }}>
      <StoreProvider>
        <Routes>
          <Route path="/ingresar" element={user?.role === 'admin' ? <Navigate to="/admin" replace /> : <Login />} />
          <Route path="/admin/*" element={<Admin />} />
          <Route
            path="*"
            element={(
              <StoreLayout>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/productos" element={<Products />} />
                  <Route path="/categoria/:slug" element={<Products />} />
                  <Route path="/producto/:slug" element={<Product />} />
                  <Route path="/carrito" element={<Cart />} />
                  <Route path="/contacto" element={<Contact />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </StoreLayout>
            )}
          />
        </Routes>
      </StoreProvider>
    </AuthCtx.Provider>
  );
}
