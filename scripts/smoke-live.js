// Recette réelle : seules deux identités techniques créées par ce script sont modifiées.
// Aucun paiement ni modification d'un compte existant.
require("dotenv").config();
const { randomUUID } = require("node:crypto");
const assert = require("node:assert/strict");
const { createFirebase } = require("../backend/firebase");
const { FirestoreStore } = require("../backend/firestore-store");
const { pdf } = require("../backend/exports");
const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";
if (
  !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base) &&
  !["https://adminfacile.onrender.com", "https://adminfacile-app.netlify.app"].includes(base)
) throw Error("Hôte de recette AdminFacile non autorisé.");
const created = [];
const results = [];
function mark(name) {
  results.push(name);
  console.log("OK : " + name);
}
async function main() {
  const services = createFirebase(process.env, "smoke-live");
  assert.ok(services, "Firebase non configuré");
  const { authAdmin, db } = services;
  const store = new FirestoreStore(db);
  try {
    const config = await fetch(base + "/api/config").then((r) => r.json());
    assert.equal(
      config.demo,
      false,
      "Le serveur doit fonctionner en mode réel.",
    );
    async function identity() {
      const uid = "adminfacile-smoke-" + randomUUID();
      await authAdmin.createUser({
        uid,
        displayName: "Compte technique de recette",
        email: uid + "@example.invalid",
        emailVerified: true,
      });
      created.push(uid);
      const customToken = await authAdmin.createCustomToken(uid);
      const response = await fetch(
        "https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=" +
          config.firebase.apiKey,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: customToken, returnSecureToken: true }),
          signal: AbortSignal.timeout(20000),
        },
      );
      const result = await response.json();
      assert.equal(response.status, 200, "Échange du jeton Firebase refusé.");
      return { uid, token: result.idToken };
    }
    const alice = await identity(),
      bob = await identity();
    mark("Authentication réelle et échange de jeton");
    async function api(
      route,
      { method = "GET", body, identity = alice, raw = false } = {},
    ) {
      const headers = { Authorization: "Bearer " + identity.token };
      if (body && !(body instanceof FormData))
        headers["Content-Type"] = "application/json";
      const response = await fetch(base + "/api" + route, {
        method,
        headers,
        body:
          body instanceof FormData
            ? body
            : body
              ? JSON.stringify(body)
              : undefined,
        signal: AbortSignal.timeout(90000),
      });
      if (!response.ok)
        throw Error(
          "Échec API " + method + " " + route + " : HTTP " + response.status,
        );
      if (response.status === 204) return null;
      return raw ? Buffer.from(await response.arrayBuffer()) : response.json();
    }
    await db
      .collection("users")
      .doc(alice.uid)
      .set({ premium: true, subscriptionStatus: "active" });
    const me = await api("/me");
    assert.equal(me.premium, false);
    mark("Un profil client ne peut pas s’attribuer Premium");
    assert.equal(me.uid, alice.uid);
    assert.equal(me.used, 0);
    mark("Profil privé lu dans Firestore");
    const letter = await api("/letters", {
      method: "POST",
      body: {
        type: "ecole",
        tonLettre: "Courtois",
        nom: "Utilisateur de recette",
        destinataire: "Établissement de démonstration",
        title: "Demande de document — recette technique",
        situation:
          "Exemple fictif de recette. Je souhaite demander une attestation, sans fournir de données personnelles réelles.",
      },
    });
    assert.ok(letter.content.length > 40);
    assert.equal((await api("/me")).used, 1);
    mark("Courrier OpenAI réel, sauvegarde et quota Firestore");
    const other = await fetch(
      base + "/api/activities/" + encodeURIComponent(letter.id),
      { headers: { Authorization: "Bearer " + bob.token } },
    );
    assert.equal(other.status, 404);
    mark("Isolation réelle entre deux comptes");
    const saved = await api("/activities/" + encodeURIComponent(letter.id), {
      method: "PATCH",
      body: {
        title: "Recette — courrier relu",
        content: letter.content + "\n\nMention de recette technique.",
      },
    });
    assert.match(saved.content, /Mention de recette/);
    assert.ok((await api("/activities")).items.some((r) => r.id === letter.id));
    mark("Édition, sauvegarde et historique réels");
    for (const format of ["pdf", "docx"]) {
      const bytes = await api("/export/" + format, {
        method: "POST",
        body: { content: saved.content },
        raw: true,
      });
      assert.equal(
        bytes.subarray(0, format === "pdf" ? 5 : 2).toString(),
        format === "pdf" ? "%PDF-" : "PK",
      );
    }
    mark("Exports PDF et DOCX");
    const form = new FormData();
    form.append(
      "document",
      new Blob(
        [
          await pdf(
            "Document fictif de recette\nVeuillez transmettre une attestation avant le 30 octobre 2026.\nAucune donnée personnelle réelle.",
          ),
        ],
        { type: "application/pdf" },
      ),
      "recette-technique.pdf",
    );
    const analysis = await api("/documents", { method: "POST", body: form });
    assert.ok(analysis.content.length > 30);
    assert.match(analysis.sourceText, /30 octobre/);
    mark("PDF réellement lu, analysé par OpenAI et sauvegardé");
    const answer = await api("/document-chat", {
      method: "POST",
      body: {
        id: analysis.id,
        question: "Quelle date est mentionnée dans le document ?",
      },
    });
    assert.match(answer.reponse, /30/);
    mark("Question réelle sur le document source");
    const reply = await api("/replies", {
      method: "POST",
      body: {
        documentId: analysis.id,
        ton: "Courtois",
        situation: "Exemple fictif : je transmets la pièce demandée.",
      },
    });
    assert.ok(reply.content.length > 30);
    mark("Réponse au document générée et enregistrée");
    const reservations = await Promise.allSettled(
      Array.from({ length: 6 }, () => store.reserve(bob.uid)),
    );
    assert.equal(
      reservations.filter((r) => r.status === "fulfilled").length,
      3,
    );
    assert.equal(
      reservations.filter(
        (r) => r.status === "rejected" && r.reason.status === 402,
      ).length,
      3,
    );
    assert.equal((await store.profile(bob.uid)).used, 3);
    mark(
      "Quota transactionnel réel : 3 autorisations sur 6 appels concurrents",
    );
    await api("/activities/" + encodeURIComponent(letter.id), {
      method: "DELETE",
    });
    assert.equal((await api("/me")).used, 2);
    mark("Suppression sans remboursement abusif du quota");
  } finally {
    let clean = true;
    for (const uid of created) {
      try {
        await store.deleteAccount(uid);
        await authAdmin.deleteUser(uid);
      } catch {
        clean = false;
      }
    }
    await db.terminate();
    await services.close();
    if (!clean) throw Error("Nettoyage des comptes de recette incomplet.");
    mark("Comptes et données techniques de recette supprimés");
  }
  console.log(
    "Recette réelle terminée : " + results.length + " contrôles réussis.",
  );
}
main().catch((e) => {
  console.error("Recette interrompue : " + (e.code || e.message || "erreur"));
  process.exitCode = 1;
});
