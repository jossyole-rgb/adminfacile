/* =========================
   IMPORTS FIREBASE
========================= */

import { db, auth, onAuthStateChanged } from "./firebase.js";

import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


/* =========================
   VARIABLES GLOBALES
========================= */

let utilisateurConnecte = null;
let utilisateurPremium = false;


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
   AUTHENTIFICATION
========================= */

onAuthStateChanged(auth, async (user) => {
  utilisateurConnecte = user;

  if (user) {
    await verifierPremium(user.email);
  }

  await mettreAJourDashboard();
});


/* =========================
   GÉNÉRATION DE LETTRE IA
========================= */

window.genererLettre = async function () {
  const type = document.getElementById("typeLettre").value;
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

  if (!nom || !destinataire || !objet) {
    resultat.innerText =
      "Veuillez remplir tous les champs avant de générer la lettre.";

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
      resultat.innerText =
        "Limite gratuite atteinte. Passe à la version Premium.";

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
          nom,
          destinataire,
          objet
        })
      }
    );

    const data = await reponse.json();

    if (!data.lettre) {
      throw new Error("Aucune lettre reçue depuis le serveur.");
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

    resultat.innerText =
      "Erreur lors de la génération. Vérifiez le serveur.";

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

          <p>
            Vos lettres générées apparaîtront ici automatiquement.
          </p>
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

async function verifierPremium(email) {
  try {
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("Email", "==", email));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const data = querySnapshot.docs[0].data();

      utilisateurPremium = data.Premium === true;
    } else {
      utilisateurPremium = false;
    }
  } catch (error) {
    console.error("Erreur Premium :", error);
    utilisateurPremium = false;
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

  if (!utilisateurConnecte) {
    userEmail.innerText = "Non connecté";
    nombreLettres.innerText = "0";
    limiteGratuite.innerText = "3 restantes";
    statutCompte.innerText = "Version gratuite";
    return;
  }

  userEmail.innerText = utilisateurConnecte.email;

  if (utilisateurPremium) {

    statutCompte.innerHTML =
      "👑 <span class='premium-badge'>Premium actif</span>";

  } else {

    statutCompte.innerHTML =
      "🆓 <span class='gratuit-badge'>Version gratuite</span>";
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
    const response = await fetch(
      "https://adminfacile.onrender.com/create-checkout-session",
      {
        method: "POST"
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

  const modeSombre =
    document.body.classList.contains("dark-mode");

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

  const themeSauvegarde =
    localStorage.getItem("theme");

  const boutonTheme =
    document.getElementById("btnTheme");

  if (themeSauvegarde === "dark") {

    document.body.classList.add("dark-mode");

    boutonTheme.innerText = "☀️ Mode clair";
  }
});