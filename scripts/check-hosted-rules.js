// Recette des règles publiées, limitée à deux comptes et documents techniques créés ici.
require("dotenv").config();
const { randomUUID } = require("node:crypto");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createFirebase } = require("../backend/firebase");
(async () => {
  const service = createFirebase(process.env, "hosted-rules");
  const users = [];
  const results = [];
  const project = process.env.FIREBASE_PROJECT_ID;
  const config = await fetch(
    "https://adminfacile.onrender.com/api/config",
  ).then((r) => r.json());
  const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/`;
  async function identity() {
    const uid = "adminfacile-rules-" + randomUUID();
    await service.authAdmin.createUser({ uid });
    users.push(uid);
    const token = await service.authAdmin.createCustomToken(uid);
    const r = await fetch(
      "https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=" +
        config.firebase.apiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, returnSecureToken: true }),
      },
    );
    assert.equal(r.status, 200);
    return { uid, token: (await r.json()).idToken };
  }
  async function request(name, user, path, method, status, fields) {
    const r = await fetch(base + path, {
      method,
      headers: {
        Authorization: "Bearer " + user.token,
        "Content-Type": "application/json",
      },
      body: fields ? JSON.stringify({ fields }) : undefined,
    });
    assert.equal(r.status, status, name + " : HTTP " + r.status);
    results.push(name);
    console.log("OK : " + name);
  }
  try {
    const a = await identity(),
      b = await identity();
    const bool = (v) => ({ booleanValue: v }),
      str = (v) => ({ stringValue: v });
    await request(
      "auto-attribution Premium refusée",
      a,
      "users/" + a.uid,
      "PATCH",
      403,
      { premium: bool(true), subscriptionStatus: str("active") },
    );
    await request(
      "profil gratuit autorisé",
      a,
      "users/" + a.uid,
      "PATCH",
      200,
      { premium: bool(false), subscriptionStatus: str("inactive") },
    );
    await request(
      "modification des droits refusée",
      a,
      "users/" + a.uid,
      "PATCH",
      403,
      { premium: bool(true) },
    );
    await request(
      "document propriétaire autorisé",
      a,
      "lettres/" + a.uid,
      "PATCH",
      200,
      { userId: str(a.uid), content: str("Document technique de recette") },
    );
    await request(
      "lecture propriétaire autorisée",
      a,
      "lettres/" + a.uid,
      "GET",
      200,
    );
    await request(
      "lecture étrangère refusée",
      b,
      "lettres/" + a.uid,
      "GET",
      403,
    );
    await request(
      "transfert de propriétaire refusé",
      a,
      "lettres/" + a.uid,
      "PATCH",
      403,
      { userId: str(b.uid) },
    );
    await request("quota client refusé", a, "usage/" + a.uid, "PATCH", 403, {
      lettersUsed: { integerValue: "0" },
    });
    await request(
      "abonnement client refusé",
      a,
      "subscriptions/" + a.uid,
      "PATCH",
      403,
      { premium: bool(true) },
    );
    const anon = await fetch(base + "lettres/" + a.uid);
    assert.equal(anon.status, 403);
    results.push("accès anonyme refusé");
    fs.writeFileSync(
      "docs/firebase-rules-check.json",
      JSON.stringify(
        { checkedAt: new Date().toISOString(), passed: results },
        null,
        2,
      ) + "\n",
    );
    console.log(results.length + " contrôles des règles publiées réussis.");
  } finally {
    for (const uid of users) {
      for (const collection of ["users", "lettres", "usage", "subscriptions"])
        await service.db.collection(collection).doc(uid).delete();
      await service.authAdmin.deleteUser(uid);
    }
    await service.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
