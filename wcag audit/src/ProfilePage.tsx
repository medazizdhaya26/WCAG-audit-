import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  Mail, Shield, Save, LogOut, Loader2, User, Calendar, Fingerprint,
  BarChart3, History as HistoryIcon, LayoutDashboard, CheckCircle2, ExternalLink,
} from 'lucide-react';
import { NavBar } from './NavBar';
import { isAuthenticated, login, logout, currentUser, isAdmin } from './keycloak';

import { USER_URL as USER_SERVICE_URL, REPORT_URL as REPORT_SERVICE_URL } from './config';

type Profile = {
  id: string;
  keycloakId: string;
  username: string;
  email: string;
  fullName: string;
  auditsCount: number;
  createdAt: string;
};

type SiteItem = { id: string; rootUrl: string; globalScore: number | null; status: string; startedAt: string };

function scoreColor(s: number | null) {
  const v = s ?? 0;
  if (v >= 90) return '#16A34A';
  if (v >= 50) return '#F59E0B';
  return '#DC2626';
}

export function ProfilePage() {
  const authed = isAuthenticated();
  const admin = isAdmin();
  const u = currentUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [recent, setRecent] = useState<SiteItem[]>([]);
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(authed);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authed) return;
    axios.get<Profile>(`${USER_SERVICE_URL}/api/users/me`)
      .then((r) => { setProfile(r.data); setFullName(r.data.fullName ?? ''); })
      .catch(() => setError("Impossible de charger le profil. Le userService (port 8100) est-il démarré ?"))
      .finally(() => setLoading(false));
    axios.get<SiteItem[]>(`${REPORT_SERVICE_URL}/website-audits`)
      .then((r) => setRecent(r.data.slice(0, 5)))
      .catch(() => {});
  }, [authed]);

  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      const r = await axios.put<Profile>(`${USER_SERVICE_URL}/api/users/me`, { fullName });
      setProfile(r.data); setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Échec de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-cream text-brand pt-16">
        <NavBar />
        <div className="max-w-2xl mx-auto px-6 py-20 text-center">
          <User className="w-14 h-14 mx-auto text-line mb-4" />
          <h1 className="text-2xl font-extrabold mb-2">Tu n'es pas connecté</h1>
          <p className="text-muted mb-6">Connecte-toi pour accéder à ton profil et ton historique.</p>
          <button onClick={login} className="px-6 py-2.5 bg-brand text-white rounded-xl font-bold hover:bg-black transition-colors">
            Se connecter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream text-brand pt-16">
      <NavBar />

      {/* ── Bannière profil ── */}
      <div className="bg-brand text-white">
        <div className="max-w-4xl mx-auto px-6 py-10 flex items-center gap-5">
          <div className="w-20 h-20 rounded-3xl bg-[#D9F95F] text-brand flex items-center justify-center text-3xl font-black shrink-0">
            {(u.username ?? '?').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl font-extrabold truncate">{u.name || u.username}</h1>
            <div className="text-sm text-[#B9C6BE] flex items-center gap-2 mt-1"><Mail className="w-4 h-4" /> {u.email ?? '—'}</div>
            <div className="mt-2 flex gap-1.5">
              {u.roles.filter((r: string) => ['USER', 'ADMIN'].includes(r)).map((r: string) => (
                <span key={r} className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#D9F95F] text-brand">{r}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Colonne gauche : infos + édition ── */}
        <div className="lg:col-span-2 space-y-6">
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand" /></div>
          ) : (
            <div className="bg-white rounded-2xl border border-line p-6 space-y-5">
              <h2 className="font-bold text-lg">Informations</h2>
              {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</div>}

              <div>
                <label className="text-xs font-bold text-muted uppercase tracking-widest">Nom complet</label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ton nom complet"
                  className="mt-1 w-full bg-cream border border-line rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-brand/20"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-muted"><User className="w-4 h-4" /> <b className="text-brand">{u.username}</b></div>
                <div className="flex items-center gap-2 text-muted"><Calendar className="w-4 h-4" /> Membre depuis {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : '—'}</div>
                <div className="flex items-center gap-2 text-muted col-span-full"><Fingerprint className="w-4 h-4" /> <span className="truncate text-[11px]">{profile?.keycloakId ?? u.username}</span></div>
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-brand text-white rounded-xl font-bold hover:bg-black transition-colors disabled:opacity-60">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                  {saved ? 'Enregistré' : 'Enregistrer'}
                </button>
                <button onClick={logout} className="flex items-center gap-2 px-5 py-2.5 border border-line text-red-600 rounded-xl font-bold hover:bg-red-50 transition-colors">
                  <LogOut className="w-4 h-4" /> Déconnexion
                </button>
              </div>
            </div>
          )}

          {/* ── Audits récents ── */}
          <div className="bg-white rounded-2xl border border-line p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg flex items-center gap-2"><HistoryIcon className="w-5 h-5" /> Mes audits récents</h2>
              <Link to="/history" className="text-sm font-semibold text-brand hover:underline">Tout voir</Link>
            </div>
            {recent.length === 0 ? (
              <p className="text-muted text-sm py-4 text-center">Aucun audit pour le moment.</p>
            ) : (
              <div className="space-y-2">
                {recent.map((s) => (
                  <Link key={s.id} to={`/audit?audit=${s.id}`} className="flex items-center gap-3 p-3 rounded-xl border border-line hover:bg-cream transition-colors">
                    <div className="w-11 h-11 rounded-lg flex items-center justify-center font-black text-sm shrink-0"
                      style={{ backgroundColor: `${scoreColor(s.globalScore)}22`, color: scoreColor(s.globalScore) }}>
                      {s.globalScore != null ? Math.round(s.globalScore) : '—'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate text-sm">{s.rootUrl}</div>
                      <div className="text-[11px] text-muted">{new Date(s.startedAt).toLocaleString()} • {s.status}</div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-muted" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Colonne droite : stats + liens ── */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-line p-6 text-center">
            <BarChart3 className="w-8 h-8 mx-auto text-brand mb-2" />
            <div className="text-4xl font-black text-brand">{profile?.auditsCount ?? 0}</div>
            <div className="text-xs text-muted uppercase tracking-widest font-bold mt-1">Audits lancés</div>
          </div>

          <div className="bg-white rounded-2xl border border-line p-6">
            <div className="text-xs font-bold text-muted uppercase flex items-center gap-1 mb-3"><Shield className="w-3 h-3" /> Accès rapide</div>
            <div className="space-y-2">
              <Link to="/audit" className="block px-4 py-2.5 rounded-xl bg-cream hover:bg-line/40 font-semibold text-sm transition-colors">🔍 Lancer un audit</Link>
              <Link to="/dev" className="block px-4 py-2.5 rounded-xl bg-cream hover:bg-line/40 font-semibold text-sm transition-colors">💻 Mode développeur</Link>
              <Link to="/history" className="block px-4 py-2.5 rounded-xl bg-cream hover:bg-line/40 font-semibold text-sm transition-colors">🕑 Mon historique</Link>
              {admin && (
                <Link to="/dashboard" className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-white font-semibold text-sm transition-colors">
                  <LayoutDashboard className="w-4 h-4" /> Dashboard admin
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
