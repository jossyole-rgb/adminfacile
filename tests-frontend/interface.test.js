/* =========================
   TESTS D'INTERFACE (Chromium headless, sans réseau)
   Firebase, l'API et les CDN sont simulés par interception des requêtes.
   Lancer : npm run test:interface
========================= */

const { test, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const RACINE = path.join(__dirname, "..");
const API = "https://adminfacile.onrender.com";

const FAUX_FIREBASE_APP = `export function initializeApp() { return {}; }`;

const FAUX_FIREBASE_AUTH = `
const utilisateur = {
  uid: "alice",
  email: "alice@example.test",
  emailVerified: true,
  getIdToken: async () => "token-test-alice",
};
export function getAuth() { return {}; }
export function onAuthStateChanged(auth, cb) { setTimeout(() => cb(utilisateur), 0); }
export async function signOut() {}
export async function createUserWithEmailAndPassword() { return { user: utilisateur }; }
export async function signInWithEmailAndPassword() { return { user: utilisateur }; }
export async function sendPasswordResetEmail() {}
export async function sendEmailVerification() {}
`;

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

let serveur;
let navigateur;
let page;
let requetesAPI;
let reponsesAPI;

function servirFichiers(req, res) {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split("?")[0]));

  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) {
    res.writeHead(404);
    return res.end();
  }

  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
  res.writeHead(200, { "Content-Type": types[path.extname(chemin)] || "application/octet-stream" });
  return res.end(fs.readFileSync(chemin));
}

before(async () => {
  serveur = http.createServer(servirFichiers);
  await new Promise((r) => serveur.listen(0, "127.0.0.1", r));
  navigateur = await chromium.launch();
});

after(async () => {
  await navigateur.close();
  serveur.close();
});

beforeEach(async () => {
  requetesAPI = [];
  reponsesAPI = {
    "/api/me": { status: 200, body: { premium: false, lettersRemaining: 2, lettersUsed: 1, freeLimit: 3 } },
  };

  page = await navigateur.newPage();

  const module = (body) => ({ status: 200, contentType: "text/javascript", body });

  await page.route("https://www.gstatic.com/firebasejs/**/firebase-app.js", (r) => r.fulfill(module(FAUX_FIREBASE_APP)));
  await page.route("https://www.gstatic.com/firebasejs/**/firebase-auth.js", (r) => r.fulfill(module(FAUX_FIREBASE_AUTH)));
  await page.route("https://www.gstatic.com/firebasejs/**/firebase-firestore.js", (r) => r.fulfill(module(FAUX_FIRESTORE)));
  await page.route(/cdnjs\.cloudflare\.com|unpkg\.com/, (r) => r.fulfill(module("")));

  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    const chemin = new URL(req.url()).pathname;

    if (req.method() === "OPTIONS") return route.fulfill({ status: 204 });

    requetesAPI.push({ chemin, methode: req.method(), headers: req.headers(), body: req.postData() });

    const reponse = reponsesAPI[chemin] || { status: 404, body: { error: "inconnu" } };
    return route.fulfill({
      status: reponse.status,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(reponse.body),
    });
  });

  const adresse = serveur.address();
  await page.goto(`http://127.0.0.1:${adresse.port}/dashboard.html`);
  await page.waitForFunction(() => document.getElementById("userEmail").innerText === "alice@example.test");
});

afterEach(async () => {
  await page.close();
});

test("le quota affiché vient du serveur (/api/me) avec le token", async () => {
  await page.waitForFunction(() => document.getElementById("limiteGratuite").innerText === "2 restantes");
  const appel = requetesAPI.find((r) => r.chemin === "/api/me");
  assert.equal(appel.headers.authorization, "Bearer token-test-alice");
});

test("générer une lettre envoie le token et affiche le résultat", async () => {
  reponsesAPI["/generer-lettre"] = { status: 200, body: { lettre: "Madame, Monsieur,\nLettre générée." } };

  await page.fill("#nom", "Alice Martin");
  await page.fill("#destinataire", "CAF");
  await page.fill("#objet", "Demande de délai");
  await page.click("#btnGenerer");

  await page.waitForFunction(() => document.getElementById("resultat").innerText.includes("Lettre générée."));

  const appel = requetesAPI.find((r) => r.chemin === "/generer-lettre");
  assert.equal(appel.headers.authorization, "Bearer token-test-alice");
  const corps = JSON.parse(appel.body);
  assert.equal(corps.nom, "Alice Martin");
  assert.equal(corps.uid, undefined);
  assert.equal(await page.isEnabled("#btnPDF"), true);
});

