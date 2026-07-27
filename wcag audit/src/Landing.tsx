import { Link } from 'react-router-dom';
import { ArrowUpRight, ArrowDownRight, Lock, ShieldCheck } from 'lucide-react';
import { NavBar } from './NavBar';
import illustration from './assets/audit-illustration.svg';
import illustrationPeople from './assets/illustration-people.svg';
import illustrationChart from './assets/illustration-chart.svg';

// Palette (reprise de l'image)
// crème #F3F0E8 · vert foncé #15241B · rose #F7C6D8 · jaune néon #D9F95F · noir

const chip = 'inline-block px-3 py-1 rounded-full text-xs font-semibold';

export function Landing() {
  return (
    <div className="min-h-screen bg-[#F3F0E8] text-[#15241B] font-sans antialiased">
      <NavBar />

      {/* ── HERO ──────────────────────────────────────────── */}
      <header className="max-w-5xl mx-auto px-6 pt-28 pb-16 text-center relative">
        <span className={`${chip} bg-[#F7C6D8] text-[#15241B] mb-6`}>Accessibilité web</span>
        <h1 className="text-4xl md:text-6xl font-extrabold leading-[1.05] tracking-tight">
          Un seul outil peut-il rendre
          <br />votre site <span className="bg-[#D9F95F] px-2 rounded-lg">accessible</span> à tous ?
        </h1>
        <p className="mt-6 max-w-xl mx-auto text-[#4B5A50] text-base md:text-lg">
          Crawlez, analysez et corrigez les problèmes d'accessibilité WCAG de tout votre site —
          avec un score clair et des corrections guidées par l'IA.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <span className={`${chip} bg-white border border-[#E3DFD3]`}>Analyse WCAG 2.0 / 2.1</span>
          <span className={`${chip} bg-white border border-[#E3DFD3]`}>Score instantané</span>
          <span className={`${chip} bg-white border border-[#E3DFD3]`}>Corrections IA</span>
        </div>

        {/* Carte hero */}
        <div className="mt-12 max-w-md mx-auto rounded-3xl overflow-hidden shadow-2xl rotate-[-2deg]">
          <div className="relative">
            <img src={illustration} alt="Aperçu d'un audit WEB4ALL" className="w-full h-64 object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-5 flex items-end justify-between">
              <span className="text-white text-sm font-semibold">Votre site,<br />clairement audité</span>
              <Link to="/audit" className="px-4 py-2 rounded-full bg-[#F7C6D8] text-[#15241B] text-xs font-bold">
                Voir le dashboard
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* ── BANDE FONCTIONS ──────────────────────────────── */}
      <div id="fonctions" className="bg-[#15241B] text-[#F3F0E8]">
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm font-medium">
          {['Crawl complet', 'Analyse visuelle', 'Score WCAG', 'Corrections IA', 'Rapport PDF', 'Dashboard'].map((f, i) => (
            <span key={f} className="flex items-center gap-3">
              {i > 0 && <span className="text-[#D9F95F]">✦</span>}{f}
            </span>
          ))}
        </div>
      </div>

      {/* ── PROCESS (vert foncé) ─────────────────────────── */}
      <section id="process" className="bg-[#15241B] text-[#F3F0E8]">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <div className="flex justify-between text-[10px] uppercase tracking-widest text-[#8AA092] mb-10">
            <span>Construit pour la clarté,<br />le contrôle et la conformité</span>
            <span className="text-right">Un seul audit peut-il<br />transformer votre site ?</span>
          </div>

          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <span className="text-[#D9F95F] text-xl font-bold">02</span>
              <ol className="mt-4 space-y-1">
                {[['Crawl', '01'], ['Audit', '02'], ['Score', '03'], ['Rapport', '04']].map(([w, n], i) => (
                  <li key={w} className="flex items-baseline gap-3">
                    <span className={`text-5xl md:text-6xl font-extrabold tracking-tight ${i === 1 ? 'text-white' : 'text-[#2E4034]'}`}>{w}</span>
                    <span className="text-xs text-[#8AA092]">{n}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="flex flex-col items-end gap-4">
              <span className={`${chip} bg-[#F7C6D8] text-[#15241B]`}>Conçu pour les développeurs</span>
              <img src={illustrationPeople} alt="" className="w-44 h-44 object-cover rounded-2xl" />
              <p className="text-[10px] uppercase tracking-widest text-[#8AA092] text-right">Et un contrôle au quotidien</p>
            </div>
          </div>

          <div className="mt-16 grid md:grid-cols-2 gap-10 items-center">
            <div className="w-44 h-44 rounded-2xl overflow-hidden">
              <img src={illustrationChart} alt="" className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="w-10 h-10 rounded-full border border-[#2E4034] flex items-center justify-center mb-4">
                <ShieldCheck className="w-5 h-5 text-[#D9F95F]" />
              </div>
              <h3 className="text-2xl md:text-3xl font-bold leading-snug">
                Un seul tableau de bord peut-il changer votre façon de voir l'accessibilité ?
              </h3>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS (rose) ─────────────────────────────────── */}
      <section id="stats" className="bg-[#F7C6D8] text-[#15241B]">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <div className="flex items-start justify-between">
            <h2 className="text-3xl md:text-4xl font-extrabold leading-tight max-w-md">
              Un seul outil peut-il rendre
              <br />tout un site conforme ?
            </h2>
            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shrink-0">
              <ArrowDownRight className="w-5 h-5" />
            </div>
          </div>

          <div className="mt-12 grid md:grid-cols-2 gap-10 items-end">
            <div>
              <div className="text-6xl md:text-7xl font-extrabold">98%</div>
              <p className="text-sm text-[#7A3B4D] mt-2 max-w-xs">
                des sites les plus visités ont des erreurs d'accessibilité détectables (WebAIM).
              </p>
            </div>

            {/* Carte résultat */}
            <div className="rounded-3xl bg-[#15241B] text-[#F3F0E8] p-6">
              <div className="flex items-center justify-between">
                <span className="font-bold">WEB4ALL</span>
                <span className={`${chip} bg-[#D9F95F] text-[#15241B]`}>Score WCAG</span>
              </div>
              <p className="text-[10px] uppercase tracking-widest text-[#8AA092] mt-6">Score global</p>
              <div className="text-5xl font-extrabold">92<span className="text-xl text-[#8AA092]">/100</span></div>
              <div className="mt-5 rounded-2xl bg-[#7A1F33] p-4 flex items-center justify-between">
                <span className="text-sm font-semibold text-[#F7C6D8]">Objectif niveau AA</span>
                <span className="text-3xl font-extrabold text-[#F7C6D8]">AA</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── MISSION (crème) ──────────────────────────────── */}
      <section className="bg-[#F3F0E8]">
        <div className="max-w-3xl mx-auto px-6 py-20 text-center">
          <div className="w-12 h-12 rounded-full bg-[#15241B] flex items-center justify-center mx-auto mb-8">
            <Lock className="w-5 h-5 text-[#D9F95F]" />
          </div>
          <p className="text-xl md:text-2xl font-semibold leading-relaxed">
            Conçu pour la clarté, l'inclusion et la conformité — pensé pour vous aider à
            comprendre les problèmes de votre site, les corriger avec confiance, et atteindre
            les standards WCAG. Un nouveau standard d'audit d'accessibilité, pensé pour le réel.
          </p>
          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { t: '6', s: "catégories d'analyse" },
              { t: 'A/AA/AAA', s: 'niveaux WCAG' },
              { t: 'IA', s: 'corrections guidées' },
              { t: 'PDF', s: 'rapport détaillé' },
            ].map((c) => (
              <div key={c.s} className="rounded-2xl bg-[#15241B] text-[#F3F0E8] p-5 text-left">
                <div className="text-2xl font-extrabold text-[#D9F95F]">{c.t}</div>
                <div className="text-xs text-[#8AA092] mt-2">{c.s}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER (vert foncé) ──────────────────────────── */}
      <footer className="bg-[#15241B] text-[#F3F0E8]">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="grid md:grid-cols-2 gap-10 border-b border-[#2E4034] pb-12">
            <div>
              <h3 className="text-2xl font-extrabold mb-2">WEB4ALL</h3>
              <p className="text-[#8AA092] max-w-xs">On vous aide à construire un web plus clair et accessible à tous.</p>
            </div>
            <div className="flex flex-col md:items-end justify-between gap-6">
              <Link to="/audit" className="w-12 h-12 rounded-full bg-[#F7C6D8] flex items-center justify-center text-[#15241B]">
                <ArrowUpRight className="w-5 h-5" />
              </Link>
              <a href="mailto:hello@web4all.com" className="text-lg font-semibold hover:text-[#D9F95F]">hello@web4all.com</a>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pt-12 text-sm">
            <div>
              <p className="text-[#8AA092] mb-3">Produit</p>
              <ul className="space-y-2">
                <li><Link to="/audit" className="hover:text-[#D9F95F]">Audit de site</Link></li>
                <li><Link to="/audit" className="hover:text-[#D9F95F]">Dashboard</Link></li>
                <li><Link to="/audit" className="hover:text-[#D9F95F]">Analyse visuelle</Link></li>
                <li><Link to="/audit" className="hover:text-[#D9F95F]">Rapport PDF</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-[#8AA092] mb-3">Ressources</p>
              <ul className="space-y-2 text-[#C9D3CC]">
                <li>Guide WCAG</li>
                <li>Référentiel RGAA</li>
                <li>Documentation</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Wordmark géant */}
        <div className="overflow-hidden border-t border-[#2E4034]">
          <div className="max-w-7xl mx-auto px-6 py-8 relative">
            <h2 className="text-[18vw] leading-none font-extrabold tracking-tighter text-[#F3F0E8] text-center">
              WEB4ALL
            </h2>
            <span className={`${chip} bg-[#D9F95F] text-[#15241B] absolute left-1/4 top-1/2`}>Accessibilité</span>
            <span className={`${chip} bg-[#F7C6D8] text-[#15241B] absolute right-1/4 bottom-6`}>Corrections IA</span>
          </div>
          <p className="text-center text-[10px] text-[#8AA092] pb-6">© 2025 WEB4ALL. Tous droits réservés.</p>
        </div>
      </footer>
    </div>
  );
}
