/* =========================
   BILLING
   Abonnement Premium (Stripe Checkout et portail).
========================= */

import { etat } from "./etat.js";
import { afficherNotification } from "./ui.js";
import { appelerAPI } from "./api.js";


/* =========================
   PAIEMENT STRIPE PREMIUM
========================= */

window.passerPremium = async function () {
  try {
    if (!etat.utilisateur) {
      afficherNotification("Connecte-toi avant de passer Premium.");
      return;
    }

    if (!etat.emailVerifie) {
      afficherNotification("Vérifie ton email avant de passer Premium.");
      return;
    }

    if (etat.premium) {
      afficherNotification("Ton abonnement Premium est déjà actif.");
      return;
    }

    // L'identité est déduite du token côté serveur.
    const data = await appelerAPI("/create-checkout-session", { body: {} });

    if (!data.url) {
      throw new Error("URL Stripe absente.");
    }

    window.location.href = data.url;
  } catch (error) {
    console.error("Erreur Stripe :", error);
    afficherNotification(error.message || "Erreur Stripe.");
  }
};


/* =========================
   PORTAIL CLIENT STRIPE
========================= */

window.gererAbonnement = async function () {
  try {
    if (!etat.utilisateur) {
      afficherNotification("Connecte-toi pour gérer ton abonnement.");
      return;
    }

    if (!etat.emailVerifie) {
      afficherNotification("Vérifie ton email avant de gérer ton abonnement.");
      return;
    }

    // Le client Stripe est retrouvé par le serveur à partir du compte connecté.
    const data = await appelerAPI("/create-customer-portal-session", { body: {} });

    if (!data.url) {
      throw new Error("URL du portail Stripe absente.");
    }

    window.location.href = data.url;
  } catch (error) {
    console.error("Erreur portail Stripe :", error);
    afficherNotification(error.message || "Erreur lors de l’ouverture du portail.");
  }
};
