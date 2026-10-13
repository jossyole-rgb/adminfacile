/* =========================
   TESTS QUOTA ET WEBHOOKS SUR FIRESTORE RÉEL (émulateur)
   Lancer : npm run test:emulateur
========================= */

const { test, describe, before, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");
const { creerServiceComptes } = require("../../services/comptes");
const { creerServiceFacturation } = require("../../services/facturation");
const { chargerConfig } = require("../../config");
const { silencieux } = require("../helpers");

const PROJET = "demo-adminfacile";

let db;

before(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("FIRESTORE_EMULATOR_HOST absent : lancer via npm run test:emulateur");
  }

  const app = admin.initializeApp({ projectId: PROJET }, "tests-serveur");
  db = app.firestore();
});

beforeEach(async () => {
  const reponse = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJET}/databases/(default)/documents`,
    { method: "DELETE" }
  );
  assert.equal(reponse.status, 200);
});

describe("Quota de génération (transactions Firestore)", () => {
  test("20 requêtes simultanées d'un compte gratuit → exactement 3 autorisées", async () => {
    const comptes = creerServiceComptes(db, { limiteGratuite: 3 });

    const resultats = await Promise.all(
      Array.from({ length: 20 }, () => comptes.reserverGeneration("alice"))
    );

    assert.equal(resultats.filter((r) => r.autorise).length, 3);
    const usage = await db.doc("usage/alice").get();
    assert.equal(usage.data().lettersUsed, 3);
  });

  test("compte existant : le compteur démarre au nombre de lettres déjà générées", async () => {
    await db.collection("lettres").add({ userId: "bob", contenu: "1" });
    await db.collection("lettres").add({ userId: "bob", contenu: "2" });
    await db.collection("lettres").add({ userId: "autre", contenu: "x" });

    const comptes = creerServiceComptes(db, { limiteGratuite: 3 });

    assert.equal((await comptes.lireEtatCompte("bob")).lettersRemaining, 1);
    assert.equal((await comptes.reserverGeneration("bob")).autorise, true);
    assert.equal((await comptes.reserverGeneration("bob")).autorise, false);
  });

  test("supprimer des lettres ne redonne pas de générations gratuites", async () => {
    const comptes = creerServiceComptes(db, { limiteGratuite: 3 });

    for (let i = 0; i < 3; i++) await comptes.reserverGeneration("alice");
    // L'historique « lettres » est vide (comme après suppressions), le compteur serveur fait foi.
    assert.equal((await comptes.reserverGeneration("alice")).autorise, false);
  });

  test("Premium actif : pas de limite", async () => {
    await db.doc("users/vip").set({ premium: true, subscriptionStatus: "active" });
    const comptes = creerServiceComptes(db, { limiteGratuite: 3 });

    const resultats = await Promise.all(Array.from({ length: 6 }, () => comptes.reserverGeneration("vip")));
    assert.ok(resultats.every((r) => r.autorise));
  });

  test("Premium en impayé (past_due) : limite gratuite appliquée", async () => {
    await db.doc("users/impaye").set({ premium: true, subscriptionStatus: "past_due" });
    await db.doc("usage/impaye").set({ lettersUsed: 10 });
    const comptes = creerServiceComptes(db, { limiteGratuite: 3 });

    assert.equal((await comptes.reserverGeneration("impaye")).autorise, false);
  });

  test("libération après échec : la tentative est rendue", async () => {
    const comptes = creerServiceComptes(db, { limiteGratuite: 3 });

    await comptes.reserverGeneration("alice");
    await comptes.libererGeneration("alice");

    assert.equal((await db.doc("usage/alice").get()).data().lettersUsed, 0);
    assert.equal((await comptes.lireEtatCompte("alice")).lettersRemaining, 3);
  });
});

describe("Facturation Stripe (Firestore réel, Stripe simulé)", () => {
  function fauxStripe() {
    const appels = [];
    return {
      appels,
      checkout: { sessions: { create: async (p) => (appels.push(["checkout", p]), { url: "https://checkout.test" }) } },
      billingPortal: { sessions: { create: async (p) => (appels.push(["portail", p]), { url: "https://portal.test" }) } },
    };
  }

  function service(stripe = fauxStripe()) {
    const config = { ...chargerConfig({}), stripePriceId: "price_test" };
    return { stripe, facturation: creerServiceFacturation({ db, stripe, config, logger: silencieux }) };
  }

  const evenement = (id, type, objet, created) => ({ id, type, created, data: { object: objet } });

  test("checkout.session.completed active le Premium du uid de la session", async () => {
    const { facturation } = service();

    const r = await facturation.traiterEvenement(
      evenement("evt_a", "checkout.session.completed", { id: "cs_1", client_reference_id: "alice", customer: "cus_alice", subscription: "sub_1", customer_details: { email: "alice@example.test" } }, 100)
    );

    assert.equal(r.statut, "traite");
    const user = (await db.doc("users/alice").get()).data();
    assert.equal(user.premium, true);
    assert.equal(user.subscriptionStatus, "active");
    assert.equal(user.stripeCustomerId, "cus_alice");
    assert.equal(user.stripeSubscriptionId, "sub_1");
  });

  test("un événement rejoué n'est traité qu'une fois (idempotence)", async () => {
    const { facturation } = service();
    const evt = evenement("evt_b", "customer.subscription.deleted", { id: "sub_1", customer: "cus_alice", metadata: {} }, 200);

    await db.doc("users/alice").set({ premium: true, subscriptionStatus: "active", stripeCustomerId: "cus_alice" });

    assert.equal((await facturation.traiterEvenement(evt)).statut, "traite");

    // Réactivation manuelle entre-temps : le rejeu ne doit pas l'écraser.
    await db.doc("users/alice").update({ premium: true, subscriptionStatus: "active" });

    assert.equal((await facturation.traiterEvenement(evt)).statut, "doublon");
    assert.equal((await db.doc("users/alice").get()).data().premium, true);
    assert.equal((await db.doc("stripeEvents/evt_b").get()).data().status, "processed");
  });

  test("un événement plus ancien n'écrase pas un état plus récent", async () => {
    const { facturation } = service();
    await db.doc("users/alice").set({ stripeCustomerId: "cus_alice" });

    await facturation.traiterEvenement(evenement("evt_new", "customer.subscription.updated", { id: "sub_1", customer: "cus_alice", status: "active" }, 300));
    await facturation.traiterEvenement(evenement("evt_old", "customer.subscription.updated", { id: "sub_1", customer: "cus_alice", status: "incomplete" }, 250));

    const user = (await db.doc("users/alice").get()).data();
    assert.equal(user.subscriptionStatus, "active");
    assert.equal(user.premium, true);
  });

  test("renouvellement échoué puis annulation", async () => {
    const { facturation } = service();
    await db.doc("users/alice").set({ premium: true, subscriptionStatus: "active", stripeCustomerId: "cus_alice" });

    await facturation.traiterEvenement(evenement("evt_f", "invoice.payment_failed", { id: "in_1", customer: "cus_alice" }, 400));
    let user = (await db.doc("users/alice").get()).data();
    assert.equal(user.premium, false);
    assert.equal(user.subscriptionStatus, "payment_failed");

    await facturation.traiterEvenement(evenement("evt_d", "customer.subscription.deleted", { id: "sub_1", customer: "cus_alice" }, 500));
    user = (await db.doc("users/alice").get()).data();
    assert.equal(user.subscriptionStatus, "canceled");
  });

  test("paiement réussi après impayé : retour en Premium via subscription.updated", async () => {
    const { facturation } = service();
    await db.doc("users/alice").set({ premium: false, subscriptionStatus: "payment_failed", stripeCustomerId: "cus_alice", stripeEventCreated: 400 });

    await facturation.traiterEvenement(evenement("evt_ok", "customer.subscription.updated", { id: "sub_1", customer: "cus_alice", status: "active" }, 450));
    assert.equal((await db.doc("users/alice").get()).data().premium, true);
  });

  test("abonnement retrouvé via metadata.uid si le client n'est pas encore lié", async () => {
    const { facturation } = service();

    await facturation.traiterEvenement(evenement("evt_m", "customer.subscription.updated", { id: "sub_9", customer: "cus_new", status: "active", metadata: { uid: "zoe" } }, 10));
    const user = (await db.doc("users/zoe").get()).data();
    assert.equal(user.stripeCustomerId, "cus_new");
    assert.equal(user.premium, true);
  });

  test("événement non géré : ignoré sans écriture", async () => {
    const { facturation } = service();
    assert.equal((await facturation.traiterEvenement(evenement("evt_x", "charge.refunded", {}, 1))).statut, "ignore");
    assert.equal((await db.doc("stripeEvents/evt_x").get()).exists, false);
  });

  test("portail : utilise le client Stripe enregistré pour ce uid", async () => {
    const { facturation, stripe } = service();
    await db.doc("users/bob").set({ stripeCustomerId: "cus_bob" });

    await facturation.creerSessionPortail({ uid: "bob" });
    assert.equal(stripe.appels[0][1].customer, "cus_bob");

    await assert.rejects(facturation.creerSessionPortail({ uid: "alice" }), (e) => e.status === 404);
  });

  test("checkout : client existant réutilisé, Premium actif refusé", async () => {
    const { facturation, stripe } = service();

    await facturation.creerSessionCheckout({ uid: "alice", email: "alice@example.test" });
    assert.equal(stripe.appels[0][1].client_reference_id, "alice");
    assert.equal(stripe.appels[0][1].customer_email, "alice@example.test");

    await db.doc("users/bob").set({ stripeCustomerId: "cus_bob", premium: false, subscriptionStatus: "canceled" });
    await facturation.creerSessionCheckout({ uid: "bob", email: "bob@example.test" });
    assert.equal(stripe.appels[1][1].customer, "cus_bob");
    assert.equal(stripe.appels[1][1].customer_email, undefined);

    await db.doc("users/vip").set({ stripeCustomerId: "cus_vip", premium: true, subscriptionStatus: "active" });
    await assert.rejects(facturation.creerSessionCheckout({ uid: "vip", email: "v@example.test" }), (e) => e.status === 409);
  });
});
