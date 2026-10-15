const { HttpError } = require("./core");
// Les règles historiques autorisent la création de users/{uid} par le navigateur.
// Les droits de facturation proviennent donc d'une collection réservée au serveur.
function createSubscriptionSynchronizer(db, stripe) {
  return async function synchronize(user) {
    const ref = db.collection("subscriptions").doc(user.uid);
    if ((await ref.get()).exists) return;
    const legacy = (await db.collection("users").doc(user.uid).get()).data();
    if (!legacy?.stripeCustomerId) return;
    if (!stripe)
      throw new HttpError(
        503,
        "La vérification de votre ancien abonnement nécessite Stripe.",
      );
    try {
      let starting_after;
      let matched;
      for (let page = 0; page < 10 && !matched; page++) {
        const sessions = await stripe.checkout.sessions.list({
          customer: legacy.stripeCustomerId,
          limit: 100,
          ...(starting_after ? { starting_after } : {}),
        });
        matched = sessions.data.find(
          (s) =>
            s.client_reference_id === user.uid &&
            s.status === "complete" &&
            s.subscription,
        );
        if (!sessions.has_more || !sessions.data.length) break;
        starting_after = sessions.data.at(-1).id;
      }
      // Un identifiant client saisi dans le navigateur ne prouve jamais la propriété.
      if (!matched) return;
      const sub = await stripe.subscriptions.retrieve(matched.subscription);
      if (sub.customer !== legacy.stripeCustomerId) return;
      await db.runTransaction(async (tx) => {
        if ((await tx.get(ref)).exists) return;
        tx.set(ref, {
          stripeCustomerId: sub.customer,
          stripeSubscriptionId: sub.id,
          subscriptionStatus: sub.status,
          premium: ["active", "trialing"].includes(sub.status),
          cancelAtPeriodEnd: sub.cancel_at_period_end || false,
          updatedAt: new Date().toISOString(),
          source: "stripe-verified-legacy",
        });
      });
    } catch (e) {
      if (e.code === "resource_missing") return;
      throw new HttpError(
        503,
        "La vérification de votre abonnement est momentanément indisponible. Réessayez.",
      );
    }
  };
}
module.exports = { createSubscriptionSynchronizer };
