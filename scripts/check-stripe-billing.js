// Vérifie Checkout et le portail sans paiement, avec une identité technique dédiée.
require("dotenv").config();
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createFirebase } = require("../backend/firebase");
const stripe = new (require("stripe"))(process.env.STRIPE_SECRET_KEY);
(async () => {
  const svc = createFirebase(process.env, "stripe-billing-check");
  const uid = "adminfacile-billing-" + randomUUID();
  let session, customer;
  const base = "https://adminfacile.onrender.com";
  try {
    await svc.authAdmin.createUser({
      uid,
      email: uid + "@example.invalid",
      emailVerified: true,
    });
    const config = await fetch(base + "/api/config").then((r) => r.json());
    const custom = await svc.authAdmin.createCustomToken(uid);
    const auth = await fetch(
      "https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=" +
        config.firebase.apiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: custom, returnSecureToken: true }),
      },
    ).then((r) => r.json());
    async function post(path) {
      const r = await fetch(base + "/api" + path, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + auth.idToken,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      assert.equal(r.status, 200, path);
      return r.json();
    }
    const checkout = await post("/billing/checkout");
    const match = (
      await stripe.checkout.sessions.list({ limit: 100 })
    ).data.find((s) => s.url === checkout.url && s.client_reference_id === uid);
    assert.ok(match);
    session = match.id;
    const detail = await stripe.checkout.sessions.retrieve(session, {
      expand: ["line_items"],
    });
    assert.equal(detail.livemode, true);
    assert.equal(detail.mode, "subscription");
    assert.equal(detail.line_items.data[0].price.unit_amount, 999);
    assert.equal(detail.line_items.data[0].price.recurring.interval, "month");
    assert.equal(detail.payment_status, "unpaid");
    customer = await stripe.customers.create({
      email: uid + "@example.invalid",
      metadata: { adminfacile_check: uid },
    });
    await svc.db
      .collection("subscriptions")
      .doc(uid)
      .set({
        stripeCustomerId: customer.id,
        premium: false,
        subscriptionStatus: "inactive",
      });
    const portal = await post("/billing/portal");
    assert.equal(new URL(portal.url).hostname, "billing.stripe.com");
    const result = {
      checkedAt: new Date().toISOString(),
      checkout: true,
      live: true,
      amount: 999,
      currency: detail.currency,
      interval: "month",
      portal: true,
      payment: false,
      returnUrl: detail.success_url,
    };
    fs.writeFileSync(
      "docs/stripe-billing-check.json",
      JSON.stringify(result, null, 2) + "\n",
    );
    console.log(JSON.stringify(result));
  } finally {
    if (session) await stripe.checkout.sessions.expire(session);
    if (customer) await stripe.customers.del(customer.id);
    for (const c of ["users", "subscriptions", "usage"])
      await svc.db.collection(c).doc(uid).delete();
    await svc.authAdmin.deleteUser(uid);
    await svc.close();
  }
})().catch((e) => {
  console.error("Recette facturation : " + e.message);
  process.exitCode = 1;
});
