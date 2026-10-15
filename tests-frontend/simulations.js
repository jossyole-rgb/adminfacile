/* =========================
   SIMULATIONS PARTAGÉES DES TESTS NAVIGATEUR
   Firebase (modules gstatic), CDN et API AdminFacile simulés.
========================= */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const RACINE = path.join(__dirname, "..");

// Pages servies depuis 127.0.0.1 : environnement « local » (js/config.js).
const API = "http://localhost:3000";

function fauxFirebaseAuth(connecte) {
  return `
const utilisateur = ${connecte ? `{
  uid: "alice",
  email: "alice@example.test",
  emailVerified: true,
  getIdToken: async () => "token-test-alice",
}` : "null"};
export function getAuth() { return {}; }
export function onAuthStateChanged(auth, cb) { setTimeout(() => cb(utilisateur), 0); }
export async function signOut() {}
export async function createUserWithEmailAndPassword() { return { user: utilisateur }; }
export async function signInWithEmailAndPassword() { return { user: utilisateur }; }
export async function sendPasswordResetEmail() {}
export async function sendEmailVerification() {}
`;
}

const FAUX_FIREBASE_APP = `export function initializeApp() { return {}; }`;

const FAUX_FIRESTORE = `
const vide = { size: 0, empty: true, docs: [], forEach() {} };
export function getFirestore() { return {}; }
export function collection(...a) { return a; }
export function doc(...a) { return a; }
export function query(...a) { return a; }
export function where(...a) { return a; }
export async function getDocs() { return vide; }
export async function getDoc() { return { exists: () => false, data: () => ({}) }; }
export async function addDoc() { window.__ajouts = (window.__ajouts || 0) + 1; return { id: "x" }; }
export async function setDoc() {}
export async function deleteDoc() {}
`;

function reponsesParDefaut() {
  return {
    "/api/me": { status: 200, body: { premium: false, lettersRemaining: 2, lettersUsed: 1, freeLimit: 3 } },
    "/api/letters": { status: 200, body: { lettres: [], total: 0, suivant: null } },
  };
}

/**
 * Installe les simulations sur une page.
 * Retourne { requetesAPI, reponsesAPI } : les tests modifient reponsesAPI à la volée.
 */
async function simulerServices(page, { connecte = true, reponsesAPI = reponsesParDefaut(), requetesAPI = [] } = {}) {
  const module = (body) => ({ status: 200, contentType: "text/javascript", body });

  await page.route("https://www.gstatic.com/firebasejs/**/firebase-app.js", (r) => r.fulfill(module(FAUX_FIREBASE_APP)));
  await page.route("https://www.gstatic.com/firebasejs/**/firebase-auth.js", (r) => r.fulfill(module(fauxFirebaseAuth(connecte))));
  await page.route("https://www.gstatic.com/firebasejs/**/firebase-firestore.js", (r) => r.fulfill(module(FAUX_FIRESTORE)));
  await page.route(/cdnjs\.cloudflare\.com|unpkg\.com/, (r) => r.fulfill(module("")));

  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const chemin = url.pathname;

    if (req.method() === "OPTIONS") return route.fulfill({ status: 204 });

    requetesAPI.push({ chemin, recherche: url.search, methode: req.method(), headers: req.headers(), body: req.postData() });

    const reponse = reponsesAPI[`${req.method()} ${chemin}`] || reponsesAPI[chemin] || { status: 404, body: { error: "inconnu" } };

    if (reponse.status === 204) {
      return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*" } });
    }

    return route.fulfill({
      status: reponse.status,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(reponse.body),
    });
  });

  return { requetesAPI, reponsesAPI };
}

function creerServeurStatique() {
  return http.createServer((req, res) => {
    const chemin = path.join(RACINE, decodeURIComponent(req.url.split("?")[0]));

    if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) {
      res.writeHead(404);
      return res.end();
    }

    const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
    res.writeHead(200, { "Content-Type": types[path.extname(chemin)] || "application/octet-stream" });
    return res.end(fs.readFileSync(chemin));
  });
}

module.exports = { API, simulerServices, reponsesParDefaut, creerServeurStatique };
