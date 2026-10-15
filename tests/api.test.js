const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../backend/app");
const { MemoryStore, validateFile } = require("../backend/core");
const { demoAI } = require("../backend/services");
async function fixture(t, override = {}) {
  const store = new MemoryStore();
  const app = createApp({
    store,
    demo: true,
    verifyToken: async (token) => {
      if (!["alice", "bob"].includes(token)) throw Error();
      return {
        uid: token,
        email: token + "@example.test",
        auth_time: Date.now() / 1000,
      };
    },
    ai: demoAI,
    env: {},
    ...override,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = "http://127.0.0.1:" + server.address().port;
  const request = (route, { token = "alice", method = "GET", body } = {}) =>
    fetch(base + route, {
      method,
      headers: {
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  return { store, request, base };
}
const input = {
  type: "logement",
  tonLettre: "Courtois",
  nom: "Alice",
  destinataire: "Bailleur",
  title: "Demande de quittance",
  situation: "Merci de me transmettre ma quittance.",
};
test("les opérations privées refusent une session absente ou invalide", async (t) => {
  const { request } = await fixture(t);
  for (const route of ["/api/me", "/api/activities", "/api/subscription"]) {
    assert.equal((await request(route, { token: null })).status, 401);
    assert.equal((await request(route, { token: "invalid" })).status, 401);
  }
  assert.equal(
    (
      await request("/generer-lettre", {
        token: null,
        method: "POST",
        body: input,
      })
    ).status,
    401,
  );
});
test("isolation des comptes pour consultation, modification et suppression", async (t) => {
  const { request } = await fixture(t);
  const created = await (
    await request("/api/letters", { method: "POST", body: input })
  ).json();
  assert.ok(created.id);
  const route = "/api/activities/" + created.id;
  assert.equal((await request(route, { token: "bob" })).status, 404);
  assert.equal(
    (
      await request(route, {
        token: "bob",
        method: "PATCH",
        body: { title: "x", content: "x" },
      })
    ).status,
    404,
  );
  assert.equal(
    (await request(route, { token: "bob", method: "DELETE" })).status,
    404,
  );
  const list = await (
    await request("/api/activities", { token: "bob" })
  ).json();
  assert.equal(list.total, 0);
  assert.equal((await request(route)).status, 200);
});
test("six générations concurrentes ne consomment que trois autorisations", async (t) => {
  const { request } = await fixture(t);
  const results = await Promise.all(
    Array.from({ length: 6 }, () =>
      request("/api/letters", { method: "POST", body: input }),
    ),
  );
  assert.equal(results.filter((r) => r.status === 201).length, 3);
  assert.equal(results.filter((r) => r.status === 402).length, 3);
  const p = await (await request("/api/me")).json();
  assert.equal(p.used, 3);
});
test("échec de génération : quota rendu et aucune activité enregistrée", async (t) => {
  const { request } = await fixture(t, {
    ai: async () => {
      throw Error("provider failed");
    },
  });
  assert.equal(
    (await request("/api/letters", { method: "POST", body: input })).status,
    500,
  );
  assert.equal((await (await request("/api/me")).json()).used, 0);
  assert.equal((await (await request("/api/activities")).json()).total, 0);
});
test("la suppression d’une lettre ne réinitialise pas le quota", async (t) => {
  const { request } = await fixture(t);
  const row = await (
    await request("/api/letters", { method: "POST", body: input })
  ).json();
  assert.equal(
    (await request("/api/activities/" + row.id, { method: "DELETE" })).status,
    204,
  );
  assert.equal((await (await request("/api/me")).json()).used, 1);
});
test("validation des entrées et du contenu réel des fichiers", async (t) => {
  const { request, base } = await fixture(t);
  assert.equal(
    (await request("/api/letters", { method: "POST", body: {} })).status,
    400,
  );
  assert.throws(() =>
    validateFile({
      buffer: Buffer.from("bad file"),
      mimetype: "application/pdf",
    }),
  );
  const form = new FormData();
  form.append(
    "document",
    new Blob(["not a pdf"], { type: "application/pdf" }),
    "document.pdf",
  );
  assert.equal(
    (
      await fetch(base + "/api/documents", {
        method: "POST",
        headers: { Authorization: "Bearer alice" },
        body: form,
      })
    ).status,
    400,
  );
});
test("analyse et question sur un document réservées au propriétaire", async (t) => {
  const { request, base } = await fixture(t);
  const form = new FormData();
  form.append(
    "document",
    new Blob(["%PDF-1.4\nDemo"], { type: "application/pdf" }),
    "document.pdf",
  );
  const r = await fetch(base + "/api/documents", {
    method: "POST",
    headers: { Authorization: "Bearer alice" },
    body: form,
  });
  assert.equal(r.status, 201);
  const row = await r.json();
  assert.equal(row.kind, "analysis");
  assert.equal(
    (
      await request("/api/replies", {
        method: "POST",
        token: "bob",
        body: { documentId: row.id, ton: "Courtois", situation: "Ma réponse" },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request("/api/replies", {
        method: "POST",
        body: { documentId: row.id, ton: "Courtois", situation: "Ma réponse" },
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await request("/api/document-chat", {
        method: "POST",
        token: "bob",
        body: { id: row.id, question: "Quand ?" },
      })
    ).status,
    404,
  );
});
test("exports binaires PDF et DOCX, sans exécution de HTML", async (t) => {
  const { request } = await fixture(t);
  for (const format of ["pdf", "docx"]) {
    const r = await request("/api/export/" + format, {
      method: "POST",
      body: {
        content:
          "Objet : échéance\nCamille — pièce jointe\n<script>alert(1)</script>\n" +
          "Une très longue ligne administrative. ".repeat(500),
      },
    });
    assert.equal(r.status, 200);
    const bytes = Buffer.from(await r.arrayBuffer());
    assert.equal(
      bytes.subarray(0, format === "pdf" ? 5 : 2).toString(),
      format === "pdf" ? "%PDF-" : "PK",
    );
    assert.match(r.headers.get("content-disposition"), new RegExp(format));
  }
});
test("secrets et fichiers serveur jamais servis par Express", async (t) => {
  const { request } = await fixture(t);
  for (const route of [
    "/.env",
    "/server.js",
    "/backend/server-v1.reference.cjs",
    "/package.json",
  ])
    assert.equal((await request(route, { token: null })).status, 404);
  assert.equal((await request("/", { token: null })).status, 200);
});
test("facturation fermée sans configuration et suppression du compte confirmée", async (t) => {
  const { request } = await fixture(t);
  assert.equal(
    (
      await request("/api/billing/checkout", {
        method: "POST",
        body: { uid: "bob", email: "bob@example.test" },
      })
    ).status,
    503,
  );
  assert.equal(
    (await request("/api/me", { method: "DELETE", body: { confirm: "non" } }))
      .status,
    400,
  );
  assert.equal(
    (
      await request("/api/me", {
        method: "DELETE",
        body: { confirm: "SUPPRIMER" },
      })
    ).status,
    204,
  );
});

test("Checkout et portail utilisent l’identité du token, jamais les identifiants du navigateur", async (t) => {
  let checkout, portal;
  const stripe = {
    checkout: {
      sessions: {
        create: async (data) => (
          (checkout = data),
          { url: "https://checkout.stripe.com/test" }
        ),
      },
    },
    billingPortal: {
      sessions: {
        create: async (data) => (
          (portal = data),
          { url: "https://billing.stripe.com/test" }
        ),
      },
    },
  };
  const { store, request } = await fixture(t, {
    stripe,
    env: {
      STRIPE_PRICE_ID: "price_fixture",
      STRIPE_WEBHOOK_SECRET: "whsec_fixture",
      STRIPE_CHECKOUT_ENABLED: "true",
      STRIPE_PORTAL_CONFIGURATION_ID: "bpc_fixture",
      PUBLIC_APP_URL: "https://example.test",
    },
  });
  store.users.set("alice", { stripeCustomerId: "cus_alice" });
  assert.equal(
    (
      await request("/api/billing/checkout", {
        method: "POST",
        body: { uid: "bob", email: "bob@example.test" },
      })
    ).status,
    200,
  );
  assert.equal(checkout.client_reference_id, "alice");
  assert.equal(checkout.customer, "cus_alice");
  assert.equal(checkout.customer_email, undefined);
  assert.equal(
    (
      await request("/api/billing/portal", {
        method: "POST",
        body: { customerId: "cus_bob" },
      })
    ).status,
    200,
  );
  assert.equal(portal.customer, "cus_alice");
  assert.equal(portal.configuration, "bpc_fixture");
});

test("webhooks : signature réelle, déduplication et protection contre un événement antérieur", async (t) => {
  const { randomUUID } = require("node:crypto");
  const rows = new Map();
  let userWrites = 0;
  const db = {
    collection: (name) => ({
      doc: (id) => ({
        key: name + "/" + id,
        get: async () => ({
          exists: rows.has(name + "/" + id),
          data: () => rows.get(name + "/" + id),
        }),
        set: async (data) => rows.set(name + "/" + id, data),
      }),
    }),
    runTransaction: async (fn) =>
      fn({
        get: async (ref) => ref.get(),
        set: (ref, data) => {
          if (ref.key.startsWith("users/")) userWrites++;
          rows.set(ref.key, { ...rows.get(ref.key), ...data });
        },
      }),
  };
  const Stripe = require("stripe"),
    webhooks = new Stripe("sk_test_fixture").webhooks,
    secret = "whsec_fixture";
  let subscription = {
    id: "sub_fixture",
    status: "active",
    customer: "cus_alice",
    metadata: { uid: "alice" },
  };
  const stripe = {
    webhooks,
    subscriptions: { retrieve: async () => subscription },
  };
  const { base } = await fixture(t, {
    stripe,
    db,
    env: { STRIPE_WEBHOOK_SECRET: secret },
  });
  const send = async (event, signed = true) => {
    const payload = JSON.stringify(event);
    return fetch(base + "/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Stripe-Signature": signed
          ? webhooks.generateTestHeaderString({ payload, secret })
          : "bad",
      },
      body: payload,
    });
  };
  const event = {
    id: "evt_" + randomUUID(),
    created: 200,
    type: "checkout.session.completed",
    data: {
      object: {
        client_reference_id: "alice",
        subscription: "sub_fixture",
        customer: "cus_alice",
      },
    },
  };
  assert.equal((await send(event, false)).status, 400);
  assert.equal(userWrites, 0);
  assert.equal((await send(event)).status, 200);
  assert.equal(rows.get("users/alice").premium, true);
  assert.equal(userWrites, 1);
  assert.equal((await send(event)).status, 200);
  assert.equal(userWrites, 1);
  subscription = { ...subscription, status: "canceled" };
  const newer = {
    id: "evt_newer",
    created: 300,
    type: "customer.subscription.deleted",
    data: { object: { id: "sub_fixture", customer: "cus_alice" } },
  };
  assert.equal((await send(newer)).status, 200);
  assert.equal(rows.get("users/alice").premium, false);
  subscription = { ...subscription, status: "active" };
  assert.equal(
    (await send({ ...event, id: "evt_older", created: 100 })).status,
    200,
  );
  assert.equal(rows.get("users/alice").premium, false);
});

test("PDF multipage : les accents et le texte sont lisibles par un parseur indépendant", async () => {
  const { pdf } = require("../backend/exports");
  const parse = require("pdf-parse");
  const document = await pdf(
    "Échéance : 30 octobre — coût : 20 €\n" +
      Array.from(
        { length: 110 },
        (_, i) => "Ligne " + i + " : justificatif à fournir.",
      ).join("\n"),
  );
  const data = await parse(document);
  assert.ok(data.numpages >= 3);
  assert.match(data.text, /Échéance/);
  assert.match(data.text, /Ligne 109/);
});

test("PDF court : le fichier exporté est réimportable pour analyse", async () => {
  const bytes = await require("../backend/exports").pdf(
    "Justificatif à fournir avant le 30 octobre 2026.",
  );
  const r = await require("pdf-parse")(bytes);
  assert.equal(r.numpages, 1);
  assert.match(r.text, /30 octobre 2026/);
});

test("import multipart : extraction réelle d’un PDF court sans services IA externes", async (t) => {
  const { base } = await fixture(t, { demo: false });
  const bytes = await require("../backend/exports").pdf(
    "Document fictif de recette\nVeuillez transmettre une attestation avant le 30 octobre 2026.\nAucune donnée personnelle réelle.",
  );
  const form = new FormData();
  form.append(
    "document",
    new Blob([bytes], { type: "application/pdf" }),
    "fixture.pdf",
  );
  const r = await fetch(base + "/api/documents", {
    method: "POST",
    headers: { Authorization: "Bearer alice" },
    body: form,
  });
  assert.equal(r.status, 201);
  assert.match((await r.json()).sourceText, /30 octobre 2026/);
});
