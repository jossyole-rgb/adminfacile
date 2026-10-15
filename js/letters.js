/* =========================
   LETTERS
   Génération, actions, exports et historique des lettres.
========================= */

import { etat } from "./etat.js";
import { afficherNotification, echapperHTML, texteMultiligne } from "./ui.js";
import { appelerAPI } from "./api.js";
import { mettreAJourDashboard } from "./dashboard.js";
import { exporterDOCX } from "./exports.js";


/* =========================
   GÉNÉRATION DE LETTRE IA
========================= */

window.genererLettre = async function () {
  const type = document.getElementById("typeLettre").value;
  const tonLettre = document.getElementById("tonLettre").value;
  const nom = document.getElementById("nom").value.trim();
  const destinataire = document.getElementById("destinataire").value.trim();
  const objet = document.getElementById("objet").value.trim();

  const resultat = document.getElementById("resultat");
  const bouton = document.getElementById("btnGenerer");
  const loader = document.getElementById("loaderIA");

  if (!etat.utilisateur) {
    resultat.innerText = "Connecte-toi avant de générer une lettre.";
    afficherNotification("Connecte-toi avant de générer une lettre.");
    return;
  }

  if (!etat.emailVerifie) {
    resultat.innerText = "Vérifie ton email avant de générer une lettre.";
    afficherNotification("Email non vérifié.");
    return;
  }

  if (!nom || !destinataire || !objet) {
    resultat.innerText = "Veuillez remplir tous les champs.";
    afficherNotification("Veuillez remplir tous les champs.");
    return;
  }

  try {
    // Le quota gratuit est vérifié par le serveur (réponse 402 si atteint).
    bouton.disabled = true;
    bouton.innerText = "Génération...";
    loader.style.display = "block";
    activerBoutonsLettre(false);
    resultat.innerText = "L’IA rédige votre lettre...";

    desactiverFormulaire(true);

    const data = await appelerAPI("/generer-lettre", {
      body: {
        type,
        tonLettre,
        nom,
        destinataire,
        objet
      }
    });

    if (!data.lettre) {
      throw new Error("Aucune lettre reçue.");
    }

    resultat.innerText = data.lettre;
    etat.lettreCouranteId = data.sauvegardee ? data.id : null;

    activerBoutonsLettre(true);

    // La lettre est enregistrée dans l'historique par le serveur.
    afficherNotification(
      data.sauvegardee
        ? "Lettre générée et sauvegardée dans l’historique."
        : "Lettre générée, mais non sauvegardée : pense à la copier."
    );

    await mettreAJourDashboard();
  } catch (error) {
    console.error("Erreur génération :", error);

    if (error.code === "QUOTA_EXCEEDED") {
      resultat.innerText = "Limite gratuite atteinte. Passe Premium pour continuer.";
      afficherNotification("Limite gratuite atteinte.");
      await mettreAJourDashboard();
    } else {
      resultat.innerText = `Erreur lors de la génération : ${error.message}`;
      afficherNotification("Erreur lors de la génération.");
    }
  } finally {
    loader.style.display = "none";
    bouton.disabled = false;
    bouton.innerText = "Générer ma lettre";

    desactiverFormulaire(false);
  }
};


/* =========================
   HELPERS FORMULAIRE
========================= */

export function desactiverFormulaire(etat) {
  document.getElementById("typeLettre").disabled = etat;
  document.getElementById("tonLettre").disabled = etat;
  document.getElementById("nom").disabled = etat;
  document.getElementById("destinataire").disabled = etat;
  document.getElementById("objet").disabled = etat;
}


export function activerBoutonsLettre(actif) {
  document.getElementById("btnCopier").disabled = !actif;
  document.getElementById("btnTelecharger").disabled = !actif;
  document.getElementById("btnPDF").disabled = !actif;
  document.getElementById("btnDOCX").disabled = !actif;
  rendreLettreModifiable(actif);
}


