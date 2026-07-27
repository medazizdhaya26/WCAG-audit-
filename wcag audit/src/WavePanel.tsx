import { useState } from 'react';
import {
  AlertCircle,
  Contrast,
  AlertTriangle,
  CheckCircle2,
  LayoutList,
  Accessibility,
} from 'lucide-react';

// ── Types (mirror the backend WaveAnalysisResult) ──────────────────────────
export type WaveResult = {
  id?: string;
  category: 'errors' | 'contrast' | 'alerts' | 'features' | 'structure' | 'aria';
  type: string;
  severity: 'high' | 'medium' | 'low' | 'info';
  message: string;
  label?: string;
  selector?: string;
  html?: string;
  details?: any;
  boundingBox?: { x: number; y: number; width: number; height: number };
};

export type WaveSummary = {
  errors: number;
  contrastErrors: number;
  alerts: number;
  features: number;
  structure: number;
  aria: number;
  score: number;
};

export type WaveAnalysisData = {
  summary: WaveSummary;
  categories: Record<WaveResult['category'], WaveResult[]>;
};

// ── WAVE category config (icon + color, matching WebAIM WAVE) ───────────────
const CATEGORIES: {
  key: WaveResult['category'];
  summaryKey: keyof WaveSummary;
  label: string;
  Icon: typeof AlertCircle;
  bg: string;
  text: string;
  ring: string;
}[] = [
  { key: 'errors',   summaryKey: 'errors',         label: 'Errors',     Icon: AlertCircle,   bg: 'bg-red-600',     text: 'text-red-600',     ring: 'ring-red-300' },
  { key: 'contrast', summaryKey: 'contrastErrors', label: 'Contrast',   Icon: Contrast,      bg: 'bg-slate-800',   text: 'text-slate-800',   ring: 'ring-slate-400' },
  { key: 'alerts',   summaryKey: 'alerts',         label: 'Alerts',     Icon: AlertTriangle, bg: 'bg-yellow-500',  text: 'text-yellow-600',  ring: 'ring-yellow-300' },
  { key: 'features', summaryKey: 'features',       label: 'Features',   Icon: CheckCircle2,  bg: 'bg-green-600',   text: 'text-green-600',   ring: 'ring-green-300' },
  { key: 'structure',summaryKey: 'structure',      label: 'Structure',  Icon: LayoutList,    bg: 'bg-blue-600',    text: 'text-blue-600',    ring: 'ring-blue-300' },
  { key: 'aria',     summaryKey: 'aria',           label: 'ARIA',       Icon: Accessibility, bg: 'bg-purple-600',  text: 'text-purple-600',  ring: 'ring-purple-300' },
];

const CAT_STYLE: Record<WaveResult['category'], { hex: string; Icon: typeof AlertCircle }> = {
  errors:    { hex: '#dc2626', Icon: AlertCircle },
  contrast:  { hex: '#1e293b', Icon: Contrast },
  alerts:    { hex: '#eab308', Icon: AlertTriangle },
  features:  { hex: '#16a34a', Icon: CheckCircle2 },
  structure: { hex: '#2563eb', Icon: LayoutList },
  aria:      { hex: '#9333ea', Icon: Accessibility },
};

// ══════════════════════════════════════════════════════════════════════════
// WAVE overlay: icon markers placed over the screenshot (like WebAIM WAVE)
// ══════════════════════════════════════════════════════════════════════════
const ALL_CATS: WaveResult['category'][] = ['errors', 'contrast', 'alerts', 'features', 'structure', 'aria'];

