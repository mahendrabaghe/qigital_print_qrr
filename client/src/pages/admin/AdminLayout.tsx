import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  LayoutDashboard,
  LogOut,
  Menu,
  Printer as PrinterIcon,
  QrCode,
  Settings,
  ShoppingCart,
  X,
} from 'lucide-react';
import { http, clearAdminToken } from '../../services/api';
import { disconnectSocket } from '../../services/socket';

export default function AdminLayout() {
  const navigate = useNavigate();
  const [shopName, setShopName] = useState('Print Shop');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    http
      .get('/api/auth/me')
      .then((res) => setShopName(res.data.shop?.name ?? 'Print Shop'))
      .catch(() => navigate('/admin/login', { replace: true }));
  }, [navigate]);

  const logout = () => {
    clearAdminToken();
    disconnectSocket();
    navigate('/admin/login', { replace: true });
  };

  const nav = [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/requests', label: 'Requests', icon: ShoppingCart, end: false },
    { to: '/admin/queue', label: 'Print queue', icon: PrinterIcon, end: false },
    { to: '/admin/analytics', label: 'Analytics', icon: BarChart3, end: false },
    { to: '/admin/printers', label: 'Printers', icon: PrinterIcon, end: false },
    { to: '/admin/qr', label: 'QR codes', icon: QrCode, end: false },
    { to: '/admin/settings', label: 'Settings', icon: Settings, end: false },
  ];

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex flex-col gap-1">
      {nav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
              isActive ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`
          }
        >
          <item.icon className="h-[18px] w-[18px]" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh bg-slate-100">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <button type="button" onClick={() => setMenuOpen(true)} aria-label="Menu" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
          <Menu className="h-5 w-5" />
        </button>
        <span className="font-extrabold text-slate-800">{shopName}</span>
        <button type="button" onClick={logout} aria-label="Logout" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-extrabold text-slate-800">{shopName}</span>
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavLinks onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-slate-200 bg-white p-4 lg:flex">
          <div className="mb-6 px-2">
            <p className="text-lg font-extrabold text-slate-800">{shopName}</p>
            <p className="text-xs font-medium text-slate-400">Admin console</p>
          </div>
          <NavLinks />
          <div className="mt-auto">
            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
            >
              <LogOut className="h-[18px] w-[18px]" />
              Sign out
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
