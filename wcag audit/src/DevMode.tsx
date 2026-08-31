import { useState } from 'react';
import axios from 'axios';
import CodeMirror from '@uiw/react-codemirror';
import { html as htmlLang } from '@codemirror/lang-html';
import { css as cssLang } from '@codemirror/lang-css';
import { javascript as jsLang } from '@codemirror/lang-javascript';
import { useRef } from 'react';
import { Loader2, Play, AlertCircle, ExternalLink, CheckCircle2, Upload } from 'lucide-react';
import { NavBar } from './NavBar';
import { WavePanel, WaveOverlay, type WaveAnalysisData, type WaveResult } from './WavePanel';

import { AUDIT_URL as AUDIT_SERVICE_URL } from './config';

type Issue = {
  id: string;
  ruleId: string;
  impact: string;
  description: string;
  help: string;
  helpUrl?: string | null;
  nodes: number;
  details: { target: string[]; html: string; location: { x: number; y: number; width: number; height: number } | null }[];
};

type InlineResult = {
  pageScore: number;
  issues: Issue[];
  waveAnalysis: WaveAnalysisData | null;
  screenshot: string;
  framework?: string;
  note?: string;
  filename?: string;
};

const DEFAULT_HTML = `<header>
  <h1>Ma page</h1>
  <img src="logo.png">
  <a href="#"></a>
</header>
<form>
  <input type="text">
  <button></button>
</form>`;

const DEFAULT_CSS = `body { font-family: sans-serif; color: #999; background: #fff; }
h1 { color: #bbb; }`;

const DEFAULT_JS = ``;

function scoreColor(s: number) {
  if (s >= 90) return 'text-green-600';
  if (s >= 50) return 'text-orange-500';
  return 'text-red-600';
}

function getImpactBadge(impact: string) {
  const n = (impact ?? '').toLowerCase();
  const colors: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    serious: 'bg-orange-100 text-orange-700 border-orange-200',
    moderate: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    minor: 'bg-blue-100 text-blue-700 border-blue-200',
  };
  return colors[n] || 'bg-gray-100 text-gray-700 border-gray-200';
}

const WAVE_FILTERS = [
  ['errors', 'Errors', '#dc2626'],
  ['contrast', 'Contrast', '#1e293b'],
  ['alerts', 'Alerts', '#eab308'],
  ['features', 'Features', '#16a34a'],
  ['structure', 'Structure', '#2563eb'],
  ['aria', 'ARIA', '#9333ea'],
] as const;

