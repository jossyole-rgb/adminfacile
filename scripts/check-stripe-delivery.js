// Vérifie une livraison Stripe réelle sans paiement : métadonnée temporaire du produit configuré.
require("dotenv").config();
const fs = require("node:fs");
const { createFirebase } = require("../backend/firebase");
const stripe = new (require("stripe"))(process.env.STRIPE_SECRET_KEY, {
  timeout: 20000,
});
(async () => {
  const services = createFirebase(process.env, "stripe-delivery");
  const marker = String(Date.now());
  const endpoints = (
    await stripe.webhookEndpoints.list({ limit: 100 })
  ).data.filter(
    (e) =>
      e.url === "https://adminfacile.onrender.com/stripe-webhook" &&
      e.status === "enabled",
  );
  const price = await stripe.prices.retrieve(process.env.STRIPE_PRICE_ID);
  const product = await stripe.products.retrieve(price.product);
  const prior = product.metadata.adminfacile_delivery_check || "";
  const changed = [];
  try {
    for (const endpoint of endpoints) {
      await stripe.webhookEndpoints.update(endpoint.id, {
        enabled_events: [
          ...new Set([...endpoint.enabled_events, "product.updated"]),
        ],
      });
      changed.push(endpoint);
    }
    await stripe.products.update(product.id, {
      metadata: { adminfacile_delivery_check: marker },
    });
    let event;
    for (let i = 0; i < 6 && !event; i++) {
      const events = await stripe.events.list({
        type: "product.updated",
        created: { gte: Math.floor(Number(marker) / 1000) - 5 },
        limit: 20,
      });
      event = events.data.find(
        (e) =>
          e.data.object.id === product.id &&
          e.data.object.metadata.adminfacile_delivery_check === marker,
      );
      if (!event) await new Promise((r) => setTimeout(r, 3000));
    }
    if (!event) throw Error("Événement Stripe introuvable");
    let received = false;
    for (let i = 0; i < 18; i++) {
      received = (
        await services.db.collection("stripeEvents").doc(event.id).get()
      ).exists;
      if (received) break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    const result = {
      eventId: event.id,
      type: event.type,
      received,
      checkedAt: new Date().toISOString(),
      payment: false,
    };
    fs.writeFileSync(
      "docs/stripe-delivery-check.json",
      JSON.stringify(result, null, 2) + "\n",
    );
    console.log(JSON.stringify(result));
    if (!received) process.exitCode = 1;
  } finally {
    await stripe.products.update(product.id, {
      metadata: { adminfacile_delivery_check: prior },
    });
    for (const endpoint of changed)
      await stripe.webhookEndpoints.update(endpoint.id, {
        enabled_events: endpoint.enabled_events,
      });
    await services.close();
  }
})().catch((e) => {
  console.error(
    "Vérification Stripe impossible : " + (e.code || e.type || e.message),
  );
  process.exitCode = 1;
});