test("quota atteint (402) : message clair, aucun enregistrement", async () => {
  reponsesAPI["/generer-lettre"] = { status: 402, body: { error: "Limite gratuite atteinte.", code: "QUOTA_EXCEEDED" } };

  await page.fill("#nom", "Alice");
  await page.fill("#destinataire", "CAF");
  await page.fill("#objet", "Objet");
  await page.click("#btnGenerer");

  await page.waitForFunction(() => document.getElementById("resultat").innerText.includes("Limite gratuite atteinte"));
  assert.equal(await page.evaluate(() => window.__ajouts || 0), 0);
  assert.equal(await page.isEnabled("#btnGenerer"), true);
});

test("erreur réseau : message lisible et bouton réactivé", async () => {
  await page.unroute(`${API}/**`);
  await page.route(`${API}/**`, (route) => route.abort("internetdisconnected"));

  await page.fill("#nom", "Alice");
  await page.fill("#destinataire", "CAF");
  await page.fill("#objet", "Objet");
  await page.click("#btnGenerer");

  await page.waitForFunction(() => document.getElementById("resultat").innerText.includes("Connexion au serveur impossible"));
  assert.equal(await page.isEnabled("#btnGenerer"), true);
});

test("une réponse IA contenant du HTML est affichée comme du texte (pas de XSS)", async () => {
  reponsesAPI["/chat-admin"] = { status: 200, body: { reponse: '<img src=x onerror="window.__xss=1">Bonjour' } };

  await page.fill("#chatInput", "<b>question</b>");
  await page.click("button[onclick='envoyerMessageIA()']");
  await page.waitForSelector(".message-ia");

  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.equal(await page.locator(".message-ia img").count(), 0);
  assert.equal(await page.locator(".message-user b").count(), 0);
  assert.match(await page.locator(".message-ia").innerText(), /<img src=x/);
});

test("Passer Premium : aucun uid ni email envoyé, token présent", async () => {
  reponsesAPI["/create-checkout-session"] = { status: 409, body: { error: "Ton abonnement Premium est déjà actif.", code: "ALREADY_PREMIUM" } };

  await page.click("button[onclick='passerPremium()']");
  await page.waitForFunction(() => document.getElementById("notification").innerText.includes("déjà actif"));

  const appel = requetesAPI.find((r) => r.chemin === "/create-checkout-session");
  assert.equal(appel.headers.authorization, "Bearer token-test-alice");
  assert.deepEqual(JSON.parse(appel.body), {});
});

test("Gérer mon abonnement : aucun customerId envoyé", async () => {
  reponsesAPI["/create-customer-portal-session"] = { status: 404, body: { error: "Aucun abonnement Stripe trouvé.", code: "NO_BILLING_ACCOUNT" } };

  await page.click("button[onclick='gererAbonnement()']");
  await page.waitForFunction(() => document.getElementById("notification").innerText.includes("Aucun abonnement"));

  const appel = requetesAPI.find((r) => r.chemin === "/create-customer-portal-session");
  assert.deepEqual(JSON.parse(appel.body), {});
});

test("analyse de document : erreur serveur affichée proprement", async () => {
  reponsesAPI["/upload-document"] = { status: 400, body: { error: "Le contenu du fichier ne correspond pas à son type.", code: "INVALID_FILE" } };

  await page.setInputFiles("#documentUpload", { name: "faux.pdf", mimeType: "application/pdf", buffer: Buffer.from("MZ") });
  await page.click("button[onclick='analyserDocument()']");

  await page.waitForFunction(() => document.getElementById("analyseDocumentResultat").innerText.includes("ne correspond pas"));
  const appel = requetesAPI.find((r) => r.chemin === "/upload-document");
  assert.equal(appel.headers.authorization, "Bearer token-test-alice");
});
