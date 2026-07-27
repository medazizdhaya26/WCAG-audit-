import { useEffect, useState } from 'react';
import { Copy, Check, Sun, Moon } from 'lucide-react';
import { NavBar } from './NavBar';

const LANGS = [
  ['js', 'JavaScript'], ['py', 'Python'], ['java', 'Java'], ['go', 'Go'], ['rust', 'Rust'], ['c', 'C'],
] as const;

const NAV = [
  { group: 'Démarrer', items: [['intro', 'Introduction'], ['auth', 'Authentification']] },
  { group: 'Détection', items: [['inline', 'Audit de code'], ['file', 'Audit de fichier']] },
  { group: 'Site complet', items: [['site', 'Crawl & audit']] },
  { group: 'Réponse', items: [['response', 'Issues & WAVE'], ['scoring', 'Scoring'], ['other', 'Autres endpoints']] },
] as const;

const INLINE: Record<string, string> = {
  js: `const res = await fetch("http://localhost:3005/audit/inline", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ html: "<img src='logo.png'>", css: "", js: "" }),
});
const data = await res.json();
console.log("Score:", data.pageScore);
console.log("Erreurs:", data.issues.length);
console.log("WAVE:", data.waveAnalysis.summary);`,
  py: `import requests

r = requests.post("http://localhost:3005/audit/inline", json={
    "html": "<img src='logo.png'>", "css": "", "js": "",
})
data = r.json()
print("Score:", data["pageScore"])
print("Erreurs:", len(data["issues"]))
print("WAVE:", data["waveAnalysis"]["summary"])`,
  java: `import java.net.URI;
import java.net.http.*;

String body = "{\\"html\\":\\"<img src='logo.png'>\\",\\"css\\":\\"\\",\\"js\\":\\"\\"}";
HttpClient client = HttpClient.newHttpClient();
HttpRequest req = HttpRequest.newBuilder()
    .uri(URI.create("http://localhost:3005/audit/inline"))
    .header("Content-Type", "application/json")
    .POST(HttpRequest.BodyPublishers.ofString(body))
    .build();
HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
System.out.println(res.body());`,
  go: `package main

import ("bytes"; "fmt"; "io"; "net/http")

func main() {
    body := []byte(\`{"html":"<img src='logo.png'>","css":"","js":""}\`)
    resp, _ := http.Post("http://localhost:3005/audit/inline",
        "application/json", bytes.NewBuffer(body))
    defer resp.Body.Close()
    out, _ := io.ReadAll(resp.Body)
    fmt.Println(string(out))
}`,
  rust: `use serde_json::{json, Value};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let res = reqwest::Client::new()
        .post("http://localhost:3005/audit/inline")
        .json(&json!({ "html": "<img src='logo.png'>", "css": "", "js": "" }))
        .send().await?;
    let data: Value = res.json().await?;
    println!("Score: {}", data["pageScore"]);
    Ok(())
}`,
  c: `#include <curl/curl.h>

int main(void) {
    CURL *curl = curl_easy_init();
    const char *json =
      "{\\"html\\":\\"<img src='logo.png'>\\",\\"css\\":\\"\\",\\"js\\":\\"\\"}";
    struct curl_slist *h = NULL;
    h = curl_slist_append(h, "Content-Type: application/json");
    curl_easy_setopt(curl, CURLOPT_URL, "http://localhost:3005/audit/inline");
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, h);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, json);
    curl_easy_perform(curl);
    curl_easy_cleanup(curl);
    return 0;
}`,
};

const FILE_CODE = `// Détecte le framework (React/Vue/Angular/Svelte/HTML) puis audite le balisage
const res = await fetch("http://localhost:3005/audit/file", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ filename: "Header.jsx", content: "<le code du fichier>" }),
});
const { framework, pageScore, issues, waveAnalysis } = await res.json();
console.log(framework, pageScore, issues.length);`;