export function WaveOverlay({
  wave,
  visible,
}: {
  wave?: WaveAnalysisData | null;
  visible?: Record<WaveResult['category'], boolean>;
}) {
  if (!wave || !wave.categories) return null;

  const cats = ALL_CATS.filter((c) => !visible || visible[c]);
  const positioned = cats.flatMap((cat) =>
    (wave.categories[cat] ?? []).filter((it) => it.boundingBox).map((it) => ({ ...it, cat })),
  );

  return (
    <div className="absolute inset-0 pointer-events-none">
      {positioned.map((item, i) => {
        const box = item.boundingBox!;
        const style = CAT_STYLE[item.cat];
        const isError = item.cat === 'errors' || item.cat === 'contrast' || item.cat === 'alerts';
        const badge = item.label || (item.cat === 'errors' ? '!' : item.cat.slice(0, 3).toUpperCase());
        return (
          <div
            key={i}
            className="absolute pointer-events-auto group"
            style={{ left: box.x, top: box.y }}
          >
            {/* léger contour seulement pour les erreurs (comme WAVE) */}
            {isError && (
              <div
                className="absolute border-2 rounded-sm"
                style={{
                  left: 0,
                  top: 0,
                  width: Math.max(box.width, 12),
                  height: Math.max(box.height, 12),
                  borderColor: style.hex,
                  backgroundColor: `${style.hex}1f`,
                }}
              />
            )}
            {/* badge-icône WAVE posé sur l'élément */}
            <div
              className="flex items-center gap-0.5 px-1 h-5 rounded text-white text-[9px] font-black shadow-md border border-white/70 whitespace-nowrap"
              style={{ backgroundColor: style.hex }}
            >
              <style.Icon className="w-3 h-3 shrink-0" />
              <span>{badge}</span>
            </div>
            {/* tooltip au survol */}
            <div className="absolute top-6 left-0 bg-slate-900 text-white text-[11px] p-2 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-[300] w-64 pointer-events-none">
              <div className="font-bold capitalize mb-0.5">
                {item.cat}: {item.type.replace(/-/g, ' ')}
              </div>
              <div className="text-slate-300">{item.message}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// WAVE-style panel: Summary tiles + Details list (like WebAIM WAVE sidebar)
// ══════════════════════════════════════════════════════════════════════════
export function WavePanel({ wave }: { wave?: WaveAnalysisData | null }) {
  const [active, setActive] = useState<WaveResult['category'] | null>(null);

  if (!wave || !wave.summary) {
    return (
      <div className="text-center py-10 bg-white rounded-2xl border border-slate-200 border-dashed">
        <p className="text-slate-400 font-medium text-sm">Pas d'analyse d'accessibilité pour cette page.</p>
      </div>
    );
  }

  const { summary, categories } = wave;
  const activeItems = active ? categories[active] ?? [] : [];

  return (
    <div className="space-y-4">
      {/* Category tiles */}
      <div className="grid grid-cols-3 gap-2">
        {CATEGORIES.map((c) => {
          const count = summary[c.summaryKey] as number;
          const isActive = active === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setActive(isActive ? null : c.key)}
              className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${
                isActive ? `bg-slate-50 border-slate-300 ring-2 ${c.ring}` : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className={`w-9 h-9 rounded-lg ${c.bg} flex items-center justify-center text-white`}>
                <c.Icon className="w-5 h-5" />
              </div>
              <span className={`text-xl font-black ${c.text}`}>{count}</span>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{c.label}</span>
            </button>
          );
        })}
      </div>

      {/* Details for the selected category */}
      {active && (
        <div className="space-y-2">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {CATEGORIES.find((c) => c.key === active)?.label} details ({activeItems.length})
          </div>
          {activeItems.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-2">No items in this category.</p>
          ) : (
            activeItems.map((item, i) => (
              <div key={item.id ?? i} className="bg-white p-3 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{item.type}</span>
                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                    item.severity === 'high' ? 'bg-red-100 text-red-700' :
                    item.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                    item.severity === 'low' ? 'bg-blue-100 text-blue-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>{item.severity}</span>
                </div>
                <p className="text-xs font-medium text-slate-700">{item.message}</p>
                {item.details?.count != null && (
                  <p className="text-[10px] text-slate-400 mt-1">Count: {item.details.count}</p>
                )}
                {item.selector && (
                  <code className="block text-[10px] text-indigo-700 mt-1 break-all">{item.selector}</code>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {!active && (
        <p className="text-[11px] text-slate-400 text-center italic">Click a category above to see details.</p>
      )}
    </div>
  );
}