/* =========================
   ÉDITION DE LA LETTRE (LETTER-04)
   La lettre affichée est modifiable directement ; les copies et exports
   utilisent toujours le texte affiché, donc la version modifiée.
========================= */

function rendreLettreModifiable(actif) {
  const resultat = document.getElementById("resultat");
  const aide = document.getElementById("aideEditionLettre");

  if (actif) {
    resultat.setAttribute("contenteditable", "plaintext-only");
    // Repli pour les navigateurs qui ne connaissent pas « plaintext-only ».
    if (resultat.contentEditable !== "plaintext-only") resultat.setAttribute("contenteditable", "true");
    resultat.setAttribute("role", "textbox");
    resultat.setAttribute("aria-multiline", "true");
    resultat.setAttribute("aria-label", "Lettre générée, modifiable");
    resultat.setAttribute("aria-describedby", "aideEditionLettre");
    // Pas d'annonce à chaque frappe pendant l'édition.
    resultat.setAttribute("aria-live", "off");
  } else {
    resultat.removeAttribute("contenteditable");
    resultat.removeAttribute("role");
    resultat.removeAttribute("aria-multiline");
    resultat.removeAttribute("aria-describedby");
    resultat.setAttribute("aria-label", "Lettre générée");
    resultat.setAttribute("aria-live", "polite");
    etat.lettreCouranteId = null;
  }

  if (aide) aide.hidden = !actif;
  marquerLettreModifiee(false);
}

function marquerLettreModifiee(modifiee) {
  const bouton = document.getElementById("btnEnregistrerLettre");
  if (bouton) bouton.disabled = !(modifiee && etat.lettreCouranteId);
}

document.getElementById("resultat")?.addEventListener("input", () => marquerLettreModifiee(true));

window.enregistrerModificationsLettre = async function () {
  const texte = document.getElementById("resultat").innerText.trim();
  const bouton = document.getElementById("btnEnregistrerLettre");

  if (!etat.lettreCouranteId) {
    afficherNotification("Cette lettre n’est pas dans l’historique : copie-la ou exporte-la.");
    return;
  }

  if (!texte) {
    afficherNotification("La lettre est vide : rien à enregistrer.");
    return;
  }

  try {
    bouton.disabled = true;
    await appelerAPI(`/api/letters/${encodeURIComponent(etat.lettreCouranteId)}`, {
      method: "PUT",
      body: { contenu: texte },
    });
    afficherNotification("Modifications enregistrées dans l’historique.");
  } catch (error) {
    console.error("Erreur enregistrement lettre :", error);
    afficherNotification(error.message || "Erreur lors de l’enregistrement.");
    marquerLettreModifiee(true);
  }
};


export function texteResultatEstVide(texte) {
  return (
    !texte ||
    texte.includes("Votre lettre apparaîtra ici") ||
    texte.includes("Veuillez remplir") ||
    texte.includes("Connecte-toi") ||
    texte.includes("Limite gratuite atteinte") ||
    texte.includes("Erreur lors de la génération")
  );
}


/* =========================
   ACTIONS SUR LA LETTRE
========================= */

window.copierLettre = function () {
  const texte = document.getElementById("resultat").innerText;

  if (texteResultatEstVide(texte)) {
    afficherNotification("Aucune lettre à copier.");
    return;
  }

  navigator.clipboard.writeText(texte);
  afficherNotification("Lettre copiée.");
};


window.telechargerLettre = function () {
  const texte = document.getElementById("resultat").innerText;

  if (texteResultatEstVide(texte)) {
    afficherNotification("Aucune lettre à télécharger.");
    return;
  }

  const blob = new Blob([texte], { type: "text/plain" });
  const lien = document.createElement("a");

  lien.href = URL.createObjectURL(blob);
  lien.download = "lettre_adminfacile.txt";
  lien.click();

  afficherNotification("Lettre téléchargée.");
};