const SITE: Record<string, string> = {
  js: `const CRAWLER = "http://localhost:3002";
const REPORT  = "http://localhost:3001";

// 1) lancer
const { id } = await (await fetch(\`\${CRAWLER}/website-audits\`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: "https://example.com", maxDepth: 1, maxPages: 10, renderJs: true }),
})).json();

// 2) attendre la fin
let audit;
do {
  await new Promise((r) => setTimeout(r, 2000));
  audit = await (await fetch(\`\${CRAWLER}/website-audits/\${id}\`)).json();
} while (!["COMPLETED", "FAILED"].includes(audit.status));

// 3) détail d'une page
const page = await (await fetch(\`\${REPORT}/page-audits/\${audit.pages[0].id}\`)).json();
console.log(page.pageScore, page.issues, page.waveAnalysis.summary);`,
  py: `import time, requests

CRAWLER = "http://localhost:3002"
REPORT  = "http://localhost:3001"

audit_id = requests.post(f"{CRAWLER}/website-audits", json={
    "url": "https://example.com", "maxDepth": 1, "maxPages": 10, "renderJs": True,
}).json()["id"]

while True:
    time.sleep(2)
    audit = requests.get(f"{CRAWLER}/website-audits/{audit_id}").json()
    if audit["status"] in ("COMPLETED", "FAILED"):
        break

page = requests.get(f"{REPORT}/page-audits/{audit['pages'][0]['id']}").json()
print(page["pageScore"], len(page["issues"]), page["waveAnalysis"]["summary"])`,
  bash: `# 1) lancer
ID=$(curl -s -X POST http://localhost:3002/website-audits \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com","maxDepth":1,"maxPages":10,"renderJs":true}' | jq -r .id)

# 2) statut + score global
curl -s http://localhost:3002/website-audits/$ID | jq '.status, .globalScore'

# 3) détail d'une page
curl -s http://localhost:3001/page-audits/PAGE_ID | jq '.pageScore, .waveAnalysis.summary'`,
};

const RESPONSE_JSON = `{
  "pageScore": 78,
  "issues": [
    { "ruleId": "image-alt", "impact": "CRITICAL",
      "help": "Images must have alternate text",
      "helpUrl": "https://dequeuniversity.com/rules/axe/4.11/image-alt",
      "nodes": 1, "details": [{ "target": ["img"], "html": "<img ...>",
        "location": { "x": 0, "y": 0, "width": 120, "height": 40 } }] }
  ],
  "waveAnalysis": {
    "summary": { "errors": 2, "contrastErrors": 1, "alerts": 1,
                 "features": 3, "structure": 2, "aria": 0 },
    "categories": { "errors": [ ... ], "contrast": [ ... ] }
  },
  "categoryScores": { "perceivable": 80, "operable": 90, "understandable": 85, "robust": 100 },
  "wcagCompliance": { "wcag20A": 90, "wcag20AA": 85, "wcag21AA": 85 }
}`;

const THEME_CSS = `
.docsroot[data-theme="dark"]{--bg:#0d1712;--side:#0a130e;--card:#14241c;--line:#243a2e;--tx:#E9F1EB;--mut:#93a89b;--head:#D9F95F;}
.docsroot[data-theme="light"]{--bg:#F3F0E8;--side:#EFEBE1;--card:#ffffff;--line:#E3DFD3;--tx:#15241B;--mut:#6B7A70;--head:#15241B;}
.docsroot{background:var(--bg);color:var(--tx);min-height:100vh;}
.d-side{background:var(--side);border-color:var(--line);}
.d-card{background:var(--card);border-color:var(--line);}
.d-mut{color:var(--mut);}
.d-head{color:var(--head);}
.d-line{border-color:var(--line);}
.d-link{color:var(--tx);}
.d-link:hover{background:var(--card);}
.d-link.active{background:var(--head);color:#0d1712;font-weight:700;}
.d-code{background:#0f1c15;color:#E9F1EB;border:1px solid var(--line);}
`;

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1400); }}
        className="absolute top-3 right-3 flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-[#21362b] text-[#cfe0d6] hover:bg-[#2b473a] transition-colors z-10"
      >
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {copied ? 'Copié' : 'Copier'}
      </button>
      <pre className="d-code rounded-xl p-5 pr-24 overflow-x-auto text-[13px] leading-relaxed custom-scrollbar font-mono">{code}</pre>
    </div>
  );
}

