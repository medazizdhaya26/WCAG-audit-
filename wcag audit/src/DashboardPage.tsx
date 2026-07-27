import { useNavigate } from 'react-router-dom';
import { ShieldAlert, LogIn } from 'lucide-react';
import { NavBar } from './NavBar';
import { Dashboard } from './Dashboard';
import { isAuthenticated, isAdmin, login } from './keycloak';

export function DashboardPage() {
  const navigate = useNavigate();
  const authed = isAuthenticated();
  const admin = isAdmin();

  // Dashboard global réservé aux administrateurs
  if (!authed || !admin) {
    return (
      <div className="min-h-screen flex flex-col pt-16 bg-[#F3F0E8] text-[#15241B]">
        <NavBar />
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center bg-white rounded-3xl border border-[#E3DFD3] p-12 max-w-md">
            <ShieldAlert className="w-14 h-14 text-[#E2542B] mx-auto mb-4" />
            <h2 className="text-2xl font-extrabold mb-2">Accès réservé aux administrateurs</h2>
            <p className="text-[#6B7A70] text-sm mb-6">
              Le tableau de bord global (tous les sites) est réservé au rôle <b>ADMIN</b>.
              {!authed && ' Connecte-toi avec un compte administrateur.'}
            </p>
            {!authed ? (
              <button onClick={login} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-black text-white text-sm font-semibold">
                <LogIn className="w-4 h-4" /> Se connecter
              </button>
            ) : (
              <button onClick={() => navigate('/history')} className="px-5 py-2.5 rounded-full bg-[#15241B] text-white text-sm font-semibold">
                Voir mon historique
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col pt-16 bg-[#0a0a0a]">
      <NavBar />
      <div className="flex-1 overflow-hidden">
        <Dashboard onOpenSite={(id) => navigate(`/audit?audit=${id}`)} />
      </div>
    </div>
  );
}
