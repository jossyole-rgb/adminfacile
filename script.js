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
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


/* =========================
   VARIABLES GLOBALES
========================= */

let utilisateurConnecte = null;
let utilisateurPremium = false;
let stripeCustomerId = null;


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
    await verifierPremium(user.email);
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

    await sendEmailVerification(userCredential.user);

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

  if (!utilisateurConnecte.emailVerified) {
    resultat.innerText =
      "Vérifie ton email avant de générer une lettre.";

    afficherNotification("Vérifie ton email avant de générer une lettre.");
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