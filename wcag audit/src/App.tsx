import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { AlertCircle, Loader2, Search, Trash2, ExternalLink } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { WavePanel, WaveOverlay, type WaveAnalysisData } from './WavePanel';
import { ChatBot } from './ChatBot';
import { isAuthenticated } from './keycloak';
import { useSearchParams } from 'react-router-dom';
import { NavBar } from './NavBar';
import { CRAWLER_URL, REPORT_URL, USER_URL } from './config';

const CRAWLER_SERVICE_URL = CRAWLER_URL;
const REPORT_SERVICE_URL = REPORT_URL;

type WebsiteAuditStatus =
  | 'QUEUED'
  | 'CRAWLING'
  | 'AUDITING'
  | 'GENERATING_REPORT'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';
type PageAuditStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';

type PageIssueDetail = {
  target: string[];
  html: string;
  location: { x: number; y: number; width: number; height: number } | null;
};

type PageIssue = {
  id: string;
  ruleId: string;
  impact: string;
  description: string;
  help: string;
  helpUrl?: string | null;
  nodes: number;
  details: PageIssueDetail[];
};

type PageListItem = {
  id: string;
  url: string;
  finalUrl?: string | null;
  depth: number;
  status: PageAuditStatus;
  lighthouseScore?: number | null;
  pageScore?: number | null;
  errorMessage?: string | null;
};

type WebsiteAudit = {
  id: string;
  rootUrl: string;
  normalizedRootUrl: string;
  status: WebsiteAuditStatus;
  maxDepth: number;
  maxPages: number;
  renderJs: boolean;
  startedAt: string;
  finishedAt?: string | null;
  pagesDiscovered: number;
  pagesQueued: number;
  pagesCompleted: number;
  pagesFailed: number;
  pagesSkipped: number;
  globalScore?: number | null;
  summary?: any;
  errorMessage?: string | null;
  pages: PageListItem[];
};

type PageAuditDetail = {
  id: string;
  url: string;
  finalUrl?: string | null;
  status: PageAuditStatus;
  depth: number;
  httpStatus?: number | null;
  title?: string | null;
  lighthouseScore?: number | null;
  pageScore?: number | null;
  errorMessage?: string | null;
  issues: PageIssue[];
  waveAnalysis?: WaveAnalysisData | null;
  screenshot?: null | { id: string; pageAuditId: string; mime: string; dataUrl?: string };
};

type AuditHistoryItem = {
  id: string;
  url: string;
  startedAt: string;
};

function safeNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getScoreColor(score: number) {
  if (score >= 90) return 'text-green-500';
  if (score >= 50) return 'text-orange-500';
  return 'text-red-500';
}

function getImpactBadge(impact: string) {
  const normalized = (impact ?? '').toLowerCase();
  const colors: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    serious: 'bg-orange-100 text-orange-700 border-orange-200',
    moderate: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    minor: 'bg-blue-100 text-blue-700 border-blue-200',
  };
  return colors[normalized] || 'bg-gray-100 text-gray-700 border-gray-200';
}

function likelyBlocksIframe(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes('youtube.com') || host.includes('google.com');
  } catch {
    return false;
  }
}

function readHistory(): AuditHistoryItem[] {
  try {
    const raw = localStorage.getItem('websiteAuditHistory');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x.id === 'string' && typeof x.url === 'string' && typeof x.startedAt === 'string')
      .slice(0, 50);
  } catch {
    return [];
  }
}

function writeHistory(items: AuditHistoryItem[]) {
  localStorage.setItem('websiteAuditHistory', JSON.stringify(items.slice(0, 50)));
}

