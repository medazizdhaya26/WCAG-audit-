// URLs des services — configurables par variables d'environnement Vite.
// En local : valeurs par défaut (localhost). En prod (EC2) : définies dans .env.production
// (ex: VITE_REPORT_URL=http://<IP_EC2>:3001 ou via un reverse proxy /api/report).
const env = import.meta.env as Record<string, string | undefined>;

export const CRAWLER_URL  = env.VITE_CRAWLER_URL  ?? 'http://localhost:3002';
export const AUDIT_URL    = env.VITE_AUDIT_URL    ?? 'http://localhost:3005';
export const REPORT_URL   = env.VITE_REPORT_URL   ?? 'http://localhost:3001';
export const USER_URL     = env.VITE_USER_URL     ?? 'http://localhost:8100';
export const KEYCLOAK_URL = env.VITE_KEYCLOAK_URL ?? 'http://localhost:8081';