export function DevMode() {
  const [html, setHtml] = useState(DEFAULT_HTML);
  const [css, setCss] = useState(DEFAULT_CSS);
  const [js, setJs] = useState(DEFAULT_JS);
  const [tab, setTab] = useState<'html' | 'css' | 'js'>('html');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InlineResult | null>(null);
  const [rightView, setRightView] = useState<'wave' | 'issues'>('wave');
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waveVisible, setWaveVisible] = useState<Record<WaveResult['category'], boolean>>({
    errors: true, contrast: true, alerts: true, features: true, structure: true, aria: true,
  });

  const fileRef = useRef<HTMLInputElement>(null);

  const audit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post<InlineResult>(`${AUDIT_SERVICE_URL}/audit/inline`, { html, css, js });
      setResult(res.data);
      setSelectedIssueId(null);
    } catch {
      setError("Échec de l'audit. Vérifie que audit-service tourne sur le port 3005.");
    } finally {
      setLoading(false);
    }
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    // affiche le contenu dans l'éditeur HTML pour référence
    setHtml(content);
    setTab('html');
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post<InlineResult>(`${AUDIT_SERVICE_URL}/audit/file`, { filename: file.name, content });
      setResult(res.data);
      setSelectedIssueId(null);
    } catch {
      setError("Échec de l'audit du fichier. Vérifie que audit-service tourne sur le port 3005.");
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const ext = tab === 'html' ? [htmlLang()] : tab === 'css' ? [cssLang()] : [jsLang()];
  const value = tab === 'html' ? html : tab === 'css' ? css : js;
  const setValue = tab === 'html' ? setHtml : tab === 'css' ? setCss : setJs;

  return (
    <div className="min-h-screen bg-cream text-brand pt-16">
      <NavBar />
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        <h1 className="text-3xl font-extrabold tracking-tight">Mode développeur</h1>
        <p className="text-muted text-sm mt-1 mb-5">Colle ton HTML / CSS / JS et lance un audit d'accessibilité instantané.</p>

        {/* ── Éditeur ── */}
        <div className="bg-white rounded-2xl border border-line overflow-hidden mb-6">
          <div className="flex items-center justify-between px-3 py-2 border-b border-line bg-cream/60">
            <div className="flex gap-1">
              {(['html', 'css', 'js'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-colors ${
                    tab === t ? 'bg-brand text-white' : 'text-muted hover:text-brand'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".html,.htm,.jsx,.tsx,.vue,.svelte,.js,.ts"
                onChange={onUpload}
                className="hidden"
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-brand text-brand text-xs font-bold hover:bg-pink/30 disabled:opacity-60 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Importer un fichier
              </button>
              <button
                onClick={audit}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-brand text-white text-xs font-bold hover:bg-black disabled:opacity-60 transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Auditer le code
              </button>
            </div>
          </div>
          <CodeMirror value={value} height="300px" extensions={ext} onChange={(v) => setValue(v)} theme="light" />
        </div>

        {/* ── Résultats (même présentation que la page d'audit) ── */}
        {!result ? (
          <div className="bg-white rounded-2xl border border-line flex flex-col items-center justify-center text-muted py-20 text-center">
            <AlertCircle className="w-10 h-10 mb-3 text-line" />
            <p className="text-sm">{error ?? "Clique sur « Auditer le code » pour voir les résultats."}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-line overflow-hidden">
            {/* barre score */}
            <div className="px-4 py-3 border-b border-line flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <div className="text-[10px] font-bold text-muted uppercase tracking-widest">Score</div>
                  <div className={`text-2xl font-black ${scoreColor(result.pageScore)}`}>{Math.round(result.pageScore)}</div>
                </div>
                {result.framework && (
                  <span className="px-2.5 py-1 rounded-lg bg-brand text-white text-xs font-bold">{result.framework}</span>
                )}
                {result.issues.length === 0 && (
                  <span className="flex items-center gap-1 text-green-600 text-sm font-bold"><CheckCircle2 className="w-5 h-5" /> Aucune erreur</span>
                )}
              </div>
            </div>

            {result.note && (
              <div className="px-4 py-2 bg-pink/20 border-b border-line text-xs text-brand">
                ℹ️ {result.note}{result.filename ? ` (${result.filename})` : ''}
              </div>
            )}

            <div className="flex flex-col md:flex-row">
              {/* ── zone screenshot + marqueurs + filtres ── */}
              <div className="flex-1 bg-slate-200 p-4 overflow-auto custom-scrollbar" style={{ maxHeight: 640 }}>
                {/* filtres WAVE */}
                <div className="mb-4 bg-white p-3 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-2 items-center">
                  <span className="text-sm font-bold text-slate-700 mr-1">Afficher :</span>
                  {WAVE_FILTERS.map(([key, label, hex]) => {
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

                <div className="relative mx-auto bg-white shadow-2xl rounded-sm overflow-hidden" style={{ width: 1280 }}>
                  {result.screenshot ? (
                    <>
                      <img src={result.screenshot} alt="rendu" className="w-full h-auto block" />
                      <WaveOverlay wave={result.waveAnalysis} visible={waveVisible} />
                    </>
                  ) : (
                    <div className="h-64 flex items-center justify-center text-slate-400">Aperçu indisponible</div>
                  )}
                </div>
              </div>

              {/* ── panneau latéral WAVE / Erreurs ── */}
              <div className="w-full md:w-[420px] bg-white border-l border-line overflow-y-auto custom-scrollbar" style={{ maxHeight: 640 }}>
                <div className="p-6 space-y-4">
                  <div className="flex gap-1 bg-cream p-1 rounded-xl">
                    <button onClick={() => setRightView('wave')} className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${rightView === 'wave' ? 'bg-white shadow-sm text-brand' : 'text-muted'}`}>Accessibilité</button>
                    <button onClick={() => setRightView('issues')} className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${rightView === 'issues' ? 'bg-white shadow-sm text-brand' : 'text-muted'}`}>Erreurs ({result.issues.length})</button>
                  </div>

                  {rightView === 'wave' && <WavePanel wave={result.waveAnalysis} />}

                  {rightView === 'issues' && (
                    <div className="space-y-3">
                      {result.issues.length === 0 && (
                        <div className="text-center py-10 bg-cream/40 rounded-2xl border border-line border-dashed">
                          <p className="text-green-600 font-medium text-sm">✅ Aucune erreur pour ce code.</p>
                        </div>
                      )}
                      {result.issues.map((issue) => (
                        <div
                          key={issue.id}
                          onClick={() => setSelectedIssueId(issue.id)}
                          className={`p-4 rounded-xl border transition-all cursor-pointer ${
                            selectedIssueId === issue.id ? 'border-brand bg-pink/30 ring-2 ring-brand/30 shadow-lg' : 'border-line bg-cream/40 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-start gap-4">
                            <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${
                              issue.impact === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                              issue.impact === 'SERIOUS' ? 'bg-orange-100 text-orange-700' :
                              issue.impact === 'MODERATE' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                              <AlertCircle className="w-6 h-6" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getImpactBadge(issue.impact)}`}>{issue.impact}</span>
                                <span className="text-[10px] font-bold text-muted uppercase tracking-widest truncate">{issue.ruleId}</span>
                              </div>
                              <p className="text-sm font-bold text-brand leading-tight">{issue.help}</p>
                              <p className="text-xs text-muted mt-1">{issue.description}</p>

                              {selectedIssueId === issue.id && (
                                <div className="mt-4 space-y-3">
                                  <p className="text-[10px] font-bold text-muted uppercase">Éléments concernés</p>
                                  {(issue.details ?? []).slice(0, 5).map((d, idx) => (
                                    <div key={idx} className="bg-white p-3 rounded-lg border border-line">
                                      <code className="block text-[10px] text-brand break-all">{(d.target ?? []).join(' > ')}</code>
                                      {d.html && (
                                        <code className="block mt-1 text-[9px] text-slate-600 bg-cream/60 p-2 rounded break-all">{d.html.substring(0, 200)}</code>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {issue.helpUrl && (
                                <a href={issue.helpUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="mt-3 inline-flex items-center gap-1 text-xs text-brand font-medium">
                                  Comment corriger <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