function App() {
  const [, setActiveTab] = useState<'audit' | 'history' | 'dashboard'>('audit');
  const [searchParams] = useSearchParams();

  // Chargement automatique d'un audit via ?audit=<id> (depuis le Dashboard / l'Historique)
  useEffect(() => {
    const id = searchParams.get('audit');
    if (id) {
      setActiveTab('audit');
      setCurrentAuditId(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const [rootUrl, setRootUrl] = useState('');
  const [maxDepth, setMaxDepth] = useState(1);
  const [maxPages, setMaxPages] = useState(5);
  const [renderJs, setRenderJs] = useState(true);

  const [startLoading, setStartLoading] = useState(false);
  const [currentAuditId, setCurrentAuditId] = useState<string | null>(null);
  const [websiteAudit, setWebsiteAudit] = useState<WebsiteAudit | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [pageDetail, setPageDetail] = useState<PageAuditDetail | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [iframeFailed, setIframeFailed] = useState(false); // Default to LIVE view
  const [pageHeight, setPageHeight] = useState(2400); // hauteur réelle de la page (px) pour aligner les marqueurs
  const [rightView, setRightView] = useState<'wave' | 'issues'>('wave');
  const [waveVisible, setWaveVisible] = useState<Record<'errors' | 'contrast' | 'alerts' | 'features' | 'structure' | 'aria', boolean>>({
    errors: true,
    contrast: true,
    alerts: true,
    features: true,
    structure: true,
    aria: true,
  });

  const [history, setHistory] = useState<AuditHistoryItem[]>([]);

  useEffect(() => {
    setHistory(readHistory());
  }, []);

  // Récupère la hauteur réelle de la page depuis le screenshot (capturé en pleine page).
  // Sert à dimensionner l'iframe live + aligner les marqueurs en coordonnées document.
  useEffect(() => {
    const url = pageDetail?.screenshot?.dataUrl;
    if (!url) return;
    const img = new Image();
    img.onload = () => setPageHeight(img.naturalHeight || 2400);
    img.src = url;
  }, [pageDetail?.screenshot?.dataUrl]);

  const terminalStatus = useMemo(() => {
    return websiteAudit?.status === 'COMPLETED' || websiteAudit?.status === 'FAILED' || websiteAudit?.status === 'CANCELLED';
  }, [websiteAudit?.status]);

  useEffect(() => {
    if (!currentAuditId) return;

    console.log('[Frontend] Starting audit polling for ID:', currentAuditId);
    
    let cancelled = false;
    const loadOnce = async () => {
      try {
        console.log('[Frontend] Polling audit data...');
        const res = await axios.get<WebsiteAudit>(`${CRAWLER_SERVICE_URL}/website-audits/${currentAuditId}`);
        if (cancelled) return;
        console.log('[Frontend] Received audit data:', res.data);
        setWebsiteAudit(res.data);

        const firstCompleted = res.data.pages.find((p) => p.status === 'COMPLETED') ?? res.data.pages[0] ?? null;
        if (!selectedPageId && firstCompleted) {
          console.log('[Frontend] Auto-selecting first page:', firstCompleted.id);
          setSelectedPageId(firstCompleted.id);
        }
      } catch (error) {
        if (cancelled) return;
        console.error('[Frontend] Polling error:', error);
      }
    };

    loadOnce();

    const interval = setInterval(() => {
      if (cancelled) return;
      loadOnce();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentAuditId, selectedPageId]);

  useEffect(() => {
    if (!selectedPageId) return;

    console.log('[Frontend] Starting page detail polling for ID:', selectedPageId);
    
    let cancelled = false;
    const loadPage = async () => {
      try {
        console.log('[Frontend] Polling page detail...');
        const res = await axios.get<PageAuditDetail>(`${REPORT_SERVICE_URL}/page-audits/${selectedPageId}`, {
          params: { includeScreenshot: 'true' },
        });
        if (cancelled) return;
        console.log('[Frontend] Received page detail:', res.data);
        console.log('[Frontend] Number of issues:', res.data.issues.length);
        setPageDetail(res.data);
        setSelectedIssueId(null);

        const url = res.data.finalUrl || res.data.url;
        setIframeFailed(likelyBlocksIframe(url));
      } catch (error) {
        if (cancelled) return;
        console.error('[Frontend] Page detail error:', error);
      }
    };

    loadPage();

    const pageInterval = setInterval(() => {
      if (cancelled) return;
      loadPage();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(pageInterval);
    };
  }, [selectedPageId]);

  const startWebsiteAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rootUrl) return;

    console.log('[Frontend] Starting new audit for URL:', rootUrl);
    console.log('[Frontend] Params:', { maxDepth, maxPages, renderJs });
    
    setStartLoading(true);
    try {
      const res = await axios.post<{ id: string }>(`${CRAWLER_SERVICE_URL}/website-audits`, {
        url: rootUrl,
        maxDepth,
        maxPages,
        renderJs,
      });

      const id = res.data.id;
      console.log('[Frontend] Audit created with ID:', id);

      // Incrémente le compteur d'audits de l'utilisateur (userService) si connecté.
      if (isAuthenticated()) {
        axios.post(`${USER_URL}/api/users/me/audits/increment`).catch(() => {});
      }

      setCurrentAuditId(id);
      setActiveTab('audit');
      setWebsiteAudit(null);
      setSelectedPageId(null);
      setPageDetail(null);
      setSelectedIssueId(null);

      const nextHistory: AuditHistoryItem[] = [
        { id, url: rootUrl, startedAt: new Date().toISOString() },
        ...readHistory().filter((x) => x.id !== id),
      ].slice(0, 50);
      writeHistory(nextHistory);
      setHistory(nextHistory);
    } catch {
      alert('Failed to start website audit. Make sure crawler-service is running on port 3002.');
    } finally {
      setStartLoading(false);
    }
  };

  const removeHistoryItem = (id: string) => {
    const next = history.filter((x) => x.id !== id);
    writeHistory(next);
    setHistory(next);
  };

  const deleteAudit = async () => {
    if (!currentAuditId) return;
    if (!confirm('Are you sure you want to delete this audit and all associated data?')) {
      return;
    }

    try {
      await axios.delete(`${CRAWLER_SERVICE_URL}/website-audits/${currentAuditId}`);
      setCurrentAuditId(null);
      setWebsiteAudit(null);
      setSelectedPageId(null);
      setPageDetail(null);
      setSelectedIssueId(null);
      removeHistoryItem(currentAuditId);
    } catch {
      alert('Failed to delete audit');
    }
  };

  const cleanQueues = async () => {
    if (!confirm('Are you sure you want to clean all Redis/BullMQ queues?')) {
      return;
    }

    try {
      await axios.delete(`${CRAWLER_SERVICE_URL}/queue/clean`);
      alert('All queues cleaned successfully!');
    } catch {
      alert('Failed to clean queues');
    }
  };

  const pages = websiteAudit?.pages ?? [];

  const globalScore = safeNumber(websiteAudit?.globalScore);

  const pageScore = safeNumber(pageDetail?.pageScore ?? pageDetail?.lighthouseScore);

  const currentUrl = pageDetail ? (pageDetail.finalUrl || pageDetail.url) : (websiteAudit?.rootUrl ?? '');

  return (
    <div className="h-screen bg-cream text-brand font-sans flex flex-col overflow-hidden pt-16">
      <NavBar />

      <main className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {(
            <motion.div
              key="audit-tab"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full flex flex-col md:flex-row"
            >
              <div className={`flex flex-col border-r border-slate-200 bg-white transition-all duration-500 ease-in-out ${websiteAudit ? 'w-full md:w-[520px]' : 'w-full md:w-[520px]'}`}>
                <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                  {!currentAuditId && (
                    <div className="text-center space-y-4 py-10">
                      <h2 className="text-3xl font-extrabold text-slate-900 leading-tight">Website Accessibility Crawler</h2>
                      <p className="text-slate-500 text-sm max-w-sm mx-auto">
                        Crawl internal pages, audit each one, and generate a global accessibility score.
                      </p>
                    </div>
                  )}

                  <form onSubmit={startWebsiteAudit} className="space-y-3">
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-slate-400 group-focus-within:text-brand transition-colors" />
                      </div>
                      <input
                        type="url"
                        placeholder="https://your-website.com"
                        required
                        value={rootUrl}
                        onChange={(e) => setRootUrl(e.target.value)}
                        className="block w-full pl-9 pr-24 py-3 bg-slate-50 border border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-brand/10 focus:border-brand outline-none transition-all text-sm"
                      />
                      <button
                        type="submit"
                        disabled={startLoading}
                        className="absolute right-1.5 top-1.5 bottom-1.5 px-4 bg-brand text-white text-xs font-bold rounded-lg hover:bg-black disabled:bg-slate-300 transition-colors flex items-center gap-1.5"
                      >
                        {startLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Start'}
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Max Depth</div>
                        <input
                          type="number"
                          min={0}
                          max={10}
                          value={maxDepth}
                          onChange={(e) => setMaxDepth(Math.max(0, Math.min(10, Number(e.target.value))))}
                          className="mt-1 w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-brand/10 focus:border-brand"
                        />
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Max Pages</div>
                        <input
                          type="number"
                          min={1}
                          max={5000}
                          value={maxPages}
                          onChange={(e) => setMaxPages(Math.max(1, Math.min(5000, Number(e.target.value))))}
                          className="mt-1 w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-brand/10 focus:border-brand"
                        />
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest"></div>
                        <button
                          type="button"
                          onClick={() => setRenderJs((v) => !v)}
                          className={`mt-2 w-full px-2 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                            renderJs ? 'bg-brand text-white border-brand' : 'bg-white text-slate-600 border-slate-200'
                          }`}
                        >
                          {renderJs ? 'ON' : 'OFF'}
                        </button>
                      </div>
                    </div>
                  </form>

                  {!currentAuditId && (
                    <button
                      type="button"
                      onClick={cleanQueues}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl transition-colors text-xs font-bold"
                    >
                      <Trash2 className="w-4 h-4" />
                      Clean All Queues
                    </button>
                  )}

                  {currentAuditId && terminalStatus && (
                    <a
                      href={`${REPORT_SERVICE_URL}/website-audits/${currentAuditId}/report/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors text-xs font-bold"
                    >
                      📄 Exporter le rapport PDF
                    </a>
                  )}

                  {websiteAudit && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Website Score</div>
                          <div className={`text-5xl font-black ${getScoreColor(globalScore)}`}>
                            {!terminalStatus && globalScore === 0 ? (
                              <div className="flex items-center gap-2">
                                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                              </div>
                            ) : (
                              Math.round(globalScore)
                            )}
                          </div>
                        </div>
                        <div className="text-right flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</div>
                            <div className="flex items-center gap-2 justify-end">
                              {!terminalStatus && <Loader2 className="w-4 h-4 animate-spin text-brand" />}
                              <span className={`text-sm font-bold ${
                                websiteAudit.status === 'COMPLETED' ? 'text-green-600' :
                                websiteAudit.status === 'FAILED' ? 'text-red-600' :
                                'text-brand'
                              }`}>{websiteAudit.status}</span>
                            </div>
                            <div className="text-[10px] font-medium text-slate-400">{websiteAudit.id}</div>
                          </div>
                          <button
                            onClick={deleteAudit}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete Audit"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>

                      {!terminalStatus && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                            <span>Progress</span>
                            <span>{websiteAudit.pagesCompleted} / {websiteAudit.pagesQueued}</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                            <motion.div 
                              className="h-full bg-gradient-to-r from-brand-soft to-brand"
                              initial={{ width: 0 }}
                              animate={{ 
                                width: websiteAudit.pagesQueued > 0 
                                  ? `${Math.min(100, (websiteAudit.pagesCompleted / websiteAudit.pagesQueued) * 100)}%` 
                                  : '0%'
                              }}
                              transition={{ duration: 0.5 }}
                            />
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-5 gap-2">
                        <div className="text-center px-2 py-2 bg-slate-50 rounded-lg border border-slate-200">
                          <div className="text-sm font-bold text-slate-700">{websiteAudit.pagesDiscovered}</div>
                          <div className="text-[8px] font-black text-slate-400 uppercase">Found</div>
                        </div>
                        <div className="text-center px-2 py-2 bg-slate-50 rounded-lg border border-slate-200">
                          <div className="text-sm font-bold text-slate-700">{websiteAudit.pagesQueued}</div>
                          <div className="text-[8px] font-black text-slate-400 uppercase">Queued</div>
                        </div>
                        <div className="text-center px-2 py-2 bg-green-50 rounded-lg border border-green-100">
                          <div className="text-sm font-bold text-green-700">{websiteAudit.pagesCompleted}</div>
                          <div className="text-[8px] font-black text-green-500 uppercase">Done</div>
                        </div>
                        <div className="text-center px-2 py-2 bg-red-50 rounded-lg border border-red-100">
                          <div className="text-sm font-bold text-red-700">{websiteAudit.pagesFailed}</div>
                          <div className="text-[8px] font-black text-red-500 uppercase">Fail</div>
                        </div>
                        <div className="text-center px-2 py-2 bg-slate-50 rounded-lg border border-slate-200">
                          <div className="text-sm font-bold text-slate-700">{websiteAudit.pagesSkipped}</div>
                          <div className="text-[8px] font-black text-slate-400 uppercase">Skip</div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <h4 className="font-bold text-slate-800 text-sm flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-brand" />
                            Pages ({pages.length})
                          </span>
                        </h4>

                        <div className="space-y-2">
                          {pages.slice(0, 200).map((p) => {
                            const s = safeNumber(p.pageScore ?? p.lighthouseScore);
                            const isSelected = p.id === selectedPageId;
                            return (
                              <div
                                key={p.id}
                                onClick={() => setSelectedPageId(p.id)}
                                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                  isSelected ? 'border-brand bg-pink/30 ring-1 ring-brand/20 shadow-sm' : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-slate-800 truncate">{p.url}</p>
                                    <p className="text-[10px] font-medium text-slate-400">
                                      depth {p.depth} • {p.status}
                                    </p>
                                  </div>
                                  <div className={`text-lg font-black ${getScoreColor(s)}`}>{Math.round(s)}</div>
                                </div>
                                {p.status === 'FAILED' && p.errorMessage && (
                                  <div className="mt-2 text-[10px] text-red-600 font-medium truncate">{p.errorMessage}</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>

              <div className="flex-1 bg-slate-100 relative flex flex-col overflow-hidden">
                {pageDetail ? (
                  <>
                    <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 py-1 bg-slate-100 rounded truncate">
                          {currentUrl}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Page Score</div>
                          <div className={`text-xl font-black ${getScoreColor(pageScore)}`}>{Math.round(pageScore)}</div>
                        </div>
                        <button
                          onClick={() => setIframeFailed((v) => !v)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-700 transition-colors"
                        >
                          {iframeFailed ? 'Show Live' : 'Show Screenshot'}
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                      <div className="flex-1 bg-slate-200 p-4 overflow-auto custom-scrollbar flex flex-col">
                        {/* Legend / WAVE filters */}
                        {rightView === 'wave' ? (
                          <div className="mb-4 bg-white p-3 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-2 items-center">
                            <span className="text-sm font-bold text-slate-700 mr-1">Afficher :</span>
                            {([
                              ['errors', 'Errors', '#dc2626'],
                              ['contrast', 'Contrast', '#1e293b'],
                              ['alerts', 'Alerts', '#eab308'],
                              ['features', 'Features', '#16a34a'],
                              ['structure', 'Structure', '#2563eb'],
                              ['aria', 'ARIA', '#9333ea'],
                            ] as const).map(([key, label, hex]) => {
                              const on = waveVisible[key];
                              return (
                                <button
                                  key={key}
                                  onClick={() => setWaveVisible((v) => ({ ...v, [key]: !v[key] }))}
                                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                                    on ? 'text-white border-transparent' : 'text-slate-400 bg-slate-50 border-slate-200'
                                  }`}
                                  style={on ? { backgroundColor: hex } : undefined}
                                >
                                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: on ? '#fff' : hex }} />
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="mb-4 bg-white p-3 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-center">
                            <span className="text-sm font-bold text-slate-700">Issue Legend:</span>
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 rounded-sm bg-red-600"></div>
                              <span className="text-xs font-medium text-slate-600">Critical</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 rounded-sm bg-orange-600"></div>
                              <span className="text-xs font-medium text-slate-600">Serious</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 rounded-sm bg-yellow-500"></div>
                              <span className="text-xs font-medium text-slate-600">Moderate</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 rounded-sm bg-blue-600"></div>
                              <span className="text-xs font-medium text-slate-600">Minor</span>
                            </div>
                          </div>
                        )}

                        {!iframeFailed ? (
                          <div className="flex flex-col">
                            <div className="mb-2 flex items-center justify-between">
                              <p className="text-xs text-slate-500 font-medium flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-brand" />
                                Vue live — les icônes marquent les éléments détectés
                              </p>
                              <button
                                onClick={() => setIframeFailed(true)}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors"
                              >
                                Voir le screenshot
                              </button>
                            </div>
                            {/* Conteneur en coordonnées document : iframe live + marqueurs par-dessus */}
                            <div
                              className="relative mx-auto bg-white shadow-2xl rounded-sm"
                              style={{ width: '1280px', height: `${pageHeight}px` }}
                            >
                              <iframe
                                src={currentUrl}
                                style={{ width: '1280px', height: `${pageHeight}px`, border: 'none' }}
                                title="Website Preview"
                                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                                scrolling="no"
                                onError={() => setIframeFailed(true)}
                              />
                              {/* Marqueurs icônes WAVE posés sur la page live */}
                              <WaveOverlay wave={pageDetail.waveAnalysis} visible={waveVisible} />
                            </div>
                          </div>
                        ) : (
                          <div className="relative mx-auto bg-white shadow-2xl rounded-sm overflow-hidden" style={{ width: '1280px' }}>
                            {/* Zoom controls */}
                            <div className="absolute top-4 right-4 z-[400] flex gap-2 bg-white/90 backdrop-blur-sm p-2 rounded-xl shadow-lg border border-slate-200">
                              <button
                                className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-all"
                              >
                                −
                              </button>
                              <div className="w-12 h-10 flex items-center justify-center text-sm font-bold text-slate-600">100%</div>
                              <button 
                                className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-all"
                              >
                                +
                              </button>
                            </div>

                            {/* Mini-map of issues */}
                            <div className="absolute bottom-4 right-4 z-[400] w-48 bg-white/95 backdrop-blur-sm p-3 rounded-xl shadow-xl border border-slate-200">
                              <div className="text-[10px] font-bold text-slate-600 mb-2 uppercase tracking-wider">Issue Map</div>
                              <div className="relative w-full h-32 bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                                {pageDetail.issues.map((issue, issueIdx) =>
                                  (issue.details || []).map((detail, detailIdx) =>
                                    detail.location ? (
                                      <div
                                        key={`mini-${issueIdx}-${detailIdx}`}
                                        className="absolute cursor-pointer hover:opacity-100 transition-all"
                                        style={{
                                          left: `${(detail.location.x / 1280) * 100}%`,
                                          top: `${(detail.location.y / 720) * 100}%`,
                                          width: '6px',
                                          height: '6px',
                                          backgroundColor:
                                            issue.impact.toLowerCase() === 'critical' ? '#dc2626' :
                                            issue.impact.toLowerCase() === 'serious' ? '#ea580c' :
                                            issue.impact.toLowerCase() === 'moderate' ? '#ca8a04' :
                                            '#2563eb',
                                          borderRadius: '50%',
                                          transform: 'translate(-50%, -50%)',
                                          opacity: selectedIssueId === issue.id ? 1 : 0.7,
                                          boxShadow: selectedIssueId === issue.id ? '0 0 0 3px rgba(99, 102, 241, 0.5)' : 'none',
                                        }}
                                        onClick={() => setSelectedIssueId(issue.id)}
                                      />
                                    ) : null
                                  )
                                )}
                              </div>
                              <div className="mt-2 flex gap-2 text-[10px] text-slate-500">
                                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-600"></div> Critical</div>
                                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-orange-600"></div> Serious</div>
                              </div>
                            </div>
                            
                            {pageDetail.screenshot?.dataUrl ? (
                              <img src={pageDetail.screenshot.dataUrl} alt="Audit Screenshot" className="w-full h-auto block" />
                            ) : (
                              <div className="flex items-center justify-center h-[720px] bg-slate-100 text-slate-500">
                                Screenshot not available for this page
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="w-full md:w-[420px] bg-white border-l border-slate-200 overflow-y-auto custom-scrollbar">
                        <div className="p-6 space-y-4">
                          {/* View toggle: WAVE / Issues */}
                          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                            <button
                              onClick={() => setRightView('wave')}
                              className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                rightView === 'wave' ? 'bg-white shadow-sm text-brand' : 'text-slate-500 hover:text-slate-700'
                              }`}
                            >
                              Accessibilité
                            </button>
                            <button
                              onClick={() => setRightView('issues')}
                              className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                rightView === 'issues' ? 'bg-white shadow-sm text-brand' : 'text-slate-500 hover:text-slate-700'
                              }`}
                            >
                              Issues ({pageDetail.issues.length})
                            </button>
                          </div>

                          {rightView === 'wave' && <WavePanel wave={pageDetail.waveAnalysis} />}

                          {rightView === 'issues' && (
                          <div className="space-y-3">
                            {pageDetail.issues.map((issue) => (
                              <div
                                key={issue.id}
                                onClick={() => setSelectedIssueId(issue.id)}
                                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                                  selectedIssueId === issue.id ? 'border-brand bg-pink/30 ring-2 ring-brand/30 shadow-lg' : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                                }`}
                              >
                                <div className="flex items-start gap-4">
                                  {/* Visual indicator of issue location */}
                                  <div className="flex-shrink-0">
                                    <div 
                                      className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                                        issue.impact.toLowerCase() === 'critical'
                                          ? 'bg-red-100 text-red-700'
                                          : issue.impact.toLowerCase() === 'serious'
                                            ? 'bg-orange-100 text-orange-700'
                                            : issue.impact.toLowerCase() === 'moderate'
                                              ? 'bg-yellow-100 text-yellow-700'
                                              : 'bg-blue-100 text-blue-700'
                                      }`}
                                    >
                                      <AlertCircle className="w-6 h-6" />
                                    </div>
                                  </div>

                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getImpactBadge(issue.impact)}`}>
                                        {issue.impact}
                                      </span>
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">
                                        {issue.ruleId}
                                      </span>
                                    </div>
                                    <p className="text-sm font-bold text-slate-800 leading-tight">{issue.help}</p>
                                    <p className="text-xs text-slate-500 mt-1">{issue.description}</p>

                                    {selectedIssueId === issue.id && (
                                      <div className="mt-4 space-y-3">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                                          <AlertCircle className="w-3 h-3" />
                                          Affected Elements
                                        </p>
                                        {(issue.details ?? []).slice(0, 5).map((d, idx) => (
                                          <div key={idx} className="bg-white p-3 rounded-lg border border-slate-200">
                                            <div className="text-[10px] font-bold text-slate-400 mb-1">Element {idx + 1}</div>
                                            <code className="block text-[10px] text-brand break-all">
                                              {(d.target ?? []).join(' > ')}
                                            </code>
                                            {d.html && (
                                              <details className="mt-2">
                                                <summary className="text-[10px] font-bold text-slate-500 cursor-pointer">View HTML</summary>
                                                <code className="block mt-1 text-[9px] text-slate-600 bg-slate-50 p-2 rounded break-all">
                                                  {d.html.substring(0, 200)}{d.html.length > 200 ? '...' : ''}
                                                </code>
                                              </details>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {/* Quick action to learn more */}
                                    {issue.helpUrl && (
                                      <a 
                                        href={issue.helpUrl} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="mt-3 inline-flex items-center gap-1 text-xs text-brand hover:text-brand font-medium"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        Learn how to fix
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}

                            {pageDetail.issues.length === 0 && (
                              <div className="text-center py-10 bg-white rounded-2xl border border-slate-200 border-dashed">
                                <p className="text-slate-400 font-medium text-sm">No issues for this page.</p>
                              </div>
                            )}
                          </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
                    <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center shadow-sm border border-slate-100">
                      <ExternalLink className="w-10 h-10 text-slate-200" />
                    </div>
                    <p className="font-medium text-sm">Start an audit and select a page</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Assistant d'accessibilité (flottant, global) */}
      <ChatBot pageAuditId={selectedPageId} />
    </div>
  );
}

export default App;
