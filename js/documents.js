/* =========================
   DOCUMENTS
   Analyse de documents, analyses sauvegardées, réponses IA.
========================= */

import { db } from "../firebase.js";
import { collection, addDoc, getDocs, query, where, deleteDoc, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { etat } from "./etat.js";
import { afficherLoader, afficherNotification, afficherToast, echapperHTML, focaliserModale, masquerLoader, restaurerFocus, texteMultiligne } from "./ui.js";
import { appelerAPI } from "./api.js";


/* =========================
   ANALYSE DOCUMENT ADMINISTRATIF
========================= */

export function extraireChampAnalyse(texte, champ) {
  const regex = new RegExp(
    `${champ}:\\s*([\\s\\S]*?)(?=\\n[A-Z_]+:|$)`
  );

  const match = texte.match(regex);

  return match ? match[1].trim() : "Non détecté";
}

window.analyserDocument = async function () {
  const input = document.getElementById("documentUpload");
  const resultat = document.getElementById("analyseDocumentResultat");

  if (!input.files || input.files.length === 0) {
    afficherNotification("Ajoute un document à analyser.");
    return;
  }

  const fichiers = Array.from(input.files);
  const tailleMax = 8 * 1024 * 1024;

  if (fichiers.length > 5) {
    afficherNotification("5 documents maximum par analyse.");
    return;
  }

  if (fichiers.some((fichier) => fichier.size > tailleMax)) {
    afficherNotification("Chaque fichier doit faire moins de 8 Mo.");
    return;
  }

  const formData = new FormData();
  fichiers.forEach((fichier) => {
    formData.append("documents", fichier);
  });

  /* Loader IA */
  resultat.innerHTML = `
<div class="loader-ia" role="status">
  🤖 Lecture du document...
</div>
`;

  let data;

  try {
    data = await appelerAPI("/upload-document", { formData });
  } catch (error) {
    console.error("Erreur analyse document :", error);
    resultat.innerText = `Analyse impossible : ${error.message}`;
    afficherNotification("Erreur lors de l’analyse du document.");
    return;
  }

  const analyse = data.analyse || "";

  if (!analyse) {
    resultat.innerText = data.avertissement || "Aucun texte lisible n'a été trouvé dans ce document.";
    return;
  }

  etat.analyseCourante = analyse;

  const typeDocument = extraireChampAnalyse(analyse, "TYPE_DOCUMENT");
  const organisme = extraireChampAnalyse(analyse, "ORGANISME");
  const dateImportante = extraireChampAnalyse(analyse, "DATE_IMPORTANTE");
  const montant = extraireChampAnalyse(analyse, "MONTANT");
  const urgence = extraireChampAnalyse(analyse, "URGENCE");
  const actions = extraireChampAnalyse(analyse, "ACTIONS_RECOMMANDEES");
  const pointsAVerifier = extraireChampAnalyse(analyse, "POINTS_A_VERIFIER");
  const resume = extraireChampAnalyse(analyse, "RESUME");

  let urgenceClass = "urgence-moyenne";

  if (urgence.toLowerCase().includes("faible")) {
    urgenceClass = "urgence-faible";
  }

  if (urgence.toLowerCase().includes("élevée")) {
    urgenceClass = "urgence-elevee";
  }

  resultat.innerHTML = `
  <h3>📄 Analyse du document</h3>

  <div class="analyse-cards">
    <div class="analyse-card">
      <span>📄 Type</span>
      <strong>${echapperHTML(typeDocument)}</strong>
    </div>

    <div class="analyse-card">
      <span>🏢 Organisme</span>
      <strong>${echapperHTML(organisme)}</strong>
    </div>

    <div class="analyse-card">
      <span>📅 Date</span>
      <strong>${echapperHTML(dateImportante)}</strong>
    </div>

    <div class="analyse-card">
      <span>💰 Montant</span>
      <strong>${echapperHTML(montant)}</strong>
    </div>

    <div class="analyse-card ${urgenceClass}">
      <span>⚠️ Urgence</span>
      <strong>${echapperHTML(urgence)}</strong>
    </div>
  </div>

  <div class="analyse-section">
    <h4>✅ Actions recommandées</h4>
    <p>${texteMultiligne(actions)}</p>
  </div>

  <div class="analyse-section">
    <h4>🔎 Points à vérifier</h4>
    <p>${texteMultiligne(pointsAVerifier)}</p>
  </div>

  <div class="analyse-section">
    <h4>🧠 Résumé</h4>
    <p>${texteMultiligne(resume)}</p>
  </div>

  <p class="avertissement-ia">
    Analyse automatique à vérifier : elle ne remplace pas l’avis de l’organisme concerné ni d’un professionnel.
  </p>
`;

  try {
    await addDoc(collection(db, "analyses"), {
      userId: etat.utilisateur.uid,
      nom: data.nom,
      type: data.type,
      taille: data.taille,
      typeDocument,
      organisme,
      dateImportante,
      montant,
      urgence,
      actions,
      resume,
      analyseComplete: analyse,
      createdAt: new Date()
    });

    afficherNotification("Analyse terminée et sauvegardée.");
  } catch (error) {
    console.error("Erreur sauvegarde analyse :", error);
    afficherNotification("Analyse terminée, mais non sauvegardée.");
  }
};


/* =========================
   CHARGEMENT DES ANALYSES SAUVEGARDÉES
========================= */

export async function chargerAnalyses() {
  afficherLoader("Chargement des analyses...");

  const container = document.getElementById("listeAnalyses");

  container.innerHTML = "<p>Chargement...</p>";

  try {
    if (!etat.utilisateur) {
      container.innerHTML = "<p>Utilisateur non connecté.</p>";
      masquerLoader();
      return;
    }

    const q = query(
      collection(db, "analyses"),
      where("userId", "==", etat.utilisateur.uid)
    );

    const querySnapshot = await getDocs(q);

    const totalAnalysesElement =
      document.getElementById("totalAnalyses");

    const premiumStatusElement =
      document.getElementById("premiumStatus");

    if (totalAnalysesElement) {
      totalAnalysesElement.textContent = querySnapshot.size;
    }

    if (premiumStatusElement) {
      premiumStatusElement.textContent =
        etat.premium ? "Premium ⭐" : "Gratuit";
    }

    if (querySnapshot.empty) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <h3>Aucune analyse sauvegardée</h3>
          <p>Ajoute ton premier document pour commencer ton coffre-fort administratif.</p>
        </div>
      `;

      masquerLoader();
      return;
    }

    container.innerHTML = "";

    querySnapshot.forEach((documentAnalyse) => {
      const data = documentAnalyse.data();
      const analyseId = documentAnalyse.id;

      const carte = document.createElement("div");
      carte.className = "analyse-card";

      carte.innerHTML = `
        <h3>📄 ${echapperHTML(data.typeDocument || "Document")}</h3>

        <p>
          <strong>Organisme :</strong>
          ${echapperHTML(data.organisme || "Non détecté")}
        </p>

        <p>
          <strong>Date :</strong>
          ${echapperHTML(data.dateImportante || "Non détectée")}
        </p>

        <p>
          <strong>Montant :</strong>
          ${echapperHTML(data.montant || "Non détecté")}
        </p>

        <p>
          <strong>Urgence :</strong>
          ${echapperHTML(data.urgence || "Non détectée")}
        </p>

        <div class="analyse-actions">

  <button onclick="voirAnalyse('${echapperHTML(analyseId)}')">
    👁️ Voir analyse
  </button>

  <!-- Sélecteur de ton IA -->
  <select class="select-ton-ia">
    <option value="professionnel">
      Professionnel
    </option>

    <option value="juridique">
      Juridique
    </option>

    <option value="ferme">
      Ferme
    </option>

    <option value="poli">
      Poli
    </option>
  </select>

  <!-- Bouton réponse IA -->
  <button class="btn-reponse-ia">
    🤖 Générer une réponse IA
  </button>

  <!-- Suppression -->
  <button
    onclick="supprimerAnalyse('${echapperHTML(analyseId)}')"
    class="btn-delete"
  >
    🗑️ Supprimer
  </button>

</div>
      `;

      container.appendChild(carte);

      /* Bouton IA propre à cette carte */
const boutonIA = carte.querySelector(".btn-reponse-ia");

if (boutonIA) {
  boutonIA.addEventListener("click", async () => {
    try {
      boutonIA.disabled = true;
      boutonIA.textContent = "⏳ Génération IA...";

      const selectTon = carte.querySelector(".select-ton-ia");
      const tonChoisi = selectTon?.value || "professionnel";

      const resultat = await appelerAPI("/generer-reponse-ia", {
        body: {
          document:
            data.analyseComplete ||
            data.resume ||
            data.actions ||
            "",
          ton: tonChoisi,
        },
      });

      if (!resultat.reponse) {
        throw new Error("Réponse IA invalide");
      }

      window.afficherModalReponseIA(resultat.reponse);
    } catch (error) {
      console.error("Erreur réponse IA :", error);
      afficherToast(`❌ ${echapperHTML(error.message || "Erreur génération IA")}`, "error");
    } finally {
      boutonIA.disabled = false;
      boutonIA.textContent = "🤖 Générer une réponse IA";
    }
  });
}
    });

    masquerLoader();
  } catch (error) {
    masquerLoader();
    console.error("Erreur chargement analyses :", error);

    container.innerHTML =
      "<p>Erreur chargement analyses.</p>";
  }
}

window.chargerAnalyses = chargerAnalyses;


/* =========================
   MODAL RÉPONSE IA
========================= */

window.afficherModalReponseIA = function (texte) {
  const modal = document.getElementById("reponseIAModal");
  const content = document.getElementById("reponseIAContent");

  if (!modal || !content) return;

  content.textContent = texte;
  modal.style.display = "flex";
  focaliserModale(modal);
  document.body.classList.add("modal-open");
};

window.fermerModalReponseIA = function () {
  const modal = document.getElementById("reponseIAModal");

  if (!modal) return;

  modal.style.display = "none";
  document.body.classList.remove("modal-open");
  restaurerFocus();
};

window.copierReponseIA = function () {
  const content = document.getElementById("reponseIAContent");

  if (!content) return;

  navigator.clipboard.writeText(content.textContent);

  afficherToast("✅ Réponse copiée", "success");
};


/* =========================
   SUPPRESSION ANALYSE
========================= */

window.supprimerAnalyse = async function (id) {
  window.ouvrirConfirmModal(async () => {
    try {
      await deleteDoc(doc(db, "analyses", id));

      afficherToast("✅ Analyse supprimée", "success");

      await chargerAnalyses();
    } catch (error) {
      console.error("Erreur suppression analyse :", error);

      afficherToast("❌ Erreur suppression analyse", "error");
    }
  });
};


/* =========================
   MODAL ANALYSE COMPLÈTE
========================= */

window.voirAnalyse = async function (id) {
  try {
    const analyseRef = doc(db, "analyses", id);
    const analyseSnap = await getDoc(analyseRef);

    if (!analyseSnap.exists()) {
      afficherNotification("Analyse introuvable.");
      return;
    }

    const data = analyseSnap.data();

    const modal = document.getElementById("analyseModal");
    const content = document.getElementById("analyseModalContent");

    if (!modal || !content) return;

    content.innerHTML = `
      <div class="analyse-header">
        <h2>📄 Analyse complète</h2>
      </div>

      <div class="analyse-section">
        <h3>📁 Informations document</h3>

        <p><strong>Type :</strong> ${echapperHTML(data.typeDocument || "Non détecté")}</p>
        <p><strong>Organisme :</strong> ${echapperHTML(data.organisme || "Non détecté")}</p>
        <p><strong>Date :</strong> ${echapperHTML(data.dateImportante || "Non détectée")}</p>
        <p><strong>Montant :</strong> ${echapperHTML(data.montant || "Non détecté")}</p>

        <p>
          <strong>Urgence :</strong>
          <span class="urgence-badge">
            ${echapperHTML(data.urgence || "Moyenne")}
          </span>
        </p>
      </div>

      <div class="analyse-section">
        <h3>✅ Actions recommandées</h3>
        <div class="analyse-actions-text">
          ${texteMultiligne(data.actions || "Aucune action recommandée")}
        </div>
      </div>

      <div class="analyse-section">
        <h3>🧠 Résumé IA</h3>
        <div class="analyse-resume">
          ${texteMultiligne(data.resume || "Aucun résumé disponible")}
        </div>
      </div>
    `;

    modal.style.display = "flex";
    focaliserModale(modal);
    document.body.classList.add("modal-open");
  } catch (error) {
    console.error("Erreur ouverture analyse :", error);
    afficherNotification("Erreur ouverture analyse.");
  }
};

window.fermerAnalyseModal = function () {
  const modal = document.getElementById("analyseModal");

  if (!modal) return;

  modal.style.display = "none";
  document.body.classList.remove("modal-open");
  restaurerFocus();
};


/* =========================================
   TELECHARGER REPONSE IA EN PDF
========================================= */

window.telechargerReponseIAPDF = function () {
  const contenu = document.getElementById("reponseIAContent");

  if (!contenu) {
    afficherToast("❌ Réponse IA introuvable", "error");
    return;
  }

  const texte = contenu.innerText;

  if (!texte.trim()) {
    afficherToast("❌ Aucune réponse IA à télécharger", "error");
    return;
  }

  const fenetre = window.open("", "_blank");

  if (!fenetre) {
    afficherToast("❌ Autorise les popups pour télécharger le PDF", "error");
    return;
  }

  fenetre.document.write(`
    <html>
      <head>
        <title>Réponse IA - AdminFacile</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 40px;
            line-height: 1.7;
            color: #111827;
          }

          h1 {
            color: #1d4ed8;
            margin-bottom: 30px;
          }

          .contenu {
            white-space: pre-wrap;
            font-size: 16px;
          }
        </style>
      </head>

      <body>
        <h1>🤖 Réponse IA AdminFacile</h1>
        <div class="contenu">${echapperHTML(texte)}</div>

        <script>
          window.onload = function () {
            window.print();
          };
        </script>
      </body>
    </html>
  `);

  fenetre.document.close();
};


window.poserQuestionDocument = async function () {
  try {
    if (!etat.analyseCourante) {
      afficherNotification("Analyse un document avant.");
      return;
    }

    const input = document.getElementById("documentChatInput");
    const messages = document.getElementById("documentChatMessages");

    const question = input.value.trim();

    if (!question) {
      afficherNotification("Pose une question.");
      return;
    }

    messages.innerHTML += `
      <div class="chat-user">
        👤 ${texteMultiligne(question)}
      </div>
    `;

    input.value = "";

    const data = await appelerAPI("/chat-document", {
      body: {
        question,
        analyse: etat.analyseCourante,
      },
    });

    messages.innerHTML += `
      <div class="chat-ai">
        🤖 ${texteMultiligne(data.reponse)}
      </div>
    `;

    /* Sauvegarde mémoire conversationnelle */
    if (etat.utilisateur) {
      await addDoc(collection(db, "documentChats"), {
        userId: etat.utilisateur.uid,

        question,
        reponse: data.reponse,

        createdAt: new Date(),
      });

      console.log("Mémoire documentChat sauvegardée !");
    }

    messages.scrollTop = messages.scrollHeight;
  } catch (error) {
    console.error(error);
    afficherNotification(error.message || "Erreur chat IA.");
  }
};
