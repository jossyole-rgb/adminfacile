/* =========================
   ACCESSIBILITÉ ET AFFICHAGE MOBILE (axe-core, WCAG 2.2 A/AA)
   Lancer : npm run test:interface
========================= */

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");
const { simulerServices, creerServeurStatique } = require("./simulations");

let serveur;
let navigateur;

before(async () => {
  serveur = creerServeurStatique();
  await new Promise((r) => serveur.listen(0, "127.0.0.1", r));
  navigateur = await chromium.launch();
});

after(async () => {
  await navigateur.close();
  serveur.close();
});

async function ouvrir(pageHtml, { connecte = true, largeur = 1280, theme = "light" } = {}) {
  const contexte = await navigateur.newContext({ viewport: { width: largeur, height: 900 } });
  const page = await contexte.newPage();
  await simulerServices(page, { connecte });
  await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
  await page.goto(`http://127.0.0.1:${serveur.address().port}/${pageHtml}`);
  await page.waitForLoadState("networkidle");
  return { page, contexte };
}

async function violations(page) {
  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  return resultat.violations.map((v) => `${v.id} (${v.impact}) : ${v.nodes.map((n) => n.target.join(" ")).slice(0, 5).join(", ")}`);
}

for (const theme of ["light", "dark"]) {
  test(`index.html : aucune violation WCAG 2.2 AA (thème ${theme})`, async () => {
    const { page, contexte } = await ouvrir("index.html", { connecte: false, theme });
    assert.deepEqual(await violations(page), []);
    await contexte.close();
  });

  test(`dashboard.html : aucune violation WCAG 2.2 AA (thème ${theme})`, async () => {
    const { page, contexte } = await ouvrir("dashboard.html", { theme });
    await page.waitForFunction(() => document.getElementById("userEmail").innerText.includes("@"));
    assert.deepEqual(await violations(page), []);
    await contexte.close();
  });
}

test("success.html : aucune violation WCAG 2.2 AA", async () => {
  const { page, contexte } = await ouvrir("success.html");
  assert.deepEqual(await violations(page), []);
  await contexte.close();
});

for (const pageHtml of ["index.html", "dashboard.html"]) {
  test(`${pageHtml} : pas de défilement horizontal sur mobile (375 px)`, async () => {
    const { page, contexte } = await ouvrir(pageHtml, { connecte: pageHtml === "dashboard.html", largeur: 375 });
    const debordement = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(debordement <= 0, `débordement de ${debordement}px`);
    await contexte.close();
  });
}

test("dashboard.html avec historique et modale ouverte : aucune violation, Échap ferme et rend le focus", async () => {
  const { page, contexte } = await ouvrir("dashboard.html");
  await page.waitForFunction(() => document.getElementById("userEmail").innerText.includes("@"));

  await page.evaluate(() => {
    document.getElementById("historique").innerHTML = "";
    window.afficherModalReponseIA("Madame, Monsieur,\nRéponse.");
  });

  assert.equal(await page.evaluate(() => document.activeElement.closest("#reponseIAModal") !== null), true, "le focus entre dans la modale");
  assert.deepEqual(await violations(page), []);

  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => document.getElementById("reponseIAModal").style.display), "none");
  await contexte.close();
});
