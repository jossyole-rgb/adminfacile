/* =========================
   CONFIGURATION PAR ENVIRONNEMENT
   L'URL de l'API dépend de l'adresse du site, jamais d'un paramètre
   modifiable par l'utilisateur (pour ne pas envoyer le token ailleurs).
========================= */

export const URLS_API = {
  production: "https://adminfacile.onrender.com",
  // Service Render de test (à créer) : voir docs/DEPLOIEMENT.md.
  test: "https://adminfacile-test.onrender.com",
  local: "http://localhost:3000"
};

export function detecterEnvironnement(hostname) {
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "local";
  }

  // Déploiements Netlify de branche ou de prévisualisation : develop--site.netlify.app
  if (hostname.endsWith(".netlify.app") && hostname.includes("--")) {
    return "test";
  }

  return "production";
}

export const ENVIRONNEMENT = detecterEnvironnement(window.location.hostname);

export const API_URL = URLS_API[ENVIRONNEMENT];
