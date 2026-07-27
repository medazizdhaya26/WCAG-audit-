import Keycloak from 'keycloak-js';
import axios from 'axios';

// Client public défini dans le realm web4all (voir keycloak/realm-web4all.json)
export const keycloak = new Keycloak({
  url: 'http://localhost:8081',
  realm: 'web4all',
  clientId: 'web4all-frontend',
});

let initialized = false;

/** Initialise Keycloak (check-sso : ne force pas le login, détecte une session existante). */
export async function initKeycloak(): Promise<boolean> {
  if (initialized) return keycloak.authenticated ?? false;
  initialized = true;
  try {
    const authed = await keycloak.init({
      onLoad: 'check-sso',
      silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
      pkceMethod: 'S256',
    });

    // Ajoute automatiquement le token Bearer à toutes les requêtes axios
    axios.interceptors.request.use(async (config) => {
      if (keycloak.authenticated) {
        try { await keycloak.updateToken(30); } catch { /* token non rafraîchi */ }
        config.headers = config.headers ?? {};
        (config.headers as any).Authorization = `Bearer ${keycloak.token}`;
      }
      return config;
    });

    // Rafraîchit le token périodiquement
    setInterval(() => {
      keycloak.updateToken(60).catch(() => {});
    }, 30000);

    return authed;
  } catch (e) {
    console.error('[Keycloak] init error', e);
    return false;
  }
}

export const login = () => keycloak.login({ redirectUri: window.location.href });
export const logout = () => keycloak.logout({ redirectUri: window.location.origin });
export const isAuthenticated = () => keycloak.authenticated ?? false;
export const currentUser = () => ({
  username: (keycloak.tokenParsed as any)?.preferred_username,
  email: (keycloak.tokenParsed as any)?.email,
  name: (keycloak.tokenParsed as any)?.name,
  roles: (keycloak.tokenParsed as any)?.realm_access?.roles ?? [],
});

/** Identifiant Keycloak (sub) de l'utilisateur connecté, ou null. */
export const currentUserId = (): string | null => (keycloak.tokenParsed as any)?.sub ?? null;

/** Vrai si l'utilisateur a le rôle ADMIN. */
export const isAdmin = (): boolean =>
  ((keycloak.tokenParsed as any)?.realm_access?.roles ?? []).includes('ADMIN');
