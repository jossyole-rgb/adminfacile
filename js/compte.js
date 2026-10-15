/* =========================
   COMPTE
   Suppression du compte et de ses données (AUTH-05).
========================= */

import { auth, signOut } from "../firebase.js";
import { afficherNotification } from "./ui.js";
import { appelerAPI } from "./api.js";

window.supprimerMonCompte = async function () {
  const champ = document.getElementById("confirmationSuppression");
  const bouton = document.getElementById("btnSupprimerCompte");

  if (!champ || champ.value.trim() !== "SUPPRIMER") {
    afficherNotification("Saisis SUPPRIMER pour confirmer la suppression.");
    champ?.focus();
    return;
  }

  bouton.disabled = true;
  bouton.innerText = "Suppression en cours...";

  try {
    await appelerAPI("/api/me", { method: "DELETE", body: { confirmation: "SUPPRIMER" } });

    afficherNotification("Ton compte a été supprimé.");
    await signOut(auth).catch(() => {});
    window.location.href = "index.html";
  } catch (error) {
    console.error("Erreur suppression compte :", error);
    afficherNotification(error.message || "Erreur lors de la suppression du compte.");

    if (error.code === "RECENT_LOGIN_REQUIRED") {
      await signOut(auth).catch(() => {});
      window.location.href = "index.html";
    }
  } finally {
    bouton.disabled = false;
    bouton.innerText = "Supprimer définitivement mon compte";
  }
};
