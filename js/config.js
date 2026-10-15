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


/* =========================
   CONFIGURATION FIREBASE (WEB)
   Identifiants publics de projet, pas des secrets : l'accès aux données est protégé
   par les règles Firestore et par l'API. Le projet de test est à renseigner quand il
   sera créé (docs/DEPLOIEMENT.md) ; d'ici là, le site de test utilise le projet de
   production, et une API de test branchée sur un autre projet refusera ses tokens (401).
========================= */

export const CONFIGS_FIREBASE = {
  production: {
    apiKey: "AIzaSyB_tDtb1IlbIkBi8vGspHUncepJBnD1Yrc",
    authDomain: "adminfacile.firebaseapp.com",
    projectId: "adminfacile",
    storageBucket: "adminfacile.firebasestorage.app",
    messagingSenderId: "537898349850",
    appId: "1:537898349850:web:9c9aed045981be3cdaa8a3"
  },
  test: null
};

export function configurationFirebase(environnement) {
  return CONFIGS_FIREBASE[environnement] || CONFIGS_FIREBASE.production;
}
