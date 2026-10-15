/* =========================
   SUPPRESSION DE COMPTE (AUTH-05)
   Ordre : résiliation Stripe → données Firestore → compte Firebase Auth.
   Si une étape échoue, les suivantes ne sont pas exécutées et l'utilisateur peut réessayer :
   chaque étape est rejouable sans effet de bord.
   Conservé volontairement : le client Stripe et ses factures (obligations comptables),
   le journal stripeEvents (identifiants techniques, sans contenu personnel).
========================= */

const COLLECTIONS_UTILISATEUR = ["lettres", "analyses", "documentChats"];
const TAILLE_LOT = 400;

const STATUTS_A_RESILIER = ["active", "trialing", "past_due", "unpaid", "incomplete"];

class ErreurSuppression extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
    this.expose = true;
  }
}

function creerServiceSuppression({ db, stripe, supprimerUtilisateurAuth, logger = console }) {
  async function resilierAbonnements(customerId) {
    if (!customerId) return 0;

    const abonnements = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    const aResilier = abonnements.data.filter((a) => STATUTS_A_RESILIER.includes(a.status));

    for (const abonnement of aResilier) {
      await stripe.subscriptions.cancel(abonnement.id);
    }

    return aResilier.length;
  }

  async function supprimerCollection(nom, uid) {
    let total = 0;

    // Suppression par lots pour rester sous la limite de 500 écritures par lot Firestore.
    for (;;) {
      const snapshot = await db.collection(nom).where("userId", "==", uid).limit(TAILLE_LOT).get();

      if (snapshot.empty) return total;

      const lot = db.batch();
      snapshot.docs.forEach((d) => lot.delete(d.ref));
      await lot.commit();

      total += snapshot.size;
    }
  }

  async function supprimerCompte(uid) {
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const customerId = userSnap.exists ? userSnap.data().stripeCustomerId : null;

    let abonnementsResilies;

    try {
      abonnementsResilies = await resilierAbonnements(customerId);
    } catch (error) {
      logger.error("Résiliation Stripe impossible pendant la suppression de compte :", error && error.message);
      throw new ErreurSuppression(
        "Impossible de résilier ton abonnement pour le moment. Ton compte n'a pas été supprimé, réessaie plus tard.",
        502,
        "BILLING_CANCEL_FAILED"
      );
    }

    const documentsSupprimes = {};

    for (const nom of COLLECTIONS_UTILISATEUR) {
      documentsSupprimes[nom] = await supprimerCollection(nom, uid);
    }

    await db.collection("usage").doc(uid).delete();
    await userRef.delete();

    await supprimerUtilisateurAuth(uid);

    return { abonnementsResilies, documentsSupprimes };
  }

  return { supprimerCompte };
}

module.exports = { creerServiceSuppression, ErreurSuppression, COLLECTIONS_UTILISATEUR };
