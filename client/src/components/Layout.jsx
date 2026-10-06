import { NavLink, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../auth';

const NAV = {
  citizen: [['/', '➕', 'Report'], ['/mine', '📋', 'My reports'], ['/nearby', '🗺️', 'Nearby']],
  worker: [['/tasks', '🔧', 'My tasks']],
  admin: [['/admin', '📊', 'Overview'], ['/admin/complaints', '📋', 'Complaints'], ['/admin/analytics', '📈', 'Analytics'], ['/admin/workers', '👷', 'Workers']],
};

export default function Layout() {
  const { user, logout } = useAuth();
  const items = NAV[user.role];
  const link = ({ isActive }) => `px-3 py-2 rounded-md text-sm font-medium ${isActive ? 'bg-white/20' : 'hover:bg-white/10'}`;
  return (
    <div className="min-h-screen pb-20 md:pb-8">
      <header className="bg-brand text-white sticky top-0 z-20" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <Link to="/" className="font-display text-xl font-bold tracking-tight">MohallaFix</Link>
          <nav className="hidden md:flex gap-1" aria-label="Main">
            {items.map(([to, , label]) => <NavLink key={to} to={to} end className={link}>{label}</NavLink>)}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden sm:inline text-white/80">{user.name}</span>
            <button onClick={logout} className="underline underline-offset-2">Sign out</button>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-5"><Outlet /></main>
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 flex z-20" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-label="Main">
        {items.map(([to, icon, label]) => (
          <NavLink key={to} to={to} end className={({ isActive }) => `flex-1 py-2 text-center text-[11px] ${isActive ? 'text-brand font-semibold' : 'text-slate-500'}`}>
            <div className="text-lg leading-none mb-0.5">{icon}</div>{label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
