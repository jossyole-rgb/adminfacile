/* =========================
   HISTORIQUE DES LETTRES (collection « lettres »)
   Toutes les opérations vérifient que la lettre appartient à l'utilisateur.
   Les anciennes lettres n'ont pas de createdAt (seulement « date » au format
   local) : le tri se fait en mémoire, sans index composite ni migration.
========================= */

const { FieldValue } = require("firebase-admin/firestore");

const MAX_LETTRES_LUES = 500;

class ErreurLettre extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
    this.expose = true;
  }
}

function horodatage(donnees) {
  if (donnees.createdAt && typeof donnees.createdAt.toMillis === "function") {
    return donnees.createdAt.toMillis();
  }

  // Ancien format « jj/mm/aaaa » (toLocaleDateString fr-FR).
  const morceaux = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(donnees.date || "");

  if (morceaux) {
    return Date.UTC(Number(morceaux[3]), Number(morceaux[2]) - 1, Number(morceaux[1]));
  }

  return 0;
}

function versAPI(snap, { avecContenu }) {
  const donnees = snap.data();
  const lettre = {
    id: snap.id,
    type: donnees.type || "",
    destinataire: donnees.destinataire || "",
    date: donnees.date || "",
    createdAt: horodatage(donnees) || null,
  };

  if (avecContenu) {
    lettre.contenu = donnees.contenu || "";
    lettre.nom = donnees.nom || "";
  } else {
    lettre.apercu = (donnees.contenu || "").slice(0, 280);
  }

  return lettre;
}

function creerServiceLettres(db) {
  const lettres = db.collection("lettres");

  async function lireLettreAutorisee(uid, id) {
    const snap = await lettres.doc(id).get();

    // Même réponse si la lettre n'existe pas ou appartient à un autre :
    // on ne révèle pas l'existence des données des autres utilisateurs.
    if (!snap.exists || snap.data().userId !== uid) {
      throw new ErreurLettre("Lettre introuvable.", 404, "NOT_FOUND");
    }

    return snap;
  }

  return {
    async enregistrer(uid, { type, contenu, nom, destinataire }) {
      const ref = await lettres.add({
        userId: uid,
        type,
        contenu,
        nom,
        destinataire,
        date: new Date().toLocaleDateString("fr-FR"),
        createdAt: FieldValue.serverTimestamp(),
      });

      return ref.id;
    },

    async lister(uid, { limite = 20, decalage = 0 } = {}) {
      const snapshot = await lettres.where("userId", "==", uid).limit(MAX_LETTRES_LUES).get();

      const triees = snapshot.docs.sort((a, b) => horodatage(b.data()) - horodatage(a.data()));
      const page = triees.slice(decalage, decalage + limite);

      return {
        lettres: page.map((snap) => versAPI(snap, { avecContenu: false })),
        total: triees.length,
        suivant: decalage + limite < triees.length ? decalage + limite : null,
      };
    },

    async lire(uid, id) {
      return versAPI(await lireLettreAutorisee(uid, id), { avecContenu: true });
    },

    async supprimer(uid, id) {
      const snap = await lireLettreAutorisee(uid, id);
      await snap.ref.delete();
    },
  };
}

module.exports = { creerServiceLettres, ErreurLettre };
