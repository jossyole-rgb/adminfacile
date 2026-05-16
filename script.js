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