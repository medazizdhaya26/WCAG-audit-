import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { MessageCircle, X, Send, Bot, Loader2, KeyRound } from 'lucide-react';

import { REPORT_URL as REPORT_SERVICE_URL } from './config';

type Msg = { role: 'user' | 'assistant'; content: string };

export function ChatBot({ pageAuditId }: { pageAuditId?: string | null }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'ai' | 'offline'>('offline');
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: "Bonjour 👋 Je suis l'assistant accessibilité WEB4ALL. Pose-moi une question sur les fautes WCAG, le contraste, les textes alternatifs, ARIA…" },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    axios.get<{ mode: 'ai' | 'offline' }>(`${REPORT_SERVICE_URL}/chat/status`)
      .then((r) => setMode(r.data.mode))
      .catch(() => {});
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const testKey = async () => {
    setMessages((m) => [...m, { role: 'assistant', content: '⏳ Test de la clé API en cours…' }]);
    try {
      const res = await axios.get<{ ok: boolean; provider: string; error?: string }>(`${REPORT_SERVICE_URL}/chat/test`);
      const d = res.data;
      const msg = d.ok
        ? `✅ La clé API fonctionne ! Provider : ${d.provider}.`
        : `❌ La clé ne fonctionne pas (provider: ${d.provider}).\nRaison : ${d.error}`;
      setMessages((m) => [...m, { role: 'assistant', content: msg }]);
      if (d.ok) setMode('ai');
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: '❌ Impossible de contacter le service (port 3001).' }]);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const history = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setInput('');
    setLoading(true);
    try {
      const res = await axios.post<{ mode: 'ai' | 'offline'; answer: string }>(`${REPORT_SERVICE_URL}/chat`, {
        message: text,
        history,
        pageAuditId: pageAuditId ?? undefined,
      });
      setMode(res.data.mode);
      setMessages((m) => [...m, { role: 'assistant', content: res.data.answer }]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: "❌ Erreur de connexion au service. Vérifie que report-service tourne sur le port 3001." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Bouton flottant */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-[1000] w-14 h-14 rounded-full bg-purple-600 hover:bg-purple-700 text-white shadow-xl flex items-center justify-center transition-all"
          title="Assistant accessibilité"
        >
          <MessageCircle className="w-7 h-7" />
        </button>
      )}

      {/* Panneau de chat */}
      {open && (
        <div className="fixed bottom-6 right-6 z-[1000] w-[380px] h-[560px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-[#0a0a0a] text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold">Assistant WEB4ALL</div>
                <div className="text-[10px] text-slate-400">
                  {mode === 'ai' ? '🟢 IA activée' : '⚪ Mode hors-ligne'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={testKey}
                title="Tester la clé API"
                className="text-slate-400 hover:text-white p-1"
              >
                <KeyRound className="w-4 h-4" />
              </button>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50 custom-scrollbar">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-purple-600 text-white rounded-br-sm'
                      : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 px-3 py-2 rounded-2xl">
                  <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-slate-200 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Pose ta question…"
              className="flex-1 bg-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500/30"
            />
            <button
              onClick={send}
              disabled={loading}
              className="w-10 h-10 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white flex items-center justify-center transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
