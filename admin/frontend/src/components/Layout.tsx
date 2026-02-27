import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Swords,
  Settings,
  Activity,
} from 'lucide-react';
import clsx from 'clsx';

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/players', icon: Users, label: 'Leaderboard' },
  { to: '/matches', icon: Swords, label: 'Matches' },
  { to: '/admin', icon: Settings, label: 'Admin' },
];

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[220px] flex-shrink-0 bg-slate-900/80 border-r border-slate-800/80 flex flex-col">
        {/* Brand */}
        <div className="px-5 py-6 border-b border-slate-800/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Activity className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white">WHR</h1>
              <p className="text-[11px] text-slate-500 font-medium tracking-wide uppercase">Admin Panel</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'bg-violet-500/15 text-violet-300 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60',
                )
              }
            >
              <Icon className="w-[18px] h-[18px]" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-800/60">
          <p className="text-[11px] text-slate-600 font-mono">
            Whole History Rating
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-slate-950">
        <div className="max-w-[1200px] mx-auto px-6 py-6 animate-fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
