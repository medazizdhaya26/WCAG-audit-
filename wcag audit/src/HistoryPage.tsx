import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { History, ChevronRight, Loader2, LogIn } from 'lucide-react';
import { NavBar } from './NavBar';
import { isAuthenticated, login } from './keycloak';

const REPORT_SERVICE_URL = 'http://localhost:3001';

type SiteItem = {
  id: string;
  rootUrl: string;
  status: string;
  globalScore: number | null;
  pagesCompleted: number;
  pagesDiscovered: number;
  startedAt: string;
};

function scoreColor(s: number | null) {
  const v = s ?? 0;
  if (v >= 90) return '#16A34A';
  if (v >= 50) return '#F59E0B';
  return '#DC2626';
}

export function HistoryPage() {
  const navigate = useNavigate();
  const authed = isAuthenticated();
  const [items, setItems] = useState<SiteItem[]>([]);
  const [loading, setLoading] = useState(authed);

  useEffect(() => {
    if (!authed) return;
    axios
      .get<SiteItem[]>(`${REPORT_SERVICE_URL}/website-audits`)
      .then((r) => setItems(r.data))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [authed]);

  return (
    <div className="min-h-screen bg-[#F3F0E8] text-[#15241B] pt-16">
      <NavBar />
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-extrabold flex items-center gap-3">
            <History className="text-[#15241B]" /> Mon historique
          </h2>
          {authed && (
            <span className="text-sm font-medium bg-[#15241B] text-[#F3F0E8] px-3 py-1 rounded-full">
              {items.length} audit(s)
            </span>
          )}
        </div>

        {!authed ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-[#E3DFD3] border-dashed">
            <LogIn className="w-12 h-12 text-[#C9CFC9] mx-auto mb-4" />
            <p className="text-[#6B7A70] font-medium text-sm">Connecte-toi pour voir tes audits.</p>
            <button onClick={login} className="inline-block mt-4 px-5 py-2 rounded-full bg-black text-white text-sm font-semibold">
              Se connecter
            </button>
          </div>
        ) : loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[#15241B]" /></div>
        ) : (
          <div className="grid gap-4">
            {items.map((item) => (
              <div key={item.id} className="group bg-white p-5 rounded-2xl border border-[#E3DFD3] hover:shadow-md transition-all flex items-center gap-6">
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 font-black"
                  style={{ backgroundColor: `${scoreColor(item.globalScore)}22`, color: scoreColor(item.globalScore) }}
                >
                  {item.globalScore != null ? Math.round(item.globalScore) : '—'}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold truncate">{item.rootUrl}</h4>
                  <div className="flex items-center gap-4 mt-1 text-[11px] text-[#6B7A70]">
                    <span>{new Date(item.startedAt).toLocaleString()}</span>
                    <span>{item.pagesCompleted}/{item.pagesDiscovered} pages</span>
                    <span>{item.status}</span>
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/audit?audit=${item.id}`)}
                  className="px-3 py-2 rounded-lg bg-[#15241B] text-white text-xs font-bold hover:bg-black transition-colors flex items-center gap-1"
                >
                  Ouvrir <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            ))}

            {items.length === 0 && (
              <div className="text-center py-20 bg-white rounded-3xl border border-[#E3DFD3] border-dashed">
                <History className="w-12 h-12 text-[#C9CFC9] mx-auto mb-4" />
                <p className="text-[#6B7A70] font-medium text-sm">Aucun audit pour le moment.</p>
                <Link to="/audit" className="inline-block mt-4 px-5 py-2 rounded-full bg-black text-white text-sm font-semibold">
                  Lancer un audit
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
