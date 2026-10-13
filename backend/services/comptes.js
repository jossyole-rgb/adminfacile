/* =========================
   COMPTES, PREMIUM ET QUOTAS
   Collections utilisées :
   - users/{uid}  : profil + statut d'abonnement (écrit uniquement par le serveur pour les champs Premium)
   - usage/{uid}  : compteur de générations (écrit uniquement par le serveur)
   - lettres      : historique existant (utilisé pour initialiser le compteur des comptes déjà actifs)
========================= */

const { FieldValue } = require("firebase-admin/firestore");

function estPremium(donneesUtilisateur) {
  return Boolean(
    donneesUtilisateur &&
      donneesUtilisateur.premium === true &&
      donneesUtilisateur.subscriptionStatus === "active"
  );
}

function creerServiceComptes(db, { limiteGratuite }) {
  const users = db.collection("users");
  const usage = db.collection("usage");

  async function lireUtilisateur(uid) {
    const snap = await users.doc(uid).get();
    return snap.exists ? snap.data() : null;
  }

  /**
   * Réserve une génération de lettre de manière atomique.
   * - Premium : toujours autorisé (le compteur est incrémenté pour les statistiques).
   * - Gratuit : autorisé tant que lettersUsed < limiteGratuite.
   * Les requêtes concurrentes sont sérialisées par la transaction Firestore :
   * si deux requêtes lisent le même compteur, l'une des deux est rejouée.
   * Pour un compte existant sans document usage, le compteur démarre au nombre
   * de lettres déjà présentes dans « lettres » (compatibilité avec l'ancien quota navigateur).
   */
  async function reserverGeneration(uid) {
    const userRef = users.doc(uid);
    const usageRef = usage.doc(uid);

    return db.runTransaction(async (transaction) => {
      const [userSnap, usageSnap] = await transaction.getAll(userRef, usageRef);

      const premium = estPremium(userSnap.exists ? userSnap.data() : null);

      let utilisees;

      if (usageSnap.exists) {
        utilisees = Number(usageSnap.data().lettersUsed) || 0;
      } else {
        const historique = await transaction.get(
          db.collection("lettres").where("userId", "==", uid).limit(limiteGratuite)
        );
        utilisees = historique.size;
      }

      if (!premium && utilisees >= limiteGratuite) {
        return { autorise: false, premium, utilisees, limite: limiteGratuite };
      }

      transaction.set(
        usageRef,
        {
          lettersUsed: utilisees + 1,
          period: "lifetime",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return { autorise: true, premium, utilisees: utilisees + 1, limite: limiteGratuite };
    });
  }

  /**
   * Rend une génération réservée lorsque l'IA a échoué :
   * un échec de génération ne consomme pas le quota gratuit.
   */
  async function libererGeneration(uid) {
    const usageRef = usage.doc(uid);

    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(usageRef);
      const utilisees = snap.exists ? Number(snap.data().lettersUsed) || 0 : 0;

      transaction.set(
        usageRef,
        {
          lettersUsed: Math.max(0, utilisees - 1),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });
  }

  async function lireEtatCompte(uid) {
    const [userSnap, usageSnap] = await db.getAll(users.doc(uid), usage.doc(uid));
    const donnees = userSnap.exists ? userSnap.data() : {};

    let utilisees;

    if (usageSnap.exists) {
      utilisees = Number(usageSnap.data().lettersUsed) || 0;
    } else {
      const historique = await db
        .collection("lettres")
        .where("userId", "==", uid)
        .limit(limiteGratuite)
        .get();
      utilisees = historique.size;
    }

    const premium = estPremium(donnees);

    return {
      premium,
      subscriptionStatus: donnees.subscriptionStatus || "inactive",
      hasBillingAccount: Boolean(donnees.stripeCustomerId),
      lettersUsed: utilisees,
      freeLimit: limiteGratuite,
      lettersRemaining: premium ? null : Math.max(0, limiteGratuite - utilisees),
    };
  }

  return { lireUtilisateur, reserverGeneration, libererGeneration, lireEtatCompte };
}

module.exports = { creerServiceComptes, estPremium };