window.telechargerPDF = function () {
  const texte = document.getElementById("resultat").innerText;

  if (texteResultatEstVide(texte)) {
    afficherNotification("Génère une lettre avant le PDF.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFont("times", "normal");
  doc.setFontSize(12);

  const lignes = doc.splitTextToSize(texte, 180);

  doc.text(lignes, 15, 20);
  doc.save("lettre_adminfacile.pdf");

  afficherNotification("PDF téléchargé.");
};


window.telechargerDOCX = async function () {
  const texte = document.getElementById("resultat").innerText;

  if (texteResultatEstVide(texte)) {
    afficherNotification("Génère une lettre avant le DOCX.");
    return;
  }

  await exporterDOCX(texte, "lettre_adminfacile.docx");

  afficherNotification("DOCX téléchargé.");
};


/* =========================
   RÉSUMÉ IA DE LA LETTRE
========================= */

window.resumerLettre = async function () {
  const texte = document.getElementById("resultat").innerText;
  const resultat = document.getElementById("resultat");

  if (texteResultatEstVide(texte)) {
    afficherNotification("Génère une lettre avant de la résumer.");
    return;
  }

  try {
    resultat.innerText = "L’IA résume votre lettre...";

    const data = await appelerAPI("/resumer-lettre", { body: { texte } });

    if (!data.resume) {
      throw new Error("Aucun résumé reçu.");
    }

    resultat.innerText = data.resume;
    marquerLettreModifiee(true);

    afficherNotification("Résumé généré.");
  } catch (error) {
    console.error("Erreur résumé IA :", error);
    resultat.innerText = texte;
    afficherNotification(error.message || "Erreur lors du résumé.");
  }
};


/* =========================
   RÉÉCRITURE IA
========================= */

window.reecrireLettre = async function (style) {

  const resultat = document.getElementById("resultat");
  const texte = resultat.innerText;

  if (texteResultatEstVide(texte)) {
    afficherNotification("Aucune lettre à réécrire.");
    return;
  }

  try {

    resultat.innerText = "L’IA réécrit votre lettre...";

    const data = await appelerAPI("/reecrire-lettre", { body: { texte, style } });

    if (!data.lettre) {
      throw new Error("Aucune réécriture reçue.");
    }

    resultat.innerText = data.lettre;
    marquerLettreModifiee(true);

    afficherNotification("Lettre réécrite.");
    
  } catch (error) {

    console.error("Erreur réécriture IA :", error);

    resultat.innerText = texte;
    afficherNotification(error.message || "Erreur lors de la réécriture.");
  }
};


/* =========================
   HISTORIQUE DES LETTRES
========================= */

const TAILLE_PAGE_HISTORIQUE = 10;
let decalageHistorique = 0;

window.telechargerLettreHistorique = async function (id) {
  try {
    const lettre = await appelerAPI(`/api/letters/${encodeURIComponent(id)}`, { method: "GET" });
    const contenu = lettre.contenu || "";

    if (!contenu.trim()) {
      afficherNotification("Aucun contenu à télécharger.");
      return;
    }

    const blob = new Blob([contenu], { type: "text/plain" });
    const lien = document.createElement("a");

    lien.href = URL.createObjectURL(blob);
    lien.download = `lettre_${lettre.type || "adminfacile"}.txt`;
    lien.click();

    afficherNotification("Lettre téléchargée.");
  } catch (error) {
    console.error("Erreur téléchargement historique :", error);
    afficherNotification(error.message || "Erreur téléchargement.");
  }
};

window.afficherLettreHistorique = async function (id) {
  try {
    const lettre = await appelerAPI(`/api/letters/${encodeURIComponent(id)}`, { method: "GET" });

    document.getElementById("resultat").innerText = lettre.contenu || "";
    activerBoutonsLettre(Boolean(lettre.contenu));
    etat.lettreCouranteId = lettre.contenu ? lettre.id || id : null;
    document.getElementById("resultat").scrollIntoView({ behavior: "smooth" });

    afficherNotification("Lettre ouverte : tu peux la modifier, la copier ou l’exporter.");
  } catch (error) {
    console.error("Erreur ouverture lettre :", error);
    afficherNotification(error.message || "Erreur ouverture lettre.");
  }
};

export function carteLettre(lettre) {
  const id = echapperHTML(lettre.id);

  return `
    <div class="lettre-card">
      <div class="lettre-header">
        <h3>${echapperHTML(lettre.type)}</h3>

        <button onclick="afficherLettreHistorique('${id}')">
          👁️ Ouvrir
        </button>

        <button onclick="telechargerLettreHistorique('${id}')">
          📥 Télécharger
        </button>

        <button class="btn-supprimer" onclick="supprimerLettre('${id}')">
          🗑️ Supprimer
        </button>
      </div>

      <small>${echapperHTML(lettre.date)}${lettre.destinataire ? " · " + echapperHTML(lettre.destinataire) : ""}</small>
      <p>${texteMultiligne(lettre.apercu)}${lettre.apercu && lettre.apercu.length >= 280 ? "…" : ""}</p>
    </div>
  `;
}

window.chargerHistorique = async function (suite = false) {
  const historique = document.getElementById("historique");

  if (!suite) {
    decalageHistorique = 0;
    historique.innerHTML = "Chargement de l’historique...";
  }

  try {
    if (!etat.utilisateur) {
      historique.innerHTML = "Connecte-toi pour voir ton historique.";
      afficherNotification("Connecte-toi pour voir l’historique.");
      return;
    }

    const page = await appelerAPI(
      `/api/letters?limit=${TAILLE_PAGE_HISTORIQUE}&offset=${decalageHistorique}`,
      { method: "GET" }
    );

    document.getElementById("btnHistoriqueSuite")?.remove();

    if (!suite) {
      historique.innerHTML = "";
    }

    if (page.total === 0) {
      historique.innerHTML = `
        <div class="historique-vide">
          <h3>📭 Aucun historique</h3>
          <p>Vos lettres générées apparaîtront ici automatiquement.</p>
        </div>
      `;

      return;
    }

    historique.insertAdjacentHTML("beforeend", page.lettres.map(carteLettre).join(""));

    if (page.suivant !== null) {
      decalageHistorique = page.suivant;
      historique.insertAdjacentHTML(
        "beforeend",
        `<button id="btnHistoriqueSuite" onclick="chargerHistorique(true)">
          Afficher plus (${page.total - page.suivant} restantes)
        </button>`
      );
    }

    if (!suite) {
      afficherNotification("Historique chargé.");
    }
  } catch (error) {
    console.error("Erreur historique :", error);
    historique.innerHTML = "Erreur lors du chargement de l’historique.";
    afficherNotification(error.message || "Erreur lors du chargement.");
  }
};


/* =========================
   SUPPRESSION D’UNE LETTRE
========================= */

window.supprimerLettre = function (id) {
  window.ouvrirConfirmModal(async () => {
    try {
      await appelerAPI(`/api/letters/${encodeURIComponent(id)}`, { method: "DELETE" });

      afficherNotification("Lettre supprimée.");

      await window.chargerHistorique();
      await mettreAJourDashboard();
    } catch (error) {
      console.error("Erreur suppression :", error);
      afficherNotification(error.message || "Erreur suppression.");
    }
  }, "🗑️ Supprimer cette lettre ?");
};


/* =========================
   RÉINITIALISATION FORMULAIRE
========================= */

window.reinitialiserFormulaire = function () {
  document.getElementById("typeLettre").value = "resiliation";
  document.getElementById("nom").value = "";
  document.getElementById("destinataire").value = "";
  document.getElementById("objet").value = "";

  document.getElementById("resultat").innerText =
    "✨ Votre lettre apparaîtra ici après génération.";

  activerBoutonsLettre(false);

  afficherNotification("Formulaire réinitialisé.");
};


/* =========================
   MASQUER HISTORIQUE
========================= */

window.masquerHistorique = function () {
  const historique = document.getElementById("historique");

  historique.innerHTML = "";

  afficherNotification("Historique masqué.");
};
