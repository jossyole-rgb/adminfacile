/* =========================
   PAGE DE PAIEMENT RÉUSSI
   Le Premium n'est affiché comme actif qu'une fois confirmé par le serveur
   (après réception du webhook Stripe), pas sur la seule redirection.
========================= */

import { auth, onAuthStateChanged } from "../firebase.js";
import { etat } from "./etat.js";
import { appelerAPI } from "./api.js";

const TENTATIVES_MAX = 10;
const INTERVALLE_MS = 3000;

function afficherStatut(message) {
  document.getElementById("statutActivation").innerText = message;
}

function attendre(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifierActivation() {
  for (let tentative = 1; tentative <= TENTATIVES_MAX; tentative++) {
    try {
      const compte = await appelerAPI("/api/me", { method: "GET" });

      if (compte.premium) {
        afficherStatut("Ton compte Premium est actif. Tu peux générer des lettres sans limite.");
        return;
      }
    } catch (error) {
      console.error("Vérification Premium :", error);
    }

    await attendre(INTERVALLE_MS);
  }

  afficherStatut(
    "Ton paiement est bien reçu, mais l’activation prend plus de temps que prévu. " +
    "Elle apparaîtra dans ton tableau de bord d’ici quelques minutes. Si ce n’est pas le cas, contacte-nous."
  );
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    afficherStatut("Paiement reçu. Connecte-toi pour voir ton statut Premium.");
    return;
  }

  etat.utilisateur = user;
  verifierActivation();
});
