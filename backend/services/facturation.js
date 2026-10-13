/* =========================
   FACTURATION STRIPE
   - L'identité (uid, email) vient TOUJOURS du token Firebase vérifié.
   - Le client Stripe est retrouvé côté serveur à partir du uid.
   - Les webhooks sont idempotents (collection stripeEvents) et ignorent
     les événements plus anciens que le dernier appliqué (ordre non garanti par Stripe).
========================= */

const { estPremium } = require("./comptes");

class ErreurFacturation extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
    this.expose = true;
  }
}

function creerServiceFacturation({ db, stripe, config, logger = console }) {
  const users = db.collection("users");
  const evenements = db.collection("stripeEvents");

  async function creerSessionCheckout({ uid, email }) {
    if (!config.stripePriceId) {
      throw new ErreurFacturation("Configuration Stripe incomplète.", 503, "BILLING_NOT_CONFIGURED");
    }

    const snap = await users.doc(uid).get();
    const donnees = snap.exists ? snap.data() : {};

    if (estPremium(donnees)) {
      throw new ErreurFacturation("Ton abonnement Premium est déjà actif.", 409, "ALREADY_PREMIUM");
    }

    const parametres = {
      mode: "subscription",
      payment_method_types: ["card"],
      client_reference_id: uid,
      metadata: { uid },
      subscription_data: { metadata: { uid } },
      line_items: [{ price: config.stripePriceId, quantity: 1 }],
      success_url: `${config.frontendUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.frontendUrl}/dashboard.html`,
    };

    if (donnees.stripeCustomerId) {
      parametres.customer = donnees.stripeCustomerId;
    } else {
      parametres.customer_email = email;
    }

    const session = await stripe.checkout.sessions.create(parametres);

    return session.url;
  }

  async function creerSessionPortail({ uid }) {
    const snap = await users.doc(uid).get();
    const customerId = snap.exists ? snap.data().stripeCustomerId : null;

    if (!customerId) {
      throw new ErreurFacturation("Aucun abonnement Stripe trouvé.", 404, "NO_BILLING_ACCOUNT");
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${config.frontendUrl}/dashboard.html`,
    });

    return session.url;
  }

  /* ---------- Webhooks ---------- */

  async function trouverUtilisateurs(customerId, uidMetadata) {
    const snapshot = await users.where("stripeCustomerId", "==", customerId).get();

    if (!snapshot.empty) return snapshot.docs.map((d) => d.ref);

    if (uidMetadata) return [users.doc(uidMetadata)];

    return [];
  }

  /**
   * Applique une mise à jour seulement si l'événement n'est pas plus ancien
   * que le dernier événement Stripe appliqué à ce compte.
   */
  async function appliquer(ref, event, champs) {
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const dernier = snap.exists ? Number(snap.data().stripeEventCreated) || 0 : 0;

      if (dernier > event.created) {
        logger.log(`Événement Stripe ${event.id} ignoré (plus ancien que l'état actuel).`);
        return;
      }

      transaction.set(
        ref,
        {
          ...champs,
          stripeEventCreated: event.created,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    });
  }

  const gestionnaires = {
    async "checkout.session.completed"(event) {
      const session = event.data.object;
      const uid = session.client_reference_id || (session.metadata && session.metadata.uid);
      const customerId = session.customer;

      if (!uid || !customerId) {
        logger.warn(`Checkout ${session.id} sans uid ou client : ignoré.`);
        return;
      }

      const champs = {
        premium: true,
        subscriptionStatus: "active",
        stripeCustomerId: customerId,
      };

      if (session.subscription) champs.stripeSubscriptionId = session.subscription;

      const email = session.customer_details && session.customer_details.email;
      if (email) champs.email = email;

      await appliquer(users.doc(uid), event, champs);
    },

    async "customer.subscription.updated"(event) {
      const abonnement = event.data.object;
      const refs = await trouverUtilisateurs(abonnement.customer, abonnement.metadata && abonnement.metadata.uid);

      await Promise.all(
        refs.map((ref) =>
          appliquer(ref, event, {
            premium: abonnement.status === "active",
            subscriptionStatus: abonnement.status,
            stripeCustomerId: abonnement.customer,
            stripeSubscriptionId: abonnement.id,
          })
        )
      );
    },

    async "customer.subscription.deleted"(event) {
      const abonnement = event.data.object;
      const refs = await trouverUtilisateurs(abonnement.customer, abonnement.metadata && abonnement.metadata.uid);

      await Promise.all(
        refs.map((ref) =>
          appliquer(ref, event, { premium: false, subscriptionStatus: "canceled" })
        )
      );
    },

    async "invoice.payment_failed"(event) {
      const facture = event.data.object;
      const refs = await trouverUtilisateurs(facture.customer, null);

      await Promise.all(
        refs.map((ref) =>
          appliquer(ref, event, { premium: false, subscriptionStatus: "payment_failed" })
        )
      );
    },
  };

  /**
   * Traite un événement déjà vérifié (signature contrôlée par la route).
   * Retourne { statut: "traite" | "doublon" | "ignore" }.
   * Lève une erreur si le traitement échoue : Stripe réessaiera.
   */
  async function traiterEvenement(event) {
    const gestionnaire = gestionnaires[event.type];

    if (!gestionnaire) return { statut: "ignore" };

    const ref = evenements.doc(event.id);
    const deja = await ref.get();

    if (deja.exists && deja.data().status === "processed") {
      return { statut: "doublon" };
    }

    try {
      await gestionnaire(event);
    } catch (error) {
      await ref
        .set({ type: event.type, status: "failed", failedAt: new Date().toISOString() }, { merge: true })
        .catch(() => {});
      throw error;
    }

    await ref.set({
      type: event.type,
      status: "processed",
      created: event.created,
      processedAt: new Date().toISOString(),
    });

    return { statut: "traite" };
  }

  return { creerSessionCheckout, creerSessionPortail, traiterEvenement };
}

module.exports = { creerServiceFacturation, ErreurFacturation };
