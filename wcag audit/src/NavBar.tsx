import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { User, ChevronDown, LogOut, History as HistoryIcon, LayoutDashboard, UserCircle } from 'lucide-react';
import { isAuthenticated, login, logout, currentUser, isAdmin } from './keycloak';

export function NavBar() {
  const { pathname } = useLocation();
  const authed = isAuthenticated();
  const admin = isAdmin();
  const u = authed ? currentUser() : null;

  // Liens de nav : Historique seulement si connecté, Dashboard seulement si ADMIN.
  const LINKS = [
    { to: '/', label: 'Accueil' },
    { to: '/audit', label: 'Audit' },
    { to: '/dev', label: 'Mode dev' },
    { to: '/docs', label: 'API' },
    ...(authed ? [{ to: '/history', label: 'Historique' }] : []),
    ...(admin ? [{ to: '/dashboard', label: 'Dashboard' }] : []),
  ];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Ferme le menu au clic extérieur
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <nav className="fixed top-0 inset-x-0 z-[2000] bg-[#F3F0E8]/90 backdrop-blur-md border-b border-[#E3DFD3]">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="text-xl font-extrabold tracking-tight text-[#15241B]">WEB4ALL</Link>

        <div className="hidden md:flex items-center gap-7 text-sm font-medium">
          {LINKS.map((l) => {
            const active = l.to === '/' ? pathname === '/' : pathname.startsWith(l.to);
            return (
              <Link
                key={l.to}
                to={l.to}
                className={`transition-colors ${active ? 'text-[#15241B] font-semibold' : 'text-[#6B7A70] hover:text-[#15241B]'}`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          {authed ? (
            <div className="relative" ref={ref}>
              <button
                onClick={() => setOpen((o) => !o)}
                className="flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-full border border-[#E3DFD3] text-[#15241B] text-sm font-semibold hover:bg-white transition-colors"
              >
                <span className="w-7 h-7 rounded-full bg-[#15241B] text-white flex items-center justify-center text-xs font-bold">
                  {(u?.username ?? '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden sm:inline max-w-[120px] truncate">{u?.username}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>

              {open && (
                <div className="absolute right-0 mt-2 w-60 bg-white rounded-2xl border border-[#E3DFD3] shadow-xl overflow-hidden">
                  {/* En-tête menu */}
                  <div className="px-4 py-3 bg-[#15241B] text-white">
                    <div className="text-sm font-bold truncate">{u?.name || u?.username}</div>
                    <div className="text-[11px] text-[#B9C6BE] truncate">{u?.email ?? '—'}</div>
                    <div className="mt-1.5 flex gap-1">
                      {(u?.roles ?? []).filter((r: string) => ['USER', 'ADMIN'].includes(r)).map((r: string) => (
                        <span key={r} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#D9F95F] text-[#15241B]">{r}</span>
                      ))}
                    </div>
                  </div>

                  {/* Items */}
                  <div className="py-1.5">
                    <Link to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-[#15241B] hover:bg-[#F3F0E8] transition-colors">
                      <UserCircle className="w-4 h-4 text-[#6B7A70]" /> Mon profil
                    </Link>
                    <Link to="/history" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-[#15241B] hover:bg-[#F3F0E8] transition-colors">
                      <HistoryIcon className="w-4 h-4 text-[#6B7A70]" /> Mon historique
                    </Link>
                    {admin && (
                      <Link to="/dashboard" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-[#15241B] hover:bg-[#F3F0E8] transition-colors">
                        <LayoutDashboard className="w-4 h-4 text-[#6B7A70]" /> Dashboard admin
                      </Link>
                    )}
                    <div className="my-1.5 border-t border-[#E3DFD3]" />
                    <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors">
                      <LogOut className="w-4 h-4" /> Déconnexion
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={login}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#E3DFD3] text-[#15241B] text-sm font-semibold hover:bg-white transition-colors"
            >
              <User className="w-4 h-4" /> Connexion
            </button>
          )}
          <Link
            to="/audit"
            className="px-4 py-2 rounded-full bg-black text-white text-sm font-semibold hover:bg-[#15241B] transition-colors"
          >
            Lancer un audit
          </Link>
        </div>
      </div>
    </nav>
  );
}
