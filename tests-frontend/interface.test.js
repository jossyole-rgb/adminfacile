/* =========================
   TESTS D'INTERFACE (Chromium headless, sans réseau)
   Firebase, l'API et les CDN sont simulés par interception des requêtes.
   Lancer : npm run test:interface
========================= */

const { test, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { API, simulerServices, reponsesParDefaut, creerServeurStatique } = require("./simulations");

let serveur;
let navigateur;
let page;
let requetesAPI;
let reponsesAPI;
let erreursPage;

before(async () => {
  serveur = creerServeurStatique();
  await new Promise((r) => serveur.listen(0, "127.0.0.1", r));
  navigateur = await chromium.launch();
});

after(async () => {
  await navigateur.close();
  serveur.close();
});

beforeEach(async () => {
  requetesAPI = [];
  reponsesAPI = reponsesParDefaut();

  page = await navigateur.newPage();
  erreursPage = [];
  page.on("pageerror", (erreur) => erreursPage.push(erreur.message));

  await simulerServices(page, { reponsesAPI, requetesAPI });

  const adresse = serveur.address();
  await page.goto(`http://127.0.0.1:${adresse.port}/dashboard.html`);
  await page.waitForFunction(() => document.getElementById("userEmail").innerText === "alice@example.test");
});

afterEach(async () => {
  await page.close();
  // Aucune erreur JavaScript non interceptée (modules introuvables, variables non définies…).
  assert.deepEqual(erreursPage, []);
});

test("toutes les fonctions appelées par les boutons de la page existent", async () => {
  const manquantes = await page.evaluate(() =>
    [...document.querySelectorAll("[onclick]")]
      .map((el) => el.getAttribute("onclick").match(/^\s*([\w]+)\(/))
      .filter(Boolean)
      .map((m) => m[1])
      .filter((nom) => typeof window[nom] !== "function")
  );
  assert.deepEqual(manquantes, []);
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
  // Le bouton est réactivé une fois le tableau de bord rafraîchi.
  await page.waitForFunction(() => !document.getElementById("btnGenerer").disabled);
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

test("historique : chargé via l'API, échappé, paginé", async () => {
  reponsesAPI["/api/letters"] = {
    status: 200,
    body: {
      lettres: [{ id: "l1", type: "caf", date: "13/10/2026", destinataire: "CAF", apercu: "<script>window.__xss=2</script>Bonjour" }],
      total: 2,
      suivant: 1,
    },
  };

  await page.click("button[onclick='chargerHistorique()']");
  await page.waitForSelector(".lettre-card");

  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.match(await page.locator(".lettre-card p").innerText(), /<script>/);
  assert.match(await page.locator("#btnHistoriqueSuite").innerText(), /1 restantes/);

  reponsesAPI["/api/letters"] = {
    status: 200,
    body: { lettres: [{ id: "l2", type: "apl", date: "01/01/2026", apercu: "Deuxième" }], total: 2, suivant: null },
  };

  await page.click("#btnHistoriqueSuite");
  await page.waitForFunction(() => document.querySelectorAll(".lettre-card").length === 2);
  assert.equal(await page.locator("#btnHistoriqueSuite").count(), 0);

  const appels = requetesAPI.filter((r) => r.chemin === "/api/letters" && r.recherche.includes("limit=10"));
  assert.deepEqual(appels.map((r) => r.recherche), ["?limit=10&offset=0", "?limit=10&offset=1"]);
});

test("historique : suppression après confirmation, via l'API avec token", async () => {
  reponsesAPI["/api/letters"] = {
    status: 200,
    body: { lettres: [{ id: "l1", type: "caf", date: "13/10/2026", apercu: "Texte" }], total: 1, suivant: null },
  };
  reponsesAPI["DELETE /api/letters/l1"] = { status: 204 };

  await page.click("button[onclick='chargerHistorique()']");
  await page.waitForSelector(".lettre-card");
  await page.click(".btn-supprimer");

  assert.equal(await page.locator("#confirmModal h3").innerText(), "🗑️ Supprimer cette lettre ?");
  assert.equal(requetesAPI.filter((r) => r.methode === "DELETE").length, 0, "rien n'est supprimé avant confirmation");

  const attenteSuppression = page.waitForRequest((r) => r.method() === "DELETE");
  await page.click("#confirmDeleteBtn");
  await attenteSuppression;
  // Après suppression, l'historique est rechargé.
  await page.waitForFunction(() => document.getElementById("notification").innerText.includes("Historique chargé"));

  const suppression = requetesAPI.find((r) => r.methode === "DELETE");
  assert.equal(suppression.chemin, "/api/letters/l1");
  assert.equal(suppression.headers.authorization, "Bearer token-test-alice");
});

test("lettre générée : plus d'écriture Firestore côté navigateur", async () => {
  reponsesAPI["/generer-lettre"] = { status: 200, body: { id: "l9", sauvegardee: true, lettre: "Lettre." } };

  await page.fill("#nom", "Alice");
  await page.fill("#destinataire", "CAF");
  await page.fill("#objet", "Objet");
  await page.click("#btnGenerer");

  await page.waitForFunction(() => document.getElementById("notification").innerText.includes("sauvegardée"));
  assert.equal(await page.evaluate(() => window.__ajouts || 0), 0);
});

test("suppression de compte : confirmation obligatoire puis appel DELETE /api/me", async () => {
  reponsesAPI["DELETE /api/me"] = { status: 200, body: { supprime: true } };

  await page.click(".zone-compte summary");
  await page.fill("#confirmationSuppression", "supprimer");
  await page.click("#btnSupprimerCompte");
  await page.waitForFunction(() => document.getElementById("notification").innerText.includes("Saisis SUPPRIMER"));
  assert.equal(requetesAPI.filter((r) => r.methode === "DELETE").length, 0);

  await page.fill("#confirmationSuppression", "SUPPRIMER");
  const attente = page.waitForRequest((r) => r.method() === "DELETE");
  await page.click("#btnSupprimerCompte");
  await attente;
  await page.waitForURL(/index\.html$/);

  const appel = requetesAPI.find((r) => r.methode === "DELETE");
  assert.equal(appel.chemin, "/api/me");
  assert.deepEqual(JSON.parse(appel.body), { confirmation: "SUPPRIMER" });
  assert.equal(appel.headers.authorization, "Bearer token-test-alice");
});

test("URL de l'API selon l'adresse du site", async () => {
  const resultats = await page.evaluate(async () => {
    const { detecterEnvironnement } = await import("/js/config.js");
    return [
      "adminfacile-app.netlify.app",
      "develop--adminfacile-app.netlify.app",
      "deploy-preview-3--adminfacile-app.netlify.app",
      "localhost",
      "127.0.0.1",
      "exemple--pirate.com",
    ].map(detecterEnvironnement);
  });

  assert.deepEqual(resultats, ["production", "test", "test", "local", "local", "production"]);
});

test("page de paiement réussi : Premium annoncé seulement après confirmation du serveur", async () => {
  reponsesAPI["/api/me"] = { status: 200, body: { premium: false } };

  const adresse = serveur.address();
  await page.goto(`http://127.0.0.1:${adresse.port}/success.html`);
  await page.waitForFunction(() => document.getElementById("statutActivation").innerText.includes("en cours"));

  reponsesAPI["/api/me"] = { status: 200, body: { premium: true } };
  await page.waitForFunction(
    () => document.getElementById("statutActivation").innerText.includes("Premium est actif"),
    null,
    { timeout: 10000 }
  );

  const appels = requetesAPI.filter((r) => r.chemin === "/api/me" && r.headers.authorization === "Bearer token-test-alice");
  assert.ok(appels.length >= 2);
});
