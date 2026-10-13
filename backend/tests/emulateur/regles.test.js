/* =========================
   TESTS D'ISOLATION DES RÈGLES FIRESTORE (émulateur)
   Lancer : npm run test:emulateur
========================= */

const { test, describe, before, after, beforeEach } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const {
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
} = require("firebase/firestore");

let env;

before(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");

  env = await initializeTestEnvironment({
    projectId: "demo-adminfacile",
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, "../../../firestore.rules"), "utf8"),
      host,
      port: Number(port),
    },
  });
});

after(async () => {
  if (env) await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();

  await env.withSecurityRulesDisabled(async (contexte) => {
    const db = contexte.firestore();
    await setDoc(doc(db, "users/alice"), { email: "alice@example.test", premium: false, subscriptionStatus: "inactive", stripeCustomerId: null });
    await setDoc(doc(db, "users/bob"), { email: "bob@example.test", premium: true, subscriptionStatus: "active", stripeCustomerId: "cus_bob" });
    await setDoc(doc(db, "lettres/lettre-bob"), { userId: "bob", contenu: "Lettre de Bob" });
    await setDoc(doc(db, "lettres/lettre-alice"), { userId: "alice", contenu: "Lettre d'Alice" });
    await setDoc(doc(db, "analyses/analyse-bob"), { userId: "bob", resume: "Analyse de Bob" });
    await setDoc(doc(db, "documentChats/chat-bob"), { userId: "bob", question: "?" });
    await setDoc(doc(db, "usage/alice"), { lettersUsed: 3 });
    await setDoc(doc(db, "stripeEvents/evt_1"), { status: "processed" });
  });
});

const alice = () => env.authenticatedContext("alice").firestore();
const anonyme = () => env.unauthenticatedContext().firestore();

describe("users/{uid}", () => {
  test("un utilisateur lit son profil", async () => {
    await assertSucceeds(getDoc(doc(alice(), "users/alice")));
  });

  test("un utilisateur ne lit pas le profil d'un autre", async () => {
    await assertFails(getDoc(doc(alice(), "users/bob")));
  });

  test("un visiteur non connecté ne lit aucun profil", async () => {
    await assertFails(getDoc(doc(anonyme(), "users/alice")));
  });

  test("un utilisateur ne peut pas s'attribuer le Premium", async () => {
    await assertFails(updateDoc(doc(alice(), "users/alice"), { premium: true, subscriptionStatus: "active" }));
  });

  test("un utilisateur ne peut pas modifier son stripeCustomerId", async () => {
    await assertFails(updateDoc(doc(alice(), "users/alice"), { stripeCustomerId: "cus_bob" }));
  });

  test("création du profil initial (comme script.js) autorisée", async () => {
    const db = env.authenticatedContext("nouveau").firestore();
    await assertSucceeds(
      setDoc(doc(db, "users/nouveau"), {
        email: "nouveau@example.test",
        premium: false,
        subscriptionStatus: "inactive",
        stripeCustomerId: null,
        createdAt: new Date(),
      })
    );
  });

  test("création d'un profil déjà Premium refusée", async () => {
    const db = env.authenticatedContext("nouveau").firestore();
    await assertFails(setDoc(doc(db, "users/nouveau"), { email: "n@example.test", premium: true, subscriptionStatus: "active", stripeCustomerId: null }));
  });

  test("création du profil d'un autre uid refusée", async () => {
    const db = env.authenticatedContext("nouveau").firestore();
    await assertFails(setDoc(doc(db, "users/autre"), { email: "n@example.test", premium: false, subscriptionStatus: "inactive", stripeCustomerId: null }));
  });
});

describe("lettres, analyses, documentChats", () => {
  for (const [collectionNom, idAutre] of [
    ["lettres", "lettre-bob"],
    ["analyses", "analyse-bob"],
    ["documentChats", "chat-bob"],
  ]) {
    test(`${collectionNom} : lecture d'un document d'un autre refusée`, async () => {
      await assertFails(getDoc(doc(alice(), `${collectionNom}/${idAutre}`)));
    });

    test(`${collectionNom} : suppression d'un document d'un autre refusée`, async () => {
      await assertFails(deleteDoc(doc(alice(), `${collectionNom}/${idAutre}`)));
    });

    test(`${collectionNom} : création au nom d'un autre refusée`, async () => {
      await assertFails(addDoc(collection(alice(), collectionNom), { userId: "bob" }));
    });

    test(`${collectionNom} : création pour soi autorisée`, async () => {
      await assertSucceeds(addDoc(collection(alice(), collectionNom), { userId: "alice" }));
    });

    test(`${collectionNom} : liste sans filtre userId refusée`, async () => {
      await assertFails(getDocs(collection(alice(), collectionNom)));
    });

    test(`${collectionNom} : liste filtrée sur un autre utilisateur refusée`, async () => {
      await assertFails(getDocs(query(collection(alice(), collectionNom), where("userId", "==", "bob"))));
    });
  }

  test("lettres : un utilisateur lit, liste et supprime ses lettres", async () => {
    await assertSucceeds(getDoc(doc(alice(), "lettres/lettre-alice")));
    await assertSucceeds(getDocs(query(collection(alice(), "lettres"), where("userId", "==", "alice"))));
    await assertSucceeds(deleteDoc(doc(alice(), "lettres/lettre-alice")));
  });

  test("lettres : impossible de transférer une lettre à un autre", async () => {
    await assertFails(updateDoc(doc(alice(), "lettres/lettre-alice"), { userId: "bob" }));
  });
});

describe("Collections serveur", () => {
  test("usage : ni lecture ni écriture côté client (quota non contournable)", async () => {
    await assertFails(getDoc(doc(alice(), "usage/alice")));
    await assertFails(setDoc(doc(alice(), "usage/alice"), { lettersUsed: 0 }));
  });

  test("stripeEvents : inaccessible côté client", async () => {
    await assertFails(getDoc(doc(alice(), "stripeEvents/evt_1")));
  });

  test("collection inconnue refusée", async () => {
    await assertFails(setDoc(doc(alice(), "divers/x"), { a: 1 }));
  });
});
