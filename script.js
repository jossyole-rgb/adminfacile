/* =========================
   IMPORTS FIREBASE
========================= */

import {
  db,
  auth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  sendEmailVerification,
  createUserWithEmailAndPassword
} from "./firebase.js";

import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  deleteDoc,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


/* =========================
   VARIABLES GLOBALES
========================= */

let utilisateurConnecte = null;
let utilisateurPremium = false;
let stripeCustomerId = null;
let emailVerifie = false;
let nombreMessagesIA = 0;
const LIMITE_MESSAGES_IA = 5;


/* =========================
   NOTIFICATIONS
========================= */

function afficherNotification(message) {
  const notification = document.getElementById("notification");

  if (!notification) return;

  notification.innerText = message;
  notification.classList.add("show");

  setTimeout(() => {
    notification.classList.remove("show");
  }, 3000);
}

function afficherLoader(message = "Chargement...") {
  const overlay = document.getElementById("loaderOverlay");
  const text = document.getElementById("loaderText");

  text.innerText = message;

  overlay.style.display = "flex";
}

function masquerLoader() {
  const overlay = document.getElementById("loaderOverlay");

  overlay.style.display = "none";
}

function afficherToast(message, type = "success") {

  const container = document.getElementById("toastContainer");

  const toast = document.createElement("div");

  toast.className = `toast toast-${type}`;

  toast.innerHTML = `
    ${message}
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3500);
}


/* =========================
   RESET PASSWORD
========================= */

window.reinitialiserMotDePasse = async function () {
  const email = prompt("Entrez votre email :");

  if (!email) return;

  try {
    await sendPasswordResetEmail(auth, email);
    afficherNotification("📩 Email de réinitialisation envoyé.");
  } catch (error) {
    console.error("Erreur reset password :", error);
    afficherNotification("Erreur lors de l’envoi.");
  }
};


/* =========================
   AUTHENTIFICATION
========================= */

onAuthStateChanged(auth, async (user) => {
  utilisateurConnecte = user;

  if (user) {
    await user.reload();

    emailVerifie = user.emailVerified;

    await verifierPremium(user.uid);
  } else {
    emailVerifie = false;
    utilisateurPremium = false;
    stripeCustomerId = null;
  }

  await mettreAJourDashboard();
});


window.creerCompte = async function () {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!email || !password) {
    afficherNotification("Veuillez remplir l’email et le mot de passe.");
    return;
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    const user = userCredential.user;

    await setDoc(doc(db, "users", user.uid), {
      email: user.email,
      premium: false,
      subscriptionStatus: "inactive",
      stripeCustomerId: null,
      createdAt: new Date()
    });

    await sendEmailVerification(user);

    afficherNotification("📩 Compte créé. Email de vérification envoyé.");
  } catch (error) {
    console.error("Erreur création compte :", error);
    afficherNotification("Erreur lors de la création du compte.");
  }
};


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

  if (!utilisateurConnecte) {
    resultat.innerText = "Connecte-toi avant de générer une lettre.";
    afficherNotification("Connecte-toi avant de générer une lettre.");
    return;
  }

  if (!emailVerifie) {
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
    const q = query(
      collection(db, "lettres"),
      where("userId", "==", utilisateurConnecte.uid)
    );

    const querySnapshot = await getDocs(q);

    if (!utilisateurPremium && querySnapshot.size >= 3) {
      resultat.innerText = "Limite gratuite atteinte.";
      afficherNotification("Limite gratuite atteinte.");
      return;
    }

    bouton.disabled = true;
    bouton.innerText = "Génération...";
    loader.style.display = "block";
    resultat.innerText = "L’IA rédige votre lettre...";

    desactiverFormulaire(true);

    const reponse = await fetch(
      "https://adminfacile.onrender.com/generer-lettre",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type,
          tonLettre,
          nom,
          destinataire,
          objet
        })
      }
    );

    const data = await reponse.json();

    if (!data.lettre) {
      throw new Error("Aucune lettre reçue.");
    }

    resultat.innerText = data.lettre;

    activerBoutonsLettre(true);

    await sauvegarderLettre({
      type,
      contenu: data.lettre,
      nom,
      destinataire
    });

    await mettreAJourDashboard();

    afficherNotification("Lettre générée avec succès.");
  } catch (error) {
    console.error("Erreur génération :", error);
    resultat.innerText = "Erreur lors de la génération.";
    afficherNotification("Erreur lors de la génération.");
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

function desactiverFormulaire(etat) {
  document.getElementById("typeLettre").disabled = etat;
  document.getElementById("nom").disabled = etat;
  document.getElementById("destinataire").disabled = etat;
  document.getElementById("objet").disabled = etat;
}


function activerBoutonsLettre(etat) {
  document.getElementById("btnCopier").disabled = !etat;
  document.getElementById("btnTelecharger").disabled = !etat;
  document.getElementById("btnPDF").disabled = !etat;
  document.getElementById("btnDOCX").disabled = !etat;
}


function texteResultatEstVide(texte) {
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
   SAUVEGARDE FIRESTORE
========================= */

async function sauvegarderLettre({ type, contenu, nom, destinataire }) {
  try {
    await addDoc(collection(db, "lettres"), {
      type,
      contenu,
      nom,
      destinataire,
      date: new Date().toLocaleDateString(),
      userId: utilisateurConnecte.uid,
      email: utilisateurConnecte.email
    });

    afficherNotification("Lettre sauvegardée dans l’historique.");
  } catch (error) {
    console.error("Erreur Firestore :", error);
    afficherNotification("Lettre générée, mais non sauvegardée.");
  }
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

  const { Document, Packer, Paragraph, TextRun } = window.docx;

  const texte = document.getElementById("resultat").innerText;

  if (texteResultatEstVide(texte)) {
    afficherNotification("Génère une lettre avant le DOCX.");
    return;
  }

  const lignes = texte
    .split("\n")
    .filter((ligne) => ligne.trim() !== "");

  const documentWord = new Document({
    sections: [
      {
        children: lignes.map(
          (ligne) =>
            new Paragraph({
              children: [
                new TextRun({
                  text: ligne,
                  size: 24
                })
              ],
              spacing: {
                after: 200
              }
            })
        )
      }
    ]
  });

  const blob = await Packer.toBlob(documentWord);

  saveAs(blob, "lettre_adminfacile.docx");

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

    const response = await fetch(
      "https://adminfacile.onrender.com/resumer-lettre",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          texte
        })
      }
    );

    const data = await response.json();

    if (!data.resume) {
      throw new Error("Aucun résumé reçu.");
    }

    resultat.innerText = data.resume;

    afficherNotification("Résumé généré.");
  } catch (error) {
    console.error("Erreur résumé IA :", error);
    afficherNotification("Erreur lors du résumé.");
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

    const response = await fetch(
      "https://adminfacile.onrender.com/reecrire-lettre",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          texte,
          style
        })
      }
    );

    const data = await response.json();

    if (!data.lettre) {
      throw new Error("Aucune réécriture reçue.");
    }

    resultat.innerText = data.lettre;

    afficherNotification("Lettre réécrite.");
    
  } catch (error) {

    console.error("Erreur réécriture IA :", error);

    afficherNotification("Erreur lors de la réécriture.");
  }
};


/* =========================
   HISTORIQUE DES LETTRES
========================= */

window.chargerHistorique = async function () {
  const historique = document.getElementById("historique");

  historique.innerHTML = "Chargement de l’historique...";

  try {
    if (!utilisateurConnecte) {
      historique.innerHTML = "Connecte-toi pour voir ton historique.";
      afficherNotification("Connecte-toi pour voir l’historique.");
      return;
    }

    const q = query(
      collection(db, "lettres"),
      where("userId", "==", utilisateurConnecte.uid)
    );

    const querySnapshot = await getDocs(q);

    historique.innerHTML = "";

    if (querySnapshot.empty) {
      historique.innerHTML = `
        <div class="historique-vide">
          <h3>📭 Aucun historique</h3>
          <p>Vos lettres générées apparaîtront ici automatiquement.</p>
        </div>
      `;

      return;
    }

    querySnapshot.forEach((document) => {
      const lettre = document.data();

      historique.innerHTML += `
        <div class="lettre-card">
          <div class="lettre-header">
            <h3>${lettre.type}</h3>

            <button 
              class="btn-supprimer"
              onclick="supprimerLettre('${document.id}')"
            >
              🗑️ Supprimer
            </button>
          </div>

          <small>${lettre.date}</small>
          <p>${lettre.contenu}</p>
        </div>
      `;
    });

    afficherNotification("Historique chargé.");
  } catch (error) {
    console.error("Erreur historique :", error);
    historique.innerHTML = "Erreur lors du chargement de l’historique.";
    afficherNotification("Erreur lors du chargement.");
  }
};


/* =========================
   SUPPRESSION D’UNE LETTRE
========================= */

window.supprimerLettre = async function (id) {
  try {
    await deleteDoc(doc(db, "lettres", id));

    afficherNotification("Lettre supprimée.");

    await chargerHistorique();
    await mettreAJourDashboard();
  } catch (error) {
    console.error("Erreur suppression :", error);
    afficherNotification("Erreur suppression.");
  }
};


/* =========================
   STATUT PREMIUM
========================= */

async function verifierPremium(uid) {
  try {
    const userRef = doc(db, "users", uid);

    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      utilisateurPremium = false;
      stripeCustomerId = null;
      return;
    }

    const data = userSnap.data();

    utilisateurPremium =
      data.premium === true &&
      data.subscriptionStatus === "active";

    stripeCustomerId =
      data.stripeCustomerId || null;

  } catch (error) {
    console.error("Erreur Premium :", error);

    utilisateurPremium = false;
    stripeCustomerId = null;
  }
}


/* =========================
   DASHBOARD UTILISATEUR
========================= */

async function mettreAJourDashboard() {
  const userEmail = document.getElementById("userEmail");
  const nombreLettres = document.getElementById("nombreLettres");
  const limiteGratuite = document.getElementById("limiteGratuite");
  const statutCompte = document.getElementById("statutCompte");
  const btnPasserPremium = document.querySelector("button[onclick='passerPremium()']");


  if (!userEmail || !nombreLettres || !limiteGratuite || !statutCompte) return;

  if (!utilisateurConnecte) {
    userEmail.innerText = "Non connecté";
    nombreLettres.innerText = "0";
    limiteGratuite.innerText = "3 restantes";
    statutCompte.innerText = "Version gratuite";
    return;
  }

  userEmail.innerText = utilisateurConnecte.email;

  if (!emailVerifie) {
    statutCompte.innerHTML =
      "⚠️ <span class='gratuit-badge'>Email non vérifié</span>";
  } else if (utilisateurPremium) {
    statutCompte.innerHTML =
      "👑 <span class='premium-badge'>Premium actif</span>";
  } else {
    statutCompte.innerHTML =
      "🆓 <span class='gratuit-badge'>Version gratuite</span>";
  }

  if (btnPasserPremium) {
    btnPasserPremium.style.display = utilisateurPremium ? "none" : "block";
  }

  const q = query(
    collection(db, "lettres"),
    where("userId", "==", utilisateurConnecte.uid)
  );

  const querySnapshot = await getDocs(q);

  nombreLettres.innerText = querySnapshot.size;

  if (utilisateurPremium) {
    limiteGratuite.innerText = "Illimité";
  } else {
    const restantes = 3 - querySnapshot.size;

    limiteGratuite.innerText =
      restantes > 0 ? restantes + " restantes" : "Limite atteinte";
  }
}


/* =========================
   PAIEMENT STRIPE PREMIUM
========================= */

window.passerPremium = async function () {
  try {
    if (!utilisateurConnecte) {
      afficherNotification("Connecte-toi avant de passer Premium.");
      return;
    }

    if (!emailVerifie) {
      afficherNotification("Vérifie ton email avant de passer Premium.");
      return;
    }

    if (utilisateurPremium) {
      afficherNotification("Ton abonnement Premium est déjà actif.");
      return;
    }

    const response = await fetch(
  "https://adminfacile.onrender.com/create-checkout-session",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      uid: utilisateurConnecte.uid,
      email: utilisateurConnecte.email
    })
  }
);

    const data = await response.json();

    if (!data.url) {
      throw new Error("URL Stripe absente.");
    }

    window.location.href = data.url;
  } catch (error) {
    console.error("Erreur Stripe :", error);
    afficherNotification("Erreur Stripe.");
  }
};


/* =========================
   PORTAIL CLIENT STRIPE
========================= */

window.gererAbonnement = async function () {
  try {
    if (!utilisateurConnecte) {
      afficherNotification("Connecte-toi pour gérer ton abonnement.");
      return;
    }

    if (!emailVerifie) {
      afficherNotification("Vérifie ton email avant de gérer ton abonnement.");
      return;
    }

    if (!stripeCustomerId) {
      afficherNotification("Aucun abonnement Stripe trouvé.");
      return;
    }

    const response = await fetch(
      "https://adminfacile.onrender.com/create-customer-portal-session",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          customerId: stripeCustomerId
        })
      }
    );

    const data = await response.json();

    if (!data.url) {
      throw new Error("URL du portail Stripe absente.");
    }

    window.location.href = data.url;
  } catch (error) {
    console.error("Erreur portail Stripe :", error);
    afficherNotification("Erreur lors de l’ouverture du portail.");
  }
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


/* =========================
   MODE SOMBRE
========================= */

window.changerTheme = function () {
  document.body.classList.toggle("dark-mode");

  const boutonTheme = document.getElementById("btnTheme");
  const modeSombre = document.body.classList.contains("dark-mode");

  if (modeSombre) {
    boutonTheme.innerText = "☀️ Mode clair";
    localStorage.setItem("theme", "dark");
  } else {
    boutonTheme.innerText = "🌙 Mode sombre";
    localStorage.setItem("theme", "light");
  }
};


/* =========================
   CHARGEMENT THÈME SAUVEGARDÉ
========================= */

window.addEventListener("DOMContentLoaded", () => {
  const themeSauvegarde = localStorage.getItem("theme");
  const boutonTheme = document.getElementById("btnTheme");

  if (themeSauvegarde === "dark") {
    document.body.classList.add("dark-mode");

    if (boutonTheme) {
      boutonTheme.innerText = "☀️ Mode clair";
    }
  }
});


/* =========================
   ASSISTANT ADMINISTRATIF IA
========================= */

window.envoyerMessageIA = async function () {

  const input =
    document.getElementById("chatInput");

  const messages =
    document.getElementById("chatMessages");

  const question =
    input.value.trim();

  if (!question) {

    afficherNotification(
      "Écris une question."
    );

    return;
  }

  if (
    !utilisateurPremium &&
    nombreMessagesIA >= LIMITE_MESSAGES_IA
  ) {

    afficherNotification(
      "Limite gratuite IA atteinte."
    );

    return;
  }

  /* Message utilisateur */

  messages.innerHTML += `
    <div class="message-user">
      ${question}
    </div>
  `;

  input.value = "";

  try {

    const response = await fetch(
      "https://adminfacile.onrender.com/chat-admin",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          message: question
        })
      }
    );

    const data =
      await response.json();

      nombreMessagesIA++;

    /* Réponse IA */

    messages.innerHTML += `
      <div class="message-ia">
        ${data.reponse}
      </div>
    `;

    messages.scrollTop =
      messages.scrollHeight;

  } catch (error) {

    console.error(
      "Erreur assistant IA :",
      error
    );

    afficherNotification(
      "Erreur assistant IA."
    );
  }
};


/* =========================
   ANALYSE DOCUMENT ADMINISTRATIF
========================= */

function extraireChampAnalyse(texte, champ) {
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

  const fichier = input.files[0];

  resultat.innerText = "Analyse du document en cours...";

const formData = new FormData();
formData.append("document", fichier);

const response = await fetch(
  "https://adminfacile.onrender.com/upload-document",
  {
    method: "POST",
    body: formData,
  }
);

const data = await response.json();

if (!response.ok) {
  throw new Error(data.error || "Erreur upload");
}

const analyse = data.analyse || "";

const typeDocument =
  extraireChampAnalyse(analyse, "TYPE_DOCUMENT");

const organisme =
  extraireChampAnalyse(analyse, "ORGANISME");

const dateImportante =
  extraireChampAnalyse(analyse, "DATE_IMPORTANTE");

const montant =
  extraireChampAnalyse(analyse, "MONTANT");

const urgence =
  extraireChampAnalyse(analyse, "URGENCE");

const actions =
  extraireChampAnalyse(analyse, "ACTIONS_RECOMMANDEES");

const resume =
  extraireChampAnalyse(analyse, "RESUME");

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
      <strong>${typeDocument}</strong>
    </div>

    <div class="analyse-card">
      <span>🏢 Organisme</span>
      <strong>${organisme}</strong>
    </div>

    <div class="analyse-card">
      <span>📅 Date</span>
      <strong>${dateImportante}</strong>
    </div>

    <div class="analyse-card">
      <span>💰 Montant</span>
      <strong>${montant}</strong>
    </div>

    <div class="analyse-card ${urgenceClass}">
      <span>⚠️ Urgence</span>
      <strong>${urgence}</strong>
    </div>
  </div>

  <div class="analyse-section">
    <h4>✅ Actions recommandées</h4>
    <p>${actions.replace(/\n/g, "<br>")}</p>
  </div>

  <div class="analyse-section">
    <h4>🧠 Résumé</h4>
    <p>${resume.replace(/\n/g, "<br>")}</p>
  </div>
`;

    console.log("Utilisateur connecté :", utilisateurConnecte);
    console.log("Sauvegarde analyse Firestore...");

if (utilisateurConnecte) {
  await addDoc(collection(db, "analyses"), {
    userId: utilisateurConnecte.uid,
    email: utilisateurConnecte.email,
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

  console.log("Analyse sauvegardée !");
}

afficherNotification("Document envoyé au serveur.");
};


async function chargerAnalyses() {

  afficherLoader("Chargement des analyses...");

  const container = document.getElementById("listeAnalyses");

  container.innerHTML = "<p>Chargement...</p>";

  try {
    if (!utilisateurConnecte) {
      container.innerHTML =
        "<p>Utilisateur non connecté.</p>";

      masquerLoader();
      return;
    }

    const q = query(
      collection(db, "analyses"),
      where("userId", "==", utilisateurConnecte.uid)
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
        utilisateurPremium ? "Premium ⭐" : "Gratuit";
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

    querySnapshot.forEach((doc) => {
      const data = doc.data();

      const carte = document.createElement("div");

      carte.className = "analyse-card";

      carte.innerHTML = `
        <h3>📄 ${data.typeDocument || "Document"}</h3>

        <p><strong>Organisme :</strong>
        ${data.organisme || "Non détecté"}</p>

        <p><strong>Date :</strong>
        ${data.dateImportante || "Non détectée"}</p>

        <p><strong>Montant :</strong>
        ${data.montant || "Non détecté"}</p>

        <p><strong>Urgence :</strong>
        ${data.urgence || "Non détectée"}</p>

      <div class="analyse-actions">
        <button onclick="voirAnalyse('${doc.id}')">
          👁️ Voir analyse
        </button>

        <button onclick="supprimerAnalyse('${doc.id}')"
          class="btn-delete">
          🗑️ Supprimer
        </button>
      </div>
      `;

      container.appendChild(carte);
    });

   masquerLoader(); 

  } catch (error) {

    masquerLoader();

    console.error(error);

    container.innerHTML =
      "<p>Erreur chargement analyses.</p>";
  }
}

window.chargerAnalyses = chargerAnalyses;

window.ouvrirConfirmModal = function (onConfirm) {
  const modal = document.getElementById("confirmModal");
  const confirmBtn = document.getElementById("confirmDeleteBtn");

  modal.style.display = "flex";

  confirmBtn.onclick = () => {
    onConfirm();
    window.fermerConfirmModal();
  };
};

window.fermerConfirmModal = function () {
  document.getElementById("confirmModal").style.display = "none";
};


window.supprimerAnalyse = async function (id) {

  window.ouvrirConfirmModal(async () => {
  try {
    await deleteDoc(doc(db, "analyses", id));

    afficherToast("✅ Analyse supprimée", "success");

    chargerAnalyses();

  } catch (error) {
    console.error(error);

    afficherToast("❌ Erreur suppression analyse", "error");
  }
});
};


window.voirAnalyse = async function (id) {
  try {
    const analyseRef = doc(db, "analyses", id);
    const analyseSnap = await getDoc(analyseRef);

    if (!analyseSnap.exists()) {
      afficherNotification("Analyse introuvable.");
      return;
    }

    const data = analyseSnap.data();

    window.voirAnalyse = function(data) {

  const modal = document.getElementById("analyseModal");
  const content = document.getElementById("analyseModalContent");

  document.body.classList.add("modal-open");

  content.innerHTML = `
  
    <div class="analyse-header">
      <h2>📄 Analyse complète</h2>
    </div>

    <div class="analyse-section">
      <h3>📁 Informations document</h3>

      <p><strong>Type :</strong> ${data.typeDocument || "Non détecté"}</p>

      <p><strong>Organisme :</strong> ${data.organisme || "Non détecté"}</p>

      <p><strong>Date :</strong> ${data.dateImportante || "Non détectée"}</p>

      <p><strong>Montant :</strong> ${data.montant || "Non détecté"}</p>

      <p>
        <strong>Urgence :</strong>
        <span class="urgence-badge">
          ${data.urgence || "Moyenne"}
        </span>
      </p>
    </div>

    <div class="analyse-section">
      <h3>✅ Actions recommandées</h3>

      <div class="analyse-actions-text">
        ${data.actions || "Aucune action recommandée"}
      </div>
    </div>

    <div class="analyse-section">
      <h3>🧠 Résumé IA</h3>

      <div class="analyse-resume">
        ${data.resume || "Aucun résumé disponible"}
      </div>
    </div>

  `;

  modal.style.display = "flex";
};
  } catch (error) {
    console.error(error);
    afficherNotification("Erreur ouverture analyse.");
  }
};


window.voirAnalyse = function (id) {
  const modal = document.getElementById("analyseModal");
  const content = document.getElementById("analyseModalContent");

  const cartes = document.querySelectorAll(".analyse-card");

  cartes.forEach((carte) => {
    const bouton = carte.querySelector("button");

    if (
      bouton &&
      bouton.getAttribute("onclick") === `voirAnalyse('${id}')`
    ) {
      const texte = carte.innerHTML;

      content.innerHTML = `
        <h2>📄 Analyse complète</h2>
        <div style="margin-top:20px;">
          ${texte}
        </div>
      `;
    }
  });

  modal.style.display = "flex";
  document.body.classList.add("modal-open");
};

window.fermerAnalyseModal = function () {
  document.getElementById("analyseModal").style.display = "none";

  document.body.classList.remove("modal-open");
};