/* =========================
   DASHBOARD
   Tableau de bord utilisateur.
========================= */

import { etat } from "./etat.js";
import { appelerAPI } from "./api.js";


/* =========================
   DASHBOARD UTILISATEUR
========================= */

export async function mettreAJourDashboard() {
  const userEmail = document.getElementById("userEmail");
  const nombreLettres = document.getElementById("nombreLettres");
  const limiteGratuite = document.getElementById("limiteGratuite");
  const statutCompte = document.getElementById("statutCompte");
  const btnPasserPremium = document.querySelector("button[onclick='passerPremium()']");


  if (!userEmail || !nombreLettres || !limiteGratuite || !statutCompte) return;

  if (!etat.utilisateur) {
    userEmail.innerText = "Non connecté";
    nombreLettres.innerText = "0";
    limiteGratuite.innerText = "3 restantes";
    statutCompte.innerText = "Version gratuite";
    return;
  }

  userEmail.innerText = etat.utilisateur.email;

  if (!etat.emailVerifie) {
    statutCompte.innerHTML =
      "⚠️ <span class='gratuit-badge'>Email non vérifié</span>";
  } else if (etat.premium) {
    statutCompte.innerHTML =
      "👑 <span class='premium-badge'>Premium actif</span>";
  } else {
    statutCompte.innerHTML =
      "🆓 <span class='gratuit-badge'>Version gratuite</span>";
  }

  if (btnPasserPremium) {
    btnPasserPremium.style.display = etat.premium ? "none" : "block";
  }

  try {
    const page = await appelerAPI("/api/letters?limit=1", { method: "GET" });
    nombreLettres.innerText = page.total;
  } catch (error) {
    console.error("Erreur comptage lettres :", error);
    nombreLettres.innerText = "–";
  }

  if (etat.premium) {
    limiteGratuite.innerText = "Illimité";
    return;
  }

  // Le compteur de référence est celui du serveur.
  try {
    const compte = await appelerAPI("/api/me", { method: "GET" });

    if (compte.premium) {
      limiteGratuite.innerText = "Illimité";
    } else {
      const restantes = compte.lettersRemaining;

      limiteGratuite.innerText =
        restantes > 0 ? restantes + " restantes" : "Limite atteinte";
    }
  } catch (error) {
    console.error("Erreur lecture quota :", error);
    limiteGratuite.innerText = "Indisponible";
  }
}
