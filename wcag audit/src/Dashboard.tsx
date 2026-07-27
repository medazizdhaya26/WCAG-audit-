import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { Globe, FileText, AlertTriangle, Gauge, ChevronRight, Loader2 } from 'lucide-react';

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const REPORT_SERVICE_URL = 'http://localhost:3001';

type DashboardStats = {
  totalSites: number;
  completedSites: number;
  totalPages: number;
  totalIssues: number;
  avgScore: number;
  severity: Record<string, number>;
  worstSites: { id: string; rootUrl: string; globalScore: number | null }[];
};

type SiteItem = {
  id: string;
  rootUrl: string;
  status: string;
  globalScore: number | null;
  pagesDiscovered: number;
  pagesCompleted: number;
  pagesFailed: number;
  startedAt: string;
};

function scoreColor(s: number | null) {
  const v = s ?? 0;
  if (v >= 90) return '#22c55e';
  if (v >= 50) return '#f59e0b';
  return '#ef4444';
}

export function Dashboard({ onOpenSite }: { onOpenSite: (id: string) => void }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [sites, setSites] = useState<SiteItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [s, l] = await Promise.all([
          axios.get<DashboardStats>(`${REPORT_SERVICE_URL}/dashboard/stats`),
          axios.get<SiteItem[]>(`${REPORT_SERVICE_URL}/website-audits`),
        ]);
        if (cancelled) return;
        setStats(s.data);
        setSites(l.data);
      } catch (e) {
        console.error('[Dashboard] load error', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-purple-300">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  const sev = stats?.severity ?? {};
  const doughnutData = {
    labels: ['Critical', 'Serious', 'Moderate', 'Minor', 'Unknown'],
    datasets: [
      {
        data: [sev.CRITICAL ?? 0, sev.SERIOUS ?? 0, sev.MODERATE ?? 0, sev.MINOR ?? 0, sev.UNKNOWN ?? 0],
        backgroundColor: ['#dc2626', '#ea580c', '#eab308', '#3b82f6', '#94a3b8'],
        borderColor: '#0a0a0a',
        borderWidth: 2,
      },
    ],
  };

  const barData = {
    labels: sites.slice(0, 8).map((s) => {
      try {
        return new URL(s.rootUrl).hostname.replace('www.', '');
      } catch {
        return s.rootUrl;
      }
    }),
    datasets: [
      {
        label: 'Score global',
        data: sites.slice(0, 8).map((s) => s.globalScore ?? 0),
        backgroundColor: sites.slice(0, 8).map((s) => scoreColor(s.globalScore)),
        borderRadius: 6,
      },
    ],
  };

  const chartText = { color: '#cbd5e1', font: { size: 11 } };

  const cards = [
    { label: 'Sites audités', value: stats?.totalSites ?? 0, Icon: Globe, color: 'text-purple-400' },
    { label: 'Pages analysées', value: stats?.totalPages ?? 0, Icon: FileText, color: 'text-blue-400' },
    { label: 'Erreurs totales', value: stats?.totalIssues ?? 0, Icon: AlertTriangle, color: 'text-red-400' },
    { label: 'Score moyen', value: stats?.avgScore ?? 0, Icon: Gauge, color: 'text-green-400' },
  ];

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a] text-white p-6 custom-scrollbar">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-3xl font-black tracking-tight">
          WEB4ALL <span className="text-purple-500">Dashboard</span>
        </h2>
        <p className="text-slate-400 text-sm mt-1">Vue globale de tous les sites audités</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map((c) => (
          <div key={c.label} className="bg-[#141414] border border-purple-900/40 rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <c.Icon className={`w-7 h-7 ${c.color}`} />
            </div>
            <div className="text-3xl font-black mt-3">{c.value}</div>
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-[#141414] border border-purple-900/40 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-slate-200 mb-4">Répartition des erreurs par sévérité</h3>
          <div className="h-64 flex items-center justify-center">
            <Doughnut
              data={doughnutData}
              options={{
                maintainAspectRatio: false,
                plugins: { legend: { position: 'right', labels: chartText } },
              }}
            />
          </div>
        </div>
        <div className="bg-[#141414] border border-purple-900/40 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-slate-200 mb-4">Score global par site</h3>
          <div className="h-64">
            <Bar
              data={barData}
              options={{
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  y: { beginAtZero: true, max: 100, ticks: chartText, grid: { color: '#1f1f1f' } },
                  x: { ticks: chartText, grid: { display: false } },
                },
              }}
            />
          </div>
        </div>
      </div>

      {/* Sites list */}
      <div className="bg-[#141414] border border-purple-900/40 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-purple-900/40">
          <h3 className="text-sm font-bold text-slate-200">Tous les sites ({sites.length})</h3>
        </div>
        <div className="divide-y divide-white/5">
          {sites.map((s) => (
            <button
              key={s.id}
              onClick={() => onOpenSite(s.id)}
              className="w-full flex items-center gap-4 px-5 py-4 hover:bg-purple-900/20 transition-colors text-left"
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-sm shrink-0"
                style={{ backgroundColor: `${scoreColor(s.globalScore)}22`, color: scoreColor(s.globalScore) }}
              >
                {s.globalScore != null ? Math.round(s.globalScore) : '—'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate text-slate-100">{s.rootUrl}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {s.pagesCompleted}/{s.pagesDiscovered} pages • {s.pagesFailed} échecs •{' '}
                  {new Date(s.startedAt).toLocaleDateString()}
                </div>
              </div>
              <span
                className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${
                  s.status === 'COMPLETED'
                    ? 'bg-green-500/15 text-green-400'
                    : s.status === 'FAILED'
                      ? 'bg-red-500/15 text-red-400'
                      : 'bg-purple-500/15 text-purple-300'
                }`}
              >
                {s.status}
              </span>
              <ChevronRight className="w-5 h-5 text-slate-600" />
            </button>
          ))}
          {sites.length === 0 && (
            <div className="px-5 py-12 text-center text-slate-500 text-sm">Aucun site audité pour l'instant.</div>
          )}
        </div>
      </div>
    </div>
  );
}