function Tabs({ options, value, onChange }: { options: readonly (readonly [string, string])[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1 bg-[#0a130e] p-2 rounded-t-xl overflow-x-auto">
      {options.map(([k, label]) => (
        <button key={k} onClick={() => onChange(k)}
          className={`px-3.5 py-2 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-colors ${value === k ? 'bg-neon text-[#0d1712]' : 'text-[#9fb4a7] hover:text-white'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Endpoint({ m, path, svc }: { m: 'GET' | 'POST' | 'DELETE'; path: string; svc: string }) {
  const cls = m === 'GET' ? 'bg-[#1F7A54]' : m === 'POST' ? 'bg-[#D9F95F] text-[#0d1712]' : 'bg-[#C13B18]';
  return (
    <div className="d-card flex items-center gap-3 border rounded-xl px-4 py-3 font-mono">
      <span className={`text-[11px] font-extrabold tracking-wide px-2.5 py-1 rounded-md ${m === 'POST' ? cls : `${cls} text-white`}`}>{m}</span>
      <span className="text-sm font-semibold">{path}</span>
      <span className="ml-auto text-xs d-mut font-sans">{svc}</span>
    </div>
  );
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="d-head text-3xl font-black tracking-tight mt-16 mb-4 scroll-mt-24">{children}</h2>;
}

export function DocsPage() {
  const [lang, setLang] = useState('js');
  const [siteLang, setSiteLang] = useState('js');
  const [active, setActive] = useState('intro');
  const [dark, setDark] = useState(true); // thème sombre par défaut

  useEffect(() => {
    const ids = NAV.flatMap((g) => g.items.map(([id]) => id));
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: '-15% 0px -70% 0px' },
    );
    ids.forEach((id) => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  return (
    <div className="docsroot" data-theme={dark ? 'dark' : 'light'}>
      <style>{THEME_CSS}</style>
      <NavBar />

      <div className="pt-16">
        {/* ── Sidebar ── */}
        <aside className="d-side hidden lg:flex flex-col fixed top-16 left-0 w-64 h-[calc(100vh-4rem)] border-r px-6 py-7 overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xl font-black tracking-tight">WEB4ALL</div>
              <div className="text-[11px] font-bold d-mut uppercase tracking-widest mt-0.5">API Docs</div>
            </div>
            <button
              onClick={() => setDark((d) => !d)}
              title="Changer de thème"
              className="w-9 h-9 rounded-lg d-card border flex items-center justify-center hover:opacity-80 transition-opacity"
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>

          <nav className="mt-8 space-y-6">
            {NAV.map((g) => (
              <div key={g.group}>
                <div className="text-[10px] font-bold d-mut uppercase tracking-widest mb-2">{g.group}</div>
                <div className="space-y-0.5">
                  {g.items.map(([id, label]) => (
                    <a key={id} href={`#${id}`} className={`d-link block px-3 py-1.5 rounded-lg text-sm transition-colors ${active === id ? 'active' : ''}`}>
                      {label}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* ── Contenu centré ── */}
        <main className="lg:ml-64">
          <div className="max-w-3xl mx-auto px-6 md:px-10 py-10">
            {/* Intro */}
            <section id="intro" className="scroll-mt-24">
              <span className="inline-block bg-neon text-[#0d1712] text-[11px] font-extrabold tracking-wide px-3 py-1 rounded-full mb-5">REST · JSON</span>
              <h1 className="text-5xl font-black tracking-tight mb-4">Documentation API WEB4ALL</h1>
              <p className="d-mut text-lg leading-relaxed">
                Détecte les problèmes d'accessibilité (WCAG), renvoie l'analyse visuelle par catégorie et le scoring —
                pour une page, un bout de code, ou un site entier. Exemples en JavaScript, Python, Java, Go, Rust et C.
              </p>
              <hr className="d-line mt-8" />

              <h3 className="text-lg font-extrabold mt-10 mb-3">Base URLs</h3>
              <div className="d-card rounded-xl border overflow-hidden text-sm">
                <div className="grid grid-cols-[130px_1fr_150px] px-4 py-2.5 border-b d-line text-[11px] font-bold uppercase tracking-wider d-mut"><span>Accès</span><span>Base URL</span><span>Note</span></div>
                <div className="grid grid-cols-[130px_1fr_150px] px-4 py-3 border-b d-line items-center"><span>Direct (dev)</span><span className="font-mono text-xs">:3005 audit · :3002 crawler · :3001 report</span><span className="d-mut">rapide en local</span></div>
                <div className="grid grid-cols-[130px_1fr_150px] px-4 py-3 items-center"><span>Gateway</span><span className="font-mono text-xs">:8090/api/audit · /api/crawler · /api/report</span><span className="d-mut">exige un JWT</span></div>
              </div>
            </section>

            <H2 id="auth">Authentification</H2>
            <p className="d-mut mb-4">Les services acceptent un JWT Keycloak. En direct, l'auth n'est pas forcée. Via le gateway, elle est obligatoire.</p>
            <CodeBlock code={`Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cC ...`} />

            <H2 id="inline">Audit de code — détection instantanée</H2>
            <p className="d-mut mb-4">Audite directement du HTML/CSS/JS collé, sans héberger de site. Renvoie le score, les erreurs (axe-core) et l'analyse WAVE.</p>
            <div className="mb-4"><Endpoint m="POST" path="/audit/inline" svc="audit-service · :3005" /></div>
            <div className="rounded-xl border d-line overflow-hidden shadow-sm">
              <Tabs options={LANGS} value={lang} onChange={setLang} />
              <CodeBlock code={INLINE[lang]} />
            </div>
            <h3 className="text-base font-bold mt-8 mb-2">Réponse</h3>
            <CodeBlock code={RESPONSE_JSON} />

            <H2 id="file">Audit de fichier</H2>
            <p className="d-mut mb-4">Envoie un fichier composant : le framework est détecté, le balisage extrait puis audité (best-effort).</p>
            <div className="mb-4"><Endpoint m="POST" path="/audit/file" svc="audit-service · :3005" /></div>
            <CodeBlock code={FILE_CODE} />

            <H2 id="site">Site complet — crawl &amp; audit</H2>
            <p className="d-mut mb-4">Lancer le crawl → suivre le statut → lire le détail par page.</p>
            <div className="space-y-2 mb-4">
              <Endpoint m="POST" path="/website-audits" svc="crawler · :3002" />
              <Endpoint m="GET" path="/website-audits/:id" svc="crawler · :3002" />
              <Endpoint m="GET" path="/page-audits/:id" svc="report · :3001" />
            </div>
            <div className="rounded-xl border d-line overflow-hidden shadow-sm">
              <Tabs options={[['js', 'JavaScript'], ['py', 'Python'], ['bash', 'cURL']] as const} value={siteLang} onChange={setSiteLang} />
              <CodeBlock code={SITE[siteLang]} />
            </div>

            <H2 id="response">Issues &amp; WAVE</H2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="d-card rounded-xl border p-5">
                <h4 className="font-bold mb-2">issues[] — détection</h4>
                <p className="text-sm d-mut">ruleId, impact, help, helpUrl, nodes, details[] (target, html, location).</p>
              </div>
              <div className="d-card rounded-xl border p-5">
                <h4 className="font-bold mb-2">waveAnalysis — par catégorie</h4>
                <p className="text-sm d-mut">summary : errors, contrastErrors, alerts, features, structure, aria. categories : éléments + boundingBox.</p>
              </div>
            </div>

            <H2 id="scoring">Scoring</H2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="d-card rounded-xl border p-5">
                <h4 className="font-bold mb-2">Scores</h4>
                <p className="text-sm d-mut">pageScore 0–100, categoryScores (4 principes), wcagCompliance, globalScore (site).</p>
              </div>
              <div className="d-card rounded-xl border-l-4 p-5" style={{ borderLeftColor: '#D9F95F' }}>
                <h4 className="font-bold mb-2">Pénalités par sévérité</h4>
                <p className="text-sm d-mut"><b className="text-red-500">CRITICAL −15</b> · <b className="text-orange-400">SERIOUS −10</b> · <b className="text-yellow-400">MODERATE −5</b> · <b className="text-blue-400">MINOR −2</b>.</p>
              </div>
            </div>

            <H2 id="other">Autres endpoints</H2>
            <div className="space-y-2">
              <Endpoint m="GET" path="/dashboard/stats" svc="report · :3001" />
              <Endpoint m="GET" path="/website-audits/:id/pages" svc="report · :3001" />
              <Endpoint m="GET" path="/website-audits/:id/export/json" svc="report · :3001" />
              <Endpoint m="GET" path="/website-audits/:id/export/csv" svc="report · :3001" />
              <Endpoint m="GET" path="/website-audits/:id/report/pdf" svc="report · :3001" />
              <Endpoint m="DELETE" path="/website-audits/:id" svc="crawler · :3002" />
            </div>

            <p className="text-xs d-mut mt-16 mb-8">WEB4ALL — API REST · documentation générée depuis le code du projet.</p>
          </div>
        </main>
      </div>
    </div>
  );
}
