import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { AssistantWidget } from './AssistantWidget';

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark">▦</span>
          <span>Product Costing</span>
        </Link>
        <nav className="topnav">
          <NavLink to="/" end>
            Products
          </NavLink>
          <NavLink to="/quotations">Quotations</NavLink>
        </nav>
        <div className="topbar-right">
          {user && (
            <span className="user-chip" title={user.email}>
              {user.name} · <span className="muted">{user.role}</span>
            </span>
          )}
          <button className="btn" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
      <AssistantWidget />
    </div>
  );
}
