const { test } = require("node:test");
const assert = require("node:assert/strict");
const { FirestoreStore } = require("../backend/firestore-store");
const { createSubscriptionSynchronizer } = require("../backend/subscriptions");
function fixture() {
  const rows = new Map();
  const db = {
    collection: (name) => ({
      doc: (id) => ({
        id,
        key: name + "/" + id,
        get: async () => ({
          exists: rows.has(name + "/" + id),
          data: () => rows.get(name + "/" + id),
        }),
        set: async (value) => rows.set(name + "/" + id, value),
      }),
    }),
    runTransaction: async (fn) =>
      fn({
        get: (ref) => ref.get(),
        set: (ref, value) => rows.set(ref.key, value),
      }),
  };
  return { rows, db };
}
test("les champs Premium créés dans users ne donnent aucun droit serveur", async () => {
  const { rows, db } = fixture();
  rows.set("users/alice", {
    premium: true,
    subscriptionStatus: "active",
    stripeCustomerId: "cus_foreign",
  });
  rows.set("usage/alice", { lettersUsed: 3 });
  const store = new FirestoreStore(db);
  const p = await store.profile("alice");
  assert.equal(p.premium, false);
  assert.equal(p.stripeCustomerId, null);
  await assert.rejects(
    () => store.reserve("alice"),
    (e) => e.status === 402,
  );
  rows.set("subscriptions/alice", {
    premium: true,
    subscriptionStatus: "active",
    stripeCustomerId: "cus_owned",
  });
  assert.equal((await store.profile("alice")).premium, true);
  assert.equal(await store.reserve("alice"), false);
});
test("un ancien client Stripe doit être prouvé par une session payée liée au bon UID", async () => {
  const { rows, db } = fixture();
  rows.set("users/alice", {
    premium: true,
    subscriptionStatus: "active",
    stripeCustomerId: "cus_fixture",
  });
  let owner = "bob";
  const stripe = {
    checkout: {
      sessions: {
        list: async () => ({
          data: [
            {
              id: "cs_fixture",
              client_reference_id: owner,
              status: "complete",
              subscription: "sub_fixture",
            },
          ],
          has_more: false,
        }),
      },
    },
    subscriptions: {
      retrieve: async () => ({
        id: "sub_fixture",
        customer: "cus_fixture",
        status: "active",
      }),
    },
  };
  const synchronize = createSubscriptionSynchronizer(db, stripe);
  await synchronize({ uid: "alice" });
  assert.equal(rows.has("subscriptions/alice"), false);
  owner = "alice";
  await synchronize({ uid: "alice" });
  assert.equal(rows.get("subscriptions/alice").premium, true);
  assert.equal(
    rows.get("subscriptions/alice").source,
    "stripe-verified-legacy",
  );
});
